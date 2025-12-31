# Bandwidth Optimization Plan: 4 Gbps -> 10 Gbps

## Current State
- **Upload:** ~3.6 Gbps (avg send latency: 2,335 µs per 1MB chunk)
- **Download:** ~4.2 Gbps (avg recv latency: 2,009 µs per 1MB chunk)
- **CPU Usage:** 31% (not the bottleneck)
- **Chunk Size:** 1 MB
- **Primary Bottleneck:** gRPC per-chunk overhead (~2ms per Send/Recv call)

## Target
- **10 Gbps** = 1.25 GB/s = need ~0.8ms per 1MB chunk (currently ~2ms)

---

## Optimization Strategies

### Strategy 1: Increase Chunk Size (Low Risk, Easy)
**Rationale:** Larger chunks = fewer Send() calls = less overhead per byte

| Chunk Size | Theoretical Max (at 2ms/chunk) | Expected Improvement |
|------------|-------------------------------|---------------------|
| 1 MB       | 4 Gbps                        | Current baseline    |
| 2 MB       | 8 Gbps                        | 2x                  |
| 4 MB       | 16 Gbps                       | 4x                  |
| 8 MB       | 32 Gbps                       | 8x                  |

**Implementation:**
- Change `DefaultChunkSize` from 1MB to 4MB or 8MB
- Test and measure actual improvement

**Risk:** Memory pressure on nodes, protobuf message size limits (default 4MB)

---

### Strategy 2: Tune gRPC Options (Low Risk, Easy)
**Rationale:** Increase buffer sizes and optimize connection settings

**Options to tune:**
```go
grpc.WithWriteBufferSize(8 * 1024 * 1024)    // 8MB write buffer
grpc.WithReadBufferSize(8 * 1024 * 1024)     // 8MB read buffer
grpc.WithInitialWindowSize(16 * 1024 * 1024) // 16MB initial window
grpc.WithInitialConnWindowSize(16 * 1024 * 1024)
grpc.MaxRecvMsgSize(16 * 1024 * 1024)        // Allow larger messages
grpc.MaxSendMsgSize(16 * 1024 * 1024)
```

**Implementation:**
- Add options to gRPC client and server creation
- Combine with Strategy 1

---

### Strategy 3: Parallel Streams (Medium Risk, Medium Effort)
**Rationale:** Open N concurrent gRPC streams, aggregate throughput

**Design:**
- Open 2-4 parallel streams
- Each stream sends chunks independently
- Aggregate bytes at the end for total throughput

**Expected:** If each stream does 4 Gbps, 3 streams = 12 Gbps (minus overhead)

**Implementation:**
- Use goroutines to run multiple StreamUpload/StreamDownload calls
- Use sync.WaitGroup to coordinate
- Sum total bytes transferred

---

### Strategy 4: Disable Protobuf for Data (Medium Risk, Medium Effort)
**Rationale:** Protobuf serialization adds overhead for large binary blobs

**Current flow:**
```
data -> protobuf encode -> gRPC frame -> send -> gRPC unframe -> protobuf decode
```

**Optimized flow:**
- Use `bytes` field directly without wrapping message
- Or use gRPC raw bytes codec

**Implementation:**
- Create custom codec that skips protobuf for BandwidthChunk
- Register with gRPC

---

### Strategy 5: TCP Socket Fallback (High Effort, Maximum Performance)
**Rationale:** Bypass gRPC entirely for pure bandwidth measurement

**Design:**
- Use gRPC for control plane (start test, report results)
- Use raw TCP for data plane (actual bandwidth transfer)
- Similar to how iperf3 works

**Expected:** Near line-rate performance (limited only by NIC/OS)

**Implementation:**
- Add TCP listener on nodes alongside gRPC
- Negotiate TCP port via gRPC
- Transfer raw bytes over TCP socket

---

## Implementation Order (Incremental)

### Phase 1: Quick Wins (Strategies 1 + 2)
1. Increase chunk size to 4MB
2. Increase gRPC max message size to 8MB
3. Add write/read buffer tuning
4. **Test and measure**

### Phase 2: Parallel Streams (Strategy 3)
1. Implement parallel stream support (2-4 streams)
2. Aggregate throughput measurement
3. **Test and measure**

### Phase 3: Advanced (Strategy 4 or 5)
Only if Phase 1+2 don't reach 10 Gbps:
1. Either implement custom codec
2. Or implement TCP fallback

---

## Test Plan

After each change:
1. Rebuild: `go build -o network-monitor.exe ./cmd/server && go build -o node.exe ./cmd/node`
2. Restart server and nodes
3. Run 10-second bidirectional test
4. Record: upload Mbps, download Mbps, avg latency per chunk
5. Compare to baseline

---

## Success Criteria

| Metric | Baseline | Target |
|--------|----------|--------|
| Upload | 3,600 Mbps | 10,000 Mbps |
| Download | 4,200 Mbps | 10,000 Mbps |
| Latency variance | 40ms max | <10ms max |

---

## Current Progress

- [x] Baseline diagnostics collected
- [ ] Phase 1: Chunk size + gRPC tuning
- [ ] Phase 2: Parallel streams
- [ ] Phase 3: Advanced optimizations (if needed)
