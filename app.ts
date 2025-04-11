/**
 * Main server entry point for the Network-Proxy application
 * This file serves both the frontend UI and WebSocket server for real-time network monitoring
 */

import { serve } from 'bun'
import { startWebSocketServer } from './src/websockets/server'
import { getDatabase } from './src/database/index'
import fs from 'node:fs'
import path from 'node:path'

// Define the port for the WebSocket server
const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 3001
const HTTP_PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000

// Initialize the database
getDatabase()

// Try to start the WebSocket server with fallback ports
let wsServer
let actualWsPort = WS_PORT
const MAX_PORT_ATTEMPTS = 5

for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
  try {
    // Try starting the server with the current port
    const attemptPort = WS_PORT + i
    wsServer = startWebSocketServer(attemptPort)
    actualWsPort = attemptPort
    break // If successful, exit the loop
  } catch (error) {
    if (i === MAX_PORT_ATTEMPTS - 1) {
      // If we've tried all ports and failed, log an error
      console.error(
        `Failed to start WebSocket server after ${MAX_PORT_ATTEMPTS} attempts.`
      )
      console.error(
        'Please check if multiple instances are running or specify a different port with WS_PORT env variable.'
      )
      process.exit(1)
    }

    console.log(`Port ${WS_PORT + i} is in use, trying ${WS_PORT + i + 1}...`)
    // Continue to the next iteration to try the next port
  }
}

// Ensure public directory exists
const publicDir = path.join(import.meta.dir, 'public')
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true })
}

// Start the Bun server
const server = serve({
  port: HTTP_PORT,

  // Define the routes
  routes: {
    // API routes
    '/api/network': {
      async GET(req) {
        // Placeholder for network data API
        return Response.json({ status: 'ok' })
      },
    },
  },

  // Enable development mode for hot reloading
  development: process.env.NODE_ENV !== 'production',

  // Fallback handler for routing
  fetch(req) {
    const url = new URL(req.url)
    const pathname = url.pathname

    // Log incoming request for debugging
    console.log(`Received request for: ${pathname}`)

    // Handle the root path
    if (pathname === '/') {
      return new Response(Bun.file(path.join(publicDir, 'index.html')))
    }

    // Handle network administration path
    if (pathname === '/network-administration') {
      return new Response(
        Bun.file(path.join(publicDir, 'network-administration.html'))
      )
    }

    // Handle ICMP polling device status path
    if (
      pathname === '/network-administration/icmp/polling/device-status' ||
      pathname.startsWith('/network-administration/icmp')
    ) {
      return new Response(
        Bun.file(path.join(publicDir, 'network-admin-icmp-status.html'))
      )
    }

    // Serve files from public directory
    const filePath = path.join(publicDir, pathname)
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      console.log(`Serving file: ${filePath}`)
      return new Response(Bun.file(filePath))
    }

    // If pathname doesn't have an extension, try to serve it as an HTML file
    if (!pathname.includes('.')) {
      const htmlPath = path.join(publicDir, `${pathname}.html`)
      if (fs.existsSync(htmlPath)) {
        console.log(`Serving HTML file: ${htmlPath}`)
        return new Response(Bun.file(htmlPath))
      }
    }

    // Default fallback for unknown routes
    return new Response(
      `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>Page Not Found</title>
          <style>
            body { 
              font-family: sans-serif; 
              text-align: center; 
              padding: 50px; 
            }
            h1 { color: #d32f2f; }
            a { color: #1976d2; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <h1>404 - Page Not Found</h1>
          <p>The page you're looking for doesn't exist.</p>
          <p>Requested path: ${pathname}</p>
          <p><a href="/">Go back to home</a></p>
        </body>
      </html>
    `,
      {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      }
    )
  },
})

// Handle graceful shutdown
const handleShutdown = () => {
  console.log('Shutting down servers...')
  process.exit(0)
}

process.on('SIGINT', handleShutdown)
process.on('SIGTERM', handleShutdown)

console.log(`Frontend server is running on ${server.url}`)
console.log(`WebSocket server is running on ws://localhost:${actualWsPort}`)
console.log('Press Ctrl+C to stop the servers')
