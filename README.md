# Network-Proxy

Network administration and monitoring tool with real-time WebSocket updates and SQLite storage.

## Features

- Real-time network monitoring using Bun's high-performance WebSockets
- Persistent data storage with Bun's native SQLite integration
- ICMP and SNMP polling data with live updates
- Pub/Sub architecture for efficient data distribution
- RESTful API for data access from any client
- Fallback to RESTful API when WebSockets are not available

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) version 1.2.8 or higher
- Node.js and npm

### Installation

1. Install dependencies:

```bash
bun install
```

2. Configure environment variables:

Create a `.env.local` file with the following content:

```
# WebSocket server configuration
WS_PORT=3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001

# SQLite database configuration
SQLITE_DB_PATH=network-proxy.db
```

### Development

Run the development server:

```bash
bun run dev
```

This starts both the Next.js frontend and the WebSocket server with SQLite integration.

## Architecture

### Database

Network-Proxy uses Bun's native SQLite integration for high-performance data storage. The database schema includes:

- Companies
- ICMP polling templates and statuses
- SNMP polling templates and statuses
- Junction tables for associations

The SQLite database is automatically initialized with sample data when you first run the server.

### WebSocket Server

The WebSocket server provides real-time updates for network monitoring data. It's implemented using Bun's native WebSocket API, which offers significantly better performance than other Node.js WebSocket libraries.

Key features:

- Pub/Sub system for topic-based messaging
- Message compression for efficient data transfer
- Connection management with automatic reconnection
- Authenticated connections with company-specific data isolation

### REST API

Network-Proxy also provides a RESTful API for accessing and manipulating data. The API endpoints include:

- `/api/network-administration/icmp/polling/status` - ICMP polling status operations
- `/api/network-administration/snmp/polling/status` - SNMP polling status operations
- `/api/debug/database` - Debug endpoint for viewing database contents

### Client Hooks

React hooks are provided to easily consume the WebSocket API:

- `useICMPPollingStatus`: For ICMP monitoring data
- `useSNMPPollingStatus`: For SNMP monitoring data

Example usage:

```tsx
import { useICMPPollingStatus } from '@/websockets/client'

function ICMPStatusMonitor({ companyId }) {
  const { icmpPollingStatuses, loading, error, refreshICMPPollingStatus } =
    useICMPPollingStatus(companyId)

  // Now you can use the data with automatic real-time updates
  return (
    <div>
      {loading ? (
        <p>Loading...</p>
      ) : error ? (
        <p>Error: {error}</p>
      ) : (
        <ul>
          {icmpPollingStatuses.map(status => (
            <li key={status._id.toString()}>
              Device Status: {status.deviceStatus}
            </li>
          ))}
        </ul>
      )}
      <button onClick={refreshICMPPollingStatus}>Refresh</button>
    </div>
  )
}
```

## Performance

The combination of Bun's WebSockets and SQLite provides significant performance improvements:

- **7x higher throughput** for WebSockets compared to Node.js + "ws" library
- **3-6x faster** than better-sqlite3 and 8-9x faster than deno.land/x/sqlite for database operations
- Optimized message handling with lower CPU usage
- Better memory efficiency
- Enhanced compression for bandwidth optimization
