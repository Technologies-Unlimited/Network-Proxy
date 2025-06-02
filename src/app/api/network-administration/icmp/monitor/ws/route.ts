/**
 * ICMP Monitor WebSocket Handler
 * Provides real-time monitoring updates via WebSocket
 */

import { Server as SocketServer } from 'socket.io'
import { monitoringService } from '@/services/icmp-monitor'
import { validateUserSession } from '@/actions/auth/production/identity'

// Type definitions for WebSocket events
interface MonitorResult {
  monitor: {
    _id: string
    companyId: string
  }
  result: {
    success: boolean
    responseTime?: number
    error?: string
  }
  timestamp: Date
}

interface MonitorAlert {
  monitor: {
    _id: string
    companyId: string
  }
  alert: {
    type: string
    message: string
    severity: string
  }
  rule: {
    condition: string
    threshold: number
  }
  result: {
    success: boolean
    responseTime?: number
    error?: string
  }
}

interface GlobalWithIO {
  io?: SocketServer
}

// Store active WebSocket connections
const connections = new Map<string, Set<string>>() // companyId -> Set of socket IDs

export async function GET(request: Request) {
  // Validate user session
  const session = await validateUserSession(request)

  if (!session.success || !session.data?.userId) {
    return new Response('Unauthorized', { status: 401 })
  }

  // For now, we'll return a simple message
  // In production, you'd upgrade the connection to WebSocket
  return new Response(
    JSON.stringify({
      message: 'WebSocket endpoint - use Socket.IO client to connect',
      path: '/api/network-administration/icmp/monitor/ws',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}

/**
 * Initialize WebSocket server (to be called from server startup)
 */
export function initializeMonitoringWebSocket(io: SocketServer) {
  const monitorNamespace = io.of('/monitor')

  monitorNamespace.on('connection', socket => {
    console.log('[MonitorWS] Client connected:', socket.id)

    // Get company ID from handshake auth with type safety
    const companyId = socket.handshake.auth.companyId as string
    if (!companyId || typeof companyId !== 'string') {
      socket.disconnect()
      return
    }

    // Add to connections
    if (!connections.has(companyId)) {
      connections.set(companyId, new Set())
    }
    connections.get(companyId)!.add(socket.id)

    // Subscribe to specific monitors
    socket.on('subscribe', (monitorIds: string[]) => {
      console.log('[MonitorWS] Client subscribing to monitors:', monitorIds)

      // Join rooms for each monitor
      monitorIds.forEach(monitorId => {
        socket.join(`monitor:${monitorId}`)
      })
    })

    // Unsubscribe from monitors
    socket.on('unsubscribe', (monitorIds: string[]) => {
      console.log('[MonitorWS] Client unsubscribing from monitors:', monitorIds)

      // Leave rooms for each monitor
      monitorIds.forEach(monitorId => {
        socket.leave(`monitor:${monitorId}`)
      })
    })

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log('[MonitorWS] Client disconnected:', socket.id)

      // Remove from connections
      const companyConnections = connections.get(companyId)
      if (companyConnections) {
        companyConnections.delete(socket.id)
        if (companyConnections.size === 0) {
          connections.delete(companyId)
        }
      }
    })
  })

  // Listen to monitoring service events with proper typing
  monitoringService.on('result', (data: MonitorResult) => {
    // Emit to all clients subscribed to this monitor
    monitorNamespace.to(`monitor:${data.monitor._id}`).emit('monitor:result', {
      monitorId: data.monitor._id,
      result: data.result,
      timestamp: data.timestamp,
    })
  })

  monitoringService.on('alert', (data: MonitorAlert) => {
    // Emit to all clients in the company
    const companyConnections = connections.get(data.monitor.companyId)
    if (companyConnections) {
      companyConnections.forEach(socketId => {
        const socket = monitorNamespace.sockets.get(socketId)
        if (socket) {
          socket.emit('monitor:alert', {
            monitorId: data.monitor._id,
            alert: data.alert,
            rule: data.rule,
            result: data.result,
          })
        }
      })
    }
  })

  console.log('[MonitorWS] WebSocket monitoring initialized')
}

/**
 * Emit custom event to specific monitor subscribers
 */
export function emitMonitorEvent(
  monitorId: string,
  event: string,
  data: unknown
) {
  const globalObj = global as GlobalWithIO
  const io = globalObj.io
  if (!io) return

  const monitorNamespace = io.of('/monitor')
  monitorNamespace.to(`monitor:${monitorId}`).emit(event, data)
}

/**
 * Emit custom event to all company connections
 */
export function emitCompanyEvent(
  companyId: string,
  event: string,
  data: unknown
) {
  const globalObj = global as GlobalWithIO
  const io = globalObj.io
  if (!io) return

  const monitorNamespace = io.of('/monitor')
  const companyConnections = connections.get(companyId)

  if (companyConnections) {
    companyConnections.forEach(socketId => {
      const socket = monitorNamespace.sockets.get(socketId)
      if (socket) {
        socket.emit(event, data)
      }
    })
  }
}
