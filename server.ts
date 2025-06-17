/**
 * Start the WebSocket server for network monitoring
 */

import { startWebSocketServer } from './src/websockets/server/index'

console.log('Starting Network Monitoring WebSocket Server...')

// Start the server on port 3001
const server = startWebSocketServer(3001)

console.log(`✅ Server running on http://localhost:3001`)
console.log('📡 WebSocket endpoint: ws://localhost:3001/ws')
console.log('🔧 API endpoints available at: http://localhost:3001/api/*')
console.log('')
console.log('Available API endpoints:')
console.log('- GET/POST http://localhost:3001/api/monitors')
console.log('- GET/POST http://localhost:3001/api/alerts')
console.log('- Health check: http://localhost:3001/health')
console.log('')
console.log('Press Ctrl+C to stop the server')

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...')
  server.stop()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server...')
  server.stop()
  process.exit(0)
})
