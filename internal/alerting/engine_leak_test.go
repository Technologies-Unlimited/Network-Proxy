package alerting

import (
	"fmt"
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
)

// staticMetricSource returns a fixed value for every metric so
// evaluateRuleForDevice actually creates an alert-state entry (the default DB
// source would error for a never-polled device and skip state creation).
type staticMetricSource struct{ value string }

func (s staticMetricSource) Get(metric string, device *models.Device) (string, error) {
	return s.value, nil
}

// TestEvaluateRulesPrunesStaleAlertStates proves the engine's alertStates map is
// pruned when the rules/devices it keyed on disappear, so it does not grow
// without bound as devices churn (a fresh UUID per device create) over a
// long-running server. Without pruning, every device create+delete cycle and
// every deleted rule leaves a permanent, unreachable state entry.
func TestEvaluateRulesPrunesStaleAlertStates(t *testing.T) {
	db := newAlertEngineTestDB(t)
	engine := NewEngine(db)
	engine.SetMetricSource(staticMetricSource{value: "1"})

	// A rule that never fires (1 > 99999 is false) but still creates state.
	rule := models.AlertRule{
		CompanyID: "c1", Name: "r", Enabled: true, Severity: "warning",
		Source: "icmp", Metric: "device_status", Condition: "gt", Threshold: "99999",
	}
	if err := db.Create(&rule).Error; err != nil {
		t.Fatalf("create rule: %v", err)
	}

	// Churn 1: 5 devices -> 5 states.
	var firstIDs []string
	for i := 0; i < 5; i++ {
		d := models.Device{CompanyID: "c1", Hostname: fmt.Sprintf("h%d", i), IPAddress: fmt.Sprintf("10.0.0.%d", i)}
		if err := db.Create(&d).Error; err != nil {
			t.Fatalf("create device: %v", err)
		}
		firstIDs = append(firstIDs, d.ID)
	}
	engine.EvaluateRules()
	if n := len(engine.GetAlertStateSnapshot()); n != 5 {
		t.Fatalf("after first pass len(alertStates)=%d want 5", n)
	}

	// Churn 2: soft-delete the first 5, create 3 fresh (new UUIDs).
	if err := db.Where("id IN ?", firstIDs).Delete(&models.Device{}).Error; err != nil {
		t.Fatalf("delete devices: %v", err)
	}
	for i := 0; i < 3; i++ {
		d := models.Device{CompanyID: "c1", Hostname: fmt.Sprintf("n%d", i), IPAddress: fmt.Sprintf("10.1.0.%d", i)}
		if err := db.Create(&d).Error; err != nil {
			t.Fatalf("create device: %v", err)
		}
	}
	engine.EvaluateRules()

	// Without pruning this would be 5 + 3 = 8 (the deleted devices' states leak).
	if n := len(engine.GetAlertStateSnapshot()); n != 3 {
		t.Errorf("after churn len(alertStates)=%d want 3 — stale states for deleted devices leaked", n)
	}

	// Disabling every rule must prune all remaining states (no valid pairs left).
	if err := db.Model(&models.AlertRule{}).Where("id = ?", rule.ID).UpdateColumn("enabled", false).Error; err != nil {
		t.Fatalf("disable rule: %v", err)
	}
	engine.EvaluateRules()
	if n := len(engine.GetAlertStateSnapshot()); n != 0 {
		t.Errorf("after disabling all rules len(alertStates)=%d want 0 — states for the disabled rule leaked", n)
	}
}
