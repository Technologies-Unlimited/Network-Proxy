/**
 * WebSocket server implementation for ICMP and SNMP polling data
 * This provides real-time updates for network monitoring data
 */

import { type Server, type ServerWebSocket } from 'bun'
import {
  ICMPPollingStatus,
  ICMPPollingStatusRepository,
} from '@/database/icmpPollingStatusRepository'
import {
  SNMPPollingStatus,
  SNMPPollingStatusRepository,
} from '@/database/snmpPollingStatusRepository'
import { handleAPIRequest } from '@/api'

// Define types for our WebSocket data and messages
export interface NetworkMonitoringData {
  companyId: string
  createdAt: number
}

type StatusUpdate = ICMPStatusUpdate | SNMPStatusUpdate

interface ICMPStatusUpdate {
  type: 'icmp'
  _id: string
  companyId: string
  icmpPollingTemplateId: string
  manufacturerId?: string
  modelNameId?: string
  productId?: string
  stockIds?: string[]
  networkInventoryIds?: string[]
  uptime?: number
  downtime?: number
  deviceStatus: string
}

interface SNMPStatusUpdate {
  type: 'snmp'
  _id: string
  companyId: string
  snmpPollingTemplateId: string
  manufacturerId?: string
  modelNameId?: string
  productId?: string
  stockIds?: string[]
  networkInventoryIds?: string[]
  uptime?: number
  downtime?: number
  deviceStatus: string
}

// Create repositories
const icmpRepository = new ICMPPollingStatusRepository()
const snmpRepository = new SNMPPollingStatusRepository()

/**
 * Starts a WebSocket server for real-time network monitoring
 * @param port The port to listen on
 * @returns The server instance
 */
export function startWebSocketServer(port: number = 3001): Server {
  console.log(
    `Starting WebSocket server for network monitoring on port ${port}...`
  )

  const server = Bun.serve<NetworkMonitoringData>({
    port,
    async fetch(req: Request, server: Server) {
      // Get the URL
      const url = new URL(req.url)

      // Handle WebSocket upgrades
      if (url.pathname === '/ws') {
        const companyId = url.searchParams.get('companyId')

        if (!companyId) {
          return new Response('Missing companyId parameter', { status: 400 })
        }

        // Upgrade the connection to WebSocket
        const upgraded = server.upgrade(req, {
          data: {
            companyId,
            createdAt: Date.now(),
          },
        })

        if (!upgraded) {
          return new Response('WebSocket upgrade failed', { status: 500 })
        }

        return undefined
      }

      // Handle HTTP API requests
      if (url.pathname.startsWith('/api')) {
        return handleAPIRequest(req)
      }

      // Handle health check
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Default response for unknown endpoints
      return new Response('Not Found', { status: 404 })
    },
    websocket: {
      // Enable compression for better performance with network monitoring data
      perMessageDeflate: true,

      // Set reasonable timeouts for network monitoring
      idleTimeout: 300, // 5 minutes

      // Allow larger payloads for batch updates
      maxPayloadLength: 5 * 1024 * 1024, // 5MB

      // Handle new client connections
      open(ws: ServerWebSocket<NetworkMonitoringData>) {
        console.log(`Client connected for company ${ws.data.companyId}`)
        // Subscribe the client to their company's updates
        ws.subscribe(`company-${ws.data.companyId}`)
        // Send initial connection confirmation
        ws.send(
          JSON.stringify({
            type: 'connection',
            status: 'connected',
            companyId: ws.data.companyId,
            timestamp: Date.now(),
          })
        )
      },

      // Handle incoming messages
      message(
        ws: ServerWebSocket<NetworkMonitoringData>,
        message: string | Uint8Array
      ) {
        try {
          const data = JSON.parse(message.toString())
          const companyId = ws.data.companyId

          // Handle different message types
          if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
          } else if (data.type === 'subscribe') {
            // Allow clients to subscribe to specific device updates
            if (data.deviceId) {
              ws.subscribe(`device-${data.deviceId}`)
              ws.send(
                JSON.stringify({
                  type: 'subscribed',
                  deviceId: data.deviceId,
                  timestamp: Date.now(),
                })
              )
            }
          } else if (data.type === 'requestInitialICMPData') {
            // Handle initial ICMP data request
            try {
              const statuses = icmpRepository.getForCompany(companyId)
              ws.send(
                JSON.stringify({
                  type: 'initialICMPData',
                  statuses: statuses.map(status => ({
                    _id: status.id,
                    companyId: status.companyId,
                    icmpPollingTemplateId: status.icmpPollingTemplateId,
                    manufacturerId: status.manufacturerId,
                    modelNameId: status.modelNameId,
                    productId: status.productId,
                    stockIds: status.stockIds,
                    networkInventoryIds: status.networkInventoryIds,
                    uptime: status.uptime,
                    downtime: status.downtime,
                    deviceStatus: status.deviceStatus,
                  })),
                })
              )
            } catch (error) {
              console.error('Error fetching initial ICMP data:', error)
              ws.send(
                JSON.stringify({
                  type: 'error',
                  message: 'Error fetching initial ICMP data',
                  timestamp: Date.now(),
                })
              )
            }
          } else if (data.type === 'requestInitialSNMPData') {
            // Handle initial SNMP data request
            try {
              const statuses = snmpRepository.getForCompany(companyId)
              ws.send(
                JSON.stringify({
                  type: 'initialSNMPData',
                  statuses: statuses.map(status => ({
                    _id: status.id,
                    companyId: status.companyId,
                    snmpPollingTemplateId: status.snmpPollingTemplateId,
                    manufacturerId: status.manufacturerId,
                    modelNameId: status.modelNameId,
                    productId: status.productId,
                    stockIds: status.stockIds,
                    networkInventoryIds: status.networkInventoryIds,
                    uptime: status.uptime,
                    downtime: status.downtime,
                    deviceStatus: status.deviceStatus,
                  })),
                })
              )
            } catch (error) {
              console.error('Error fetching initial SNMP data:', error)
              ws.send(
                JSON.stringify({
                  type: 'error',
                  message: 'Error fetching initial SNMP data',
                  timestamp: Date.now(),
                })
              )
            }
          } else if (data.type === 'requestICMPRefresh') {
            // Handle ICMP refresh request
            try {
              const statuses = icmpRepository.getForCompany(companyId)
              ws.send(
                JSON.stringify({
                  type: 'initialICMPData',
                  statuses: statuses.map(status => ({
                    _id: status.id,
                    companyId: status.companyId,
                    icmpPollingTemplateId: status.icmpPollingTemplateId,
                    manufacturerId: status.manufacturerId,
                    modelNameId: status.modelNameId,
                    productId: status.productId,
                    stockIds: status.stockIds,
                    networkInventoryIds: status.networkInventoryIds,
                    uptime: status.uptime,
                    downtime: status.downtime,
                    deviceStatus: status.deviceStatus,
                  })),
                })
              )
            } catch (error) {
              console.error('Error refreshing ICMP data:', error)
              ws.send(
                JSON.stringify({
                  type: 'error',
                  message: 'Error refreshing ICMP data',
                  timestamp: Date.now(),
                })
              )
            }
          } else if (data.type === 'requestSNMPRefresh') {
            // Handle SNMP refresh request
            try {
              const statuses = snmpRepository.getForCompany(companyId)
              ws.send(
                JSON.stringify({
                  type: 'initialSNMPData',
                  statuses: statuses.map(status => ({
                    _id: status.id,
                    companyId: status.companyId,
                    snmpPollingTemplateId: status.snmpPollingTemplateId,
                    manufacturerId: status.manufacturerId,
                    modelNameId: status.modelNameId,
                    productId: status.productId,
                    stockIds: status.stockIds,
                    networkInventoryIds: status.networkInventoryIds,
                    uptime: status.uptime,
                    downtime: status.downtime,
                    deviceStatus: status.deviceStatus,
                  })),
                })
              )
            } catch (error) {
              console.error('Error refreshing SNMP data:', error)
              ws.send(
                JSON.stringify({
                  type: 'error',
                  message: 'Error refreshing SNMP data',
                  timestamp: Date.now(),
                })
              )
            }
          } else if (data.type === 'updateICMP') {
            // Handle ICMP update request
            try {
              const { id, input } = data
              const result = icmpRepository.update(id, companyId, input)

              if (result) {
                // Broadcast the update to all subscribed clients
                broadcastICMPUpdate(server, {
                  _id: result.id,
                  companyId: result.companyId,
                  icmpPollingTemplateId: result.icmpPollingTemplateId,
                  manufacturerId: result.manufacturerId,
                  modelNameId: result.modelNameId,
                  productId: result.productId,
                  stockIds: result.stockIds,
                  networkInventoryIds: result.networkInventoryIds,
                  uptime: result.uptime,
                  downtime: result.downtime,
                  deviceStatus: result.deviceStatus,
                })

                ws.send(
                  JSON.stringify({
                    type: 'success',
                    message: 'ICMP status updated successfully',
                    timestamp: Date.now(),
                  })
                )
              } else {
                ws.send(
                  JSON.stringify({
                    type: 'error',
                    message: 'Failed to update ICMP status',
                    timestamp: Date.now(),
                  })
                )
              }
            } catch (error) {
              console.error('Error updating ICMP status:', error)
              ws.send(
                JSON.stringify({
                  type: 'error',
                  message: 'Error updating ICMP status',
                  timestamp: Date.now(),
                })
              )
            }
          } else if (data.type === 'updateSNMP') {
            // Handle SNMP update request
            try {
              const { id, input } = data
              const result = snmpRepository.update(id, companyId, input)

              if (result) {
                // Broadcast the update to all subscribed clients
                broadcastSNMPUpdate(server, {
                  _id: result.id,
                  companyId: result.companyId,
                  snmpPollingTemplateId: result.snmpPollingTemplateId,
                  manufacturerId: result.manufacturerId,
                  modelNameId: result.modelNameId,
                  productId: result.productId,
                  stockIds: result.stockIds,
                  networkInventoryIds: result.networkInventoryIds,
                  uptime: result.uptime,
                  downtime: result.downtime,
                  deviceStatus: result.deviceStatus,
                })

                ws.send(
                  JSON.stringify({
                    type: 'success',
                    message: 'SNMP status updated successfully',
                    timestamp: Date.now(),
                  })
                )
              } else {
                ws.send(
                  JSON.stringify({
                    type: 'error',
                    message: 'Failed to update SNMP status',
                    timestamp: Date.now(),
                  })
                )
              }
            } catch (error) {
              console.error('Error updating SNMP status:', error)
              ws.send(
                JSON.stringify({
                  type: 'error',
                  message: 'Error updating SNMP status',
                  timestamp: Date.now(),
                })
              )
            }
          } else if (data.type === 'deleteICMP') {
            // Handle ICMP delete request
            try {
              const { id } = data
              const result = icmpRepository.delete(id, companyId)

              if (result) {
                // Broadcast the deletion to all subscribed clients
                server.publish(
                  `company-${companyId}`,
                  JSON.stringify({
                    type: 'deleteICMP',
                    id,
                  })
                )

                ws.send(
                  JSON.stringify({
                    type: 'success',
                    message: 'ICMP status deleted successfully',
                    timestamp: Date.now(),
                  })
                )
              } else {
                ws.send(
                  JSON.stringify({
                    type: 'error',
                    message: 'Failed to delete ICMP status',
                    timestamp: Date.now(),
                  })
                )
              }
            } catch (error) {
              console.error('Error deleting ICMP status:', error)
              ws.send(
                JSON.stringify({
                  type: 'error',
                  message: 'Error deleting ICMP status',
                  timestamp: Date.now(),
                })
              )
            }
          } else if (data.type === 'deleteSNMP') {
            // Handle SNMP delete request
            try {
              const { id } = data
              const result = snmpRepository.delete(id, companyId)

              if (result) {
                // Broadcast the deletion to all subscribed clients
                server.publish(
                  `company-${companyId}`,
                  JSON.stringify({
                    type: 'deleteSNMP',
                    id,
                  })
                )

                ws.send(
                  JSON.stringify({
                    type: 'success',
                    message: 'SNMP status deleted successfully',
                    timestamp: Date.now(),
                  })
                )
              } else {
                ws.send(
                  JSON.stringify({
                    type: 'error',
                    message: 'Failed to delete SNMP status',
                    timestamp: Date.now(),
                  })
                )
              }
            } catch (error) {
              console.error('Error deleting SNMP status:', error)
              ws.send(
                JSON.stringify({
                  type: 'error',
                  message: 'Error deleting SNMP status',
                  timestamp: Date.now(),
                })
              )
            }
          }
        } catch (error) {
          console.error('Error processing message:', error)
          ws.send(
            JSON.stringify({
              type: 'error',
              message: 'Invalid message format',
              timestamp: Date.now(),
            })
          )
        }
      },

      // Handle client disconnections
      close(ws: ServerWebSocket<NetworkMonitoringData>) {
        console.log(`Client disconnected for company ${ws.data.companyId}`)
      },

      // Handle error cases
      error(ws: ServerWebSocket<NetworkMonitoringData>, error: Error) {
        console.error(
          `WebSocket error for company ${ws.data.companyId}:`,
          error
        )
      },
    },
  })

  console.log(`WebSocket server running at ${server.hostname}:${server.port}`)
  console.log(
    `HTTP API running at http://${server.hostname}:${server.port}/api`
  )
  console.log(
    `Health check available at http://${server.hostname}:${server.port}/health`
  )

  return server
}

// Helper functions to broadcast updates to clients

/**
 * Broadcast an ICMP status update to all clients subscribed to the company
 */
export function broadcastICMPUpdate(
  server: Server,
  update: Omit<ICMPStatusUpdate, 'type'>
) {
  const message: ICMPStatusUpdate = {
    type: 'icmp',
    ...update,
  }

  // Broadcast to company channel
  server.publish(`company-${update.companyId}`, JSON.stringify(message))

  // Also broadcast to specific device channels if applicable
  if (update.networkInventoryIds) {
    update.networkInventoryIds.forEach(deviceId => {
      server.publish(`device-${deviceId}`, JSON.stringify(message))
    })
  }
}

/**
 * Broadcast an SNMP status update to all clients subscribed to the company
 */
export function broadcastSNMPUpdate(
  server: Server,
  update: Omit<SNMPStatusUpdate, 'type'>
) {
  const message: SNMPStatusUpdate = {
    type: 'snmp',
    ...update,
  }

  // Broadcast to company channel
  server.publish(`company-${update.companyId}`, JSON.stringify(message))

  // Also broadcast to specific device channels if applicable
  if (update.networkInventoryIds) {
    update.networkInventoryIds.forEach(deviceId => {
      server.publish(`device-${deviceId}`, JSON.stringify(message))
    })
  }
}
