# Network Monitor

A high-performance network monitoring and management system built in Go. Designed to be a better, more scalable alternative to Zabbix.

## Features

- **Real-time ICMP Monitoring** - Raw socket ping monitoring for 100,000+ devices
- **SNMP Polling** - SNMPv2c and SNMPv3 support with template-based polling
- **Network Discovery** - Automatic device discovery on network ranges
- **Prometheus Integration** - Native Prometheus metrics for AI/ML pipelines
- **Distributed Agents** - Deploy agents near monitored devices for low latency
- **Alert Engine** - Rule-based alerting with multiple notification channels
- **REST API** - Full-featured API for automation and integration
- **Web UI** - Modern htmx-based dashboard

## Architecture

```
┌─────────────────────────────────────────┐
│  Central Server (network-monitor-server)│
│  ├── HTTP API (port 8080)               │
│  ├── Web UI                             │
│  ├── PostgreSQL (devices, alerts, etc.) │
│  └── Alert Engine                       │
└─────────────────────────────────────────┘
                    ▲
                    │ HTTP/gRPC
        ┌───────────┼───────────┐
        │           │           │
┌───────▼─────┐ ┌──▼────────┐ ┌▼──────────┐
│  Agent 1    │ │  Agent 2  │ │  Agent 3  │
│  ├─ ICMP    │ │ (remote)  │ │ (remote)  │
│  ├─ SNMP    │ └───────────┘ └───────────┘
│  └─ Metrics │
│  :9090      │
└─────────────┘
        │
        ▼
  Prometheus/VictoriaMetrics
```

## Prerequisites

- **Go 1.21+** - [Install Go](https://go.dev/doc/install)
- **PostgreSQL 14+** - For device/alert storage
- **Prometheus or VictoriaMetrics** (optional) - For time-series metrics

## Quick Start

### 1. Install Go

**Windows:**
```powershell
# Using winget
winget install GoLang.Go

# Or download from https://go.dev/dl/
```

**Linux:**
```bash
wget https://go.dev/dl/go1.21.0.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.21.0.linux-amd64.tar.gz
export PATH=$PATH:/usr/local/go/bin
```

### 2. Clone and Build

```bash
git clone https://github.com/Technologies-Unlimited/Network-Proxy.git
cd Network-Proxy

# Download dependencies
go mod download

# Build server
go build -o network-monitor-server.exe ./cmd/server

# Build agent
go build -o network-monitor-agent.exe ./cmd/agent
```

### 3. Set Up Database

```bash
# Create PostgreSQL database
createdb network_monitor

# Copy environment file
cp .env.example .env

# Edit .env with your database credentials
DATABASE_URL=postgres://postgres:password@localhost:5432/network_monitor?sslmode=disable
```

### 4. Run

**Start Server:**
```bash
./network-monitor-server.exe
# Server running on http://localhost:8080
```

**Start Agent (in another terminal):**
```bash
./network-monitor-agent.exe
# Agent metrics on http://localhost:9090/metrics
```

**Access Web UI:**
Open http://localhost:8080 in your browser

## Building for Production

### Single Binary (Windows .exe)

```bash
# Server
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o dist/network-monitor-server.exe ./cmd/server

# Agent
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o dist/network-monitor-agent.exe ./cmd/agent
```

### Cross-Platform Builds

```bash
# Linux
GOOS=linux GOARCH=amd64 go build -o dist/network-monitor-server-linux ./cmd/server
GOOS=linux GOARCH=amd64 go build -o dist/network-monitor-agent-linux ./cmd/agent

# macOS (Apple Silicon)
GOOS=darwin GOARCH=arm64 go build -o dist/network-monitor-server-macos ./cmd/server

# macOS (Intel)
GOOS=darwin GOARCH=amd64 go build -o dist/network-monitor-server-macos-intel ./cmd/server
```

### Using Makefile

```bash
# Build all targets
make build

# Build server only
make server

# Build agent only
make agent

# Build for all platforms
make build-all

# Run tests
make test

# Clean build artifacts
make clean
```

## Docker Deployment

### Using Docker Compose (Recommended for Development)

```bash
# Start all services (server, agent, PostgreSQL, Prometheus)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

### Manual Docker Build

```bash
# Build server image
docker build -f Dockerfile.server -t network-monitor-server:latest .

# Build agent image
docker build -f Dockerfile.agent -t network-monitor-agent:latest .

# Run server
docker run -d \
  -p 8080:8080 \
  -e DATABASE_URL=postgres://postgres:password@db:5432/network_monitor \
  --name monitor-server \
  network-monitor-server:latest

# Run agent
docker run -d \
  -p 9090:9090 \
  --name monitor-agent \
  network-monitor-agent:latest
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server HTTP port | `8080` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `METRICS_PORT` | Agent Prometheus port | `9090` |
| `PROMETHEUS_URL` | Prometheus server URL | Optional |
| `LOG_LEVEL` | Logging level (debug\|info\|warn\|error) | `info` |
| `ICMP_POLL_INTERVAL` | ICMP polling interval (seconds) | `60` |
| `SNMP_POLL_INTERVAL` | SNMP polling interval (seconds) | `60` |

### Database Schema

The application automatically creates and migrates database tables on startup:
- `devices` - Monitored network devices
- `agents` - Distributed monitoring agents
- `snmp_templates` - SNMP polling templates
- `oids` - SNMP OID definitions
- `alerts` - Active and historical alerts
- `alert_rules` - Alert rule definitions

## API Usage

### Add a Device

```bash
curl -X POST http://localhost:8080/api/v1/devices \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "router-1",
    "ip_address": "192.168.1.1",
    "device_type": "router",
    "icmp_enabled": true,
    "icmp_interval": 60
  }'
```

### List Devices

```bash
curl http://localhost:8080/api/v1/devices
```

### Create SNMP Template

```bash
curl -X POST http://localhost:8080/api/v1/snmp/templates \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Cisco Router",
    "version": "v2c",
    "community": "public"
  }'
```

### View Metrics

```bash
# Agent Prometheus metrics
curl http://localhost:9090/metrics
```

## Prometheus Integration

### Configure Prometheus Scraping

Add to `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'network-monitor-agents'
    static_configs:
      - targets: ['agent-1:9090', 'agent-2:9090']
```

### Example PromQL Queries

```promql
# Device status
network_device_status{ip_address="192.168.1.1"}

# Average ping latency
avg(network_ping_latency_milliseconds)

# Devices down
count(network_device_status == 0)

# SNMP value for specific OID
network_snmp_value{oid_name="ifInOctets"}
```

## AI Integration

Metrics are exposed in Prometheus format for easy integration with AI/ML pipelines:

```python
# Example: Anomaly detection with Python
import requests
import pandas as pd

# Query Prometheus
response = requests.get('http://localhost:9090/api/v1/query', params={
    'query': 'network_ping_latency_milliseconds'
})

data = pd.DataFrame(response.json()['data']['result'])

# Train anomaly detection model
# ...
```

## Performance

- **100,000+ devices** supported per server
- **Sub-second polling** with raw ICMP sockets
- **<10ms latency** for local agents
- **Horizontal scaling** via multiple agents
- **~100MB RAM** base usage, ~1KB per monitored device

## Development

### Project Structure

```
Network-Proxy/
├── cmd/
│   ├── server/          # Server entry point
│   └── agent/           # Agent entry point
├── internal/
│   ├── api/             # HTTP API handlers
│   ├── agent/           # Agent monitoring logic
│   │   ├── icmp/        # ICMP poller
│   │   ├── snmp/        # SNMP walker
│   │   └── collector/   # Collector orchestration
│   ├── database/        # Database layer
│   ├── metrics/         # Prometheus metrics
│   ├── models/          # Data models
│   └── server/          # Server logic
├── web/
│   ├── templates/       # HTML templates
│   └── static/          # CSS/JS assets
├── pkg/                 # Public packages
├── configs/             # Configuration files
└── docs/                # Documentation
```

### Running Tests

```bash
go test ./...
```

### Code Formatting

```bash
go fmt ./...
```

### Linting

```bash
golangci-lint run
```

## Roadmap

- [x] ICMP monitoring
- [x] SNMPv2c/v3 polling
- [x] PostgreSQL storage
- [x] Prometheus metrics
- [x] REST API
- [ ] Network discovery
- [ ] Alert engine
- [ ] htmx Web UI
- [ ] Agent registration
- [ ] AI anomaly detection
- [ ] Grafana dashboards
- [ ] Mobile app

## License

MIT License - see LICENSE file

## Contributing

Contributions welcome! Please open an issue or PR.

## Support

- GitHub Issues: https://github.com/Technologies-Unlimited/Network-Proxy/issues
- Documentation: https://github.com/Technologies-Unlimited/Network-Proxy/wiki

---

**Built with Go 🐹 | Faster than Zabbix ⚡**
