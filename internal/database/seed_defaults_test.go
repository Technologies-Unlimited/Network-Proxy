package database

import (
	"path/filepath"
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// seedTestDB builds an isolated, migrated SQLite DB for the seed tests.
func seedTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := filepath.Join(t.TempDir(), "seed.db")
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&models.Device{}, &models.AlertRule{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	t.Cleanup(func() {
		if sqlDB, err := db.DB(); err == nil {
			sqlDB.Close()
		}
	})
	return db
}

// TestSeedDefaultsPopulatesAlertRulesOnFreshDB is the behavioral regression test
// for the "alerting engine ships inert" bug: on a brand-new install SeedDefaults
// MUST create the default alert rules (and default devices), otherwise the
// engine runs but evaluates nothing and a "device down" never alerts. The
// no-orphan-bootstrap gate proves SeedDefaults is WIRED into boot; this proves it
// actually populates the tables, and that it is idempotent so a reboot does not
// duplicate.
func TestSeedDefaultsPopulatesAlertRulesOnFreshDB(t *testing.T) {
	db := seedTestDB(t)

	if err := SeedDefaults(db); err != nil {
		t.Fatalf("SeedDefaults: %v", err)
	}

	var rules int64
	if err := db.Model(&models.AlertRule{}).Count(&rules).Error; err != nil {
		t.Fatal(err)
	}
	if rules == 0 {
		t.Fatalf("fresh install has ZERO alert rules after SeedDefaults — the alerting engine would evaluate nothing and a device-down never alerts")
	}

	// The headline out-of-box rule must exist and be enabled, or a fresh install
	// silently does not alert on a down device.
	var down models.AlertRule
	if err := db.Where("metric = ? AND enabled = ?", "device_status", true).First(&down).Error; err != nil {
		t.Fatalf("no enabled device_status (device-down) alert rule seeded: %v", err)
	}

	var devices int64
	if err := db.Model(&models.Device{}).Count(&devices).Error; err != nil {
		t.Fatal(err)
	}
	if devices == 0 {
		t.Fatalf("fresh install has ZERO devices after SeedDefaults — the engine (which needs devices AND rules) evaluates nothing")
	}

	// Idempotency: a second call must not duplicate rows.
	if err := SeedDefaults(db); err != nil {
		t.Fatalf("SeedDefaults (2nd call): %v", err)
	}
	var rules2, devices2 int64
	db.Model(&models.AlertRule{}).Count(&rules2)
	db.Model(&models.Device{}).Count(&devices2)
	if rules2 != rules || devices2 != devices {
		t.Errorf("SeedDefaults is not idempotent: rules %d->%d, devices %d->%d", rules, rules2, devices, devices2)
	}
}
