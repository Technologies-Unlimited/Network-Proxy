package icmp

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/metrics"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	probing "github.com/prometheus-community/pro-bing"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// Default poll parameters. These are the fallbacks used until a ThothOS
// polling template overrides them via SetInterval / SetPingParams — the
// hardcoded values are now DEFAULTS, not the only truth.
const (
	defaultICMPInterval = 60 * time.Second
	defaultPingCount    = 4
	defaultPingTimeout  = 5 * time.Second
	// defaultLossThreshold is the packet-loss percentage at or above which a
	// device is considered DOWN. The default of 100 preserves the historical
	// "any packet received = up" semantics (only total loss is down) while
	// still RECORDING partial loss; a ThothOS ICMP monitoring template can
	// lower it (e.g. 25) to make a degraded link alert.
	defaultLossThreshold = 100.0
)

// Collector handles ICMP ping polling for devices
type Collector struct {
	metrics *metrics.Registry
	db      *gorm.DB
	devices map[string]*models.Device
	mu      sync.RWMutex
	// interval, pingCount, pingTimeout and lossThreshold are read under mu so
	// the config-apply step can retune the LIVE poller (the run loop re-reads
	// them every cycle).
	interval      time.Duration
	pingCount     int
	pingTimeout   time.Duration
	lossThreshold float64
	// lastPolled tracks the last time each device was polled so a per-device
	// ICMPInterval (previously a dead field) throttles that device on top of
	// the collector-wide base cadence. Guarded by mu.
	lastPolled map[string]time.Time

	// Raw-socket privilege health. On an unprivileged Linux/container install
	// every ping fails; instead of silently flipping every device to "down"
	// (a false all-down alert storm indistinguishable from a real outage), the
	// collector records the failure ONCE as a persistent health error surfaced
	// on the API, and leaves devices UNKNOWN rather than falsely down.
	healthMu      sync.RWMutex
	rawSocketErr  error
	privCheckOnce sync.Once
}

// NewCollector creates a new ICMP collector
func NewCollector(registry *metrics.Registry, db *gorm.DB) *Collector {
	return &Collector{
		metrics:       registry,
		db:            db,
		devices:       make(map[string]*models.Device),
		interval:      defaultICMPInterval,
		pingCount:     defaultPingCount,
		pingTimeout:   defaultPingTimeout,
		lossThreshold: defaultLossThreshold,
		lastPolled:    make(map[string]time.Time),
	}
}

// AddDevice adds a device to monitor
func (c *Collector) AddDevice(device *models.Device) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.devices[device.ID] = device
	log.Info().Str("device", device.Hostname).Str("ip", device.IPAddress).Msg("Added device to ICMP monitoring")
}

// RemoveDevice removes a device from monitoring
func (c *Collector) RemoveDevice(deviceID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if device, exists := c.devices[deviceID]; exists {
		log.Info().Str("device", device.Hostname).Msg("Removed device from ICMP monitoring")
		delete(c.devices, deviceID)
		delete(c.lastPolled, deviceID)
	}
}

// SetInterval sets the polling interval. Guarded by mu because Start's run
// loop re-reads the interval every cycle — this is what makes a ThothOS
// polling-template frequency actually retune a LIVE collector (previously the
// ticker was created once at Start and SetInterval had no effect on it).
func (c *Collector) SetInterval(interval time.Duration) {
	if interval <= 0 {
		return
	}
	c.mu.Lock()
	c.interval = interval
	c.mu.Unlock()
}

// GetInterval returns the current polling interval.
func (c *Collector) GetInterval() time.Duration {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.interval
}

// SetPingParams overrides the per-ping count and timeout (from a ThothOS
// polling template). Zero/negative values leave the current value unchanged.
func (c *Collector) SetPingParams(count int, timeout time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if count > 0 {
		c.pingCount = count
	}
	if timeout > 0 {
		c.pingTimeout = timeout
	}
}

// pingParams returns the current per-ping count and timeout under the lock.
func (c *Collector) pingParams() (int, time.Duration) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.pingCount, c.pingTimeout
}

// SetLossThreshold sets the packet-loss percentage at or above which a device is
// marked DOWN (from a ThothOS ICMP monitoring template's icmpLossThreshold). A
// non-positive value is ignored; values above 100 clamp to 100.
func (c *Collector) SetLossThreshold(threshold float64) {
	if threshold <= 0 {
		return
	}
	if threshold > 100 {
		threshold = 100
	}
	c.mu.Lock()
	c.lossThreshold = threshold
	c.mu.Unlock()
}

// LossThreshold returns the current packet-loss down-threshold percentage.
func (c *Collector) LossThreshold() float64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.lossThreshold
}

// lossToStatus maps a packet-loss percentage to an up/down status given the
// down-threshold. loss >= threshold is DOWN; anything below is UP (a device
// dropping some but not threshold-many packets is up-but-degraded, and its real
// loss is still recorded on the gauge and device row).
func lossToStatus(loss, threshold float64) string {
	if loss >= threshold {
		return "down"
	}
	return "up"
}

// deviceIntervalLocked returns the effective poll interval for a device: its
// per-device ICMPInterval (seconds) when set, else the collector-wide interval.
// Caller must hold mu.
func (c *Collector) deviceIntervalLocked(device *models.Device) time.Duration {
	if device.ICMPInterval > 0 {
		return time.Duration(device.ICMPInterval) * time.Second
	}
	return c.interval
}

// devicesDue returns the devices that are due for polling at time now and stamps
// their lastPolled to now. A device is due when it has never been polled or when
// at least its effective interval (per-device ICMPInterval, else the collector
// interval) has elapsed since its last poll — with half the base-cadence as
// slack so a device whose interval equals the base cadence isn't skipped every
// other tick by scheduling jitter. This is what makes Device.ICMPInterval (a
// dead field before) actually throttle a device relative to the collector base
// cadence set by the config-apply step.
func (c *Collector) devicesDue(now time.Time) []*models.Device {
	c.mu.Lock()
	defer c.mu.Unlock()
	slack := c.interval / 2
	due := make([]*models.Device, 0, len(c.devices))
	for id, device := range c.devices {
		eff := c.deviceIntervalLocked(device)
		last, seen := c.lastPolled[id]
		if !seen || now.Sub(last) >= eff-slack {
			due = append(due, device)
			c.lastPolled[id] = now
		}
	}
	return due
}

// isPrivilegeError reports whether err looks like a raw-socket privilege denial
// (unprivileged Linux/container). Only these suppress false-down recording and
// raise the persistent health error — a transient/other probe error must not.
func isPrivilegeError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	switch {
	case strings.Contains(msg, "operation not permitted"),
		strings.Contains(msg, "permission denied"),
		strings.Contains(msg, "not permitted"),
		strings.Contains(msg, "socket: permission"):
		return true
	}
	return false
}

// setRawSocketErr records (or clears) the persistent raw-socket health error.
func (c *Collector) setRawSocketErr(err error) {
	c.healthMu.Lock()
	c.rawSocketErr = err
	c.healthMu.Unlock()
}

// HealthError returns the persistent collector health error (nil when healthy).
// A non-nil value means raw-socket ICMP is unavailable and devices are being
// reported UNKNOWN rather than falsely down; the API surfaces this to operators.
func (c *Collector) HealthError() error {
	c.healthMu.RLock()
	defer c.healthMu.RUnlock()
	return c.rawSocketErr
}

// RawSocketAvailable reports whether the raw ICMP socket is usable.
func (c *Collector) RawSocketAvailable() bool {
	return c.HealthError() == nil
}

// rawSocketUnavailable is the internal predicate used to suppress false-down
// recording when the privilege probe flagged a raw-socket denial.
func (c *Collector) rawSocketUnavailable() bool {
	return c.HealthError() != nil
}

// Start begins polling devices.
//
// Probes the local raw-socket privilege once at startup. If the platform
// can't open the right socket type, the collector logs loudly and continues
// (every ping will still fail; the operator at least knows why).
//
// The loop re-reads the interval each cycle (via a per-cycle timer rather than
// a fixed ticker) so a SetInterval call from the config-apply step retunes the
// cadence on the NEXT cycle instead of being silently ignored.
func (c *Collector) Start(ctx context.Context) {
	c.checkPrivilege()

	log.Info().Dur("interval", c.GetInterval()).Msg("ICMP collector started")

	c.pollAllDevices(ctx)

	for {
		timer := time.NewTimer(c.GetInterval())
		select {
		case <-timer.C:
			c.pollAllDevices(ctx)
		case <-ctx.Done():
			timer.Stop()
			log.Info().Msg("ICMP collector stopped")
			return
		}
	}
}

// checkPrivilege verifies (once) that pro-bing can run a privileged pinger
// against the loopback address. If it fails with a permission-class error the
// collector records a PERSISTENT health error (surfaced via HealthError() on the
// API) rather than the old warn-once-and-continue that then flipped every device
// to a false "down". probePrivilege is the pure, testable core.
func (c *Collector) checkPrivilege() {
	c.privCheckOnce.Do(func() {
		if err := privilegeProbe(); err != nil {
			if isPrivilegeError(err) {
				c.setRawSocketErr(fmt.Errorf(
					"ICMP raw socket unavailable (%w); devices report UNKNOWN, not down, until the process gets CAP_NET_RAW (Linux) or admin (Windows); surfaced on /health",
					err))
				log.Error().Err(err).Msg("ICMP raw socket unavailable; devices will report UNKNOWN (not down) until privilege is granted")
			} else {
				// Non-permission probe glitch: log, but do NOT claim a
				// privilege problem or suppress real down-recording.
				log.Warn().Err(err).Msg("ICMP privilege probe: non-permission error")
			}
			return
		}
		log.Info().Msg("ICMP privilege probe: raw socket OK")
	})
}

// privilegeProbe is the seam checkPrivilege runs to detect a raw-socket
// privilege denial. It is a package var so tests can simulate an unprivileged
// Linux/container host — the real probe succeeds on the Windows dev/CI box
// (raw ICMP sockets are permitted without elevation there), so the
// permission-denied recording path is otherwise unreachable in a test.
var privilegeProbe = probePrivilege

// probePrivilege runs a single loopback ping with a privileged raw socket and
// returns the resulting error (nil when the socket is usable).
func probePrivilege() error {
	probe, err := probing.NewPinger("127.0.0.1")
	if err != nil {
		return err
	}
	probe.SetPrivileged(true)
	probe.Count = 1
	probe.Timeout = 500 * time.Millisecond
	return probe.Run()
}

// pollAllDevices polls the devices that are due this cycle concurrently. Which
// devices are "due" honors each device's per-device ICMPInterval on top of the
// collector-wide base cadence (see devicesDue).
func (c *Collector) pollAllDevices(ctx context.Context) {
	devices := c.devicesDue(time.Now())

	var wg sync.WaitGroup
	// Use semaphore to limit concurrent pings (avoid overwhelming network)
	sem := make(chan struct{}, 100)

	for _, device := range devices {
		wg.Add(1)
		go func(d *models.Device) {
			defer wg.Done()
			sem <- struct{}{}        // Acquire
			defer func() { <-sem }() // Release

			c.pollDevice(ctx, d)
		}(device)
	}

	wg.Wait()
}

// pollDevice performs a single ping to a device, records its packet loss, and
// derives up/down from the loss threshold (not the old binary "any packet = up").
func (c *Collector) pollDevice(ctx context.Context, device *models.Device) {
	pinger, err := probing.NewPinger(device.IPAddress)
	if err != nil {
		log.Error().Err(err).Str("device", device.Hostname).Msg("Failed to create pinger")
		c.metrics.RecordPingFailure(device.ID, device.IPAddress)
		c.recordDown(device)
		return
	}

	// Windows requires SetPrivileged(true) to avoid socket errors
	// Despite the name, this works on Windows 10 without admin privileges
	pinger.SetPrivileged(true)
	// Count/timeout come from the collector's current config (a ThothOS
	// polling template can override the 4-ping / 5s defaults).
	count, timeout := c.pingParams()
	pinger.Count = count
	pinger.Timeout = timeout

	startTime := time.Now()
	// RunWithContext returns when the ping completes OR ctx is cancelled,
	// so a shutdown doesn't have to wait the full 5s timeout per device.
	err = pinger.RunWithContext(ctx)
	duration := time.Since(startTime)
	if err != nil && ctx.Err() != nil {
		// Cancelled mid-ping; don't spam metrics with a fake "down".
		return
	}

	if err != nil {
		log.Error().Err(err).Str("device", device.Hostname).Msg("Ping failed")
		c.metrics.RecordPingFailure(device.ID, device.IPAddress)
		c.recordDown(device)
		return
	}

	stats := pinger.Statistics()
	loss := stats.PacketLoss // percentage 0-100

	if stats.PacketsRecv > 0 {
		latency := stats.AvgRtt.Milliseconds()
		log.Debug().
			Str("device", device.Hostname).
			Str("ip", device.IPAddress).
			Int64("latency_ms", latency).
			Float64("packet_loss", loss).
			Msg("Ping completed")

		c.metrics.RecordPingSuccess(device.ID, device.IPAddress, float64(latency))
	} else {
		log.Warn().
			Str("device", device.Hostname).
			Dur("duration", duration).
			Float64("packet_loss", loss).
			Msg("Ping timeout (100% loss)")

		c.metrics.RecordPingFailure(device.ID, device.IPAddress)
		loss = 100
	}

	c.recordLossAndStatus(device, loss)
}

// recordDown records a device as fully lost (100% loss). If the raw socket is
// known-unavailable (a privilege failure), it records NOTHING for status/loss —
// leaving the device UNKNOWN — because with no raw socket we cannot measure any
// device, and emitting "down" for the whole fleet is a false all-down storm. The
// persistent HealthError() surfaces the real cause instead.
func (c *Collector) recordDown(device *models.Device) {
	if c.rawSocketUnavailable() {
		return
	}
	c.recordLossAndStatus(device, 100)
}

// recordLossAndStatus writes the packet-loss gauge, derives up/down from the
// loss threshold, records the status gauge, and persists status + packet_loss to
// the device row.
func (c *Collector) recordLossAndStatus(device *models.Device, loss float64) {
	if loss < 0 {
		loss = 0
	}
	if loss > 100 {
		loss = 100
	}

	status := lossToStatus(loss, c.LossThreshold())

	if c.metrics != nil {
		c.metrics.RecordPacketLoss(device.ID, device.IPAddress, loss)
		var statusVal float64
		if status == "up" {
			statusVal = 1
		}
		c.metrics.RecordDeviceStatus(device.ID, device.IPAddress, statusVal)
	}

	if c.db == nil {
		return
	}
	updates := map[string]interface{}{
		"status":      status,
		"packet_loss": loss,
	}
	if status == "up" {
		updates["last_seen"] = time.Now()
	}
	c.db.Model(&models.Device{}).Where("id = ?", device.ID).Updates(updates)
}

// GetDeviceCount returns the number of monitored devices
func (c *Collector) GetDeviceCount() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.devices)
}
