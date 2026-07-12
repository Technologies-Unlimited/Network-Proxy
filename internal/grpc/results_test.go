package grpc

import (
	"context"
	"testing"
	"time"

	pb "github.com/Technologies-Unlimited/Network-Proxy/internal/grpc/pb/node"
)

// TestGetTestResultsDurationFrozenAtEndTime is the RED-first regression test for
// the SA9003 empty-branch bug in GetTestResults: for a COMPLETED/FAILED/CANCELLED
// test the handler MEANT to freeze the duration at the test's real EndTime, but
// the branch body was empty, so durationMs was recomputed from time.Now() on
// EVERY query. The reported DurationMs therefore INFLATED (and the derived
// Upload/DownloadSpeedMbps DECAYED) the longer a client waited to fetch results.
//
// A finished test's duration is a fixed historical fact — it must be identical no
// matter when GetTestResults is called. This test pins that: it seeds a completed
// test that ended 4s ago after running for exactly 1000ms and asserts the handler
// reports 1000ms (not ~5000ms), and that a second query later returns the same
// numbers. Before the fix it fails (durationMs ≈ 5000, and grows); after it passes.
func TestGetTestResultsDurationFrozenAtEndTime(t *testing.T) {
	s := newLeakTestServer()

	start := time.Now().Add(-5 * time.Second)
	end := start.Add(1 * time.Second) // real run = exactly 1000ms; ended ~4s ago
	s.tests["done"] = &BandwidthTest{
		ID:            "done",
		SourceNodeID:  "src",
		TargetNodeID:  "dst",
		TestType:      pb.TestType_TEST_TYPE_UPLOAD,
		State:         pb.TestState_TEST_STATE_COMPLETED,
		StartTime:     start,
		EndTime:       end,
		BytesSent:     1_000_000,
		BytesReceived: 2_000_000,
	}

	wantMs := end.Sub(start).Milliseconds() // 1000

	res1, err := s.GetTestResults(context.Background(), &pb.GetTestResultsRequest{TestId: "done"})
	if err != nil {
		t.Fatalf("GetTestResults: %v", err)
	}
	if res1.DurationMs != wantMs {
		t.Fatalf("DurationMs=%d, want %d — a finished test's duration must be frozen at "+
			"EndTime-StartTime, not recomputed from time.Now()-StartTime", res1.DurationMs, wantMs)
	}

	// Stability: a query taken some wall-clock later must return the SAME duration
	// and the SAME derived speeds. With the empty-branch bug res2 drifts above res1.
	time.Sleep(15 * time.Millisecond)
	res2, err := s.GetTestResults(context.Background(), &pb.GetTestResultsRequest{TestId: "done"})
	if err != nil {
		t.Fatalf("GetTestResults (2nd call): %v", err)
	}
	if res2.DurationMs != res1.DurationMs {
		t.Fatalf("DurationMs drifted between queries: first=%d second=%d — a finished "+
			"test's reported duration must be stable across repeated fetches", res1.DurationMs, res2.DurationMs)
	}
	if res2.UploadSpeedMbps != res1.UploadSpeedMbps || res2.DownloadSpeedMbps != res1.DownloadSpeedMbps {
		t.Fatalf("derived speeds drifted between queries: up %.6f->%.6f down %.6f->%.6f — "+
			"Mbps must not decay with wall-clock for a finished test",
			res1.UploadSpeedMbps, res2.UploadSpeedMbps, res1.DownloadSpeedMbps, res2.DownloadSpeedMbps)
	}
}

// TestGetTestResultsRunningUsesLiveElapsed guards the OTHER side of the fix: while
// a test is still RUNNING it has no EndTime yet, so the duration must reflect live
// elapsed time (measured from now), not a frozen zero. This makes sure the fix
// keys off EndTime being set, not off a hardcoded state list, and that it doesn't
// accidentally report a zero/negative duration for in-flight tests.
func TestGetTestResultsRunningUsesLiveElapsed(t *testing.T) {
	s := newLeakTestServer()
	s.tests["live"] = &BandwidthTest{
		ID:        "live",
		State:     pb.TestState_TEST_STATE_RUNNING,
		StartTime: time.Now().Add(-2 * time.Second),
		// EndTime intentionally zero — the test has not finished.
		BytesSent: 500_000,
	}

	res, err := s.GetTestResults(context.Background(), &pb.GetTestResultsRequest{TestId: "live"})
	if err != nil {
		t.Fatalf("GetTestResults: %v", err)
	}
	if res.DurationMs < 1000 {
		t.Fatalf("running test DurationMs=%d, want >=1000 (live elapsed since StartTime ~2s ago)", res.DurationMs)
	}
}
