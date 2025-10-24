# Network Diagnostic Tools Documentation

## Overview

The Network Monitor includes a comprehensive suite of network diagnostic tools accessible via both a web interface and REST API. These tools provide essential network troubleshooting and analysis capabilities.

## Available Tools

### 1. Traceroute

Traces the path packets take to reach a destination, showing each network hop.

**API Endpoint:** `POST /api/v1/tools/traceroute`

**Request Body:**
```json
{
  "target": "8.8.8.8",
  "max_hops": 30,
  "timeout": 3,
  "resolve_addr": true
}
```

**Response:**
```json
{
  "target": "8.8.8.8",
  "hops": [
    {
      "hop": 1,
      "ip": "192.168.1.1",
      "hostname": "gateway.local",
      "rtt": 2500000,
      "timeout": false
    }
  ]
}
```

**Features:**
- IPv4 and IPv6 support
- Hostname resolution
- Configurable max hops and timeout
- RTT (Round Trip Time) measurement

---

### 2. DNS Lookup

Performs DNS queries for various record types.

**API Endpoint:** `POST /api/v1/tools/dns-lookup`

**Request Body:**
```json
{
  "domain": "google.com",
  "type": "A",
  "nameserver": "8.8.8.8",
  "timeout": 5
}
```

**Supported Record Types:**
- `A` - IPv4 address records
- `AAAA` - IPv6 address records
- `MX` - Mail exchange records
- `NS` - Name server records
- `TXT` - Text records
- `CNAME` - Canonical name records
- `PTR` - Reverse DNS lookups

**Response:**
```json
{
  "domain": "google.com",
  "type": "A",
  "records": [
    {
      "type": "A",
      "value": "142.250.185.46",
      "priority": 0,
      "ttl": 0
    }
  ],
  "duration": 25000000
}
```

**Features:**
- Multiple record type support
- Custom nameserver option
- Query time measurement
- Reverse DNS lookups

---

### 3. Port Scanner

Scans TCP ports to determine their status (open, closed, filtered).

**API Endpoint:** `POST /api/v1/tools/port-scan`

**Request Body:**
```json
{
  "target": "192.168.1.1",
  "ports": "22,80,443",
  "timeout": 2,
  "concurrency": 100,
  "grab_banner": false
}
```

**Port Specification:**
- Comma-separated: `"22,80,443"`
- Port ranges: `"1-1024"`
- Mixed: `"22,80,443,8000-9000"`

**Response:**
```json
{
  "target": "192.168.1.1",
  "ports": [
    {
      "port": 80,
      "status": "open",
      "service": "http",
      "banner": "nginx/1.18.0"
    }
  ],
  "start_time": "2024-01-01T12:00:00Z",
  "end_time": "2024-01-01T12:00:05Z",
  "duration": 5000000000
}
```

**Features:**
- Concurrent scanning for speed
- Banner grabbing (optional)
- Common service identification
- Configurable timeout and concurrency

**Helper Endpoint:** `GET /api/v1/tools/common-ports?count=20`

Returns commonly used ports for quick scanning.

---

### 4. WHOIS Lookup

Retrieves domain and IP address registration information.

**API Endpoint:** `POST /api/v1/tools/whois`

**Request Body:**
```json
{
  "target": "google.com",
  "server": "whois.verisign-grs.com",
  "timeout": 10
}
```

**Response:**
```json
{
  "target": "google.com",
  "server": "whois.verisign-grs.com",
  "response": "Domain Name: GOOGLE.COM\nRegistrar: MarkMonitor Inc...",
  "duration": 150000000
}
```

**Features:**
- Domain and IP address lookups
- Automatic WHOIS server detection
- Custom WHOIS server support
- Referral following

**Supported Lookups:**
- Domain names (automatically selects TLD-specific server)
- IPv4 addresses
- IPv6 addresses

---

### 5. Bandwidth Test

Measures network bandwidth and latency.

**API Endpoint:** `POST /api/v1/tools/bandwidth-test`

**Request Body:**
```json
{
  "target": "192.168.1.1",
  "duration": 10,
  "port": 80
}
```

**Response:**
```json
{
  "target": "192.168.1.1",
  "duration": 10000000000,
  "bytes_sent": 0,
  "bytes_received": 524288,
  "upload_speed_mbps": 0,
  "download_speed_mbps": 4.19,
  "average_latency": 15000000,
  "min_latency": 12000000,
  "max_latency": 25000000,
  "packet_loss_percent": 0
}
```

**Features:**
- Download speed testing
- Latency measurement (min, max, average)
- Configurable test duration
- Multiple port support

---

### 6. Ping Test

Tests network connectivity and measures latency.

**API Endpoint:** `POST /api/v1/tools/ping`

**Request Body:**
```json
{
  "target": "8.8.8.8",
  "count": 4
}
```

**Response:**
```json
{
  "target": "8.8.8.8",
  "packets_sent": 4,
  "packets_received": 4,
  "packet_loss_percent": 0,
  "min_latency": 12000000,
  "max_latency": 25000000,
  "average_latency": 18000000
}
```

**Features:**
- TCP-based connectivity testing
- Packet loss calculation
- Latency statistics
- Configurable packet count

---

## Web Interface

Access the tools via the web interface at `/tools`. The interface provides:

- **Tabbed Interface:** Easy navigation between different tools
- **Form Validation:** Input validation for all fields
- **Real-time Results:** Results displayed immediately after completion
- **Visual Formatting:** Tables and charts for easy reading
- **Quick Actions:** Pre-configured settings for common tasks

### Web Interface Features

1. **Traceroute Tab:**
   - Configure max hops and timeout
   - Toggle hostname resolution
   - View results in a formatted table

2. **DNS Lookup Tab:**
   - Select record type from dropdown
   - Optional custom nameserver
   - Results displayed with query time

3. **Port Scanner Tab:**
   - Quick port selection buttons (Web, Common, Database)
   - Port range support
   - Optional banner grabbing
   - Color-coded port status (green=open, gray=closed, orange=filtered)

4. **WHOIS Tab:**
   - Automatic server detection
   - Optional custom WHOIS server
   - Formatted response display

5. **Bandwidth Test Tab:**
   - Configurable duration
   - Custom port selection
   - Visual statistics display

6. **Ping Tab:**
   - Configurable packet count
   - Statistics summary

---

## Code Organization

### Directory Structure

```
internal/tools/
├── traceroute.go    # Traceroute implementation
├── dns.go          # DNS lookup implementation
├── portscan.go     # Port scanner implementation
├── whois.go        # WHOIS lookup implementation
└── bandwidth.go    # Bandwidth testing implementation

internal/api/
└── tools.go        # API handlers for tools

web/templates/
└── tools.html      # Web interface
```

### Tool Implementation

Each tool is implemented as a standalone Go package with:
- Context support for cancellation
- Configurable options via options structs
- Structured result types
- Error handling

Example usage in code:

```go
import "github.com/Technologies-Unlimited/Network-Proxy/internal/tools"

// Traceroute
opts := tools.DefaultTracerouteOptions()
opts.MaxHops = 20
result, err := tools.Traceroute(ctx, "8.8.8.8", opts)

// DNS Lookup
opts := tools.DefaultDNSLookupOptions()
result, err := tools.DNSLookup(ctx, "google.com", tools.RecordTypeA, opts)

// Port Scan
ports := []int{80, 443, 8080}
opts := tools.DefaultPortScanOptions()
result, err := tools.PortScan(ctx, "192.168.1.1", ports, opts)

// WHOIS
opts := tools.DefaultWhoisOptions()
result, err := tools.Whois(ctx, "google.com", opts)

// Bandwidth Test
result, err := tools.SimpleBandwidthTest(ctx, "192.168.1.1", 10*time.Second)

// Ping
result, err := tools.Ping(ctx, "8.8.8.8", 4)
```

---

## Security Considerations

1. **Rate Limiting:** Consider implementing rate limiting for API endpoints
2. **Authentication:** Add authentication for production use
3. **Input Validation:** All inputs are validated before processing
4. **Timeout Controls:** All operations have configurable timeouts
5. **Resource Limits:** Concurrent operations are limited to prevent resource exhaustion

---

## Performance Notes

- **Traceroute:** May take several seconds depending on hop count and network conditions
- **Port Scanning:** Speed depends on concurrency setting and network latency
- **DNS Lookups:** Typically very fast (milliseconds)
- **WHOIS:** Depends on WHOIS server response time
- **Bandwidth Tests:** Duration is user-configurable

---

## Error Handling

All tools return structured error information:
- Network errors (connection refused, timeout, etc.)
- DNS resolution failures
- Invalid input parameters
- Permission errors (some operations may require elevated privileges)

Errors are included in the response with appropriate HTTP status codes:
- `200 OK` - Successful operation
- `400 Bad Request` - Invalid input
- `500 Internal Server Error` - Server error

---

## Requirements

### Go Dependencies

```
golang.org/x/net/icmp
golang.org/x/net/ipv4
golang.org/x/net/ipv6
```

These are already included in the project's go.mod file.

### System Requirements

- **Traceroute:** May require raw socket permissions (elevated privileges)
- **Port Scanning:** Standard network access
- **DNS:** Standard network access
- **WHOIS:** Standard network access on port 43
- **Bandwidth Test:** Standard network access

---

## Future Enhancements

Potential additions:
- MTR (My Traceroute) - Combined traceroute and ping
- SSL/TLS certificate inspection
- HTTP/HTTPS response analysis
- Network speed test against public servers
- Subnet calculator
- IP geolocation
- MAC address lookup
- Open proxy detection

---

## Support

For issues or questions:
1. Check the application logs
2. Verify network connectivity
3. Check firewall rules
4. Ensure proper permissions for raw sockets (traceroute)

---

## License

Part of the Network-Proxy project.
