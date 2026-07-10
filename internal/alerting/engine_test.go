package alerting

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"gorm.io/gorm"
)

// newAlertEngineTestDB builds a fresh in-memory SQLite DB with the models the
// engine reads/writes.
func newAlertEngineTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open in-memory db: %v", err)
	}
	if err := db.AutoMigrate(&models.Device{}, &models.AlertRule{}, &models.Alert{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func activeAlertCount(t *testing.T, db *gorm.DB, deviceID string) int64 {
	t.Helper()
	var n int64
	if err := db.Model(&models.Alert{}).Where("device_id = ?", deviceID).Count(&n).Error; err != nil {
		t.Fatalf("count alerts for %s: %v", deviceID, err)
	}
	return n
}

// TestEngineDoesNotAlertNeverPolledDevice is the end-to-end regression for fix 2:
// a "Device Down" rule (device_status eq 0) must NOT fire for a device that has
// never been polled (status "unknown"), because a never-polled device is UNKNOWN,
// not down. The old behavior resolved a never-polled device to a concrete 0 (from
// an auto-created zero gauge / a default "0" status mapping) and raised a false
// critical Device Down alert the instant the device was created. A genuinely
// polled-down device MUST still alert.
func TestEngineDoesNotAlertNeverPolledDevice(t *testing.T) {
	db := newAlertEngineTestDB(t)
	engine := NewEngine(db) // default DBMetricSource

	// Fires immediately (Duration 0) IF the metric resolves to 0.
	rule := models.AlertRule{
		CompanyID: "c1",
		Name:      "Device Down - Critical",
		Enabled:   true,
		Severity:  "critical",
		Source:    "icmp",
		Metric:    "device_status",
		Condition: "eq",
		Threshold: "0",
		Duration:  0,
	}
	if err := db.Create(&rule).Error; err != nil {
		t.Fatalf("create rule: %v", err)
	}
	// AlertRule.Duration has a GORM default of 300, which overrides an explicit
	// zero on struct insert. Force it to 0 so a matching rule fires on the first
	// evaluation pass (this test is about which devices alert, not the debounce).
	if err := db.Model(&models.AlertRule{}).Where("id = ?", rule.ID).UpdateColumn("duration", 0).Error; err != nil {
		t.Fatalf("force rule duration 0: %v", err)
	}

	// A perfectly healthy-so-far, never-polled device (default status "unknown").
	never := models.Device{ID: "d-never", CompanyID: "c1", Hostname: "fresh", IPAddress: "10.0.0.1", Status: "unknown"}
	if err := db.Create(&never).Error; err != nil {
		t.Fatalf("create never-polled device: %v", err)
	}

	engine.EvaluateRules()

	if n := activeAlertCount(t, db, "d-never"); n != 0 {
		t.Fatalf("false Device Down alert fired for a never-polled device: count=%d want 0", n)
	}

	// A genuinely polled-down device MUST still raise the alert.
	down := models.Device{ID: "d-down", CompanyID: "c1", Hostname: "dead", IPAddress: "10.0.0.2", Status: "down"}
	if err := db.Create(&down).Error; err != nil {
		t.Fatalf("create down device: %v", err)
	}

	engine.EvaluateRules()

	if n := activeAlertCount(t, db, "d-down"); n != 1 {
		t.Fatalf("polled-down device did not alert: count=%d want 1", n)
	}
	// The never-polled device still must not have alerted on the second pass.
	if n := activeAlertCount(t, db, "d-never"); n != 0 {
		t.Errorf("never-polled device alerted on the second pass: count=%d want 0", n)
	}
}
