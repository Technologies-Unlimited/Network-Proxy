package database

import (
	"fmt"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/icmp"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/snmp"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// SeedDefaults populates a fresh install with its out-of-box defaults: the
// default monitoring targets AND the default alert rules. Both underlying seeds
// are idempotent (they no-op when their table already has rows), so this is safe
// to call on every boot — a fresh DB gets seeded, an existing DB is untouched.
//
// This is the single wiring point runServer calls after migrations. Before it
// existed, SeedDefaultDevices and SeedDefaultAlertRules had ZERO callers, so a
// brand-new install shipped with no alert rules and the alerting engine ran but
// evaluated nothing — a "device down" never alerted out of the box.
func SeedDefaults(db *gorm.DB) error {
	if err := SeedDefaultDevices(db); err != nil {
		return fmt.Errorf("seeding default devices: %w", err)
	}
	if err := SeedDefaultAlertRules(db); err != nil {
		return fmt.Errorf("seeding default alert rules: %w", err)
	}
	return nil
}

// SeedDefaultDevices adds default monitoring targets to the database
func SeedDefaultDevices(db *gorm.DB) error {
	// Check if any devices already exist. A swallowed error here reads as
	// count==0 and would (wrongly) re-seed on top of existing rows.
	var count int64
	if err := db.Model(&models.Device{}).Count(&count).Error; err != nil {
		return fmt.Errorf("counting existing devices: %w", err)
	}

	if count > 0 {
		log.Info().Int64("count", count).Msg("Devices already exist, skipping seed")
		return nil
	}

	log.Info().Msg("Seeding default monitoring targets...")

	// Create devices without agent_id (will be handled separately)
	defaultDevices := []*models.Device{
		{
			Hostname:     "Google DNS (Primary)",
			IPAddress:    "8.8.8.8",
			DeviceType:   "server",
			Location:     "Google Cloud",
			Description:  "Google Public DNS - Primary",
			ICMPEnabled:  true,
			ICMPInterval: 60,
			Status:       "unknown",
		},
		{
			Hostname:     "Google DNS (Secondary)",
			IPAddress:    "8.8.4.4",
			DeviceType:   "server",
			Location:     "Google Cloud",
			Description:  "Google Public DNS - Secondary",
			ICMPEnabled:  true,
			ICMPInterval: 60,
			Status:       "unknown",
		},
		{
			Hostname:     "Cloudflare DNS (Primary)",
			IPAddress:    "1.1.1.1",
			DeviceType:   "server",
			Location:     "Cloudflare",
			Description:  "Cloudflare Public DNS - Primary",
			ICMPEnabled:  true,
			ICMPInterval: 60,
			Status:       "unknown",
		},
		{
			Hostname:     "Cloudflare DNS (Secondary)",
			IPAddress:    "1.0.0.1",
			DeviceType:   "server",
			Location:     "Cloudflare",
			Description:  "Cloudflare Public DNS - Secondary",
			ICMPEnabled:  true,
			ICMPInterval: 60,
			Status:       "unknown",
		},
		{
			Hostname:     "Google DNS FQDN",
			IPAddress:    "dns.google",
			DeviceType:   "server",
			Location:     "Google Cloud",
			Description:  "Google Public DNS via FQDN",
			ICMPEnabled:  true,
			ICMPInterval: 60,
			Status:       "unknown",
		},
		{
			Hostname:     "Cloudflare DNS FQDN",
			IPAddress:    "one.one.one.one",
			DeviceType:   "server",
			Location:     "Cloudflare",
			Description:  "Cloudflare DNS via FQDN",
			ICMPEnabled:  true,
			ICMPInterval: 60,
			Status:       "unknown",
		},
	}

	for _, device := range defaultDevices {
		if err := db.Omit("AgentID").Create(&device).Error; err != nil {
			log.Error().Err(err).Str("hostname", device.Hostname).Msg("Failed to seed device")
			return err
		}
		log.Info().Str("hostname", device.Hostname).Str("address", device.IPAddress).Msg("Seeded device")
	}

	log.Info().Int("count", len(defaultDevices)).Msg("Successfully seeded default devices")
	return nil
}

// LoadDevicesIntoCollectors loads all devices from database into monitoring collectors
func LoadDevicesIntoCollectors(db *gorm.DB, icmpCollector *icmp.Collector, snmpCollector *snmp.Collector) {
	var devices []models.Device

	// Nested preload loads each device's SNMPTemplate AND that template's
	// many2many OIDs. The walker's pollDevice ranges over template.OIDs, so
	// preloading only "SNMPTemplate" (without ".OIDs") hands the collector an
	// OID-less template and the device connects but polls ZERO metrics.
	if err := db.Preload("SNMPTemplate.OIDs").Find(&devices).Error; err != nil {
		log.Error().Err(err).Msg("Failed to load devices from database")
		return
	}

	log.Info().Int("count", len(devices)).Msg("Loading devices into collectors")

	for _, device := range devices {
		if device.ICMPEnabled {
			icmpCollector.AddDevice(&device)
			log.Info().Str("hostname", device.Hostname).Str("address", device.IPAddress).Msg("Added device to ICMP monitoring")
		}
		if device.SNMPEnabled && device.SNMPTemplate != nil {
			snmpCollector.AddDevice(&device, device.SNMPTemplate)
			log.Info().Str("hostname", device.Hostname).Str("address", device.IPAddress).Msg("Added device to SNMP monitoring")
		}
	}

	log.Info().Msg("Devices loaded into collectors")
}

// SeedDefaultAlertRules adds default alert rules for monitoring
func SeedDefaultAlertRules(db *gorm.DB) error {
	// Check if any alert rules already exist. A swallowed error here reads as
	// count==0 and would (wrongly) re-seed on top of existing rows.
	var count int64
	if err := db.Model(&models.AlertRule{}).Count(&count).Error; err != nil {
		return fmt.Errorf("counting existing alert rules: %w", err)
	}

	if count > 0 {
		log.Info().Int64("count", count).Msg("Alert rules already exist, skipping seed")
		return nil
	}

	log.Info().Msg("Seeding default alert rules...")

	defaultRules := []*models.AlertRule{
		{
			Name:        "Device Down - Critical",
			Description: "Triggers when a device fails to respond to ICMP ping",
			Enabled:     true,
			Severity:    "critical",
			Source:      "icmp",
			Metric:      "device_status",
			Condition:   "eq",
			Threshold:   "0",
			Duration:    60, // 1 minute
		},
		{
			Name:        "High Latency - Warning",
			Description: "Triggers when ping latency exceeds 200ms",
			Enabled:     true,
			Severity:    "warning",
			Source:      "icmp",
			Metric:      "ping_latency",
			Condition:   "gt",
			Threshold:   "200",
			Duration:    120, // 2 minutes
		},
		{
			Name:        "Critical Latency",
			Description: "Triggers when ping latency exceeds 500ms",
			Enabled:     true,
			Severity:    "critical",
			Source:      "icmp",
			Metric:      "ping_latency",
			Condition:   "gt",
			Threshold:   "500",
			Duration:    60, // 1 minute
		},
		{
			Name:        "Device Offline Extended",
			Description: "Triggers when device hasn't been seen for 5 minutes",
			Enabled:     true,
			Severity:    "warning",
			Source:      "icmp",
			Metric:      "last_seen",
			Condition:   "gt",
			Threshold:   "300", // 5 minutes in seconds
			Duration:    0,     // Immediate
		},
		{
			Name:        "Packet Loss Detected",
			Description: "Triggers when packet loss is detected during ping",
			Enabled:     true,
			Severity:    "warning",
			Source:      "icmp",
			Metric:      "packet_loss",
			Condition:   "gt",
			Threshold:   "25", // 25% packet loss
			Duration:    180,  // 3 minutes
		},
	}

	for _, rule := range defaultRules {
		if err := db.Create(&rule).Error; err != nil {
			log.Error().Err(err).Str("rule", rule.Name).Msg("Failed to seed alert rule")
			return err
		}
		log.Info().Str("rule", rule.Name).Str("severity", rule.Severity).Msg("Seeded alert rule")
	}

	log.Info().Int("count", len(defaultRules)).Msg("Successfully seeded default alert rules")
	return nil
}
