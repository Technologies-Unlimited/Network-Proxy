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

// Collector handles ICMP ping polling for devices
type Collector struct {
	metrics  *metrics.Registry
	db       *gorm.DB
	devices  map[string]*models.Device
	mu       sync.RWMutex
	interval time.Duration
}

// NewCollector creates a new ICMP collector
func NewCollector(registry *metrics.Registry, db *gorm.DB) *Collector {
	return &Collector{
		metrics:  registry,
		db:       db,
		devices:  make(map[string]*models.Device),
		interval: 60 * time.Second, // Default 60 second interval
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

// SetInterval sets the polling interval
func (c *Collector) SetInterval(interval time.Duration) {
	c.interval = interval
}

// Start begins polling devices
func (c *Collector) Start(ctx context.Context) {
	ticker := time.NewTicker(c.interval)
	defer ticker.Stop()

	log.Info().Dur("interval", c.interval).Msg("ICMP collector started")

	// Initial poll
	c.pollAllDevices(ctx)

	for {
		select {
		case <-ticker.C:
			c.pollAllDevices(ctx)
		case <-ctx.Done():
			log.Info().Msg("ICMP collector stopped")
			return
		}
	}
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
	pinger.Count = 4
	pinger.Timeout = 5 * time.Second

	startTime := time.Now()
	err = pinger.Run()
	duration := time.Since(startTime)

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
