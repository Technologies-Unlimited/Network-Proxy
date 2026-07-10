package api

import (
	"context"
	"sync"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/safego"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/thothos"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// resultsReportInterval is how often the results reporter batches the current
// device states and reports them to ThothOS. The shipped design batches every
// 30-60s; 30s keeps the SaaS dashboard's device liveness reasonably fresh. It is
// a package var only so tests can shrink it; production leaves it at 30s.
var resultsReportInterval = 30 * time.Second

// maxBufferedResults bounds the reporter's carry-forward buffer so a prolonged
// ThothOS outage can never grow it without limit. When a report send fails, the
// batch is carried forward to the next tick; if the buffer would exceed this
// many results, the OLDEST entries are dropped. ~10k is far above any realistic
// single-proxy device count, so it only ever trims during a long outage.
const maxBufferedResults = 10000

// DeviceSampleSource is the subset of the metrics querier the results reporter
// needs to read a device's latest ICMP sample. It is an interface (not the
// concrete *metrics.LocalQuerier) so the reporter is decoupled from the metrics
// package and trivially stubbable in tests. A non-nil error from DeviceStatus
// means the device has NO real sample this process lifetime (never polled) — the
// reporter treats that as "unknown" and does NOT report the device (never as a
// false "down").
type DeviceSampleSource interface {
	DeviceStatus(deviceID, ipAddress string) (float64, error)
	PingLatency(deviceID, ipAddress string) (float64, error)
	PacketLoss(deviceID, ipAddress string) (float64, error)
}

var (
	sampleSourceMu sync.RWMutex
	sampleSource   DeviceSampleSource
)

// SetSampleSource wires the live metrics querier into the API package so the
// results reporter can read per-device status/latency/loss. Called once from
// main.go after the metrics registry is built, following the same package-hook
// pattern as SetCollectors / SetAlertEngine / SetMetricsHandler.
func SetSampleSource(src DeviceSampleSource) {
	sampleSourceMu.Lock()
	defer sampleSourceMu.Unlock()
	sampleSource = src
}

// getSampleSource returns the wired metrics querier, or nil if none is wired
// (e.g. unit tests that don't run the collectors). A nil source makes the
// reporter a no-op rather than a crash.
func getSampleSource() DeviceSampleSource {
	sampleSourceMu.RLock()
	defer sampleSourceMu.RUnlock()
	return sampleSource
}

// resultsClient is the subset of *thothos.Client the reporter calls. An interface
// so tests can drive carry-forward/bounded behavior with a stub that fails or
// counts calls, without an HTTP round-trip. *thothos.Client satisfies it.
type resultsClient interface {
	ReportMonitoringResults(proxyName string, results []thothos.MonitoringResult) (*thothos.MonitoringReportResult, error)
}

// resultsReporter batches current device monitoring states and reports them to
// ThothOS on a fixed cadence. On a failed send it carries the batch forward
// (bounded) rather than dropping the data or replaying at the transport layer.
type resultsReporter struct {
	client    resultsClient
	db        *gorm.DB
	src       DeviceSampleSource
	proxyName string
	maxBuffer int

	// pending is the carry-forward buffer: results not yet acknowledged by a
	// successful send. Deduped by (deviceName, ipAddress) so a long outage keeps
	// the freshest state per device rather than a growing pile of stale dupes,
	// and hard-capped at maxBuffer (oldest dropped).
	pending []thothos.MonitoringResult
}

// runResultsReporter runs the reporter loop until ctx is cancelled
// (disconnect/logout/shutdown stops it cleanly). It lives in the ThothOS session
// alongside the heartbeat and config-sync loops, so it shares their lifecycle —
// it only runs while a live session owns a cancelable context.
func runResultsReporter(ctx context.Context, cfg ThothOSSessionConfig) {
	reporter := &resultsReporter{
		client:    cfg.Client,
		db:        cfg.DB,
		src:       getSampleSource(),
		proxyName: cfg.ProxyName,
		maxBuffer: maxBufferedResults,
	}

	log.Info().Dur("interval", resultsReportInterval).Msg("ThothOS results reporter started")

	ticker := time.NewTicker(resultsReportInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Info().Msg("ThothOS results reporter stopped")
			return
		case <-ticker.C:
			reporter.reportOnce(time.Now())
		}
	}
}

// reportOnce collects the current device states, merges them into the pending
// buffer, and attempts a single-shot report. On success the buffer is cleared;
// on failure it is retained (carried forward) so no observed state is lost.
func (r *resultsReporter) reportOnce(now time.Time) {
	snapshot := collectDeviceResults(r.db, r.src, now)
	r.enqueue(snapshot)

	if len(r.pending) == 0 {
		return
	}

	if _, err := r.client.ReportMonitoringResults(r.proxyName, r.pending); err != nil {
		log.Warn().
			Err(err).
			Int("buffered", len(r.pending)).
			Msg("Failed to report monitoring results to ThothOS; carrying batch forward")
		return
	}

	// Acknowledged — clear the buffer (keep the backing array).
	r.pending = r.pending[:0]
}

// enqueue merges a fresh snapshot into the pending buffer. Entries are deduped by
// (deviceName, ipAddress) so a newer sample supersedes a carried one in place,
// keeping the buffer ~device-count sized and always carrying the freshest state.
// Beyond maxBuffer distinct devices the OLDEST entries are dropped.
func (r *resultsReporter) enqueue(snapshot []thothos.MonitoringResult) {
	if len(snapshot) == 0 {
		return
	}

	index := make(map[string]int, len(r.pending)+len(snapshot))
	for i, res := range r.pending {
		index[resultKey(res)] = i
	}
	for _, res := range snapshot {
		key := resultKey(res)
		if i, ok := index[key]; ok {
			r.pending[i] = res
			continue
		}
		index[key] = len(r.pending)
		r.pending = append(r.pending, res)
	}

	if r.maxBuffer > 0 && len(r.pending) > r.maxBuffer {
		drop := len(r.pending) - r.maxBuffer
		// Reslice into a fresh backing array so the dropped prefix is not aliased.
		r.pending = append([]thothos.MonitoringResult(nil), r.pending[drop:]...)
	}
}

// resultKey is the dedupe identity of a result, matching ThothOS's upsert key
// (companyId is implicit — one proxy, one tenant): device name + IP.
func resultKey(res thothos.MonitoringResult) string {
	return res.DeviceName + "\x00" + res.IPAddress
}

// collectDeviceResults builds the current monitoring-results snapshot from the
// device inventory (DB) joined with the live metrics samples (src). Only devices
// with a REAL status sample this process lifetime are included — a never-polled
// device is "unknown" and is skipped, never reported as down. Returns nil when
// there is nothing to report (no DB, no source, or no sampled devices).
func collectDeviceResults(db *gorm.DB, src DeviceSampleSource, now time.Time) []thothos.MonitoringResult {
	if db == nil || src == nil {
		return nil
	}

	var devices []models.Device
	if err := db.Find(&devices).Error; err != nil {
		log.Error().Err(err).Msg("Results reporter: failed to load devices")
		return nil
	}

	checkedAt := now.UTC().Format(time.RFC3339)
	results := make([]thothos.MonitoringResult, 0, len(devices))

	for i := range devices {
		device := &devices[i]
		// deviceName/ipAddress are required + must be non-empty server-side; skip
		// a malformed row rather than fail the whole batch.
		if device.Hostname == "" || device.IPAddress == "" {
			continue
		}

		statusVal, err := src.DeviceStatus(device.ID, device.IPAddress)
		if err != nil {
			// No sample this lifetime -> unknown. Do NOT report (a never-polled
			// device is not "down").
			continue
		}

		status := "down"
		if statusVal == 1 {
			status = "up"
		}

		result := thothos.MonitoringResult{
			DeviceName: device.Hostname,
			IPAddress:  device.IPAddress,
			DeviceType: device.DeviceType,
			Status:     status,
			CheckedAt:  checkedAt,
		}

		// Latency is only meaningful for a reachable device; a down device's
		// last-successful latency would be stale/misleading.
		if status == "up" {
			if latency, err := src.PingLatency(device.ID, device.IPAddress); err == nil {
				value := latency
				result.LatencyMs = &value
			}
		}

		// Packet loss is meaningful for both up (degraded) and down (100%).
		if loss, err := src.PacketLoss(device.ID, device.IPAddress); err == nil {
			value := loss
			result.PacketLossPct = &value
		}

		results = append(results, result)
	}

	if len(results) == 0 {
		return nil
	}
	return results
}

// startResultsReporter launches the results reporter goroutine under the session
// context. Split out so StartThothOSSession reads as a list of the loops the
// session owns.
func startResultsReporter(ctx context.Context, cfg ThothOSSessionConfig) {
	safego.Go("thothos-results-reporter", func() {
		runResultsReporter(ctx, cfg)
	})
}
