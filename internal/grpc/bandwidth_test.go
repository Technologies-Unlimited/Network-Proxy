package grpc

import (
	"context"
	"net"
	"testing"
	"time"

	pb "github.com/Technologies-Unlimited/Network-Proxy/internal/grpc/pb/node"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// startTestBandwidthServer spins up a real gRPC BandwidthService on a loopback
// port (no TLS/auth — we exercise the data path, not the security layer) and
// returns a connected client plus a cleanup func.
func startTestBandwidthServer(t *testing.T) (pb.BandwidthServiceClient, *Server) {
	t.Helper()

	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}

	srv := NewServer(ServerConfig{
		NodeID:   "target-node",
		NodeName: "target",
		GRPCPort: lis.Addr().(*net.TCPAddr).Port,
		Version:  "test",
	})

	grpcSrv := grpc.NewServer(
		grpc.MaxRecvMsgSize(GRPCMaxMsgSize),
		grpc.MaxSendMsgSize(GRPCMaxMsgSize),
	)
	pb.RegisterBandwidthServiceServer(grpcSrv, srv)
	go func() { _ = grpcSrv.Serve(lis) }()

	conn, err := grpc.NewClient(
		lis.Addr().String(),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithDefaultCallOptions(
			grpc.MaxCallRecvMsgSize(GRPCMaxMsgSize),
			grpc.MaxCallSendMsgSize(GRPCMaxMsgSize),
		),
	)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}

	t.Cleanup(func() {
		conn.Close()
		grpcSrv.Stop()
		lis.Close()
	})

	return pb.NewBandwidthServiceClient(conn), srv
}

// TestBandwidthUploadStream runs a REAL upload speed test: the client streams
// data chunks to the server over gRPC, the server tallies bytes and returns a
// throughput measurement.
func TestBandwidthUploadStream(t *testing.T) {
	client, _ := startTestBandwidthServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	const testID = "upload-1"
	if _, err := client.StartTest(ctx, &pb.StartTestRequest{
		TestId:          testID,
		SourceNodeId:    "src",
		TargetNodeId:    "target-node",
		TestType:        pb.TestType_TEST_TYPE_UPLOAD,
		DurationSeconds: 2,
		ChunkSize:       64 * 1024,
	}); err != nil {
		t.Fatalf("StartTest: %v", err)
	}

	stream, err := client.StreamUpload(ctx)
	if err != nil {
		t.Fatalf("StreamUpload: %v", err)
	}

	payload := make([]byte, 64*1024)
	deadline := time.Now().Add(500 * time.Millisecond)
	var seq int64
	var sent int64
	for time.Now().Before(deadline) {
		if err := stream.Send(&pb.DataChunk{
			TestId:      testID,
			Sequence:    seq,
			Data:        payload,
			TimestampNs: time.Now().UnixNano(),
		}); err != nil {
			t.Fatalf("send chunk %d: %v", seq, err)
		}
		sent += int64(len(payload))
		seq++
	}
	// Final marker
	if err := stream.Send(&pb.DataChunk{TestId: testID, Sequence: seq, IsFinal: true}); err != nil {
		t.Fatalf("send final: %v", err)
	}

	result, err := stream.CloseAndRecv()
	if err != nil {
		t.Fatalf("CloseAndRecv: %v", err)
	}
	if result.TotalBytes < sent {
		t.Errorf("server tallied %d bytes, client sent at least %d", result.TotalBytes, sent)
	}
	if result.ThroughputMbps <= 0 {
		t.Errorf("throughput must be positive, got %f", result.ThroughputMbps)
	}
	t.Logf("UPLOAD: %d bytes, %.2f Mbps over loopback", result.TotalBytes, result.ThroughputMbps)
}

// TestBandwidthDownloadStream runs a REAL download speed test: the server
// streams data chunks to the client for the requested duration.
func TestBandwidthDownloadStream(t *testing.T) {
	client, _ := startTestBandwidthServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	stream, err := client.StreamDownload(ctx, &pb.DownloadRequest{
		TestId:          "download-1",
		ChunkSize:       64 * 1024,
		DurationSeconds: 1,
	})
	if err != nil {
		t.Fatalf("StreamDownload: %v", err)
	}

	var received int64
	var chunks int
	for {
		chunk, err := stream.Recv()
		if err != nil {
			t.Fatalf("recv: %v", err)
		}
		received += int64(len(chunk.Data))
		chunks++
		if chunk.IsFinal {
			break
		}
	}
	if received <= 0 {
		t.Fatalf("download received no data")
	}
	t.Logf("DOWNLOAD: %d bytes across %d chunks over loopback", received, chunks)
}

// TestBandwidthBidirectional runs a REAL bidirectional test: chunks flow both
// directions and the server echoes data back.
func TestBandwidthBidirectional(t *testing.T) {
	client, _ := startTestBandwidthServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	stream, err := client.BidirectionalStream(ctx)
	if err != nil {
		t.Fatalf("BidirectionalStream: %v", err)
	}

	payload := make([]byte, 32*1024)
	var echoed int64

	// Receiver
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			chunk, err := stream.Recv()
			if err != nil {
				return
			}
			echoed += int64(len(chunk.Data))
			if chunk.IsFinal {
				return
			}
		}
	}()

	for i := int64(0); i < 10; i++ {
		if err := stream.Send(&pb.DataChunk{
			TestId:      "bidir-1",
			Sequence:    i,
			Data:        payload,
			TimestampNs: time.Now().UnixNano(),
		}); err != nil {
			t.Fatalf("send: %v", err)
		}
	}
	if err := stream.Send(&pb.DataChunk{TestId: "bidir-1", Sequence: 99, IsFinal: true}); err != nil {
		t.Fatalf("send final: %v", err)
	}
	_ = stream.CloseSend()
	<-done

	if echoed <= 0 {
		t.Error("bidirectional: server echoed no data back")
	}
	t.Logf("BIDIRECTIONAL: %d bytes echoed back over loopback", echoed)
}

// TestBandwidthStartAndStatus verifies the StartTest → GetTestStatus →
// GetTestResults bookkeeping path that the HTTP layer relies on.
func TestBandwidthStartStatusResults(t *testing.T) {
	client, _ := startTestBandwidthServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	const testID = "status-1"
	if _, err := client.StartTest(ctx, &pb.StartTestRequest{
		TestId:          testID,
		SourceNodeId:    "src",
		TargetNodeId:    "target-node",
		TestType:        pb.TestType_TEST_TYPE_UPLOAD,
		DurationSeconds: 3,
		ChunkSize:       64 * 1024,
	}); err != nil {
		t.Fatalf("StartTest: %v", err)
	}

	// Push some bytes so the counters are non-zero.
	stream, err := client.StreamUpload(ctx)
	if err != nil {
		t.Fatalf("StreamUpload: %v", err)
	}
	payload := make([]byte, 64*1024)
	for i := 0; i < 20; i++ {
		if err := stream.Send(&pb.DataChunk{TestId: testID, Sequence: int64(i), Data: payload}); err != nil {
			t.Fatalf("send: %v", err)
		}
	}
	_ = stream.Send(&pb.DataChunk{TestId: testID, IsFinal: true})
	if _, err := stream.CloseAndRecv(); err != nil {
		t.Fatalf("CloseAndRecv: %v", err)
	}

	status, err := client.GetTestStatus(ctx, &pb.GetTestStatusRequest{TestId: testID})
	if err != nil {
		t.Fatalf("GetTestStatus: %v", err)
	}
	if status.BytesSent <= 0 {
		t.Errorf("expected BytesSent > 0, got %d", status.BytesSent)
	}

	results, err := client.GetTestResults(ctx, &pb.GetTestResultsRequest{TestId: testID})
	if err != nil {
		t.Fatalf("GetTestResults: %v", err)
	}
	if results.BytesSent <= 0 {
		t.Errorf("results BytesSent should be > 0, got %d", results.BytesSent)
	}

	// Unknown test ID must error, not panic.
	if _, err := client.GetTestStatus(ctx, &pb.GetTestStatusRequest{TestId: "nope"}); err == nil {
		t.Error("expected error for unknown test id")
	}
}
