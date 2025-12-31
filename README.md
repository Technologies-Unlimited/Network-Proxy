# Network Monitor

A high-performance network monitoring solution built in Go. Designed to be faster and more scalable than Zabbix.

## Features

- **Distributed Node Architecture** - Central server with multiple monitoring nodes connected via gRPC
- **High-Speed Bandwidth Testing** - 10+ Gbps throughput with 6 parallel gRPC streams
- **Real-time ICMP Monitoring** - Raw socket ping monitoring for 100,000+ devices
- **SNMP Polling** - SNMPv2c and SNMPv3 support with template-based polling
- **Network Discovery** - Automatic device discovery on network ranges
- **Network Tools** - Traceroute, DNS lookup, port scanning, WHOIS, and more
- **Alert Engine** - Rule-based alerting with multiple notification channels
- **Modern Web UI** - htmx-based dashboard with dark/light theme support
- **REST API** - Full-featured API for automation and integration
- **SQLite Database** - Zero-configuration embedded database

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│           Central Server (network-monitor server)         │
│  ├── HTTP API & Web UI (port 8080)                       │
│  ├── SQLite Database (network-monitor.db)                │
│  ├── Node Registration & Heartbeat Management            │
│  └── Bandwidth Test Coordination                         │
└──────────────────────────────────────────────────────────┘
                         ▲
                         │ HTTP/gRPC
         ┌───────────────┼───────────────┐
         │               │               │
┌────────▼─────┐  ┌──────▼──────┐  ┌─────▼───────┐
│  Node-Alpha  │  │  Node-Beta  │  │  Node-Gamma │
│  :50051      │  │  :50052     │  │  :50053     │
│  (gRPC)      │  │  (gRPC)     │  │  (gRPC)     │
└──────────────┘  └─────────────┘  └─────────────┘
```

## Prerequisites

- **Go 1.21+** - [Install Go](https://go.dev/doc/install)

## Quick Start

### 1. Build

```bash
# Clone the repository
git clone https://github.com/Technologies-Unlimited/Network-Monitor.git
cd Network-Monitor

# Download dependencies
go mod download

# Build the unified binary
go build -o network-monitor.exe .
```

### 2. Start the Server

```bash
./network-monitor.exe server
# Server running on http://localhost:8080
```

### 3. Start Monitoring Nodes

```bash
# Start first node
./network-monitor.exe node --name Node-Alpha --grpc-port 50051

# Start second node (in another terminal)
./network-monitor.exe node --name Node-Beta --grpc-port 50052
```

### 4. Access Web UI

Open http://localhost:8080 in your browser.

## CLI Usage

Network Monitor uses a unified binary with subcommands:

```bash
# Start the central server
./network-monitor.exe server

# Start a monitoring node
./network-monitor.exe node --name <name> [options]

# Node options:
#   -n, --name        Node name (required, must be unique)
#   -p, --grpc-port   gRPC port for peer connections (default: 50051)
#   -s, --server      Central server address (default: http://localhost:8080)
#   -c, --company     Company ID (default: default)
```

## Web UI Navigation

The web interface includes the following sections:

| Page | Description |
|------|-------------|
| **Dashboard** | Overview with device counts, status, and active alerts |
| **Devices** | Manage monitored network devices (routers, switches, servers) |
| **Alerts** | View and manage active and historical alerts |
| **Nodes** | Distributed monitoring nodes, peer connections, and bandwidth tests |
| **Visualize** | Network topology and metrics visualization |
| **Tools** | Network diagnostic tools (see below) |
| **Reports** | Generate device, uptime, alert, and performance reports |
| **Settings** | Theme settings and configuration |

## Network Tools

The Tools page provides 13 network diagnostic utilities:

| Tool | Description |
|------|-------------|
| **Traceroute** | Trace the network path to a destination |
| **DNS Lookup** | Query DNS records (A, AAAA, MX, TXT, etc.) |
| **Port Scan** | Scan for open ports on a target host |
| **WHOIS** | Look up domain registration information |
| **Bandwidth Test** | Test network throughput to external servers |
| **Ping** | ICMP ping with statistics |
| **SNMP Query** | Query SNMP OIDs from devices |
| **MAC Lookup** | Look up vendor information from MAC addresses |
| **Connection Test** | Test TCP/UDP connectivity to a host:port |
| **HTTP Test** | Test HTTP/HTTPS endpoints with response details |
| **SSL Check** | Validate SSL certificates and expiration |
| **ARP Scan** | Discover devices on the local network |
| **MTU Discovery** | Find the maximum transmission unit for a path |

## Distributed Bandwidth Testing

### High-Performance Testing

Bandwidth tests between nodes use 6 parallel gRPC bidirectional streams:
- Achieves **10+ Gbps** on capable hardware
- Each stream sends/receives 4MB chunks
- Real-time latency sampling for time-series charts

### Network Path Modes

Tests support three network path modes:

| Mode | Description |
|------|-------------|
| **Direct** | Connect directly to target node's IP (default) |
| **Local** | Force traffic through localhost/loopback (127.0.0.1) |
| **Gateway** | Route through a specified gateway address |

### Running a Bandwidth Test

1. Navigate to **Nodes** page
2. Ensure at least 2 nodes are online
3. Create a peer connection between nodes
4. Click **Run Test** and select:
   - Source and target nodes
   - Test type (bidirectional, upload, download)
   - Network path mode
   - Duration (5-300 seconds)

## Node Management

### Node Registration

- Nodes register with the server on startup using their unique name
- If a node with the same name exists, the existing record is updated
- Node status is tracked via heartbeats (every 30 seconds)

### Node Status Lifecycle

| Status | Condition |
|--------|-----------|
| **Online** | Actively sending heartbeats |
| **Offline** | No heartbeat for 5+ minutes |
| **Deleted** | Automatically removed after 15+ minutes without heartbeat |

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server HTTP port | `8080` |
| `THOTHOS_URL` | ThothOS integration URL | Optional |
| `THOTHOS_API_KEY` | ThothOS API key | Optional |

### Standalone Mode

When ThothOS is not configured, the server runs in standalone mode with authentication bypassed.

## API Examples

### List Nodes

```bash
curl http://localhost:8080/api/v1/nodes
```

### Start Bandwidth Test

```bash
# Direct mode
curl -X POST http://localhost:8080/api/v1/bandwidth-tests/start \
  -H "Content-Type: application/json" \
  -d '{
    "source_node_id": "uuid-1",
    "target_node_id": "uuid-2",
    "test_type": "bidirectional",
    "duration": 10,
    "test_mode": "direct"
  }'

# Local mode (loopback)
curl -X POST http://localhost:8080/api/v1/bandwidth-tests/start \
  -H "Content-Type: application/json" \
  -d '{
    "source_node_id": "uuid-1",
    "target_node_id": "uuid-2",
    "test_mode": "local"
  }'

# Gateway mode
curl -X POST http://localhost:8080/api/v1/bandwidth-tests/start \
  -H "Content-Type: application/json" \
  -d '{
    "source_node_id": "uuid-1",
    "target_node_id": "uuid-2",
    "test_mode": "gateway",
    "gateway_address": "192.168.1.1:50051"
  }'
```

### Add a Device

```bash
curl -X POST http://localhost:8080/api/v1/devices \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "router-1",
    "ip_address": "192.168.1.1",
    "device_type": "router",
    "icmp_enabled": true
  }'
```

## Project Structure

```
Network-Monitor/
├── main.go                  # Unified CLI entry point (server + node)
├── internal/
│   ├── api/                 # HTTP API handlers
│   ├── database/            # SQLite database initialization
│   ├── grpc/                # gRPC server for node communication
│   │   └── pb/              # Generated protobuf files
│   ├── models/              # GORM data models
│   ├── middleware/          # Authentication middleware
│   └── server/              # Server state management
├── proto/
│   └── node/                # Protobuf definitions
├── web/
│   ├── templates/           # HTML templates (htmx)
│   └── static/              # CSS, JS, images
└── network-monitor.db       # SQLite database (created at runtime)
```

## Database Schema

Uses SQLite with GORM ORM. Key tables:

| Table | Description |
|-------|-------------|
| `nodes` | Registered monitoring nodes |
| `node_peers` | Peer connections between nodes |
| `bandwidth_test_results` | Historical bandwidth test results |
| `scheduled_tests` | Scheduled/recurring bandwidth tests |
| `devices` | Monitored network devices |
| `alerts` | Active and historical alerts |
| `alert_rules` | Alert rule definitions |
| `snmp_templates` | SNMP polling templates |
| `oids` | SNMP OID definitions |

## Cross-Platform Builds

```bash
# Windows
go build -o network-monitor.exe .

# Linux
GOOS=linux GOARCH=amd64 go build -o network-monitor-linux .

# macOS (Apple Silicon)
GOOS=darwin GOARCH=arm64 go build -o network-monitor-macos .

# macOS (Intel)
GOOS=darwin GOARCH=amd64 go build -o network-monitor-macos-intel .
```

## Performance

- **10+ Gbps** bandwidth testing between nodes
- **100,000+ devices** supported per server
- **Sub-second polling** with raw ICMP sockets
- **~100MB RAM** base usage

## License

MIT License - see LICENSE file

## Contributing

Contributions welcome! Please open an issue or PR.

---

**Built with Go | Faster than Zabbix**
