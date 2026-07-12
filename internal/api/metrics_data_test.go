package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
)

// stubMetricsQuerier is a hand-built MetricsQuerier keyed by device ID. A missing
// entry returns errNoStubSample so tests can drive both the real-data and the
// no-data paths without standing up the collectors.
type stubMetricsQuerier struct {
	latency map[string]float64
	counts  map[string][2]float64 // [success, failure]
}

func (s stubMetricsQuerier) PingLatency(deviceID, ipAddress string) (float64, error) {
	if v, ok := s.latency[deviceID]; ok {
		return v, nil
	}
	return 0, errNoStubSample
}

func (s stubMetricsQuerier) PingCounts(deviceID, ipAddress string) (float64, float64, error) {
	if v, ok := s.counts[deviceID]; ok {
		return v[0], v[1], nil
	}
	return 0, 0, errNoStubSample
}

func withMetricsQuerier(t *testing.T, q MetricsQuerier) {
	t.Helper()
	prev := getMetricsQuerier()
	t.Cleanup(func() { SetMetricsQuerier(prev) })
	SetMetricsQuerier(q)
}

func getMetricJSON(t *testing.T, h gin.HandlerFunc, target string) map[string]interface{} {
	t.Helper()
	r := gin.New()
	r.GET("/x", h)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, target, nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	var out map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("unmarshal: %v body=%s", err, w.Body.String())
	}
	return out
}

// TestGetUptimeMetricsRealAvailability proves the uptime endpoint reports a REAL
// success/total ratio (75 up + 25 down = 75%), never the old hardcoded 99.9 that
// was keyed only off the current up/down flag.
func TestGetUptimeMetricsRealAvailability(t *testing.T) {
	db := newTestDB(t)
	dev := models.Device{ID: "up-dev", CompanyID: "c1", Hostname: "h1", IPAddress: "10.0.0.1", Status: "up"}
	if err := db.Create(&dev).Error; err != nil {
		t.Fatalf("seed device: %v", err)
	}
	withMetricsQuerier(t, stubMetricsQuerier{counts: map[string][2]float64{"up-dev": {75, 25}}})

	srv := &server.Server{DB: db}
	out := getMetricJSON(t, getUptimeMetrics(srv), "/x?device_id=up-dev")

	got, ok := out["uptime_percentage"].(float64)
	if !ok {
		t.Fatalf("uptime_percentage missing/not a number: %v", out)
	}
	if got != 75 {
		t.Errorf("uptime_percentage=%v want 75 (real ratio, not a constant)", got)
	}
	if got == 99.9 {
		t.Errorf("uptime_percentage is the old fabricated 99.9")
	}
}

// TestGetUptimeMetricsNoData proves a device with no real sample yields an honest
// "no_data" result with NO uptime_percentage, rather than a fabricated figure.
func TestGetUptimeMetricsNoData(t *testing.T) {
	db := newTestDB(t)
	dev := models.Device{ID: "cold-dev", CompanyID: "c1", Hostname: "h2", IPAddress: "10.0.0.2", Status: "up"}
	if err := db.Create(&dev).Error; err != nil {
		t.Fatalf("seed device: %v", err)
	}
	withMetricsQuerier(t, stubMetricsQuerier{}) // no data for any device

	srv := &server.Server{DB: db}
	out := getMetricJSON(t, getUptimeMetrics(srv), "/x?device_id=cold-dev")

	if _, present := out["uptime_percentage"]; present {
		t.Errorf("uptime_percentage present for a never-sampled device: %v", out)
	}
	if out["status"] != "no_data" {
		t.Errorf("status=%v want no_data", out["status"])
	}
}

// TestGetPingHistoryRealLatency proves the ping-history endpoint plots the REAL
// current latency at the trailing point (earlier points null, no fabricated
// curve) and reports a real avg_latency — never the old 20-38ms invented series.
func TestGetPingHistoryRealLatency(t *testing.T) {
	db := newTestDB(t)
	dev := models.Device{ID: "p-dev", CompanyID: "c1", Hostname: "h3", IPAddress: "10.0.0.3", Status: "up", ICMPEnabled: true}
	if err := db.Create(&dev).Error; err != nil {
		t.Fatalf("seed device: %v", err)
	}
	withMetricsQuerier(t, stubMetricsQuerier{latency: map[string]float64{"p-dev": 3.5}})

	srv := &server.Server{DB: db}
	out := getMetricJSON(t, getPingHistoryMetrics(srv), "/x?range=1h")

	if out["history_available"] != false {
		t.Errorf("history_available=%v want false", out["history_available"])
	}
	if avg, ok := out["avg_latency"].(float64); !ok || avg != 3.5 {
		t.Errorf("avg_latency=%v want 3.5 (real sample)", out["avg_latency"])
	}

	devices, ok := out["devices"].([]interface{})
	if !ok || len(devices) != 1 {
		t.Fatalf("devices=%v want 1 entry", out["devices"])
	}
	data := devices[0].(map[string]interface{})["data"].([]interface{})
	last := data[len(data)-1]
	if last == nil || last.(float64) != 3.5 {
		t.Errorf("trailing point=%v want 3.5 (real current latency)", last)
	}
	// Every earlier point must be null (no invented history).
	for i := 0; i < len(data)-1; i++ {
		if data[i] != nil {
			t.Errorf("data[%d]=%v want null (no fabricated history)", i, data[i])
		}
	}
}

// TestGetPingHistoryNoSampleOmitsAvg proves that with no real sample the endpoint
// omits avg_latency entirely (UI shows its "-" placeholder) instead of inventing
// an average, and never emits a nonzero fabricated data point.
func TestGetPingHistoryNoSampleOmitsAvg(t *testing.T) {
	db := newTestDB(t)
	dev := models.Device{ID: "q-dev", CompanyID: "c1", Hostname: "h4", IPAddress: "10.0.0.4", Status: "up", ICMPEnabled: true}
	if err := db.Create(&dev).Error; err != nil {
		t.Fatalf("seed device: %v", err)
	}
	withMetricsQuerier(t, stubMetricsQuerier{}) // no latency samples

	srv := &server.Server{DB: db}
	out := getMetricJSON(t, getPingHistoryMetrics(srv), "/x?range=1h")

	if _, present := out["avg_latency"]; present {
		t.Errorf("avg_latency present with no real sample: %v", out["avg_latency"])
	}
	devices := out["devices"].([]interface{})
	data := devices[0].(map[string]interface{})["data"].([]interface{})
	for i, p := range data {
		if p != nil {
			t.Errorf("data[%d]=%v want null (no fabricated point)", i, p)
		}
	}
}

// TestGetOutageHistoryNoFabricatedDevice is the core regression for the hardcoded
// "Google DNS (Primary)" fiction: no outage may reference a device that is not a
// real row, and a currently-down device is reported as ongoing with an unknown
// (null) start time — never an invented 15-minute window.
func TestGetOutageHistoryNoFabricatedDevice(t *testing.T) {
	db := newTestDB(t)
	down := models.Device{ID: "down-dev", CompanyID: "c1", Hostname: "switch-down", IPAddress: "10.0.0.5", Status: "down"}
	up := models.Device{ID: "up-dev", CompanyID: "c1", Hostname: "switch-up", IPAddress: "10.0.0.6", Status: "up"}
	if err := db.Create(&down).Error; err != nil {
		t.Fatalf("seed down: %v", err)
	}
	if err := db.Create(&up).Error; err != nil {
		t.Fatalf("seed up: %v", err)
	}

	srv := &server.Server{DB: db}
	// range=24h previously injected the fabricated Google DNS outage.
	out := getMetricJSON(t, getOutageHistory(srv), "/x?range=24h")

	body, _ := json.Marshal(out)
	if strings.Contains(string(body), "Google DNS") {
		t.Fatalf("fabricated 'Google DNS' outage still present: %s", body)
	}

	outages, _ := out["outages"].([]interface{})
	if len(outages) != 1 {
		t.Fatalf("outages=%d want exactly 1 (the real down device)", len(outages))
	}
	o := outages[0].(map[string]interface{})
	if o["device_name"] != "switch-down" {
		t.Errorf("outage device_name=%v want switch-down", o["device_name"])
	}
	if o["device_id"] != "down-dev" {
		t.Errorf("outage device_id=%v want the real id (not 'sample')", o["device_id"])
	}
	if o["start_time"] != nil {
		t.Errorf("start_time=%v want null (not tracked, never invented)", o["start_time"])
	}
	if o["status"] != "ongoing" {
		t.Errorf("status=%v want ongoing", o["status"])
	}
}
