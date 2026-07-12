package grpc

import (
	"context"
	"sync"
	"testing"
	"time"

	pb "github.com/Technologies-Unlimited/Network-Proxy/internal/grpc/pb/node"
)

// TestBandwidthConcurrentAccessRace is the runtime backstop (Layer 2) for the
// concurrency data-race class. The static atomicconsistency analyzer (Layer 1)
// catches the atomic/plain BytesSent/BytesReceived mix, but it CANNOT see the
// sibling lock-inconsistency subclass: BandwidthTest.State is written under
// testsLock in finishTest yet read WITHOUT the lock in GetTestStatus /
// GetTestResults. Only the race detector sees that, and only when a test forces
// the write/read windows to overlap.
//
// The pre-existing TestBandwidthStartStatusResults reads the fields AFTER the
// stream closes and BEFORE the finish deadline, so the windows never overlap and
// `go test -race` was green despite the bug — the false-safety gap this test
// closes. Here concurrent goroutines drive the atomic writers (addBytesSent /
// addBytesReceived) AND the unlocked readers (GetTestStatus / GetTestResults)
// while finishTest fires at the ~1s deadline, so every accessor of BytesSent,
// BytesReceived and State genuinely overlaps.
//
// Under CI's `go test -race ./...` this FAILS on the unfixed code (both the
// atomic/plain counter reads and the unlocked State read) and PASSES once every
// accessor is made consistent. Without -race (the cgo-less Windows dev box) it is
// a plain smoke test that must not panic or return nonsense.
func TestBandwidthConcurrentAccessRace(t *testing.T) {
	client, srv := startTestBandwidthServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	const testID = "race-1"
	// DurationSeconds=1 so runTest's finishTest fires ~1s in — inside the
	// concurrent reader/writer window below.
	if _, err := client.StartTest(ctx, &pb.StartTestRequest{
		TestId:          testID,
		SourceNodeId:    "src",
		TargetNodeId:    "target-node",
		TestType:        pb.TestType_TEST_TYPE_BIDIRECTIONAL,
		DurationSeconds: 1,
		ChunkSize:       64 * 1024,
	}); err != nil {
		t.Fatalf("StartTest: %v", err)
	}

	stop := make(chan struct{})
	var wg sync.WaitGroup

	// Writers: atomic AddInt64 on BytesSent / BytesReceived, exactly as the
	// streaming RPC handlers do while data flows.
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
					srv.addBytesSent(testID, 1024)
					srv.addBytesReceived(testID, 2048)
				}
			}
		}()
	}

	// Readers: the exact accessors an operator polling a running test hits. They
	// read BytesSent / BytesReceived (atomic-written) and State (lock-written)
	// concurrently with the writers and with finishTest.
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
					_, _ = srv.GetTestStatus(ctx, &pb.GetTestStatusRequest{TestId: testID})
					_, _ = srv.GetTestResults(ctx, &pb.GetTestResultsRequest{TestId: testID})
				}
			}
		}()
	}

	// Straddle the ~1s finishTest deadline so the locked State write overlaps the
	// unlocked reads.
	time.Sleep(1400 * time.Millisecond)
	close(stop)
	wg.Wait()

	// Smoke sanity independent of -race: the test finished cleanly and the
	// atomically-accumulated counters are non-negative and non-zero (writers ran).
	results, err := srv.GetTestResults(ctx, &pb.GetTestResultsRequest{TestId: testID})
	if err != nil {
		t.Fatalf("GetTestResults after window: %v", err)
	}
	if results.BytesSent <= 0 || results.BytesReceived <= 0 {
		t.Fatalf("expected accumulated counters > 0, got sent=%d recv=%d", results.BytesSent, results.BytesReceived)
	}
}
