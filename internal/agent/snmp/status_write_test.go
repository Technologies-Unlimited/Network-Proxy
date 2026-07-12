package snmp

import (
	"path/filepath"
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// snmpStatusDB builds an isolated, migrated SQLite database for the reachability
// status-write tests.
func snmpStatusDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := filepath.Join(t.TempDir(), "snmp_status.db")
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&models.Device{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	t.Cleanup(func() {
		if sqlDB, err := db.DB(); err == nil {
			sqlDB.Close()
		}
	})
	return db
}

// TestSNMPRecordReachabilityWritesStatusForSNMPOnlyDevice proves the SNMP
// collector persists an up/down Device.Status for a device it monitors — closing
// the "SNMP-only device stuck 'unknown' forever even while being polled
// successfully" gap (Device.Status used to be written ONLY by the ICMP poller).
func TestSNMPRecordReachabilityWritesStatusForSNMPOnlyDevice(t *testing.T) {
	db := snmpStatusDB(t)
	c := NewCollector(nil, db)

	dev := &models.Device{
		Hostname: "snmp-only", IPAddress: "10.0.0.50",
		Status: "unknown", ICMPEnabled: false, SNMPEnabled: true,
	}
	if err := db.Create(dev).Error; err != nil {
		t.Fatalf("seed device: %v", err)
	}

	// A successful poll -> up + LastSeen stamped.
	c.recordReachability(dev, true)
	var got models.Device
	if err := db.First(&got, "id = ?", dev.ID).Error; err != nil {
		t.Fatal(err)
	}
	if got.Status != "up" {
		t.Errorf("successful SNMP poll left status %q, want up (SNMP-only device stuck non-up)", got.Status)
	}
	if got.LastSeen == nil {
		t.Errorf("successful SNMP poll did not stamp LastSeen")
	}

	// A failed poll -> down (not left as a stale 'up').
	c.recordReachability(dev, false)
	if err := db.First(&got, "id = ?", dev.ID).Error; err != nil {
		t.Fatal(err)
	}
	if got.Status != "down" {
		t.Errorf("failed SNMP poll left status %q, want down", got.Status)
	}
}

// TestSNMPRecordReachabilityLeavesICMPOwnedDeviceAlone proves the single-writer
// guard: when ICMP is enabled it owns Device.Status (loss-based up/down), so the
// SNMP collector must NOT also write it — otherwise two collectors race the same
// column and flip a device's status against each other.
func TestSNMPRecordReachabilityLeavesICMPOwnedDeviceAlone(t *testing.T) {
	db := snmpStatusDB(t)
	c := NewCollector(nil, db)

	dev := &models.Device{
		Hostname: "dual", IPAddress: "10.0.0.51",
		Status: "up", ICMPEnabled: true, SNMPEnabled: true,
	}
	if err := db.Create(dev).Error; err != nil {
		t.Fatalf("seed device: %v", err)
	}

	// SNMP sees it as unreachable, but ICMP owns status here -> SNMP must not
	// clobber the ICMP-written 'up'.
	c.recordReachability(dev, false)

	var got models.Device
	if err := db.First(&got, "id = ?", dev.ID).Error; err != nil {
		t.Fatal(err)
	}
	if got.Status != "up" {
		t.Errorf("SNMP clobbered an ICMP-owned device's status to %q; ICMP must remain the sole writer when enabled", got.Status)
	}
}
