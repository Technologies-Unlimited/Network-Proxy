package discovery

import (
	"context"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/go-ping/ping"
)

// Scanner performs network discovery
type Scanner struct {
	devices map[string]*models.Device
	mu      sync.RWMutex

	// Scan state
	scanning   bool
	scanMu     sync.RWMutex
	progress   int
	total      int
	startTime  time.Time
	lastUpdate time.Time
}

// ScanStatus represents the current scan status
type ScanStatus struct {
	Scanning   bool      `json:"scanning"`
	Progress   int       `json:"progress"`
	Total      int       `json:"total"`
	StartTime  time.Time `json:"start_time,omitempty"`
	Duration   string    `json:"duration,omitempty"`
	Discovered int       `json:"discovered"`
}

// NewScanner creates a new network scanner
func NewScanner() *Scanner {
	return &Scanner{
		devices: make(map[string]*models.Device),
	}
}

// MaxScanHosts is the largest CIDR we'll enumerate. Allocating a list of
// every IP in /16 already burns ~64k strings; /8 used to OOM. 65536 hosts is
// plenty for any sane LAN scan.
const MaxScanHosts = 65536

// ScanCIDR scans a CIDR range (e.g., "192.168.1.0/24")
func (s *Scanner) ScanCIDR(ctx context.Context, cidr string) ([]*models.Device, error) {
	s.scanMu.Lock()
	if s.scanning {
		s.scanMu.Unlock()
		return nil, fmt.Errorf("scan already in progress")
	}
	s.scanning = true
	s.progress = 0
	s.startTime = time.Now()
	s.lastUpdate = time.Now()
	s.scanMu.Unlock()

	defer func() {
		s.scanMu.Lock()
		s.scanning = false
		s.scanMu.Unlock()
	}()

	_, ipNet, err := net.ParseCIDR(cidr)
	if err != nil {
		return nil, fmt.Errorf("invalid CIDR: %w", err)
	}

	// Reject ranges large enough to OOM the process. The previous code
	// allocated every IP in a CIDR up front; a /8 would attempt 16M strings.
	hostCount := cidrHostCount(ipNet)
	if hostCount > MaxScanHosts {
		return nil, fmt.Errorf(
			"CIDR %s contains %d hosts, exceeding scan cap of %d",
			cidr, hostCount, MaxScanHosts)
	}

	// Generate list of IPs to scan, skipping the network and broadcast
	// addresses *for this specific subnet* — the previous string-suffix check
	// only worked for /24s and corrupted /23, /22, /16, etc. results.
	network := ipNet.IP.Mask(ipNet.Mask)
	broadcast := networkBroadcast(ipNet)

	var ips []string
	for ip := append(net.IP(nil), network...); ipNet.Contains(ip); incIP(ip) {
		if isIPv4(ip) {
			if ip.Equal(network) || (broadcast != nil && ip.Equal(broadcast)) {
				continue
			}
		}
		ips = append(ips, ip.String())
	}

	// Set total for progress tracking
	s.scanMu.Lock()
	s.total = len(ips)
	s.scanMu.Unlock()

	// Create semaphore for concurrent scanning (limit to 100 concurrent goroutines)
	sem := make(chan struct{}, 100)
	var wg sync.WaitGroup
	devicesChan := make(chan *models.Device, len(ips))

	// Scan all IPs concurrently
	for _, ipAddr := range ips {
		wg.Add(1)
		go func(ip string) {
			defer wg.Done()

			// Acquire semaphore
			sem <- struct{}{}
			defer func() { <-sem }()

			// Check context cancellation
			select {
			case <-ctx.Done():
				return
			default:
			}

			// Scan the host
			if device := s.scanHost(ctx, ip); device != nil {
				devicesChan <- device
			}

			// Update progress
			s.scanMu.Lock()
			s.progress++
			s.lastUpdate = time.Now()
			s.scanMu.Unlock()
		}(ipAddr)
	}

	// Wait for all scans to complete
	go func() {
		wg.Wait()
		close(devicesChan)
	}()

	// Collect discovered devices
	var discovered []*models.Device
	for device := range devicesChan {
		s.mu.Lock()
		s.devices[device.IPAddress] = device
		s.mu.Unlock()
		discovered = append(discovered, device)
	}

	return discovered, nil
}

// scanHost checks if host is alive and gets hostname. Network/broadcast
// filtering happens in ScanCIDR using the actual subnet mask, not a string
// suffix; that lets non-/24 ranges (e.g. /23, /22, /30) work correctly.
func (s *Scanner) scanHost(ctx context.Context, ip string) *models.Device {
	// Perform ICMP ping
	pinger, err := ping.NewPinger(ip)
	if err != nil {
		return nil
	}

	// Configure pinger
	pinger.Count = 2
	pinger.Timeout = 2 * time.Second
	pinger.SetPrivileged(false) // Use unprivileged mode (UDP)

	// Run ping
	err = pinger.Run()
	if err != nil {
		return nil
	}

	stats := pinger.Statistics()
	if stats.PacketsRecv == 0 {
		return nil // Host is not responding
	}

	// Host is alive, create device
	now := time.Now()
	device := &models.Device{
		IPAddress:   ip,
		Hostname:    s.getHostname(ip),
		Status:      "up",
		LastSeen:    &now,
		DeviceType:  s.detectDeviceType(ip),
		ICMPEnabled: true,
		ICMPInterval: 60,
	}

	return device
}

// getHostname performs reverse DNS lookup
func (s *Scanner) getHostname(ip string) string {
	names, err := net.LookupAddr(ip)
	if err != nil || len(names) == 0 {
		return ""
	}

	// Return first hostname, trim trailing dot
	hostname := names[0]
	return strings.TrimSuffix(hostname, ".")
}

// detectDeviceType basic device type detection via port scanning
func (s *Scanner) detectDeviceType(ip string) string {
	// Common port checks with shorter timeout
	checks := map[string][]int{
		"router":  {22, 23, 80, 443},    // SSH, Telnet, HTTP, HTTPS
		"printer": {515, 631, 9100},      // LPD, IPP, JetDirect
		"server":  {22, 80, 443, 3389},   // SSH, HTTP, HTTPS, RDP
		"nas":     {139, 445, 2049, 548}, // SMB, NFS, AFP
	}

	timeout := 500 * time.Millisecond
	openPorts := make(map[int]bool)

	// Quick port scan
	var wg sync.WaitGroup
	var mu sync.Mutex

	for _, ports := range checks {
		for _, port := range ports {
			wg.Add(1)
			go func(p int) {
				defer wg.Done()

				conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", ip, p), timeout)
				if err == nil {
					conn.Close()
					mu.Lock()
					openPorts[p] = true
					mu.Unlock()
				}
			}(port)
		}
	}

	wg.Wait()

	// Determine device type based on open ports
	for deviceType, ports := range checks {
		matchCount := 0
		for _, port := range ports {
			if openPorts[port] {
				matchCount++
			}
		}

		// If at least 2 ports match, classify as that device type
		if matchCount >= 2 {
			return deviceType
		}
	}

	// Check for specific single-port indicators
	if openPorts[22] {
		return "server"
	}
	if openPorts[80] || openPorts[443] {
		return "device" // Generic web-enabled device
	}

	return "unknown"
}

// GetStatus returns the current scan status
func (s *Scanner) GetStatus() ScanStatus {
	s.scanMu.RLock()
	defer s.scanMu.RUnlock()

	status := ScanStatus{
		Scanning: s.scanning,
		Progress: s.progress,
		Total:    s.total,
	}

	if s.scanning {
		status.StartTime = s.startTime
		status.Duration = time.Since(s.startTime).Round(time.Second).String()
	}

	// Count discovered devices
	s.mu.RLock()
	status.Discovered = len(s.devices)
	s.mu.RUnlock()

	return status
}

// GetDevices returns all discovered devices
func (s *Scanner) GetDevices() []*models.Device {
	s.mu.RLock()
	defer s.mu.RUnlock()

	devices := make([]*models.Device, 0, len(s.devices))
	for _, device := range s.devices {
		devices = append(devices, device)
	}

	return devices
}

// ClearDevices clears the discovered devices cache
func (s *Scanner) ClearDevices() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.devices = make(map[string]*models.Device)
}

// incIP increments an IP address
func incIP(ip net.IP) {
	for j := len(ip) - 1; j >= 0; j-- {
		ip[j]++
		if ip[j] > 0 {
			break
		}
	}
}

// cidrHostCount returns the number of addresses inside ipNet. Uses int math
// and clamps at math.MaxInt to avoid overflowing on /0.
func cidrHostCount(ipNet *net.IPNet) int {
	ones, bits := ipNet.Mask.Size()
	hostBits := bits - ones
	if hostBits >= 31 {
		// Larger than int can represent on 32-bit; treat as "too big".
		return MaxScanHosts + 1
	}
	return 1 << hostBits
}

// networkBroadcast returns the IPv4 broadcast address for ipNet, or nil for
// IPv6 networks (which don't have a broadcast address).
func networkBroadcast(ipNet *net.IPNet) net.IP {
	ip4 := ipNet.IP.To4()
	if ip4 == nil {
		return nil
	}
	mask := ipNet.Mask
	if len(mask) != net.IPv4len {
		// Mask was returned in IPv4-mapped IPv6 form; trim it.
		if len(mask) == net.IPv6len {
			mask = mask[12:]
		} else {
			return nil
		}
	}
	bcast := make(net.IP, net.IPv4len)
	for i := 0; i < net.IPv4len; i++ {
		bcast[i] = ip4[i] | ^mask[i]
	}
	return bcast
}

func isIPv4(ip net.IP) bool {
	return ip.To4() != nil
}
