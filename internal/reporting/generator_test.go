package reporting

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

var errNoReportSample = errors.New("no sample")

// stubMetrics implements MetricsSource keyed by device ID; a missing entry
// returns errNoReportSample so a device with no real data can be exercised.
type stubMetrics struct {
	latency map[string]float64
	counts  map[string][2]float64 // [success, failure]
}

func (s stubMetrics) PingLatency(deviceID, ipAddress string) (float64, error) {
	if v, ok := s.latency[deviceID]; ok {
		return v, nil
	}
	return 0, errNoReportSample
}

func (s stubMetrics) PingCounts(deviceID, ipAddress string) (float64, float64, error) {
	if v, ok := s.counts[deviceID]; ok {
		return v[0], v[1], nil
	}
	return 0, 0, errNoReportSample
}

func newReportDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := filepath.Join(t.TempDir(), "report.db")
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

func seedDevice(t *testing.T, db *gorm.DB, id, ip, status string) {
	t.Helper()
	d := models.Device{ID: id, CompanyID: "c1", Hostname: id, IPAddress: ip, Status: status}
	if err := db.Create(&d).Error; err != nil {
		t.Fatalf("seed %s: %v", id, err)
	}
}

// TestUptimeReportUsesRealCounters proves the uptime report computes availability
// from REAL ping counters (900 up / 1000 total = 90%), never the old hardcoded
// 99.9% over a fictional 1440 checks.
func TestUptimeReportUsesRealCounters(t *testing.T) {
	db := newReportDB(t)
	seedDevice(t, db, "dev1", "10.0.0.1", "up")

	g := NewGeneratorWithMetrics(db, stubMetrics{
		counts:  map[string][2]float64{"dev1": {900, 100}},
		latency: map[string]float64{"dev1": 4.2},
	})
	out, err := g.GenerateUptimeReport("json", "", time.Time{}, time.Time{})
	if err != nil {
		t.Fatalf("generate: %v", err)
	}

	var parsed struct {
		UptimeData []map[string]interface{} `json:"uptime_data"`
	}
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(parsed.UptimeData) != 1 {
		t.Fatalf("uptime_data len=%d want 1", len(parsed.UptimeData))
	}
	row := parsed.UptimeData[0]
	if row["UptimePercent"].(float64) != 90 {
		t.Errorf("UptimePercent=%v want 90 (real ratio)", row["UptimePercent"])
	}
	if row["TotalChecks"].(float64) != 1000 {
		t.Errorf("TotalChecks=%v want 1000 (real), not the old 1440", row["TotalChecks"])
	}
	if row["AvgLatency"].(float64) != 4.2 {
		t.Errorf("AvgLatency=%v want 4.2 (real sample), not 25.5", row["AvgLatency"])
	}
	// The old fabricated constants must be gone.
	if strings.Contains(string(out), "99.9") || strings.Contains(string(out), "1440") {
		t.Errorf("report still contains a fabricated constant:\n%s", out)
	}
}

// TestUptimeReportNoDataIsHonest proves that with no metrics source a device
// gets an explicit "No monitoring data collected yet" period and a 0 uptime,
// rather than a fabricated 99.9%.
func TestUptimeReportNoDataIsHonest(t *testing.T) {
	db := newReportDB(t)
	seedDevice(t, db, "dev1", "10.0.0.1", "up")

	g := NewGenerator(db) // no metrics source
	out, err := g.GenerateUptimeReport("json", "", time.Time{}, time.Time{})
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if !strings.Contains(string(out), "No monitoring data collected yet") {
		t.Errorf("expected explicit no-data period, got:\n%s", out)
	}
	if strings.Contains(string(out), "99.9") {
		t.Errorf("no-data report fabricated 99.9%%:\n%s", out)
	}
}

// TestPerformanceReportRealAndNoFakeCPU proves the performance report emits a
// single REAL Ping Latency metric from the measured sample and NO fabricated CPU
// row (the old invented 45.2%).
func TestPerformanceReportRealAndNoFakeCPU(t *testing.T) {
	db := newReportDB(t)
	seedDevice(t, db, "dev1", "10.0.0.1", "up")

	g := NewGeneratorWithMetrics(db, stubMetrics{latency: map[string]float64{"dev1": 7.5}})
	out, err := g.GeneratePerformanceReport("json", "", time.Time{}, time.Time{})
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	s := string(out)
	if !strings.Contains(s, "Ping Latency") {
		t.Errorf("expected a real Ping Latency metric, got:\n%s", s)
	}
	if strings.Contains(s, "CPU Usage") || strings.Contains(s, "45.2") {
		t.Errorf("performance report still fabricates a CPU metric:\n%s", s)
	}
	if !strings.Contains(s, "7.5") {
		t.Errorf("expected the real latency 7.5, got:\n%s", s)
	}
	if strings.Contains(s, "25.5") {
		t.Errorf("performance report still contains the fabricated 25.5:\n%s", s)
	}
}

// TestPerformanceReportNoSampleNoRow proves a device with no real sample produces
// NO performance row rather than an invented one.
func TestPerformanceReportNoSampleNoRow(t *testing.T) {
	db := newReportDB(t)
	seedDevice(t, db, "dev1", "10.0.0.1", "up")

	g := NewGeneratorWithMetrics(db, stubMetrics{}) // no samples
	out, err := g.GeneratePerformanceReport("json", "", time.Time{}, time.Time{})
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if strings.Contains(string(out), "Ping Latency") {
		t.Errorf("emitted a metric row for a device with no real sample:\n%s", out)
	}
}
