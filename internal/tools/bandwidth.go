package tools

import (
	"context"
	"fmt"
	"io"
	"net"
	"time"
)

// BandwidthResult contains bandwidth test results
type BandwidthResult struct {
	Target           string        `json:"target"`
	Duration         time.Duration `json:"duration"`
	BytesSent        int64         `json:"bytes_sent"`
	BytesReceived    int64         `json:"bytes_received"`
	UploadSpeed      float64       `json:"upload_speed_mbps"`
	DownloadSpeed    float64       `json:"download_speed_mbps"`
	AverageLatency   time.Duration `json:"average_latency"`
	MinLatency       time.Duration `json:"min_latency"`
	MaxLatency       time.Duration `json:"max_latency"`
	PacketLoss       float64       `json:"packet_loss_percent"`
	Error            string        `json:"error,omitempty"`
}

// BandwidthOptions configures bandwidth test behavior
type BandwidthOptions struct {
	Duration    time.Duration
	PacketSize  int
	Protocol    string // "tcp" or "udp"
	Port        int
	TestUpload  bool
	TestDownload bool
}

// DefaultBandwidthOptions returns default options
func DefaultBandwidthOptions() BandwidthOptions {
	return BandwidthOptions{
		Duration:    10 * time.Second,
		PacketSize:  1024 * 8, // 8KB
		Protocol:    "tcp",
		Port:        5201, // iperf3 default port
		TestUpload:  true,
		TestDownload: false,
	}
}

// BandwidthTest performs a bandwidth test
func BandwidthTest(ctx context.Context, target string, opts BandwidthOptions) (*BandwidthResult, error) {
	result := &BandwidthResult{
		Target:   target,
		Duration: opts.Duration,
	}

	if opts.Protocol == "tcp" {
		return bandwidthTestTCP(ctx, target, opts, result)
	}

	return nil, fmt.Errorf("unsupported protocol: %s", opts.Protocol)
}

func bandwidthTestTCP(ctx context.Context, target string, opts BandwidthOptions, result *BandwidthResult) (*BandwidthResult, error) {
	// Resolve target
	address := fmt.Sprintf("%s:%d", target, opts.Port)

	// Create dialer with timeout
	dialer := &net.Dialer{
		Timeout: 5 * time.Second,
	}

	// Connect to target
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		result.Error = err.Error()
		return result, fmt.Errorf("failed to connect: %w", err)
	}
	defer conn.Close()

	// Prepare data buffer
	data := make([]byte, opts.PacketSize)
	for i := range data {
		data[i] = byte(i % 256)
	}

	// Start time
	startTime := time.Now()
	endTime := startTime.Add(opts.Duration)

	// Test upload
	if opts.TestUpload {
		var bytesSent int64
		for time.Now().Before(endTime) {
			select {
			case <-ctx.Done():
				return result, ctx.Err()
			default:
			}

			n, err := conn.Write(data)
			if err != nil {
				result.Error = err.Error()
				return result, fmt.Errorf("write error: %w", err)
			}
			bytesSent += int64(n)
		}

		actualDuration := time.Since(startTime)
		result.BytesSent = bytesSent
		result.UploadSpeed = calculateMbps(bytesSent, actualDuration)
	}

	// Test download
	if opts.TestDownload {
		startTime = time.Now()
		endTime = startTime.Add(opts.Duration)

		buffer := make([]byte, opts.PacketSize)
		var bytesReceived int64

		for time.Now().Before(endTime) {
			select {
			case <-ctx.Done():
				return result, ctx.Err()
			default:
			}

			conn.SetReadDeadline(time.Now().Add(1 * time.Second))
			n, err := conn.Read(buffer)
			if err != nil {
				if err == io.EOF {
					break
				}
				// Timeout is expected
				if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
					continue
				}
				result.Error = err.Error()
				return result, fmt.Errorf("read error: %w", err)
			}
			bytesReceived += int64(n)
		}

		actualDuration := time.Since(startTime)
		result.BytesReceived = bytesReceived
		result.DownloadSpeed = calculateMbps(bytesReceived, actualDuration)
	}

	// Measure latency
	latencies := measureLatency(ctx, target, 10)
	if len(latencies) > 0 {
		result.MinLatency = latencies[0]
		result.MaxLatency = latencies[0]
		var totalLatency time.Duration

		for _, latency := range latencies {
			totalLatency += latency
			if latency < result.MinLatency {
				result.MinLatency = latency
			}
			if latency > result.MaxLatency {
				result.MaxLatency = latency
			}
		}

		result.AverageLatency = totalLatency / time.Duration(len(latencies))
	}

	return result, nil
}

// calculateMbps calculates megabits per second
func calculateMbps(bytes int64, duration time.Duration) float64 {
	bits := float64(bytes * 8)
	seconds := duration.Seconds()
	if seconds == 0 {
		return 0
	}
	return bits / seconds / 1000000 // Convert to Mbps
}

// maxLatencySamples bounds the count parameter so a request can't
// allocate-by-proxy: a malicious caller passing count=2_000_000_000
// would otherwise commit ~16 GB to the slice header. CodeQL flagged
// this with go/uncontrolled-allocation-size.
const maxLatencySamples = 1024

// measureLatency measures network latency using TCP connects.
func measureLatency(ctx context.Context, target string, count int) []time.Duration {
	if count < 0 {
		count = 0
	}
	if count > maxLatencySamples {
		count = maxLatencySamples
	}
	latencies := make([]time.Duration, 0, count)

	// Try to connect to port 80 or 443
	ports := []int{80, 443, 22}
	var workingPort int

	// Find a working port
	for _, port := range ports {
		address := fmt.Sprintf("%s:%d", target, port)
		dialer := &net.Dialer{
			Timeout: 2 * time.Second,
		}

		conn, err := dialer.DialContext(ctx, "tcp", address)
		if err == nil {
			conn.Close()
			workingPort = port
			break
		}
	}

	if workingPort == 0 {
		return latencies
	}

	address := fmt.Sprintf("%s:%d", target, workingPort)

	for i := 0; i < count; i++ {
		select {
		case <-ctx.Done():
			return latencies
		default:
		}

		start := time.Now()

		dialer := &net.Dialer{
			Timeout: 2 * time.Second,
		}

		conn, err := dialer.DialContext(ctx, "tcp", address)
		if err != nil {
			continue
		}
		conn.Close()

		latency := time.Since(start)
		latencies = append(latencies, latency)

		// Small delay between measurements
		time.Sleep(100 * time.Millisecond)
	}

	return latencies
}

// Ping performs a simple ping test using TCP connects
func Ping(ctx context.Context, target string, count int) (*PingResult, error) {
	result := &PingResult{
		Target:      target,
		PacketsSent: count,
	}

	latencies := measureLatency(ctx, target, count)
	result.PacketsReceived = len(latencies)

	if result.PacketsSent > 0 {
		result.PacketLoss = float64(result.PacketsSent-result.PacketsReceived) / float64(result.PacketsSent) * 100
	}

	if len(latencies) > 0 {
		result.MinLatency = latencies[0]
		result.MaxLatency = latencies[0]
		var totalLatency time.Duration

		for _, latency := range latencies {
			totalLatency += latency
			if latency < result.MinLatency {
				result.MinLatency = latency
			}
			if latency > result.MaxLatency {
				result.MaxLatency = latency
			}
		}

		result.AverageLatency = totalLatency / time.Duration(len(latencies))
	}

	return result, nil
}

// PingResult contains ping test results
type PingResult struct {
	Target          string        `json:"target"`
	PacketsSent     int           `json:"packets_sent"`
	PacketsReceived int           `json:"packets_received"`
	PacketLoss      float64       `json:"packet_loss_percent"`
	MinLatency      time.Duration `json:"min_latency"`
	MaxLatency      time.Duration `json:"max_latency"`
	AverageLatency  time.Duration `json:"average_latency"`
}

// SimpleBandwidthTest performs a simple bandwidth test by downloading data
func SimpleBandwidthTest(ctx context.Context, target string, duration time.Duration) (*BandwidthResult, error) {
	result := &BandwidthResult{
		Target:   target,
		Duration: duration,
	}

	// Try to connect to common HTTP ports
	ports := []int{80, 8080, 443}
	var conn net.Conn
	var err error

	for _, port := range ports {
		address := fmt.Sprintf("%s:%d", target, port)
		dialer := &net.Dialer{
			Timeout: 5 * time.Second,
		}

		conn, err = dialer.DialContext(ctx, "tcp", address)
		if err == nil {
			break
		}
	}

	if conn == nil {
		result.Error = "failed to connect to target"
		return result, fmt.Errorf("failed to connect to target")
	}
	defer conn.Close()

	// Send HTTP request
	request := "GET / HTTP/1.1\r\nHost: " + target + "\r\nConnection: close\r\n\r\n"
	_, err = conn.Write([]byte(request))
	if err != nil {
		result.Error = err.Error()
		return result, fmt.Errorf("failed to send request: %w", err)
	}

	// Read response
	startTime := time.Now()
	endTime := startTime.Add(duration)

	buffer := make([]byte, 8192)
	var bytesReceived int64

	for time.Now().Before(endTime) {
		select {
		case <-ctx.Done():
			return result, ctx.Err()
		default:
		}

		conn.SetReadDeadline(time.Now().Add(1 * time.Second))
		n, err := conn.Read(buffer)
		if err != nil {
			if err == io.EOF {
				break
			}
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				continue
			}
			break
		}
		bytesReceived += int64(n)
	}

	actualDuration := time.Since(startTime)
	result.BytesReceived = bytesReceived
	result.DownloadSpeed = calculateMbps(bytesReceived, actualDuration)

	return result, nil
}
