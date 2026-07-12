package api

import "sync"

// MetricsQuerier is the subset of the live metrics registry the visualization
// and reporting handlers read to serve REAL monitoring numbers (never invented
// ones). It is an interface — not the concrete *metrics.LocalQuerier — so the
// api package stays decoupled from the metrics package and the handlers are
// trivially stubbable in tests.
//
// A non-nil error from either method means the device has NO real sample this
// process lifetime (never polled / unmeasurable): the caller MUST surface that
// as an explicit "no data" result, never as a fabricated value.
type MetricsQuerier interface {
	// PingLatency is the most recent ICMP latency (ms) for a device.
	PingLatency(deviceID, ipAddress string) (float64, error)
	// PingCounts is the cumulative (success, failure) ping counts, the real
	// basis for availability%: success / (success + failure) * 100.
	PingCounts(deviceID, ipAddress string) (success, failure float64, err error)
}

var (
	metricsQuerierMu sync.RWMutex
	metricsQuerier   MetricsQuerier
)

// SetMetricsQuerier wires the live metrics registry into the api package so the
// visualization + report handlers read real per-device latency/availability.
// Called once from main.go after the registry is built, following the same
// package-hook pattern as SetSampleSource / SetCollectors / SetAlertEngine.
func SetMetricsQuerier(q MetricsQuerier) {
	metricsQuerierMu.Lock()
	defer metricsQuerierMu.Unlock()
	metricsQuerier = q
}

// getMetricsQuerier returns the wired querier, or nil if none is wired (unit
// tests / a build with no collectors). A nil querier makes the handlers return
// an honest "no data yet" result rather than crash or invent numbers.
func getMetricsQuerier() MetricsQuerier {
	metricsQuerierMu.RLock()
	defer metricsQuerierMu.RUnlock()
	return metricsQuerier
}
