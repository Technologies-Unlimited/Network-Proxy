package database

import (
	"path/filepath"
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/icmp"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/snmp"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// openLoaderDB migrates the tables LoadDevicesIntoCollectors reads.
func openLoaderDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := filepath.Join(t.TempDir(), "loader.db")
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := db.AutoMigrate(
		&models.Device{}, &models.SNMPTemplate{}, &models.OID{},
	); err != nil {
		t.Fatalf("automigrate: %v", err)
	}
	t.Cleanup(func() {
		if sqlDB, err := db.DB(); err == nil {
			sqlDB.Close()
		}
	})
	return db
}

// TestLoadDevicesIntoCollectorsPreloadsTemplateOIDs proves the boot/seed load
// path (LoadDevicesIntoCollectors) hands the SNMP collector a template whose
// many2many OIDs association is populated. The walker's pollDevice ranges over
// template.OIDs, so if this query preloads only the SNMPTemplate but not its
// nested OIDs, the device is registered for SNMP but polls ZERO metrics. An
// ICMP-only device must be unaffected (never enters the SNMP collector).
func TestLoadDevicesIntoCollectorsPreloadsTemplateOIDs(t *testing.T) {
	db := openLoaderDB(t)

	// Template + two OIDs joined via the many2many association.
	tmpl := models.SNMPTemplate{CompanyID: "c1", Name: "core", Version: "v2c", Community: "public"}
	if err := db.Create(&tmpl).Error; err != nil {
		t.Fatalf("seed template: %v", err)
	}
	oid1 := models.OID{CompanyID: "c1", OID: "1.3.6.1.2.1.1.3.0", Name: "sysUpTime"}
	oid2 := models.OID{CompanyID: "c1", OID: "1.3.6.1.2.1.2.2.1.10", Name: "ifInOctets"}
	if err := db.Create(&oid1).Error; err != nil {
		t.Fatalf("seed oid1: %v", err)
	}
	if err := db.Create(&oid2).Error; err != nil {
		t.Fatalf("seed oid2: %v", err)
	}
	if err := db.Model(&tmpl).Association("OIDs").Append(&oid1, &oid2); err != nil {
		t.Fatalf("associate oids: %v", err)
	}

	tmplID := tmpl.ID
	snmpDev := models.Device{
		ID: "snmp-dev", CompanyID: "c1", Hostname: "switch1", IPAddress: "10.0.0.5",
		ICMPEnabled: false, SNMPEnabled: true, SNMPTemplateID: &tmplID,
	}
	icmpOnly := models.Device{
		ID: "icmp-dev", CompanyID: "c1", Hostname: "host1", IPAddress: "10.0.0.6",
		ICMPEnabled: true, SNMPEnabled: false,
	}
	if err := db.Create(&snmpDev).Error; err != nil {
		t.Fatalf("seed snmp device: %v", err)
	}
	// gorm applies the column DEFAULT (ICMPEnabled default:true) for a Go
	// false zero-value on Create, so force ICMP off explicitly to keep this an
	// SNMP-only device (proving ICMP-only devices stay out of the SNMP path and
	// vice-versa).
	if err := db.Model(&models.Device{}).Where("id = ?", "snmp-dev").Update("icmp_enabled", false).Error; err != nil {
		t.Fatalf("force snmp-dev icmp off: %v", err)
	}
	if err := db.Create(&icmpOnly).Error; err != nil {
		t.Fatalf("seed icmp device: %v", err)
	}

	icmpC := icmp.NewCollector(nil, nil)
	snmpC := snmp.NewCollector(nil, nil)

	LoadDevicesIntoCollectors(db, icmpC, snmpC)

	if snmpC.GetDeviceCount() != 1 {
		t.Fatalf("SNMP collector device count=%d want 1", snmpC.GetDeviceCount())
	}
	if icmpC.GetDeviceCount() != 1 {
		t.Fatalf("ICMP collector device count=%d want 1", icmpC.GetDeviceCount())
	}

	got := snmpC.DeviceTemplate("snmp-dev")
	if got == nil {
		t.Fatalf("SNMP collector has no template for snmp-dev")
	}
	if len(got.OIDs) == 0 {
		t.Fatalf("template handed to SNMP collector has 0 OIDs — poller would walk nothing (want 2)")
	}
	if len(got.OIDs) != 2 {
		t.Errorf("template.OIDs len=%d want 2", len(got.OIDs))
	}
}
