package exporters

import (
	"encoding/csv"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestExportDevicesCSV(t *testing.T) {
	now := time.Now()
	data := []DeviceReportData{
		{ID: "d1", Hostname: "router1", IPAddress: "10.0.0.1", Status: "up", CreatedAt: now, UptimeHours: 12.5},
		{ID: "d2", Hostname: "switch1", IPAddress: "10.0.0.2", Status: "down", CreatedAt: now},
	}
	out, err := ExportDevicesCSV(data)
	if err != nil {
		t.Fatalf("ExportDevicesCSV: %v", err)
	}
	rows, err := csv.NewReader(strings.NewReader(string(out))).ReadAll()
	if err != nil {
		t.Fatalf("parse csv: %v", err)
	}
	// header + 2 rows
	if len(rows) != 3 {
		t.Fatalf("expected 3 rows, got %d", len(rows))
	}
	if rows[1][1] != "router1" || rows[2][1] != "switch1" {
		t.Errorf("unexpected hostnames: %v / %v", rows[1][1], rows[2][1])
	}
}

func TestCSVInjectionMitigation(t *testing.T) {
	// A hostname that starts with '=' must be neutralized so spreadsheets
	// don't evaluate it as a formula (CWE-1236).
	data := []DeviceReportData{
		{ID: "d1", Hostname: "=cmd|' /C calc'!A1", IPAddress: "10.0.0.1", Status: "up", CreatedAt: time.Now()},
	}
	out, err := ExportDevicesCSV(data)
	if err != nil {
		t.Fatalf("ExportDevicesCSV: %v", err)
	}
	rows, _ := csv.NewReader(strings.NewReader(string(out))).ReadAll()
	if !strings.HasPrefix(rows[1][1], "'=") {
		t.Errorf("formula not neutralized: %q", rows[1][1])
	}
}

func TestExportDevicesJSON(t *testing.T) {
	data := []DeviceReportData{
		{ID: "d1", Hostname: "router1", IPAddress: "10.0.0.1", Status: "up", CreatedAt: time.Now()},
	}
	out, err := ExportDevicesJSON(data)
	if err != nil {
		t.Fatalf("ExportDevicesJSON: %v", err)
	}
	var parsed map[string]interface{}
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if parsed["report_type"] != "devices" {
		t.Errorf("report_type=%v", parsed["report_type"])
	}
	if parsed["total_count"].(float64) != 1 {
		t.Errorf("total_count=%v", parsed["total_count"])
	}
}

func TestExportAlertsJSONSummary(t *testing.T) {
	data := []AlertReportData{
		{ID: "a1", Severity: "critical", Status: "active", TriggeredAt: time.Now()},
		{ID: "a2", Severity: "warning", Status: "resolved", TriggeredAt: time.Now()},
		{ID: "a3", Severity: "critical", Status: "acknowledged", TriggeredAt: time.Now()},
	}
	out, err := ExportAlertsJSON(data)
	if err != nil {
		t.Fatalf("ExportAlertsJSON: %v", err)
	}
	var parsed struct {
		TotalCount int `json:"total_count"`
		Summary    struct {
			BySeverity map[string]int `json:"by_severity"`
			ByStatus   map[string]int `json:"by_status"`
		} `json:"summary"`
	}
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if parsed.TotalCount != 3 {
		t.Errorf("total=%d", parsed.TotalCount)
	}
	if parsed.Summary.BySeverity["critical"] != 2 {
		t.Errorf("critical count=%d want 2", parsed.Summary.BySeverity["critical"])
	}
	if parsed.Summary.ByStatus["resolved"] != 1 {
		t.Errorf("resolved count=%d want 1", parsed.Summary.ByStatus["resolved"])
	}
}

func TestExportUptimeAndPerformanceCSV(t *testing.T) {
	up := []UptimeReportData{{DeviceID: "d1", Hostname: "h1", UptimePercent: 99.9, TotalChecks: 1000, SuccessChecks: 999}}
	if out, err := ExportUptimeCSV(up); err != nil || !strings.Contains(string(out), "99.90") {
		t.Errorf("uptime csv err=%v out=%s", err, out)
	}
	perf := []PerformanceReportData{{DeviceID: "d1", Hostname: "h1", MetricName: "cpu", MetricValue: 55.5, Timestamp: time.Now()}}
	if out, err := ExportPerformanceCSV(perf); err != nil || !strings.Contains(string(out), "cpu") {
		t.Errorf("perf csv err=%v out=%s", err, out)
	}
}
