package alerting

import (
	"errors"
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
)

func deviceStub() *models.Device {
	return &models.Device{ID: "dev-1", IPAddress: "10.0.0.1", Status: "up"}
}

func TestEvaluateConditionNumeric(t *testing.T) {
	cases := []struct {
		cond, threshold, value string
		want                   bool
	}{
		{"gt", "100", "150", true},
		{"gt", "100", "50", false},
		{"lt", "100", "50", true},
		{"ge", "100", "100", true},
		{"le", "100", "100", true},
		{"eq", "100", "100", true},
		{"ne", "100", "101", true},
		{"gt", "90.5", "90.6", true},
	}
	for _, c := range cases {
		if got := EvaluateCondition(c.cond, c.threshold, c.value); got != c.want {
			t.Errorf("EvaluateCondition(%s,%s,%s)=%v want %v", c.cond, c.threshold, c.value, got, c.want)
		}
	}
}

func TestEvaluateConditionString(t *testing.T) {
	cases := []struct {
		cond, threshold, value string
		want                   bool
	}{
		{"eq", "up", "UP", true},
		{"ne", "up", "down", true},
		{"contains", "err", "fatal error here", true},
		{"starts_with", "eth", "eth0", true},
		{"ends_with", "0", "eth0", true},
	}
	for _, c := range cases {
		if got := EvaluateCondition(c.cond, c.threshold, c.value); got != c.want {
			t.Errorf("EvaluateCondition(%s,%s,%s)=%v want %v", c.cond, c.threshold, c.value, got, c.want)
		}
	}
}

func TestConditionGroupAndOr(t *testing.T) {
	pass := Condition{Condition: "gt", Threshold: "10", Value: "20"}
	fail := Condition{Condition: "gt", Threshold: "10", Value: "5"}

	and := &ConditionGroup{Operator: "and", Conditions: []Condition{pass, pass}}
	if !and.Evaluate() {
		t.Error("AND of two passing conditions should be true")
	}
	andMixed := &ConditionGroup{Operator: "and", Conditions: []Condition{pass, fail}}
	if andMixed.Evaluate() {
		t.Error("AND with a failing condition should be false")
	}
	or := &ConditionGroup{Operator: "or", Conditions: []Condition{pass, fail}}
	if !or.Evaluate() {
		t.Error("OR with one passing condition should be true")
	}
	// Empty operator defaults to AND
	def := &ConditionGroup{Operator: "", Conditions: []Condition{pass, pass}}
	if !def.Evaluate() {
		t.Error("empty operator should behave as AND")
	}
	// Unknown operator returns false (no silent coercion)
	bad := &ConditionGroup{Operator: "xor", Conditions: []Condition{pass}}
	if bad.Evaluate() {
		t.Error("unknown operator should return false")
	}
	// Empty conditions returns false
	empty := &ConditionGroup{Operator: "and"}
	if empty.Evaluate() {
		t.Error("empty conditions should return false")
	}
}

func TestValidateConditionAndMetric(t *testing.T) {
	for _, c := range []string{"gt", "lt", "eq", "contains", "ends_with"} {
		if !ValidateCondition(c) {
			t.Errorf("%q should be valid condition", c)
		}
	}
	if ValidateCondition("xor") {
		t.Error("xor should be invalid")
	}
	if !ValidateMetric("ping_latency") || !ValidateMetric("cpu_usage") {
		t.Error("known metrics should validate")
	}
	if ValidateMetric("made_up") {
		t.Error("unknown metric should not validate")
	}
}

func TestParseThreshold(t *testing.T) {
	v, unit, err := ParseThreshold("150ms")
	if err != nil || v != 150 || unit != "ms" {
		t.Errorf("ParseThreshold(150ms)=%v,%q,%v", v, unit, err)
	}
	v, unit, err = ParseThreshold("80")
	if err != nil || v != 80 || unit != "" {
		t.Errorf("ParseThreshold(80)=%v,%q,%v", v, unit, err)
	}
	if _, _, err := ParseThreshold("abc"); err == nil {
		t.Error("non-numeric threshold should error")
	}
}

func TestNormalizeValue(t *testing.T) {
	// 2s normalized to ms => 2000
	if v, err := NormalizeValue("2s", "ms"); err != nil || v != 2000 {
		t.Errorf("NormalizeValue(2s,ms)=%v,%v want 2000", v, err)
	}
	// 1mb normalized to kb => 1024
	if v, err := NormalizeValue("1mb", "kb"); err != nil || v != 1024 {
		t.Errorf("NormalizeValue(1mb,kb)=%v,%v want 1024", v, err)
	}
}

// fakeQuerier implements LocalRegistryQuerier for LocalMetricSource tests.
type fakeQuerier struct {
	latency float64
	status  float64
	loss    float64
	err     error
}

func (f fakeQuerier) PingLatency(string, string) (float64, error)  { return f.latency, f.err }
func (f fakeQuerier) DeviceStatus(string, string) (float64, error) { return f.status, f.err }
func (f fakeQuerier) PacketLoss(string, string) (float64, error)   { return f.loss, f.err }

func TestLocalMetricSource(t *testing.T) {
	src := NewLocalMetricSource(fakeQuerier{latency: 42.5, status: 1, loss: 12.5})
	v, err := src.Get("ping_latency", deviceStub())
	if err != nil || v != "42.5" {
		t.Errorf("ping_latency=%q,%v want 42.5", v, err)
	}
	v, err = src.Get("device_status", deviceStub())
	if err != nil || v != "1" {
		t.Errorf("device_status=%q,%v want 1", v, err)
	}
	v, err = src.Get("packet_loss", deviceStub())
	if err != nil || v != "12.5" {
		t.Errorf("packet_loss=%q,%v want 12.5", v, err)
	}
	if _, err := src.Get("bogus", deviceStub()); err == nil {
		t.Error("unsupported metric should error")
	}
}

// TestLocalMetricSourceNoSampleErrors proves a querier error (e.g. ErrNoSample
// for a never-polled device) propagates as an error the engine skips on — never
// as a fabricated "0" that would fire a false Device Down alert.
func TestLocalMetricSourceNoSampleErrors(t *testing.T) {
	noSample := errors.New("no sample recorded for metric")
	src := NewLocalMetricSource(fakeQuerier{err: noSample})
	for _, metric := range []string{"device_status", "ping_latency", "packet_loss"} {
		if _, err := src.Get(metric, deviceStub()); err == nil {
			t.Errorf("%s: expected error to propagate for a never-polled device", metric)
		}
	}
}

// TestDBMetricSourceNeverPolledIsUnknown pins the never-polled fix: a device
// with the default "unknown" status must NOT resolve device_status to "0"
// (which fired false Device Down alerts) — it must return an error the engine
// treats as unknown. A polled device still resolves to a concrete value.
func TestDBMetricSourceNeverPolledIsUnknown(t *testing.T) {
	src := NewDBMetricSource(nil)

	unknown := &models.Device{ID: "d-unknown", IPAddress: "10.0.0.9", Status: "unknown"}
	if v, err := src.Get("device_status", unknown); err == nil {
		t.Errorf("device_status for never-polled device = %q, want error (unknown, not down)", v)
	}
	if v, err := src.Get("packet_loss", unknown); err == nil {
		t.Errorf("packet_loss for never-polled device = %q, want error", v)
	}

	up := &models.Device{ID: "d-up", IPAddress: "10.0.0.1", Status: "up", PacketLoss: 25}
	if v, err := src.Get("device_status", up); err != nil || v != "1" {
		t.Errorf("device_status(up)=%q,%v want 1", v, err)
	}
	if v, err := src.Get("packet_loss", up); err != nil || v != "25" {
		t.Errorf("packet_loss(up)=%q,%v want 25 (real measured loss)", v, err)
	}

	down := &models.Device{ID: "d-down", IPAddress: "10.0.0.2", Status: "down", PacketLoss: 100}
	if v, err := src.Get("device_status", down); err != nil || v != "0" {
		t.Errorf("device_status(down)=%q,%v want 0", v, err)
	}
}
