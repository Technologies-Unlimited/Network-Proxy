package grpc

import (
	"context"
	"crypto/rand"
	"fmt"
	"io"
	"log"
	"runtime"
	"sync/atomic"
	"time"

	pb "github.com/Technologies-Unlimited/Network-Proxy/internal/grpc/pb/node"

	"google.golang.org/grpc"
	"google.golang.org/protobuf/types/known/timestamppb"
)

const (
	DefaultChunkSize  = 4 * 1024 * 1024 // 4MB for maximum throughput (reduced overhead per byte)
	LatencySampleRate = 100             // Only sample latency every N chunks to reduce overhead
	DiagnosticMode    = true            // Enable detailed diagnostic logging

	// gRPC tuning constants for high-throughput
	GRPCMaxMsgSize      = 8 * 1024 * 1024  // 8MB max message size
	GRPCWriteBufferSize = 8 * 1024 * 1024  // 8MB write buffer
	GRPCReadBufferSize  = 8 * 1024 * 1024  // 8MB read buffer
	GRPCInitWindowSize  = 16 * 1024 * 1024 // 16MB initial window size
	GRPCConnWindowSize  = 16 * 1024 * 1024 // 16MB connection window size
)

// DiagnosticStats tracks detailed performance metrics
type DiagnosticStats struct {
	ChunksSent       int64
	ChunksReceived   int64
	SendErrors       int64
	RecvErrors       int64
	MinSendTimeNs    int64
	MaxSendTimeNs    int64
	TotalSendTimeNs  int64
	MinRecvTimeNs    int64
	MaxRecvTimeNs    int64
	TotalRecvTimeNs  int64
	PerSecondBytes   []int64 // Bytes per second samples
	GoroutineCount   int
	HeapAllocMB      float64
}

// StartTest initiates a bandwidth test
func (s *Server) StartTest(ctx context.Context, req *pb.StartTestRequest) (*pb.StartTestResponse, error) {
	log.Printf("Starting bandwidth test %s: %s -> %s, type=%s, duration=%ds",
		req.TestId, req.SourceNodeId, req.TargetNodeId, req.TestType, req.DurationSeconds)

	testCtx, cancel := context.WithCancel(context.Background())

	test := &BandwidthTest{
		ID:           req.TestId,
		SourceNodeID: req.SourceNodeId,
		TargetNodeID: req.TargetNodeId,
		TestType:     req.TestType,
		Duration:     req.DurationSeconds,
		StartTime:    time.Now(),
		State:        pb.TestState_TEST_STATE_RUNNING,
		Cancel:       cancel,
	}

	s.testsLock.Lock()
	s.tests[req.TestId] = test
	s.testsLock.Unlock()

	// Start the test in background
	go s.runTest(testCtx, test, req)

	return &pb.StartTestResponse{
		Success:   true,
		TestId:    req.TestId,
		Message:   "Test started",
		StartedAt: timestamppb.Now(),
	}, nil
}

// runTest executes the bandwidth test
func (s *Server) runTest(ctx context.Context, test *BandwidthTest, req *pb.StartTestRequest) {
	chunkSize := int(req.ChunkSize)
	if chunkSize <= 0 {
		chunkSize = DefaultChunkSize
	}

	duration := time.Duration(req.DurationSeconds) * time.Second
	deadline := time.Now().Add(duration)

	// Generate random data for sending
	data := make([]byte, chunkSize)
	rand.Read(data)

	var sequence int64
	ticker := time.NewTicker(1 * time.Millisecond) // Send as fast as possible
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			s.finishTest(test, pb.TestState_TEST_STATE_CANCELLED, "")
			return
		case <-ticker.C:
			if time.Now().After(deadline) {
				s.finishTest(test, pb.TestState_TEST_STATE_COMPLETED, "")
				return
			}

			// In a real implementation, we'd stream to the peer
			// For now, simulate data transfer
			atomic.AddInt64(&test.BytesSent, int64(chunkSize))
			atomic.AddInt64(&test.BytesReceived, int64(chunkSize))
			sequence++
		}
	}
}

// finishTest marks a test as complete
func (s *Server) finishTest(test *BandwidthTest, state pb.TestState, errMsg string) {
	s.testsLock.Lock()
	test.State = state
	s.testsLock.Unlock()

	endTime := time.Now()
	durationMs := endTime.Sub(test.StartTime).Milliseconds()

	// Calculate speeds
	var uploadMbps, downloadMbps float64
	if durationMs > 0 {
		uploadMbps = float64(test.BytesSent*8) / float64(durationMs) / 1000
		downloadMbps = float64(test.BytesReceived*8) / float64(durationMs) / 1000
	}

	results := &pb.TestResults{
		TestId:            test.ID,
		SourceNodeId:      test.SourceNodeID,
		TargetNodeId:      test.TargetNodeID,
		TestType:          test.TestType,
		State:             state,
		StartedAt:         timestamppb.New(test.StartTime),
		EndedAt:           timestamppb.New(endTime),
		DurationMs:        durationMs,
		BytesSent:         test.BytesSent,
		UploadSpeedMbps:   uploadMbps,
		BytesReceived:     test.BytesReceived,
		DownloadSpeedMbps: downloadMbps,
		ErrorMessage:      errMsg,
	}

	// Calculate latency stats if we have data
	if len(test.Latencies) > 0 {
		var sum, min, max int64
		min = test.Latencies[0]
		for _, l := range test.Latencies {
			sum += l
			if l < min {
				min = l
			}
			if l > max {
				max = l
			}
		}
		results.AvgLatencyUs = sum / int64(len(test.Latencies))
		results.MinLatencyUs = min
		results.MaxLatencyUs = max
	}

	if s.onTestComplete != nil {
		s.onTestComplete(test.ID, results)
	}

	log.Printf("Test %s completed: upload=%.2f Mbps, download=%.2f Mbps",
		test.ID, uploadMbps, downloadMbps)
}

// StreamUpload handles upload bandwidth testing with diagnostic logging
func (s *Server) StreamUpload(stream grpc.ClientStreamingServer[pb.DataChunk, pb.StreamResult]) error {
	var totalBytes int64
	var totalChunks int64
	var latencies []int64
	startTime := time.Now()

	// Diagnostic tracking
	var minRecvNs, maxRecvNs, totalRecvNs int64
	minRecvNs = int64(^uint64(0) >> 1) // Max int64
	var perSecondBytes []int64
	lastSecond := time.Now()
	bytesThisSecond := int64(0)
	var recvErrors int64

	if DiagnosticMode {
		var m runtime.MemStats
		runtime.ReadMemStats(&m)
		log.Printf("[DIAG-UPLOAD-START] Goroutines=%d, HeapAlloc=%.2fMB, HeapSys=%.2fMB",
			runtime.NumGoroutine(), float64(m.HeapAlloc)/1024/1024, float64(m.HeapSys)/1024/1024)
	}

	for {
		recvStart := time.Now().UnixNano()
		chunk, err := stream.Recv()
		recvTime := time.Now().UnixNano() - recvStart

		if err == io.EOF {
			break
		}
		if err != nil {
			recvErrors++
			if DiagnosticMode {
				log.Printf("[DIAG-UPLOAD-ERROR] Recv error after %d chunks: %v", totalChunks, err)
			}
			return err
		}

		// Track recv timing
		totalRecvNs += recvTime
		if recvTime < minRecvNs {
			minRecvNs = recvTime
		}
		if recvTime > maxRecvNs {
			maxRecvNs = recvTime
		}

		chunkLen := int64(len(chunk.Data))
		totalBytes += chunkLen
		bytesThisSecond += chunkLen
		totalChunks++

		// Track per-second throughput
		if time.Since(lastSecond) >= time.Second {
			perSecondBytes = append(perSecondBytes, bytesThisSecond)
			if DiagnosticMode && len(perSecondBytes) <= 5 {
				mbps := float64(bytesThisSecond*8) / 1000000
				log.Printf("[DIAG-UPLOAD] Second %d: %.2f Mbps, chunks=%d, avgRecv=%.2fµs",
					len(perSecondBytes), mbps, totalChunks, float64(totalRecvNs)/float64(totalChunks)/1000)
			}
			bytesThisSecond = 0
			lastSecond = time.Now()
		}

		// Calculate latency from timestamp (sample every Nth chunk to reduce overhead)
		if chunk.TimestampNs > 0 && totalChunks%int64(LatencySampleRate) == 0 {
			latency := time.Now().UnixNano() - chunk.TimestampNs
			latencies = append(latencies, latency/1000) // Convert to microseconds
		}

		if chunk.IsFinal {
			break
		}
	}

	// Add final partial second
	if bytesThisSecond > 0 {
		perSecondBytes = append(perSecondBytes, bytesThisSecond)
	}

	durationMs := time.Since(startTime).Milliseconds()
	throughputMbps := float64(totalBytes*8) / float64(durationMs) / 1000

	if DiagnosticMode {
		var m runtime.MemStats
		runtime.ReadMemStats(&m)

		// Calculate per-second stats
		var minMbps, maxMbps, avgMbps float64
		if len(perSecondBytes) > 0 {
			minMbps = float64(perSecondBytes[0]*8) / 1000000
			maxMbps = minMbps
			total := int64(0)
			for _, b := range perSecondBytes {
				mbps := float64(b*8) / 1000000
				if mbps < minMbps {
					minMbps = mbps
				}
				if mbps > maxMbps {
					maxMbps = mbps
				}
				total += b
			}
			avgMbps = float64(total*8) / float64(len(perSecondBytes)) / 1000000
		}

		log.Printf("[DIAG-UPLOAD-END] Duration=%dms, TotalBytes=%d, Chunks=%d, Throughput=%.2f Mbps",
			durationMs, totalBytes, totalChunks, throughputMbps)
		log.Printf("[DIAG-UPLOAD-RECV] MinRecv=%.2fµs, MaxRecv=%.2fµs, AvgRecv=%.2fµs",
			float64(minRecvNs)/1000, float64(maxRecvNs)/1000, float64(totalRecvNs)/float64(totalChunks)/1000)
		log.Printf("[DIAG-UPLOAD-PERSEC] Samples=%d, MinMbps=%.2f, MaxMbps=%.2f, AvgMbps=%.2f",
			len(perSecondBytes), minMbps, maxMbps, avgMbps)
		log.Printf("[DIAG-UPLOAD-MEM] Goroutines=%d, HeapAlloc=%.2fMB, GCCycles=%d",
			runtime.NumGoroutine(), float64(m.HeapAlloc)/1024/1024, m.NumGC)

		// Identify bottleneck
		avgRecvUs := float64(totalRecvNs) / float64(totalChunks) / 1000
		theoreticalMaxMbps := float64(totalBytes) / float64(totalChunks) * 8 / avgRecvUs // bytes/chunk * 8 bits / µs per chunk = Mbps
		log.Printf("[DIAG-UPLOAD-ANALYSIS] AvgChunkSize=%d bytes, TheoreticalMax=%.2f Mbps (based on recv time)",
			totalBytes/totalChunks, theoreticalMaxMbps)

		if avgRecvUs > 100 {
			log.Printf("[DIAG-UPLOAD-BOTTLENECK] High recv latency (%.2fµs) - likely gRPC/network overhead", avgRecvUs)
		}
		if maxMbps > avgMbps*1.5 {
			log.Printf("[DIAG-UPLOAD-BOTTLENECK] High variance (max %.2f vs avg %.2f) - possible GC or scheduling issues", maxMbps, avgMbps)
		}
	}

	result := &pb.StreamResult{
		TotalBytes:     totalBytes,
		TotalChunks:    totalChunks,
		DurationMs:     durationMs,
		ThroughputMbps: throughputMbps,
	}

	if len(latencies) > 0 {
		var sum, min, max int64
		min = latencies[0]
		for _, l := range latencies {
			sum += l
			if l < min {
				min = l
			}
			if l > max {
				max = l
			}
		}
		result.AvgLatencyUs = sum / int64(len(latencies))
		result.MinLatencyUs = min
		result.MaxLatencyUs = max
	}

	return stream.SendAndClose(result)
}

// StreamDownload handles download bandwidth testing with diagnostic logging
func (s *Server) StreamDownload(req *pb.DownloadRequest, stream grpc.ServerStreamingServer[pb.DataChunk]) error {
	chunkSize := int(req.ChunkSize)
	if chunkSize <= 0 {
		chunkSize = DefaultChunkSize
	}

	duration := time.Duration(req.DurationSeconds) * time.Second
	deadline := time.Now().Add(duration)
	startTime := time.Now()

	// Generate random data once (reuse for all sends)
	data := make([]byte, chunkSize)
	rand.Read(data)

	var sequence int64

	// Diagnostic tracking
	var minSendNs, maxSendNs, totalSendNs int64
	minSendNs = int64(^uint64(0) >> 1) // Max int64
	var perSecondBytes []int64
	lastSecond := time.Now()
	bytesThisSecond := int64(0)
	var sendErrors int64

	if DiagnosticMode {
		var m runtime.MemStats
		runtime.ReadMemStats(&m)
		log.Printf("[DIAG-DOWNLOAD-START] ChunkSize=%d KB, Duration=%ds, Goroutines=%d, HeapAlloc=%.2fMB",
			chunkSize/1024, req.DurationSeconds, runtime.NumGoroutine(), float64(m.HeapAlloc)/1024/1024)
	}

	for time.Now().Before(deadline) {
		sendStart := time.Now().UnixNano()

		chunk := &pb.DataChunk{
			TestId:      req.TestId,
			Sequence:    sequence,
			Data:        data,
			TimestampNs: time.Now().UnixNano(),
			IsFinal:     false,
		}

		if err := stream.Send(chunk); err != nil {
			sendErrors++
			if DiagnosticMode {
				log.Printf("[DIAG-DOWNLOAD-ERROR] Send error at chunk %d: %v", sequence, err)
			}
			return err
		}

		sendTime := time.Now().UnixNano() - sendStart

		// Track send timing
		totalSendNs += sendTime
		if sendTime < minSendNs {
			minSendNs = sendTime
		}
		if sendTime > maxSendNs {
			maxSendNs = sendTime
		}

		bytesThisSecond += int64(chunkSize)
		sequence++

		// Track per-second throughput
		if time.Since(lastSecond) >= time.Second {
			perSecondBytes = append(perSecondBytes, bytesThisSecond)
			if DiagnosticMode && len(perSecondBytes) <= 5 {
				mbps := float64(bytesThisSecond*8) / 1000000
				avgSendUs := float64(totalSendNs) / float64(sequence) / 1000
				log.Printf("[DIAG-DOWNLOAD] Second %d: %.2f Mbps, chunks=%d, avgSend=%.2fµs",
					len(perSecondBytes), mbps, sequence, avgSendUs)
			}
			bytesThisSecond = 0
			lastSecond = time.Now()
		}
	}

	// Add final partial second
	if bytesThisSecond > 0 {
		perSecondBytes = append(perSecondBytes, bytesThisSecond)
	}

	totalBytes := sequence * int64(chunkSize)
	durationMs := time.Since(startTime).Milliseconds()
	throughputMbps := float64(totalBytes*8) / float64(durationMs) / 1000

	if DiagnosticMode {
		var m runtime.MemStats
		runtime.ReadMemStats(&m)

		// Calculate per-second stats
		var minMbps, maxMbps, avgMbps float64
		if len(perSecondBytes) > 0 {
			minMbps = float64(perSecondBytes[0]*8) / 1000000
			maxMbps = minMbps
			total := int64(0)
			for _, b := range perSecondBytes {
				mbps := float64(b*8) / 1000000
				if mbps < minMbps {
					minMbps = mbps
				}
				if mbps > maxMbps {
					maxMbps = mbps
				}
				total += b
			}
			avgMbps = float64(total*8) / float64(len(perSecondBytes)) / 1000000
		}

		log.Printf("[DIAG-DOWNLOAD-END] Duration=%dms, TotalBytes=%d, Chunks=%d, Throughput=%.2f Mbps",
			durationMs, totalBytes, sequence, throughputMbps)
		log.Printf("[DIAG-DOWNLOAD-SEND] MinSend=%.2fµs, MaxSend=%.2fµs, AvgSend=%.2fµs",
			float64(minSendNs)/1000, float64(maxSendNs)/1000, float64(totalSendNs)/float64(sequence)/1000)
		log.Printf("[DIAG-DOWNLOAD-PERSEC] Samples=%d, MinMbps=%.2f, MaxMbps=%.2f, AvgMbps=%.2f",
			len(perSecondBytes), minMbps, maxMbps, avgMbps)
		log.Printf("[DIAG-DOWNLOAD-MEM] Goroutines=%d, HeapAlloc=%.2fMB, GCCycles=%d",
			runtime.NumGoroutine(), float64(m.HeapAlloc)/1024/1024, m.NumGC)

		// Identify bottleneck
		avgSendUs := float64(totalSendNs) / float64(sequence) / 1000
		theoreticalMaxMbps := float64(chunkSize) * 8 / avgSendUs // bytes/chunk * 8 bits / µs per send = Mbps
		log.Printf("[DIAG-DOWNLOAD-ANALYSIS] ChunkSize=%d bytes, TheoreticalMax=%.2f Mbps (based on send time)",
			chunkSize, theoreticalMaxMbps)

		if avgSendUs > 100 {
			log.Printf("[DIAG-DOWNLOAD-BOTTLENECK] High send latency (%.2fµs) - likely gRPC serialization or network buffer", avgSendUs)
		}
		if maxMbps > avgMbps*1.5 {
			log.Printf("[DIAG-DOWNLOAD-BOTTLENECK] High variance (max %.2f vs avg %.2f) - possible backpressure or GC", maxMbps, avgMbps)
		}
		if throughputMbps < theoreticalMaxMbps*0.5 {
			log.Printf("[DIAG-DOWNLOAD-BOTTLENECK] Actual (%.2f) << Theoretical (%.2f) - receiver may be slow", throughputMbps, theoreticalMaxMbps)
		}
	}

	// Send final chunk
	return stream.Send(&pb.DataChunk{
		TestId:      req.TestId,
		Sequence:    sequence,
		TimestampNs: time.Now().UnixNano(),
		IsFinal:     true,
	})
}

// BidirectionalStream handles bidirectional bandwidth testing
func (s *Server) BidirectionalStream(stream grpc.BidiStreamingServer[pb.DataChunk, pb.DataChunk]) error {
	// Generate random data for responses
	data := make([]byte, DefaultChunkSize)
	rand.Read(data)

	for {
		chunk, err := stream.Recv()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}

		// Echo back with our own data
		response := &pb.DataChunk{
			TestId:      chunk.TestId,
			Sequence:    chunk.Sequence,
			Data:        data,
			TimestampNs: time.Now().UnixNano(),
			IsFinal:     chunk.IsFinal,
		}

		if err := stream.Send(response); err != nil {
			return err
		}

		if chunk.IsFinal {
			return nil
		}
	}
}

// GetTestStatus returns current test status
func (s *Server) GetTestStatus(ctx context.Context, req *pb.GetTestStatusRequest) (*pb.TestStatus, error) {
	s.testsLock.RLock()
	test, ok := s.tests[req.TestId]
	s.testsLock.RUnlock()

	if !ok {
		return nil, fmt.Errorf("test %s not found", req.TestId)
	}

	elapsedMs := time.Since(test.StartTime).Milliseconds()
	durationMs := int64(test.Duration) * 1000
	remainingMs := durationMs - elapsedMs
	if remainingMs < 0 {
		remainingMs = 0
	}

	progress := float64(elapsedMs) / float64(durationMs) * 100
	if progress > 100 {
		progress = 100
	}

	var uploadMbps, downloadMbps float64
	if elapsedMs > 0 {
		uploadMbps = float64(test.BytesSent*8) / float64(elapsedMs) / 1000
		downloadMbps = float64(test.BytesReceived*8) / float64(elapsedMs) / 1000
	}

	return &pb.TestStatus{
		TestId:              req.TestId,
		State:               test.State,
		ProgressPercent:     progress,
		BytesSent:           test.BytesSent,
		BytesReceived:       test.BytesReceived,
		CurrentUploadMbps:   uploadMbps,
		CurrentDownloadMbps: downloadMbps,
		ElapsedMs:           elapsedMs,
		RemainingMs:         remainingMs,
	}, nil
}

// CancelTest cancels a running test
func (s *Server) CancelTest(ctx context.Context, req *pb.CancelTestRequest) (*pb.CancelTestResponse, error) {
	s.testsLock.Lock()
	test, ok := s.tests[req.TestId]
	s.testsLock.Unlock()

	if !ok {
		return &pb.CancelTestResponse{
			Success: false,
			Message: fmt.Sprintf("test %s not found", req.TestId),
		}, nil
	}

	if test.Cancel != nil {
		test.Cancel()
	}

	return &pb.CancelTestResponse{
		Success: true,
		Message: "Test cancelled",
	}, nil
}

// GetTestResults returns completed test results
func (s *Server) GetTestResults(ctx context.Context, req *pb.GetTestResultsRequest) (*pb.TestResults, error) {
	s.testsLock.RLock()
	test, ok := s.tests[req.TestId]
	s.testsLock.RUnlock()

	if !ok {
		return nil, fmt.Errorf("test %s not found", req.TestId)
	}

	endTime := time.Now()
	if test.State == pb.TestState_TEST_STATE_COMPLETED ||
		test.State == pb.TestState_TEST_STATE_FAILED ||
		test.State == pb.TestState_TEST_STATE_CANCELLED {
		// Use actual end time if test is done
	}

	durationMs := endTime.Sub(test.StartTime).Milliseconds()

	var uploadMbps, downloadMbps float64
	if durationMs > 0 {
		uploadMbps = float64(test.BytesSent*8) / float64(durationMs) / 1000
		downloadMbps = float64(test.BytesReceived*8) / float64(durationMs) / 1000
	}

	return &pb.TestResults{
		TestId:            test.ID,
		SourceNodeId:      test.SourceNodeID,
		TargetNodeId:      test.TargetNodeID,
		TestType:          test.TestType,
		State:             test.State,
		StartedAt:         timestamppb.New(test.StartTime),
		EndedAt:           timestamppb.New(endTime),
		DurationMs:        durationMs,
		BytesSent:         test.BytesSent,
		UploadSpeedMbps:   uploadMbps,
		BytesReceived:     test.BytesReceived,
		DownloadSpeedMbps: downloadMbps,
	}, nil
}

// RunBandwidthTest executes a bandwidth test against a peer
func (s *Server) RunBandwidthTest(ctx context.Context, peerID string, testType pb.TestType, durationSec int) (*pb.TestResults, error) {
	s.peersLock.RLock()
	peer, ok := s.peers[peerID]
	s.peersLock.RUnlock()

	if !ok {
		return nil, fmt.Errorf("peer %s not connected", peerID)
	}

	if peer.BwClient == nil {
		return nil, fmt.Errorf("peer %s has no bandwidth client", peerID)
	}

	testID := fmt.Sprintf("test-%d", time.Now().UnixNano())
	chunkSize := int32(DefaultChunkSize)
	duration := time.Duration(durationSec) * time.Second

	// Start test on peer
	startResp, err := peer.BwClient.StartTest(ctx, &pb.StartTestRequest{
		TestId:          testID,
		SourceNodeId:    s.nodeID,
		TargetNodeId:    peerID,
		TestType:        testType,
		DurationSeconds: int32(durationSec),
		ChunkSize:       chunkSize,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to start test on peer: %w", err)
	}

	if !startResp.Success {
		return nil, fmt.Errorf("peer rejected test: %s", startResp.Message)
	}

	var uploadBytes, downloadBytes int64
	var latencies []int64
	startTime := time.Now()

	// Generate test data
	data := make([]byte, chunkSize)
	rand.Read(data)

	switch testType {
	case pb.TestType_TEST_TYPE_UPLOAD:
		uploadBytes, latencies, err = s.runUploadTest(ctx, peer.BwClient, testID, data, duration)

	case pb.TestType_TEST_TYPE_DOWNLOAD:
		downloadBytes, latencies, err = s.runDownloadTest(ctx, peer.BwClient, testID, chunkSize, durationSec)

	case pb.TestType_TEST_TYPE_BIDIRECTIONAL:
		uploadBytes, downloadBytes, latencies, err = s.runBidirectionalTest(ctx, peer.BwClient, testID, data, duration)
	}

	if err != nil {
		return nil, err
	}

	durationMs := time.Since(startTime).Milliseconds()

	results := &pb.TestResults{
		TestId:            testID,
		SourceNodeId:      s.nodeID,
		TargetNodeId:      peerID,
		TestType:          testType,
		State:             pb.TestState_TEST_STATE_COMPLETED,
		StartedAt:         timestamppb.New(startTime),
		EndedAt:           timestamppb.Now(),
		DurationMs:        durationMs,
		BytesSent:         uploadBytes,
		BytesReceived:     downloadBytes,
		UploadSpeedMbps:   float64(uploadBytes*8) / float64(durationMs) / 1000,
		DownloadSpeedMbps: float64(downloadBytes*8) / float64(durationMs) / 1000,
	}

	// Calculate latency stats
	if len(latencies) > 0 {
		var sum, min, max int64
		min = latencies[0]
		for _, l := range latencies {
			sum += l
			if l < min {
				min = l
			}
			if l > max {
				max = l
			}
		}
		results.AvgLatencyUs = sum / int64(len(latencies))
		results.MinLatencyUs = min
		results.MaxLatencyUs = max
	}

	return results, nil
}

func (s *Server) runUploadTest(ctx context.Context, client pb.BandwidthServiceClient, testID string, data []byte, duration time.Duration) (int64, []int64, error) {
	stream, err := client.StreamUpload(ctx)
	if err != nil {
		return 0, nil, err
	}

	var totalBytes int64
	var latencies []int64
	deadline := time.Now().Add(duration)
	var sequence int64

	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			stream.CloseAndRecv()
			return totalBytes, latencies, ctx.Err()
		default:
		}

		sendTime := time.Now().UnixNano()
		err := stream.Send(&pb.DataChunk{
			TestId:      testID,
			Sequence:    sequence,
			Data:        data,
			TimestampNs: sendTime,
			IsFinal:     false,
		})
		if err != nil {
			break
		}

		totalBytes += int64(len(data))
		sequence++
	}

	// Send final chunk
	stream.Send(&pb.DataChunk{
		TestId:      testID,
		Sequence:    sequence,
		TimestampNs: time.Now().UnixNano(),
		IsFinal:     true,
	})

	result, err := stream.CloseAndRecv()
	if err != nil {
		return totalBytes, latencies, err
	}

	if result != nil {
		latencies = append(latencies, result.AvgLatencyUs)
	}

	return totalBytes, latencies, nil
}

func (s *Server) runDownloadTest(ctx context.Context, client pb.BandwidthServiceClient, testID string, chunkSize int32, durationSec int) (int64, []int64, error) {
	stream, err := client.StreamDownload(ctx, &pb.DownloadRequest{
		TestId:          testID,
		ChunkSize:       chunkSize,
		DurationSeconds: int32(durationSec),
	})
	if err != nil {
		return 0, nil, err
	}

	var totalBytes int64
	var latencies []int64

	for {
		chunk, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			return totalBytes, latencies, err
		}

		totalBytes += int64(len(chunk.Data))

		if chunk.TimestampNs > 0 {
			latency := (time.Now().UnixNano() - chunk.TimestampNs) / 1000
			latencies = append(latencies, latency)
		}

		if chunk.IsFinal {
			break
		}
	}

	return totalBytes, latencies, nil
}

func (s *Server) runBidirectionalTest(ctx context.Context, client pb.BandwidthServiceClient, testID string, data []byte, duration time.Duration) (int64, int64, []int64, error) {
	stream, err := client.BidirectionalStream(ctx)
	if err != nil {
		return 0, 0, nil, err
	}

	var uploadBytes, downloadBytes int64
	var latencies []int64
	deadline := time.Now().Add(duration)
	var sequence int64

	// Start receiver goroutine
	recvDone := make(chan struct{})
	go func() {
		defer close(recvDone)
		for {
			chunk, err := stream.Recv()
			if err != nil {
				return
			}

			downloadBytes += int64(len(chunk.Data))

			if chunk.TimestampNs > 0 {
				latency := (time.Now().UnixNano() - chunk.TimestampNs) / 1000
				latencies = append(latencies, latency)
			}

			if chunk.IsFinal {
				return
			}
		}
	}()

	// Send data
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			stream.CloseSend()
			return uploadBytes, downloadBytes, latencies, ctx.Err()
		default:
		}

		err := stream.Send(&pb.DataChunk{
			TestId:      testID,
			Sequence:    sequence,
			Data:        data,
			TimestampNs: time.Now().UnixNano(),
			IsFinal:     false,
		})
		if err != nil {
			break
		}

		uploadBytes += int64(len(data))
		sequence++
	}

	// Send final
	stream.Send(&pb.DataChunk{
		TestId:      testID,
		Sequence:    sequence,
		TimestampNs: time.Now().UnixNano(),
		IsFinal:     true,
	})
	stream.CloseSend()

	// Wait for receiver
	<-recvDone

	return uploadBytes, downloadBytes, latencies, nil
}
