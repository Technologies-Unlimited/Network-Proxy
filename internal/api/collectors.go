package api

import (
	"sync"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/icmp"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/snmp"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"gorm.io/gorm"
)

// LiveCollectors bundles the running per-protocol collectors so API handlers
// (device create/update/delete) and the config-apply step can mutate the LIVE
// pollers — add/remove devices and retune intervals — instead of only writing
// the DB. Before this hook existed, devices entered the collectors solely via
// boot-time LoadDevicesIntoCollectors, so a UI/API/discovery-created device was
// never polled until an undocumented process restart (audit P1 #3).
type LiveCollectors struct {
	ICMP *icmp.Collector
	SNMP *snmp.Collector
}

var (
	collectorsMu   sync.RWMutex
	liveCollectors *LiveCollectors
)

// SetCollectors wires the running collectors into the API package. Called once
// from main.go after the collectors are constructed. Follows the same
// package-hook pattern as SetAlertEngine / SetMetricsHandler.
func SetCollectors(icmpC *icmp.Collector, snmpC *snmp.Collector) {
	collectorsMu.Lock()
	defer collectorsMu.Unlock()
	liveCollectors = &LiveCollectors{ICMP: icmpC, SNMP: snmpC}
}

// GetCollectors returns the registered collectors, or nil if none are wired
// (e.g. unit tests that don't run the collectors).
func GetCollectors() *LiveCollectors {
	collectorsMu.RLock()
	defer collectorsMu.RUnlock()
	return liveCollectors
}

// CollectorHealth is the operator-facing health of the live collectors, surfaced
// on /health. It exists so an unprivileged raw-socket ICMP install (every ping
// failing) is a VISIBLE, persistent error instead of a silent all-devices-down
// dataset that looks like a real outage.
type CollectorHealth struct {
	// ICMPRawSocketAvailable is false when the ICMP collector could not open a
	// privileged raw socket; while false, devices are reported UNKNOWN (not
	// down) and ICMPHealthError explains why.
	ICMPRawSocketAvailable bool   `json:"icmpRawSocketAvailable"`
	ICMPHealthError        string `json:"icmpHealthError,omitempty"`
}

// collectorHealth reads the current live-collector health. When no collectors
// are wired (unit tests / pre-boot) it reports healthy defaults.
func collectorHealth() CollectorHealth {
	health := CollectorHealth{ICMPRawSocketAvailable: true}
	lc := GetCollectors()
	if lc != nil && lc.ICMP != nil {
		if err := lc.ICMP.HealthError(); err != nil {
			health.ICMPRawSocketAvailable = false
			health.ICMPHealthError = err.Error()
		}
	}
	return health
}

// wireDeviceIntoCollectors adds a device to the live collectors according to
// its enabled protocols, mirroring database.LoadDevicesIntoCollectors so a
// runtime-created device is polled immediately. Safe (no-op) when no collectors
// are wired. If the device's SNMP template isn't already loaded, it is fetched
// so the SNMP collector has the credentials/OIDs it needs.
func wireDeviceIntoCollectors(db *gorm.DB, device *models.Device) {
	lc := GetCollectors()
	if lc == nil {
		return
	}
	if device.ICMPEnabled && lc.ICMP != nil {
		lc.ICMP.AddDevice(device)
	}
	if device.SNMPEnabled && lc.SNMP != nil {
		if device.SNMPTemplate == nil && device.SNMPTemplateID != nil && db != nil {
			var tmpl models.SNMPTemplate
			// Preload("OIDs") is required: the walker's pollDevice ranges over
			// template.OIDs, so fetching the template without its many2many OIDs
			// hands the collector an OID-less template and the device polls
			// ZERO metrics (it connects but walks nothing).
			if err := db.Preload("OIDs").First(&tmpl, "id = ?", *device.SNMPTemplateID).Error; err == nil {
				device.SNMPTemplate = &tmpl
			}
		}
		if device.SNMPTemplate != nil {
			lc.SNMP.AddDevice(device, device.SNMPTemplate)
		}
	}
}

// unwireDeviceFromCollectors removes a device from both live collectors. Safe
// (no-op) when no collectors are wired or the device isn't monitored.
func unwireDeviceFromCollectors(deviceID string) {
	lc := GetCollectors()
	if lc == nil {
		return
	}
	if lc.ICMP != nil {
		lc.ICMP.RemoveDevice(deviceID)
	}
	if lc.SNMP != nil {
		lc.SNMP.RemoveDevice(deviceID)
	}
}
