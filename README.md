# Network Proxy

A network monitoring and administration tool built with Bun and React.

## Features

- Real-time network monitoring via WebSockets
- Network device administration (ICMP, SNMP)
- Network inventory management
- Diagnostic tools

## Prerequisites

- [Bun](https://bun.sh/) (v1.2.0 or higher)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/yourusername/network-proxy.git
cd network-proxy
```

2. Install dependencies:

```bash
bun install
```

3. Start the development server:

```bash
bun dev
```

This will start the development server with hot reloading enabled.

## Project Structure

```
network-proxy/
├── app.ts              # Main server entry point
├── public/             # Static assets and client pages
│   ├── client.tsx        # Main React client entry
│   ├── index.html        # Main HTML template
│   └── styles.css        # Global styles
├── src/                # Source code
│   ├── api/              # API endpoints
│   ├── database/         # Database operations
│   ├── themes/           # UI themes
│   ├── types/            # TypeScript types
│   ├── utils/            # Utility functions
│   └── websockets/       # WebSocket server and client
├── package.json        # Project dependencies
└── README.md           # Project documentation
```

## Available Scripts

- `bun dev`: Start the development server with hot reloading
- `bun build`: Build the application for production
- `bun start`: Start the production server
- `bun test`: Run tests
- `bun lint`: Run linting

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
PORT=3000
WS_PORT=3001
NODE_ENV=development
```

## License

This project is licensed under the MIT License.
