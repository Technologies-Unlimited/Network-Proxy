/**
 * Main server entry point for the Network-Proxy application
 * This file starts the WebSocket server for real-time network monitoring data
 */

import { getDatabase } from './database'

// Initialize the database
getDatabase()

// Define the port for the WebSocket server
const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 3001

// Handle graceful shutdown
const handleShutdown = () => {
  console.log('Shutting down WebSocket server...')
  process.exit(0)
}

process.on('SIGINT', handleShutdown)
process.on('SIGTERM', handleShutdown)

console.log(`WebSocket server is running on ws://localhost:${WS_PORT}`)
console.log('Press Ctrl+C to stop the server')
