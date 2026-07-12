package grpc

import (
	"context"
	"fmt"
	"testing"
	"time"

	pb "github.com/Technologies-Unlimited/Network-Proxy/internal/grpc/pb/node"
)

func newLeakTestServer() *Server {
	return NewServer(ServerConfig{NodeID: "n1", NodeName: "node1"})
}

// TestReapFinishedTestsEvictsOldTerminalTests proves finished tests are evicted
// from s.tests once past the retention window, so the map does not grow by one
// BandwidthTest (with its retained Latencies slice + cancel func) per test run
// forever. Running tests and recently-finished tests (results still fetchable)
// must survive.
func TestReapFinishedTestsEvictsOldTerminalTests(t *testing.T) {
	s := newLeakTestServer()
	old := time.Now().Add(-2 * finishedTestRetention)

	states := []pb.TestState{
		pb.TestState_TEST_STATE_COMPLETED,
		pb.TestState_TEST_STATE_FAILED,
		pb.TestState_TEST_STATE_CANCELLED,
	}
	for i, st := range states {
		id := fmt.Sprintf("old-%d", i)
		s.tests[id] = &BandwidthTest{ID: id, State: st, EndTime: old}
	}
	// A running test must NOT be reaped.
	s.tests["running"] = &BandwidthTest{ID: "running", State: pb.TestState_TEST_STATE_RUNNING}
	// A recently-finished test must NOT be reaped (results still fetchable).
	s.tests["recent"] = &BandwidthTest{ID: "recent", State: pb.TestState_TEST_STATE_COMPLETED, EndTime: time.Now()}

	s.reapFinishedTests(time.Now())

	if _, ok := s.tests["running"]; !ok {
		t.Errorf("reaper evicted a running test")
	}
	if _, ok := s.tests["recent"]; !ok {
		t.Errorf("reaper evicted a recently-finished test still within retention")
	}
	for i := range states {
		id := fmt.Sprintf("old-%d", i)
		if _, ok := s.tests[id]; ok {
			t.Errorf("reaper did not evict old terminal test %s", id)
		}
	}
	if len(s.tests) != 2 {
		t.Errorf("after reap len(s.tests)=%d want 2 (running + recent)", len(s.tests))
	}
}

// TestStartTestReapsFinishedTests proves the reaper is actually WIRED into the
// live path: StartTest opportunistically evicts old finished tests, so the map
// stays bounded under repeated test runs without any manual reaping.
func TestStartTestReapsFinishedTests(t *testing.T) {
	s := newLeakTestServer()
	s.tests["stale"] = &BandwidthTest{
		ID:      "stale",
		State:   pb.TestState_TEST_STATE_COMPLETED,
		EndTime: time.Now().Add(-2 * finishedTestRetention),
	}

	resp, err := s.StartTest(context.Background(), &pb.StartTestRequest{
		TestId:          "new",
		DurationSeconds: 3600,
	})
	if err != nil || !resp.Success {
		t.Fatalf("StartTest: resp=%v err=%v", resp, err)
	}

	// Stop the background runTest goroutine StartTest just launched.
	s.testsLock.RLock()
	newTest := s.tests["new"]
	_, staleStillThere := s.tests["stale"]
	s.testsLock.RUnlock()
	if newTest != nil && newTest.Cancel != nil {
		newTest.Cancel()
	}

	if staleStillThere {
		t.Errorf("StartTest did not reap the stale finished test — the reaper is not wired into the live path")
	}
}

// TestFinishTestSetsEndTimeAndCancels proves finishTest stamps EndTime (so the
// reaper can age the test out) and invokes the test's Cancel (so the deadline-
// COMPLETED path releases its context instead of leaking the cancel func — only
// CancelTest called Cancel before).
func TestFinishTestSetsEndTimeAndCancels(t *testing.T) {
	s := newLeakTestServer()
	cancelled := false
	test := &BandwidthTest{
		ID:        "fin",
		StartTime: time.Now().Add(-time.Second),
		State:     pb.TestState_TEST_STATE_RUNNING,
		Cancel:    func() { cancelled = true },
	}
	s.tests[test.ID] = test

	s.finishTest(test, pb.TestState_TEST_STATE_COMPLETED, "")

	if test.EndTime.IsZero() {
		t.Errorf("finishTest did not set EndTime")
	}
	if !cancelled {
		t.Errorf("finishTest did not invoke test.Cancel on the completed path (context/cancel-func leak)")
	}
}
