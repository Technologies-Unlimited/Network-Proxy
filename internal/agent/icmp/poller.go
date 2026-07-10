package icmp

import (
	"context"
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
)

// Collector handles ICMP ping polling for devices
type Collector struct {
	metrics *metrics.Registry
	db      *gorm.DB
	devices map[string]*models.Device
	mu      sync.RWMutex
	// interval, pingCount and pingTimeout are read under mu so the config-apply
	// step can retune the LIVE poller (the run loop re-reads them every cycle).
	interval    time.Duration
	pingCount   int
	pingTimeout time.Duration
}

// NewCollector creates a new ICMP collector
func NewCollector(registry *metrics.Registry, db *gorm.DB) *Collector {
	return &Collector{
		metrics:     registry,
		db:          db,
		devices:     make(map[string]*models.Device),
		interval:    defaultICMPInterval,
		pingCount:   defaultPingCount,
		pingTimeout: defaultPingTimeout,
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
	checkPrivilegeOnce()

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

var privilegeCheckOnce sync.Once

// checkPrivilegeOnce verifies that pro-bing can construct a privileged
// pinger against the loopback address. If the call to Run() fails with
// "operation not permitted" or "permission denied", we log a single Warn —
// otherwise this would spam every 60s for every device.
func checkPrivilegeOnce() {
	privilegeCheckOnce.Do(func() {
		probe, err := probing.NewPinger("127.0.0.1")
		if err != nil {
			log.Warn().Err(err).Msg("ICMP privilege probe: pinger init failed")
			return
		}
		probe.SetPrivileged(true)
		probe.Count = 1
		probe.Timeout = 500 * time.Millisecond
		if err := probe.Run(); err != nil {
			log.Warn().
				Err(err).
				Msg("ICMP raw socket appears unavailable; pings will fail until the process gets the right privilege (Linux: CAP_NET_RAW; Windows: admin OR set pinger.SetPrivileged(false))")
		} else {
			log.Info().Msg("ICMP privilege probe: raw socket OK")
		}
	})
}

// pollAllDevices polls all registered devices concurrently
func (c *Collector) pollAllDevices(ctx context.Context) {
	c.mu.RLock()
	devices := make([]*models.Device, 0, len(c.devices))
	for _, device := range c.devices {
		devices = append(devices, device)
	}
	c.mu.RUnlock()

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

// pollDevice performs a single ping to a device
func (c *Collector) pollDevice(ctx context.Context, device *models.Device) {
	pinger, err := probing.NewPinger(device.IPAddress)
	if err != nil {
		log.Error().Err(err).Str("device", device.Hostname).Msg("Failed to create pinger")
		c.metrics.RecordPingFailure(device.ID, device.IPAddress)
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
		c.metrics.RecordDeviceStatus(device.ID, device.IPAddress, 0) // Down
		return
	}

	stats := pinger.Statistics()

	if stats.PacketsRecv > 0 {
		latency := stats.AvgRtt.Milliseconds()
		log.Debug().
			Str("device", device.Hostname).
			Str("ip", device.IPAddress).
			Int64("latency_ms", latency).
			Msg("Ping successful")

		c.metrics.RecordPingSuccess(device.ID, device.IPAddress, float64(latency))
		c.metrics.RecordDeviceStatus(device.ID, device.IPAddress, 1) // Up

		// Update device status in database
		now := time.Now()
		c.db.Model(&models.Device{}).Where("id = ?", device.ID).Updates(map[string]interface{}{
			"status":    "up",
			"last_seen": now,
		})
	} else {
		log.Warn().
			Str("device", device.Hostname).
			Dur("duration", duration).
			Msg("Ping timeout")

		c.metrics.RecordPingFailure(device.ID, device.IPAddress)
		c.metrics.RecordDeviceStatus(device.ID, device.IPAddress, 0) // Down

		// Update device status in database
		c.db.Model(&models.Device{}).Where("id = ?", device.ID).Update("status", "down")
	}
}

// GetDeviceCount returns the number of monitored devices
func (c *Collector) GetDeviceCount() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.devices)
}
