package tools

import (
	"context"
	"fmt"
	"net"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// PortStatus represents the status of a port
type PortStatus string

const (
	PortStatusOpen     PortStatus = "open"
	PortStatusClosed   PortStatus = "closed"
	PortStatusFiltered PortStatus = "filtered"
)

// PortScanResult represents the result of scanning a single port
type PortScanResult struct {
	Port    int        `json:"port"`
	Status  PortStatus `json:"status"`
	Service string     `json:"service,omitempty"`
	Banner  string     `json:"banner,omitempty"`
}

// PortScanResults contains all port scan results
type PortScanResults struct {
	Target    string           `json:"target"`
	Ports     []PortScanResult `json:"ports"`
	StartTime time.Time        `json:"start_time"`
	EndTime   time.Time        `json:"end_time"`
	Duration  time.Duration    `json:"duration"`
	Error     string           `json:"error,omitempty"`
}

// PortScanOptions configures port scanning behavior
type PortScanOptions struct {
	Timeout     time.Duration
	Concurrency int
	GrabBanner  bool
}

// DefaultPortScanOptions returns default options
func DefaultPortScanOptions() PortScanOptions {
	return PortScanOptions{
		Timeout:     2 * time.Second,
		Concurrency: 100,
		GrabBanner:  false,
	}
}

// PortScan performs a TCP port scan
func PortScan(ctx context.Context, target string, ports []int, opts PortScanOptions) (*PortScanResults, error) {
	startTime := time.Now()

	results := &PortScanResults{
		Target:    target,
		Ports:     make([]PortScanResult, 0),
		StartTime: startTime,
	}

	// Resolve target
	ips, err := net.LookupIP(target)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve target: %w", err)
	}
	if len(ips) == 0 {
		return nil, fmt.Errorf("no IP addresses found for target")
	}

	targetIP := ips[0].String()

	// Create channel for port scan jobs
	portChan := make(chan int, len(ports))
	resultChan := make(chan PortScanResult, len(ports))

	// Create worker pool
	var wg sync.WaitGroup
	for i := 0; i < opts.Concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for port := range portChan {
				select {
				case <-ctx.Done():
					return
				default:
					result := scanPort(ctx, targetIP, port, opts)
					resultChan <- result
				}
			}
		}()
	}

	// Send ports to scan
	go func() {
		for _, port := range ports {
			select {
			case <-ctx.Done():
				close(portChan)
				return
			case portChan <- port:
			}
		}
		close(portChan)
	}()

	// Wait for all workers to finish
	go func() {
		wg.Wait()
		close(resultChan)
	}()

	// Collect results
	for result := range resultChan {
		results.Ports = append(results.Ports, result)
	}

	// Sort results by port number
	sort.Slice(results.Ports, func(i, j int) bool {
		return results.Ports[i].Port < results.Ports[j].Port
	})

	endTime := time.Now()
	results.EndTime = endTime
	results.Duration = endTime.Sub(startTime)

	return results, nil
}

func scanPort(ctx context.Context, target string, port int, opts PortScanOptions) PortScanResult {
	result := PortScanResult{
		Port:   port,
		Status: PortStatusFiltered,
	}

	// Add common service names
	result.Service = getServiceName(port)

	address := fmt.Sprintf("%s:%d", target, port)

	// Create dialer with timeout
	dialer := &net.Dialer{
		Timeout: opts.Timeout,
	}

	// Attempt to connect
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		// Check if it's a connection refused (port closed)
		if strings.Contains(err.Error(), "connection refused") {
			result.Status = PortStatusClosed
		} else {
			result.Status = PortStatusFiltered
		}
		return result
	}
	defer conn.Close()

	result.Status = PortStatusOpen

	// Grab banner if requested
	if opts.GrabBanner {
		banner := grabBanner(conn, opts.Timeout)
		if banner != "" {
			result.Banner = banner
		}
	}

	return result
}

func grabBanner(conn net.Conn, timeout time.Duration) string {
	conn.SetReadDeadline(time.Now().Add(timeout))

	buffer := make([]byte, 1024)
	n, err := conn.Read(buffer)
	if err != nil {
		return ""
	}

	return strings.TrimSpace(string(buffer[:n]))
}

func getServiceName(port int) string {
	commonPorts := map[int]string{
		20:    "ftp-data",
		21:    "ftp",
		22:    "ssh",
		23:    "telnet",
		25:    "smtp",
		53:    "dns",
		80:    "http",
		110:   "pop3",
		143:   "imap",
		443:   "https",
		445:   "smb",
		3306:  "mysql",
		3389:  "rdp",
		5432:  "postgresql",
		5900:  "vnc",
		6379:  "redis",
		8080:  "http-proxy",
		8443:  "https-alt",
		9200:  "elasticsearch",
		27017: "mongodb",
	}

	if service, ok := commonPorts[port]; ok {
		return service
	}
	return ""
}

// ParsePortRange parses a port range string (e.g., "22,80,443" or "1-1024")
func ParsePortRange(portStr string) ([]int, error) {
	ports := make([]int, 0)
	seen := make(map[int]bool)

	parts := strings.Split(portStr, ",")
	for _, part := range parts {
		part = strings.TrimSpace(part)

		// Check if it's a range
		if strings.Contains(part, "-") {
			rangeParts := strings.Split(part, "-")
			if len(rangeParts) != 2 {
				return nil, fmt.Errorf("invalid port range: %s", part)
			}

			start, err := strconv.Atoi(strings.TrimSpace(rangeParts[0]))
			if err != nil {
				return nil, fmt.Errorf("invalid port number: %s", rangeParts[0])
			}

			end, err := strconv.Atoi(strings.TrimSpace(rangeParts[1]))
			if err != nil {
				return nil, fmt.Errorf("invalid port number: %s", rangeParts[1])
			}

			if start < 1 || start > 65535 || end < 1 || end > 65535 {
				return nil, fmt.Errorf("port number out of range (1-65535)")
			}

			if start > end {
				return nil, fmt.Errorf("invalid port range: start > end")
			}

			for i := start; i <= end; i++ {
				if !seen[i] {
					ports = append(ports, i)
					seen[i] = true
				}
			}
		} else {
			// Single port
			port, err := strconv.Atoi(part)
			if err != nil {
				return nil, fmt.Errorf("invalid port number: %s", part)
			}

			if port < 1 || port > 65535 {
				return nil, fmt.Errorf("port number out of range (1-65535)")
			}

			if !seen[port] {
				ports = append(ports, port)
				seen[port] = true
			}
		}
	}

	return ports, nil
}

// CommonPorts returns a list of commonly scanned ports
func CommonPorts() []int {
	return []int{
		21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143, 443, 445, 993, 995,
		1723, 3306, 3389, 5900, 8080, 8443,
	}
}

// TopPorts returns the top N most common ports
func TopPorts(n int) []int {
	allCommon := CommonPorts()
	if n > len(allCommon) {
		n = len(allCommon)
	}
	return allCommon[:n]
}
