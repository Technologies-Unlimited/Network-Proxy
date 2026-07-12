# Network Discovery Module

This module provides network discovery functionality for the Network-Proxy application.

## Features

- **CIDR Range Scanning**: Scan entire network ranges (e.g., `192.168.1.0/24`)
- **Concurrent Scanning**: Uses semaphore-based concurrency (100 concurrent goroutines)
- **ICMP Ping**: Uses the pro-bing library for host detection
- **Hostname Resolution**: Reverse DNS lookup for discovered hosts
- **Device Type Detection**: Basic port-based device classification
- **Progress Tracking**: Real-time scan progress and status

## Usage

### Scanner API

```go
import "github.com/Technologies-Unlimited/Network-Proxy/internal/agent/discovery"

// Create a new scanner
scanner := discovery.NewScanner()

// Scan a network range
ctx := context.Background()
devices, err := scanner.ScanCIDR(ctx, "192.168.1.0/24")
if err != nil {
    log.Fatal(err)
}

// Get scan status
status := scanner.GetStatus()
fmt.Printf("Progress: %d/%d\n", status.Progress, status.Total)
```

### REST API Endpoints

#### Start Network Scan
```bash
POST /api/v1/discovery/scan
Content-Type: application/json

{
    "cidr": "192.168.1.0/24",
    "timeout": 300
}
```

Response:
```json
{
    "success": true,
    "message": "Network scan started for 192.168.1.0/24",
    "status": {
        "scanning": true
    }
}
```

#### Get Scan Status
```bash
GET /api/v1/discovery/status
```

Response:
```json
{
    "success": true,
    "message": "Scan status retrieved",
    "discovered": 15,
    "status": {
        "scanning": true,
        "progress": 128,
        "total": 256,
        "start_time": "2024-10-20T22:30:00Z",
        "duration": "45s",
        "discovered": 15
    }
}
```

#### Get Discovered Devices
```bash
GET /api/v1/discovery/devices
```

Response:
```json
{
    "success": true,
    "message": "Discovered devices retrieved",
    "discovered": 15,
    "devices": [
        {
            "ip_address": "192.168.1.1",
            "hostname": "router.local",
            "device_type": "router",
            "status": "up"
        },
        {
            "ip_address": "192.168.1.10",
            "hostname": "server.local",
            "device_type": "server",
            "status": "up"
        }
    ]
}
```

#### Clear Scan Cache
```bash
DELETE /api/v1/discovery/cache
```

Response:
```json
{
    "success": true,
    "message": "Scan cache cleared"
}
```

## Device Type Detection

The scanner performs basic device type detection based on open ports:

- **Router**: Ports 22, 23, 80, 443 (SSH, Telnet, HTTP, HTTPS)
- **Printer**: Ports 515, 631, 9100 (LPD, IPP, JetDirect)
- **Server**: Ports 22, 80, 443, 3389 (SSH, HTTP, HTTPS, RDP)
- **NAS**: Ports 139, 445, 2049, 548 (SMB, NFS, AFP)
- **Device**: Generic web-enabled device (HTTP/HTTPS only)
- **Unknown**: No matching port patterns

## Implementation Details

### Scanner Structure

```go
type Scanner struct {
    devices    map[string]*models.Device  // Discovered devices cache
    mu         sync.RWMutex               // Protects devices map
    scanning   bool                       // Current scan state
    scanMu     sync.RWMutex              // Protects scan state
    progress   int                        // Current scan progress
    total      int                        // Total IPs to scan
    startTime  time.Time                 // Scan start time
    lastUpdate time.Time                 // Last progress update
}
```

### Concurrency Control

- Uses semaphore pattern to limit concurrent goroutines to 100
- Each IP is scanned in a separate goroutine
- Thread-safe device cache with RWMutex
- Context-aware for cancellation support

### ICMP Ping Configuration

- 2 ping packets per host
- 2-second timeout per host
- Unprivileged mode (UDP-based ICMP)
- Skips network (.0) and broadcast (.255) addresses

### Database Integration

Discovered devices are automatically saved to the database:
- New devices are created
- Existing devices are updated (hostname, status, last_seen, device_type)
- Device matching is based on IP address

## Dependencies

- `github.com/prometheus-community/pro-bing` - ICMP ping functionality (maintained fork of the deprecated go-ping/ping)
- `net` (stdlib) - DNS resolution and TCP port scanning
- `context` (stdlib) - Cancellation and timeout support

## Performance

- Scanning a /24 network (256 IPs) typically takes 1-2 minutes
- Concurrent limit of 100 prevents network/system overload
- Port scanning uses 500ms timeout per port
- Memory-efficient streaming of results

## Error Handling

- Invalid CIDR notation returns error immediately
- Concurrent scan attempts are rejected
- Context cancellation stops scan gracefully
- Individual host failures don't stop overall scan
- Database errors are logged but don't fail the scan
