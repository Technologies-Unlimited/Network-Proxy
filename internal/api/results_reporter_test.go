package api

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/thothos"
)

// errNoStubSample mirrors metrics.ErrNoSample: the reporter treats any error
// from the source as "never polled -> unknown -> skip".
var errNoStubSample = errors.New("no sample")

// stubSource is a hand-built DeviceSampleSource keyed by device ID. A missing
// key returns errNoStubSample (a never-polled device).
type stubSource struct {
	status  map[string]float64
	latency map[string]float64
	loss    map[string]float64
}

func (s stubSource) DeviceStatus(id, _ string) (float64, error) {
	if v, ok := s.status[id]; ok {
		return v, nil
	}
	return 0, errNoStubSample
}
func (s stubSource) PingLatency(id, _ string) (float64, error) {
	if v, ok := s.latency[id]; ok {
		return v, nil
	}
	return 0, errNoStubSample
}
func (s stubSource) PacketLoss(id, _ string) (float64, error) {
	if v, ok := s.loss[id]; ok {
		return v, nil
	}
	return 0, errNoStubSample
}

// stubResultsClient records calls and can be toggled to fail, so carry-forward
// behavior is testable without an HTTP round-trip.
type stubResultsClient struct {
	mu          sync.Mutex
	fail        bool
	calls       int
	lastResults []thothos.MonitoringResult
}

func (c *stubResultsClient) ReportMonitoringResults(_ string, results []thothos.MonitoringResult) (*thothos.MonitoringReportResult, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.calls++
	c.lastResults = append([]thothos.MonitoringResult(nil), results...)
	if c.fail {
		return nil, errors.New("thothos unreachable")
	}
	return &thothos.MonitoringReportResult{Success: true, Upserted: len(results)}, nil
}

// TestCollectDeviceResults verifies the snapshot only reports devices with a REAL
// status sample (never-polled ones are skipped, never reported "down"), maps the
// status gauge to "up"/"down", attaches latency only for up devices, always
// attaches loss when sampled, and skips rows missing a name/IP.
func TestCollectDeviceResults(t *testing.T) {
	db := newTestDB(t)

	seed := []models.Device{
		{ID: "up-dev", Hostname: "router-up", IPAddress: "10.0.0.1", DeviceType: "router"},
		{ID: "down-dev", Hostname: "router-down", IPAddress: "10.0.0.2", DeviceType: "switch"},
		{ID: "never-dev", Hostname: "router-unknown", IPAddress: "10.0.0.3", DeviceType: "server"},
		{ID: "blank-dev", Hostname: "", IPAddress: "10.0.0.4", DeviceType: "router"},
	}
	for i := range seed {
		if err := db.Create(&seed[i]).Error; err != nil {
			t.Fatalf("seed device %s: %v", seed[i].ID, err)
		}
	}

	src := stubSource{
		status:  map[string]float64{"up-dev": 1, "down-dev": 0, "blank-dev": 1},
		latency: map[string]float64{"up-dev": 5},
		loss:    map[string]float64{"up-dev": 0, "down-dev": 100},
	}

	results := collectDeviceResults(db, src, time.Date(2026, 7, 10, 0, 0, 0, 0, time.UTC))

	byName := map[string]thothos.MonitoringResult{}
	for _, r := range results {
		byName[r.DeviceName] = r
	}

	if len(results) != 2 {
		t.Fatalf("collected %d results, want 2 (up + down; unknown + blank skipped): %+v", len(results), results)
	}
	if _, ok := byName["router-unknown"]; ok {
		t.Errorf("never-polled device was reported; it must be skipped (unknown != down)")
	}

	up, ok := byName["router-up"]
	if !ok {
		t.Fatalf("up device missing from results")
	}
	if up.Status != "up" {
		t.Errorf("up device status = %q, want up", up.Status)
	}
	if up.LatencyMs == nil || *up.LatencyMs != 5 {
		t.Errorf("up device latencyMs = %v, want 5", up.LatencyMs)
	}
	if up.PacketLossPct == nil || *up.PacketLossPct != 0 {
		t.Errorf("up device packetLossPct = %v, want 0", up.PacketLossPct)
	}
	if up.DeviceType != "router" {
		t.Errorf("up device type = %q, want router", up.DeviceType)
	}
	if _, err := time.Parse(time.RFC3339, up.CheckedAt); err != nil {
		t.Errorf("checkedAt = %q is not RFC3339: %v", up.CheckedAt, err)
	}

	down, ok := byName["router-down"]
	if !ok {
		t.Fatalf("down device missing from results")
	}
	if down.Status != "down" {
		t.Errorf("down device status = %q, want down", down.Status)
	}
	if down.LatencyMs != nil {
		t.Errorf("down device should carry no latency, got %v", *down.LatencyMs)
	}
	if down.PacketLossPct == nil || *down.PacketLossPct != 100 {
		t.Errorf("down device packetLossPct = %v, want 100", down.PacketLossPct)
	}
}

// TestResultsReporter_CarryForwardOnFailure proves a failed send carries the
// batch forward (buffer retained) and a subsequent success clears it.
func TestResultsReporter_CarryForwardOnFailure(t *testing.T) {
	db := newTestDB(t)
	if err := db.Create(&models.Device{ID: "d1", Hostname: "r1", IPAddress: "10.0.0.1", DeviceType: "router"}).Error; err != nil {
		t.Fatalf("seed: %v", err)
	}
	src := stubSource{
		status:  map[string]float64{"d1": 1},
		latency: map[string]float64{"d1": 3},
		loss:    map[string]float64{"d1": 0},
	}
	client := &stubResultsClient{fail: true}
	reporter := &resultsReporter{client: client, db: db, src: src, proxyName: "proxy", maxBuffer: maxBufferedResults}

	reporter.reportOnce(time.Now())
	if client.calls != 1 {
		t.Fatalf("client called %d times, want 1", client.calls)
	}
	if len(reporter.pending) != 1 {
		t.Fatalf("failed send should carry the batch forward; pending = %d, want 1", len(reporter.pending))
	}

	client.fail = false
	reporter.reportOnce(time.Now())
	if client.calls != 2 {
		t.Fatalf("client called %d times, want 2", client.calls)
	}
	if len(reporter.pending) != 0 {
		t.Fatalf("successful send should clear the buffer; pending = %d, want 0", len(reporter.pending))
	}
	if len(client.lastResults) != 1 || client.lastResults[0].DeviceName != "r1" {
		t.Errorf("second send should carry the device; got %+v", client.lastResults)
	}
}

// TestResultsReporter_NoSampledDevicesSkipsSend confirms the reporter never calls
// ThothOS when there is nothing to report (no sampled devices).
func TestResultsReporter_NoSampledDevicesSkipsSend(t *testing.T) {
	db := newTestDB(t)
	if err := db.Create(&models.Device{ID: "d1", Hostname: "r1", IPAddress: "10.0.0.1"}).Error; err != nil {
		t.Fatalf("seed: %v", err)
	}
	// Empty source -> the device has no sample -> nothing to report.
	client := &stubResultsClient{}
	reporter := &resultsReporter{client: client, db: db, src: stubSource{}, proxyName: "proxy", maxBuffer: maxBufferedResults}

	reporter.reportOnce(time.Now())
	if client.calls != 0 {
		t.Fatalf("client should not be called with no sampled devices; calls = %d", client.calls)
	}
}

// TestResultsReporter_EnqueueDedupeAndBounded proves the carry-forward buffer
// dedupes by (deviceName, ipAddress) keeping the newest, and drops the oldest
// beyond maxBuffer.
func TestResultsReporter_EnqueueDedupeAndBounded(t *testing.T) {
	reporter := &resultsReporter{maxBuffer: 3}
	mk := func(name, status string) thothos.MonitoringResult {
		return thothos.MonitoringResult{DeviceName: name, IPAddress: "10.0.0." + name, Status: status}
	}

	// Dedupe: same key updates in place, keeping the newest status.
	reporter.enqueue([]thothos.MonitoringResult{mk("a", "up")})
	reporter.enqueue([]thothos.MonitoringResult{mk("a", "down")})
	if len(reporter.pending) != 1 {
		t.Fatalf("dedupe failed: pending = %d, want 1", len(reporter.pending))
	}
	if reporter.pending[0].Status != "down" {
		t.Errorf("dedupe should keep newest status, got %q", reporter.pending[0].Status)
	}

	// Bounded: 4 distinct devices with cap 3 -> oldest ("a") dropped.
	reporter.enqueue([]thothos.MonitoringResult{mk("b", "up"), mk("c", "up"), mk("d", "up")})
	if len(reporter.pending) != 3 {
		t.Fatalf("cap not enforced: pending = %d, want 3", len(reporter.pending))
	}
	got := []string{reporter.pending[0].DeviceName, reporter.pending[1].DeviceName, reporter.pending[2].DeviceName}
	want := []string{"b", "c", "d"}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("bounded buffer kept %v, want %v (oldest dropped)", got, want)
		}
	}
}

// TestSetSampleSource_Roundtrip confirms the package hook stores and returns the
// wired querier (the main.go -> reporter wiring seam).
func TestSetSampleSource_Roundtrip(t *testing.T) {
	prev := getSampleSource()
	defer SetSampleSource(prev)

	src := stubSource{status: map[string]float64{"x": 1}}
	SetSampleSource(src)
	if getSampleSource() == nil {
		t.Fatal("getSampleSource returned nil after SetSampleSource")
	}
}

// TestRunResultsReporter_StopsOnCancel proves the reporter loop honors context
// cancellation (disconnect/logout/shutdown stops it cleanly).
func TestRunResultsReporter_StopsOnCancel(t *testing.T) {
	origInterval := resultsReportInterval
	resultsReportInterval = 5 * time.Millisecond
	defer func() { resultsReportInterval = origInterval }()

	prev := getSampleSource()
	SetSampleSource(stubSource{})
	defer SetSampleSource(prev)

	db := newTestDB(t)
	cfg := ThothOSSessionConfig{Client: &thothos.Client{}, DB: db, ProxyName: "proxy"}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		runResultsReporter(ctx, cfg)
		close(done)
	}()

	time.Sleep(20 * time.Millisecond) // let a few no-op ticks fire
	cancel()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("runResultsReporter did not stop within 2s of cancel")
	}
}
