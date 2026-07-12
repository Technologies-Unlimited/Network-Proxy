package snmp

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/metrics"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/gosnmp/gosnmp"
	"github.com/rs/zerolog/log"
)

// Collector handles SNMP polling for devices
type Collector struct {
	metrics  *metrics.Registry
	devices  map[string]*SNMPDevice
	mu       sync.RWMutex
	interval time.Duration
}

// SNMPDevice represents a device configured for SNMP monitoring
type SNMPDevice struct {
	Device   *models.Device
	Template *models.SNMPTemplate
}

// NewCollector creates a new SNMP collector
func NewCollector(registry *metrics.Registry) *Collector {
	return &Collector{
		metrics:  registry,
		devices:  make(map[string]*SNMPDevice),
		interval: 60 * time.Second,
	}
}

// AddDevice adds a device with SNMP template to monitor
func (c *Collector) AddDevice(device *models.Device, template *models.SNMPTemplate) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.devices[device.ID] = &SNMPDevice{
		Device:   device,
		Template: template,
	}

	log.Info().
		Str("device", device.Hostname).
		Str("ip", device.IPAddress).
		Str("version", template.Version).
		Msg("Added device to SNMP monitoring")
}

// RemoveDevice removes a device from monitoring
func (c *Collector) RemoveDevice(deviceID string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if device, exists := c.devices[deviceID]; exists {
		log.Info().Str("device", device.Device.Hostname).Msg("Removed device from SNMP monitoring")
		delete(c.devices, deviceID)
		// Drain the device's Prometheus series so /metrics (and RSS) don't retain
		// orphaned SNMP children for a device we no longer poll.
		if c.metrics != nil {
			c.metrics.ForgetDevice(deviceID)
		}
	}
}

// SetInterval sets the polling interval. Guarded by mu because Start's run
// loop re-reads it every cycle, so a ThothOS polling-template frequency can
// retune a LIVE collector (previously the ticker was fixed at Start and
// SetInterval was inert).
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

// Start begins polling devices. The loop re-reads the interval each cycle so a
// SetInterval call from the config-apply step retunes the cadence on the next
// cycle instead of being ignored.
func (c *Collector) Start(ctx context.Context) {
	log.Info().Dur("interval", c.GetInterval()).Msg("SNMP collector started")

	// Initial poll
	c.pollAllDevices(ctx)

	for {
		timer := time.NewTimer(c.GetInterval())
		select {
		case <-timer.C:
			c.pollAllDevices(ctx)
		case <-ctx.Done():
			timer.Stop()
			log.Info().Msg("SNMP collector stopped")
			return
		}
	}
}

// pollAllDevices polls all registered devices concurrently
func (c *Collector) pollAllDevices(ctx context.Context) {
	c.mu.RLock()
	devices := make([]*SNMPDevice, 0, len(c.devices))
	for _, device := range c.devices {
		devices = append(devices, device)
	}
	c.mu.RUnlock()

	var wg sync.WaitGroup
	sem := make(chan struct{}, 50) // Limit concurrent SNMP queries

	for _, snmpDevice := range devices {
		wg.Add(1)
		go func(sd *SNMPDevice) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			c.pollDevice(ctx, sd)
		}(snmpDevice)
	}

	wg.Wait()
}

// pollDevice performs SNMP polling on a device
func (c *Collector) pollDevice(ctx context.Context, snmpDevice *SNMPDevice) {
	device := snmpDevice.Device
	template := snmpDevice.Template

	// Create SNMP connection
	snmpClient := &gosnmp.GoSNMP{
		Target:    device.IPAddress,
		Port:      161,
		Community: template.Community,
		Version:   c.getSNMPVersion(template.Version),
		Timeout:   5 * time.Second,
		Retries:   1,
	}

	// Configure SNMPv3 if needed
	if template.Version == "v3" {
		c.configureSNMPv3(snmpClient, template)
	}

	err := snmpClient.Connect()
	if err != nil {
		log.Error().Err(err).Str("device", device.Hostname).Msg("Failed to connect SNMP")
		c.metrics.RecordSNMPFailure(device.ID, device.IPAddress)
		return
	}
	defer snmpClient.Conn.Close()

	// Poll each OID in the template
	for _, oid := range template.OIDs {
		c.pollOID(snmpClient, device, oid)
	}
}

// pollOID queries a single OID and records the metric
func (c *Collector) pollOID(client *gosnmp.GoSNMP, device *models.Device, oid models.OID) {
	result, err := client.Get([]string{oid.OID})
	if err != nil {
		log.Error().
			Err(err).
			Str("device", device.Hostname).
			Str("oid", oid.OID).
			Msg("Failed to get SNMP value")
		return
	}

	if len(result.Variables) == 0 {
		log.Warn().
			Str("device", device.Hostname).
			Str("oid", oid.OID).
			Msg("No SNMP variables returned")
		return
	}

	variable := result.Variables[0]
	value := c.getSNMPValue(variable)

	log.Debug().
		Str("device", device.Hostname).
		Str("oid", oid.OID).
		Str("name", oid.Name).
		Interface("value", value).
		Msg("SNMP value retrieved")

	// Record metric
	c.metrics.RecordSNMPValue(device.ID, device.IPAddress, oid.Name, value)
}

// getSNMPVersion converts string version to gosnmp version
func (c *Collector) getSNMPVersion(version string) gosnmp.SnmpVersion {
	switch version {
	case "v1":
		return gosnmp.Version1
	case "v2c":
		return gosnmp.Version2c
	case "v3":
		return gosnmp.Version3
	default:
		return gosnmp.Version2c
	}
}

// configureSNMPv3 sets up SNMPv3 parameters
func (c *Collector) configureSNMPv3(client *gosnmp.GoSNMP, template *models.SNMPTemplate) {
	client.SecurityModel = gosnmp.UserSecurityModel
	client.MsgFlags = gosnmp.AuthPriv
	client.SecurityParameters = &gosnmp.UsmSecurityParameters{
		UserName:                 template.Username,
		AuthenticationProtocol:   c.getAuthProtocol(template.AuthProtocol),
		AuthenticationPassphrase: template.AuthPassword,
		PrivacyProtocol:          c.getPrivProtocol(template.PrivProtocol),
		PrivacyPassphrase:        template.PrivPassword,
	}
}

// getAuthProtocol converts string to gosnmp auth protocol
func (c *Collector) getAuthProtocol(protocol string) gosnmp.SnmpV3AuthProtocol {
	switch protocol {
	case "MD5":
		return gosnmp.MD5
	case "SHA":
		return gosnmp.SHA
	case "SHA224":
		return gosnmp.SHA224
	case "SHA256":
		return gosnmp.SHA256
	case "SHA384":
		return gosnmp.SHA384
	case "SHA512":
		return gosnmp.SHA512
	default:
		return gosnmp.NoAuth
	}
}

// getPrivProtocol converts string to gosnmp privacy protocol
func (c *Collector) getPrivProtocol(protocol string) gosnmp.SnmpV3PrivProtocol {
	switch protocol {
	case "DES":
		return gosnmp.DES
	case "AES":
		return gosnmp.AES
	case "AES192":
		return gosnmp.AES192
	case "AES256":
		return gosnmp.AES256
	case "AES192C":
		return gosnmp.AES192C
	case "AES256C":
		return gosnmp.AES256C
	default:
		return gosnmp.NoPriv
	}
}

// getSNMPValue extracts the value from SNMP variable
func (c *Collector) getSNMPValue(variable gosnmp.SnmpPDU) interface{} {
	switch variable.Type {
	case gosnmp.OctetString:
		return string(variable.Value.([]byte))
	case gosnmp.Integer:
		return variable.Value
	case gosnmp.Counter32, gosnmp.Counter64, gosnmp.Gauge32:
		return fmt.Sprintf("%d", variable.Value)
	case gosnmp.TimeTicks:
		return fmt.Sprintf("%d", variable.Value)
	case gosnmp.IPAddress:
		return variable.Value
	default:
		// Coerce unknown SNMP types to a string; the previous "return raw
		// interface{}" path produced values that callers (Prometheus gauge,
		// JSON encoder, struct decoders) would silently drop or panic on.
		// Stringifying gives a deterministic representation we can log,
		// store, and surface in the UI.
		if variable.Value == nil {
			return ""
		}
		return fmt.Sprintf("%v", variable.Value)
	}
}

// GetDeviceCount returns the number of monitored devices
func (c *Collector) GetDeviceCount() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.devices)
}

// DeviceTemplate returns the SNMP template registered for a device (the exact
// pointer pollDevice iterates OIDs on), or nil if the device isn't monitored.
// Exposed so callers/tests can verify the template handed to the collector is
// fully hydrated — critically, that its many2many OIDs association was preloaded
// by the feeding query; an empty template.OIDs means the poller walks nothing.
func (c *Collector) DeviceTemplate(deviceID string) *models.SNMPTemplate {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if sd, ok := c.devices[deviceID]; ok {
		return sd.Template
	}
	return nil
}
