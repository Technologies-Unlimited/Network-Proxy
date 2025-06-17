/**
 * WebSocket server implementation for ICMP and SNMP polling data
 * This provides real-time updates for network monitoring data
 */

import { type Server, type ServerWebSocket } from 'bun'
import { getDatabase } from '@/database/index'
import { handleICMPPollingStatusRequest } from '@/app/api/network-administration/icmp/polling/status/route'
import { handleICMPPollingTemplatesRequest } from '@/app/api/network-administration/icmp/polling/templates/route'
import { handleICMPTemplatesRequest } from '@/app/api/network-administration/icmp/templates/route'
import { handleICMPMonitorsRequest } from '@/app/api/network-administration/icmp/monitors/route'
import { handleICMPAlertsRequest } from '@/app/api/network-administration/icmp/alerts/route'
import { handleIPAddressRequest } from '@/app/api/network-administration/ipam/ipaddress/route'
import { handleIPPoolRequest } from '@/app/api/network-administration/ipam/pool/route'
import { handleIPSubnetRequest } from '@/app/api/network-administration/ipam/subnet/route'
import { handleIPSupernetRequest } from '@/app/api/network-administration/ipam/supernet/route'
import { handleVLANRequest } from '@/app/api/network-administration/ipam/vlan/route'
import { handleSNMPOIDRequest } from '@/app/api/network-administration/snmp/oid/route'
import { handleSNMPMIBRequest } from '@/app/api/network-administration/snmp/mib/route'
import { handleSNMPv2PollingTemplateRequest } from '@/app/api/network-administration/snmp/polling/template/snmpv2/route'
import { handleSNMPv3PollingTemplateRequest } from '@/app/api/network-administration/snmp/polling/template/snmpv3/route'
import { handleSNMPv2Request } from '@/app/api/network-administration/snmp/snmpv2/route'
import { handleSNMPv3Request } from '@/app/api/network-administration/snmp/snmpv3/route'
import { handleSNMPv2TemplateRequest } from '@/app/api/network-administration/snmp/templates/snmpv2/route'
import { handleSNMPv3TemplateRequest } from '@/app/api/network-administration/snmp/templates/snmpv3/route'

// Define types for our WebSocket data and messages
export interface NetworkMonitoringData {
  companyId: string
  createdAt: number
  tool?: string
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

// Define interfaces for our database row objects
interface ICMPStatusRow {
  _id: string
  company_id: string
  icmp_polling_template_id: string
  manufacturer_id: string | null
  model_name_id: string | null
  product_id: string | null
  uptime: number | null
  downtime: number | null
  device_status: string
  created_at: number
  updated_at: number
}

interface SNMPStatusRow {
  _id: string
  company_id: string
  snmp_polling_template_id: string
  manufacturer_id: string | null
  model_name_id: string | null
  product_id: string | null
  uptime: number | null
  downtime: number | null
  device_status: string
  created_at: number
  updated_at: number
}

interface ICMPTemplateRow {
  _id: string
  company_id: string
  name: string
  description: string | null
  frequency: number
  timeout: number
  retries: number
  polling_frequency_days: number
  polling_frequency_hours: number
  polling_frequency_minutes: number
  polling_frequency_seconds: number
  downtime_trigger_days: number
  downtime_trigger_hours: number
  downtime_trigger_minutes: number
  downtime_trigger_seconds: number
  created_at: number
}

// Get database instance
const db = getDatabase()

/**
 * Starts a WebSocket server for real-time network monitoring
 * @param port The port to listen on
 * @returns The server instance
 */
export function startWebSocketServer(port: number = 3001): Server {
  console.log(
    `Starting WebSocket server for network monitoring on port ${port}...`
  )

  const server = Bun.serve<NetworkMonitoringData, any>({
    port,
    async fetch(req: Request, server: Server) {
      // Get the URL
      const url = new URL(req.url)

      // Add CORS headers for all responses
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
      }

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: corsHeaders,
        })
      }

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
      
      // Handle WebSocket upgrades for iperf tool
      if (url.pathname === '/ws/tools/iperf') {
        // For tools, we may not need a companyId
        // Upgrade the connection to WebSocket
        const upgraded = server.upgrade(req, {
          data: {
            createdAt: Date.now(),
            tool: 'iperf',
          },
        })

        if (!upgraded) {
          return new Response('WebSocket upgrade failed', { status: 500 })
        }

        return undefined
      }

      // Handle HTTP API requests for network administration
      if (url.pathname.startsWith('/api/network-administration')) {
        // ICMP API endpoints
        if (url.pathname.startsWith('/api/network-administration/icmp')) {
          if (
            url.pathname.startsWith(
              '/api/network-administration/icmp/polling/status'
            )
          ) {
            return handleICMPPollingStatusRequest(req)
          }
          if (
            url.pathname.startsWith(
              '/api/network-administration/icmp/polling/templates'
            )
          ) {
            return handleICMPPollingTemplatesRequest(req)
          }
          if (
            url.pathname.startsWith(
              '/api/network-administration/icmp/templates'
            )
          ) {
            return handleICMPTemplatesRequest(req)
          }
          if (
            url.pathname.startsWith(
              '/api/network-administration/icmp/monitors'
            )
          ) {
            return handleICMPMonitorsRequest(req)
          }
          if (
            url.pathname.startsWith(
              '/api/network-administration/icmp/alerts'
            )
          ) {
            return handleICMPAlertsRequest(req)
          }
        }

        // IPAM API endpoints
        if (url.pathname.startsWith('/api/network-administration/ipam')) {
          if (
            url.pathname.startsWith(
              '/api/network-administration/ipam/ipaddress'
            )
          ) {
            return handleIPAddressRequest(req)
          }
          if (
            url.pathname.startsWith('/api/network-administration/ipam/pool')
          ) {
            return handleIPPoolRequest(req)
          }
          if (
            url.pathname.startsWith('/api/network-administration/ipam/subnet')
          ) {
            return handleIPSubnetRequest(req)
          }
          if (
            url.pathname.startsWith('/api/network-administration/ipam/supernet')
          ) {
            return handleIPSupernetRequest(req)
          }
          if (
            url.pathname.startsWith('/api/network-administration/ipam/vlan')
          ) {
            return handleVLANRequest(req)
          }
        }

        // SNMP API endpoints
        if (url.pathname.startsWith('/api/network-administration/snmp')) {
          if (url.pathname.startsWith('/api/network-administration/snmp/oid')) {
            return handleSNMPOIDRequest(req)
          }
          if (url.pathname.startsWith('/api/network-administration/snmp/mib')) {
            return handleSNMPMIBRequest(req)
          }
          if (
            url.pathname.startsWith(
              '/api/network-administration/snmp/polling/template/snmpv2'
            )
          ) {
            return handleSNMPv2PollingTemplateRequest(req)
          }
          if (
            url.pathname.startsWith(
              '/api/network-administration/snmp/polling/template/snmpv3'
            )
          ) {
            return handleSNMPv3PollingTemplateRequest(req)
          }
          if (
            url.pathname.startsWith('/api/network-administration/snmp/snmpv2')
          ) {
            return handleSNMPv2Request(req)
          }
          if (
            url.pathname.startsWith('/api/network-administration/snmp/snmpv3')
          ) {
            return handleSNMPv3Request(req)
          }
          if (
            url.pathname.startsWith(
              '/api/network-administration/snmp/templates/snmpv2'
            )
          ) {
            return handleSNMPv2TemplateRequest(req)
          }
          if (
            url.pathname.startsWith(
              '/api/network-administration/snmp/templates/snmpv3'
            )
          ) {
            return handleSNMPv3TemplateRequest(req)
          }
        }
      }

      // Handle health check
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      // Handle direct ICMP monitor API endpoints (for frontend)
      if (url.pathname.startsWith('/api/monitors')) {
        const response = await handleICMPMonitorsRequest(req)
        // Add CORS headers to the response
        const headers = new Headers(response.headers)
        Object.entries(corsHeaders).forEach(([key, value]) => {
          headers.set(key, value)
        })
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        })
      }

      // Handle ping API endpoint (for real ping tests)
      if (url.pathname === '/api/ping') {
        const response = await handleICMPMonitorsRequest(req)
        // Add CORS headers to the response
        const headers = new Headers(response.headers)
        Object.entries(corsHeaders).forEach(([key, value]) => {
          headers.set(key, value)
        })
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        })
      }

      // Handle direct ICMP alerts API endpoints (for frontend)
      if (url.pathname.startsWith('/api/alerts')) {
        const response = await handleICMPAlertsRequest(req)
        // Add CORS headers to the response
        const headers = new Headers(response.headers)
        Object.entries(corsHeaders).forEach(([key, value]) => {
          headers.set(key, value)
        })
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        })
      }

      // Default response for unknown endpoints
      return new Response('Not Found', { 
        status: 404,
        headers: corsHeaders,
      })
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
          const toolType = ws.data.tool

          // Handle iperf tool messages
          if (toolType === 'iperf') {
            handleIperfMessage(ws, data)
            return
          }

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
              const statuses = db
                .query(
                  `
                SELECT 
                  _id, company_id, icmp_polling_template_id, manufacturer_id, 
                  model_name_id, product_id, uptime, downtime, 
                  device_status, created_at, updated_at
                FROM icmp_polling_status 
                WHERE company_id = ?
              `
                )
                .all(companyId) as ICMPStatusRow[]

              ws.send(
                JSON.stringify({
                  type: 'initialICMPData',
                  statuses: statuses.map(status => ({
                    _id: status._id,
                    companyId: status.company_id,
                    icmpPollingTemplateId: status.icmp_polling_template_id,
                    manufacturerId: status.manufacturer_id || undefined,
                    modelNameId: status.model_name_id || undefined,
                    productId: status.product_id || undefined,
                    // Handle related data properly
                    stockIds: getStockIdsForStatus(status._id),
                    networkInventoryIds: getNetworkInventoryIdsForStatus(
                      status._id
                    ),
                    uptime: status.uptime || 0,
                    downtime: status.downtime || 0,
                    deviceStatus: status.device_status,
                    createdAt: status.created_at,
                    updatedAt: status.updated_at,
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
          } else if (data.type === 'requestInitialICMPTemplates') {
            // Handle initial ICMP templates request
            try {
              const templates = db
                .query(
                  `
                SELECT 
                  _id, company_id, name, description, frequency, timeout, retries,
                  polling_frequency_days, polling_frequency_hours, 
                  polling_frequency_minutes, polling_frequency_seconds,
                  downtime_trigger_days, downtime_trigger_hours, 
                  downtime_trigger_minutes, downtime_trigger_seconds,
                  created_at
                FROM icmp_polling_templates
                WHERE company_id = ?
              `
                )
                .all(companyId) as ICMPTemplateRow[]

              ws.send(
                JSON.stringify({
                  type: 'initialICMPTemplates',
                  templates: templates.map(template => ({
                    _id: template._id,
                    companyId: template.company_id,
                    name: template.name,
                    description: template.description || '',
                    frequency: template.frequency,
                    timeout: template.timeout,
                    retries: template.retries,
                    pollingFrequency: {
                      days: template.polling_frequency_days,
                      hours: template.polling_frequency_hours,
                      minutes: template.polling_frequency_minutes,
                      seconds: template.polling_frequency_seconds,
                    },
                    downtimeTrigger: {
                      days: template.downtime_trigger_days,
                      hours: template.downtime_trigger_hours,
                      minutes: template.downtime_trigger_minutes,
                      seconds: template.downtime_trigger_seconds,
                    },
                    createdAt: template.created_at,
                  })),
                })
              )
            } catch (error) {
              console.error('Error fetching initial ICMP templates:', error)
              ws.send(
                JSON.stringify({
                  type: 'error',
                  message: 'Error fetching initial ICMP templates',
                  timestamp: Date.now(),
                })
              )
            }
          } else if (data.type === 'requestInitialSNMPData') {
            // Handle initial SNMP data request
            try {
              const statuses = db
                .query(
                  `
                SELECT 
                  _id, company_id, snmp_polling_template_id, manufacturer_id, 
                  model_name_id, product_id, uptime, downtime, 
                  device_status, created_at, updated_at
                FROM snmp_polling_status 
                WHERE company_id = ?
              `
                )
                .all(companyId) as SNMPStatusRow[]

              ws.send(
                JSON.stringify({
                  type: 'initialSNMPData',
                  statuses: statuses.map(status => ({
                    _id: status._id,
                    companyId: status.company_id,
                    snmpPollingTemplateId: status.snmp_polling_template_id,
                    manufacturerId: status.manufacturer_id || undefined,
                    modelNameId: status.model_name_id || undefined,
                    productId: status.product_id || undefined,
                    // Handle related data properly
                    stockIds: getSNMPStockIdsForStatus(status._id),
                    networkInventoryIds: getSNMPNetworkInventoryIdsForStatus(
                      status._id
                    ),
                    uptime: status.uptime || 0,
                    downtime: status.downtime || 0,
                    deviceStatus: status.device_status,
                    createdAt: status.created_at,
                    updatedAt: status.updated_at,
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
            // Handle ICMP refresh request - reuse the same logic as initial data request
            try {
              const statuses = db
                .query(
                  `
                SELECT 
                  _id, company_id, icmp_polling_template_id, manufacturer_id, 
                  model_name_id, product_id, uptime, downtime, 
                  device_status, created_at, updated_at
                FROM icmp_polling_status 
                WHERE company_id = ?
              `
                )
                .all(companyId) as ICMPStatusRow[]

              ws.send(
                JSON.stringify({
                  type: 'initialICMPData',
                  statuses: statuses.map(status => ({
                    _id: status._id,
                    companyId: status.company_id,
                    icmpPollingTemplateId: status.icmp_polling_template_id,
                    manufacturerId: status.manufacturer_id || undefined,
                    modelNameId: status.model_name_id || undefined,
                    productId: status.product_id || undefined,
                    stockIds: getStockIdsForStatus(status._id),
                    networkInventoryIds: getNetworkInventoryIdsForStatus(
                      status._id
                    ),
                    uptime: status.uptime || 0,
                    downtime: status.downtime || 0,
                    deviceStatus: status.device_status,
                    createdAt: status.created_at,
                    updatedAt: status.updated_at,
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
              const statuses = db
                .query(
                  `
                SELECT 
                  _id, company_id, snmp_polling_template_id, manufacturer_id, 
                  model_name_id, product_id, uptime, downtime, 
                  device_status, created_at, updated_at
                FROM snmp_polling_status 
                WHERE company_id = ?
              `
                )
                .all(companyId) as SNMPStatusRow[]

              ws.send(
                JSON.stringify({
                  type: 'initialSNMPData',
                  statuses: statuses.map(status => ({
                    _id: status._id,
                    companyId: status.company_id,
                    snmpPollingTemplateId: status.snmp_polling_template_id,
                    manufacturerId: status.manufacturer_id || undefined,
                    modelNameId: status.model_name_id || undefined,
                    productId: status.product_id || undefined,
                    stockIds: getSNMPStockIdsForStatus(status._id),
                    networkInventoryIds: getSNMPNetworkInventoryIdsForStatus(
                      status._id
                    ),
                    uptime: status.uptime || 0,
                    downtime: status.downtime || 0,
                    deviceStatus: status.device_status,
                    createdAt: status.created_at,
                    updatedAt: status.updated_at,
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
              const { _id, input } = data

              // Build a proper update SQL statement instead of using SET ?
              let updateSql = 'UPDATE icmp_polling_status SET updated_at = ?'
              const params: any[] = [Date.now()]

              // Add each field to update
              if (input.icmpPollingTemplateId !== undefined) {
                updateSql += ', icmp_polling_template_id = ?'
                params.push(input.icmpPollingTemplateId)
              }

              if (input.manufacturerId !== undefined) {
                updateSql += ', manufacturer_id = ?'
                params.push(input.manufacturerId)
              }

              if (input.modelNameId !== undefined) {
                updateSql += ', model_name_id = ?'
                params.push(input.modelNameId)
              }

              if (input.productId !== undefined) {
                updateSql += ', product_id = ?'
                params.push(input.productId)
              }

              if (input.uptime !== undefined) {
                updateSql += ', uptime = ?'
                params.push(input.uptime)
              }

              if (input.downtime !== undefined) {
                updateSql += ', downtime = ?'
                params.push(input.downtime)
              }

              if (input.deviceStatus !== undefined) {
                updateSql += ', device_status = ?'
                params.push(input.deviceStatus)
              }

              updateSql += ' WHERE _id = ? AND company_id = ?'
              params.push(_id, companyId)

              // Execute the update
              const result = db.query(updateSql).run(...params)

              if (result.changes > 0) {
                // Get the updated status
                const updatedStatus = db
                  .query(
                    `
                  SELECT 
                    _id, company_id, icmp_polling_template_id, manufacturer_id, 
                    model_name_id, product_id, uptime, downtime, 
                    device_status, created_at, updated_at
                  FROM icmp_polling_status 
                  WHERE _id = ?
                `
                  )
                  .get(_id) as ICMPStatusRow

                // Update related collections if needed
                if (input.stockIds !== undefined) {
                  updateStockIdsForStatus(_id, input.stockIds)
                }

                if (input.networkInventoryIds !== undefined) {
                  updateNetworkInventoryIdsForStatus(
                    _id,
                    input.networkInventoryIds
                  )
                }

                // Broadcast the update to all subscribed clients
                broadcastICMPUpdate(server, {
                  _id: updatedStatus._id,
                  companyId: updatedStatus.company_id,
                  icmpPollingTemplateId: updatedStatus.icmp_polling_template_id,
                  manufacturerId: updatedStatus.manufacturer_id || undefined,
                  modelNameId: updatedStatus.model_name_id || undefined,
                  productId: updatedStatus.product_id || undefined,
                  stockIds: getStockIdsForStatus(updatedStatus._id),
                  networkInventoryIds: getNetworkInventoryIdsForStatus(
                    updatedStatus._id
                  ),
                  uptime: updatedStatus.uptime || 0,
                  downtime: updatedStatus.downtime || 0,
                  deviceStatus: updatedStatus.device_status,
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
              const { _id, input } = data

              // Build a proper update SQL statement
              let updateSql = 'UPDATE snmp_polling_status SET updated_at = ?'
              const params: any[] = [Date.now()]

              // Add each field to update
              if (input.snmpPollingTemplateId !== undefined) {
                updateSql += ', snmp_polling_template_id = ?'
                params.push(input.snmpPollingTemplateId)
              }

              if (input.manufacturerId !== undefined) {
                updateSql += ', manufacturer_id = ?'
                params.push(input.manufacturerId)
              }

              if (input.modelNameId !== undefined) {
                updateSql += ', model_name_id = ?'
                params.push(input.modelNameId)
              }

              if (input.productId !== undefined) {
                updateSql += ', product_id = ?'
                params.push(input.productId)
              }

              if (input.uptime !== undefined) {
                updateSql += ', uptime = ?'
                params.push(input.uptime)
              }

              if (input.downtime !== undefined) {
                updateSql += ', downtime = ?'
                params.push(input.downtime)
              }

              if (input.deviceStatus !== undefined) {
                updateSql += ', device_status = ?'
                params.push(input.deviceStatus)
              }

              updateSql += ' WHERE _id = ? AND company_id = ?'
              params.push(_id, companyId)

              // Execute the update
              const result = db.query(updateSql).run(...params)

              if (result.changes > 0) {
                // Get the updated status
                const updatedStatus = db
                  .query(
                    `
                  SELECT 
                    _id, company_id, snmp_polling_template_id, manufacturer_id, 
                    model_name_id, product_id, uptime, downtime, 
                    device_status, created_at, updated_at
                  FROM snmp_polling_status 
                  WHERE _id = ?
                `
                  )
                  .get(_id) as SNMPStatusRow

                // Update related collections if needed
                if (input.stockIds !== undefined) {
                  updateSNMPStockIdsForStatus(_id, input.stockIds)
                }

                if (input.networkInventoryIds !== undefined) {
                  updateSNMPNetworkInventoryIdsForStatus(
                    _id,
                    input.networkInventoryIds
                  )
                }

                // Broadcast the update to all subscribed clients
                broadcastSNMPUpdate(server, {
                  _id: updatedStatus._id,
                  companyId: updatedStatus.company_id,
                  snmpPollingTemplateId: updatedStatus.snmp_polling_template_id,
                  manufacturerId: updatedStatus.manufacturer_id || undefined,
                  modelNameId: updatedStatus.model_name_id || undefined,
                  productId: updatedStatus.product_id || undefined,
                  stockIds: getSNMPStockIdsForStatus(updatedStatus._id),
                  networkInventoryIds: getSNMPNetworkInventoryIdsForStatus(
                    updatedStatus._id
                  ),
                  uptime: updatedStatus.uptime || 0,
                  downtime: updatedStatus.downtime || 0,
                  deviceStatus: updatedStatus.device_status,
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
              const { _id } = data

              // First, delete associated data
              db.query(
                `
                DELETE FROM icmp_polling_status_stock
                WHERE icmp_polling_status_id = ?
              `
              ).run(_id)

              db.query(
                `
                DELETE FROM icmp_polling_status_network_inventory
                WHERE icmp_polling_status_id = ?
              `
              ).run(_id)

              // Then delete the main record
              const result = db
                .query(
                  `
                DELETE FROM icmp_polling_status 
                WHERE _id = ? AND company_id = ?
              `
                )
                .run(_id, companyId)

              if (result.changes > 0) {
                // Broadcast the deletion to all subscribed clients
                server.publish(
                  `company-${companyId}`,
                  JSON.stringify({
                    type: 'deleteICMP',
                    _id, // Use _id consistently
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
              const { _id } = data

              // First, delete associated data
              db.query(
                `
                DELETE FROM snmp_polling_status_stock
                WHERE snmp_polling_status_id = ?
              `
              ).run(_id)

              db.query(
                `
                DELETE FROM snmp_polling_status_network_inventory
                WHERE snmp_polling_status_id = ?
              `
              ).run(_id)

              // Then delete the main record
              const result = db
                .query(
                  `
                DELETE FROM snmp_polling_status 
                WHERE _id = ? AND company_id = ?
              `
                )
                .run(_id, companyId)

              if (result.changes > 0) {
                // Broadcast the deletion to all subscribed clients
                server.publish(
                  `company-${companyId}`,
                  JSON.stringify({
                    type: 'deleteSNMP',
                    _id, // Use _id consistently
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

      // Log connection errors - using standard console logging instead of the unsupported handler
      drain(ws: ServerWebSocket<NetworkMonitoringData>) {
        // This handler is actually supported by Bun's WebSocket
        // We can use this to log errors by adding custom code here
        if (ws.data) {
          console.log(`WebSocket drain for company ${ws.data.companyId}`)
        }
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

/**
 * Helper function to get stock IDs for an ICMP polling status
 */
function getStockIdsForStatus(statusId: string): string[] {
  return db
    .query(
      'SELECT stock_id FROM icmp_polling_status_stock WHERE icmp_polling_status_id = ?'
    )
    .all(statusId)
    .map((row: any) => row.stock_id)
}

/**
 * Helper function to get network inventory IDs for an ICMP polling status
 */
function getNetworkInventoryIdsForStatus(statusId: string): string[] {
  return db
    .query(
      'SELECT network_inventory_id FROM icmp_polling_status_network_inventory WHERE icmp_polling_status_id = ?'
    )
    .all(statusId)
    .map((row: any) => row.network_inventory_id)
}

/**
 * Helper function to get stock IDs for an SNMP polling status
 */
function getSNMPStockIdsForStatus(statusId: string): string[] {
  return db
    .query(
      'SELECT stock_id FROM snmp_polling_status_stock WHERE snmp_polling_status_id = ?'
    )
    .all(statusId)
    .map((row: any) => row.stock_id)
}

/**
 * Helper function to get network inventory IDs for an SNMP polling status
 */
function getSNMPNetworkInventoryIdsForStatus(statusId: string): string[] {
  return db
    .query(
      'SELECT network_inventory_id FROM snmp_polling_status_network_inventory WHERE snmp_polling_status_id = ?'
    )
    .all(statusId)
    .map((row: any) => row.network_inventory_id)
}

/**
 * Helper function to update stock IDs for an ICMP polling status
 */
function updateStockIdsForStatus(statusId: string, stockIds: string[]): void {
  const deleteStmt = db.query(
    'DELETE FROM icmp_polling_status_stock WHERE icmp_polling_status_id = ?'
  )
  deleteStmt.run(statusId)

  if (stockIds.length > 0) {
    const insertStmt = db.prepare(
      'INSERT INTO icmp_polling_status_stock (icmp_polling_status_id, stock_id) VALUES (?, ?)'
    )

    for (const stockId of stockIds) {
      insertStmt.run(statusId, stockId)
    }
  }
}

/**
 * Helper function to update network inventory IDs for an ICMP polling status
 */
function updateNetworkInventoryIdsForStatus(
  statusId: string,
  networkInventoryIds: string[]
): void {
  const deleteStmt = db.query(
    'DELETE FROM icmp_polling_status_network_inventory WHERE icmp_polling_status_id = ?'
  )
  deleteStmt.run(statusId)

  if (networkInventoryIds.length > 0) {
    const insertStmt = db.prepare(
      'INSERT INTO icmp_polling_status_network_inventory (icmp_polling_status_id, network_inventory_id) VALUES (?, ?)'
    )

    for (const networkId of networkInventoryIds) {
      insertStmt.run(statusId, networkId)
    }
  }
}

/**
 * Helper function to update stock IDs for an SNMP polling status
 */
function updateSNMPStockIdsForStatus(
  statusId: string,
  stockIds: string[]
): void {
  const deleteStmt = db.query(
    'DELETE FROM snmp_polling_status_stock WHERE snmp_polling_status_id = ?'
  )
  deleteStmt.run(statusId)

  if (stockIds.length > 0) {
    const insertStmt = db.prepare(
      'INSERT INTO snmp_polling_status_stock (snmp_polling_status_id, stock_id) VALUES (?, ?)'
    )

    for (const stockId of stockIds) {
      insertStmt.run(statusId, stockId)
    }
  }
}

/**
 * Helper function to update network inventory IDs for an SNMP polling status
 */
function updateSNMPNetworkInventoryIdsForStatus(
  statusId: string,
  networkInventoryIds: string[]
): void {
  const deleteStmt = db.query(
    'DELETE FROM snmp_polling_status_network_inventory WHERE snmp_polling_status_id = ?'
  )
  deleteStmt.run(statusId)

  if (networkInventoryIds.length > 0) {
    const insertStmt = db.prepare(
      'INSERT INTO snmp_polling_status_network_inventory (snmp_polling_status_id, network_inventory_id) VALUES (?, ?)'
    )

    for (const networkId of networkInventoryIds) {
      insertStmt.run(statusId, networkId)
    }
  }
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

/**
 * Handle iperf tool messages
 * @param ws WebSocket connection
 * @param data Message data
 */
function handleIperfMessage(ws: ServerWebSocket<NetworkMonitoringData>, data: any) {
  try {
    console.log('Handling iperf message:', data.type)
    
    // Import iperf service functions
    const { 
      runIperfTest, 
      stopIperfTest, 
      getIperfTestStatus, 
      discoverIperfServers, 
      checkIperfServerAvailability,
      getLocalAddress
    } = require('../../services/iperf')
    
    switch (data.type) {
      case 'startTest':
        // Start a new iperf test
        if (!data.params) {
          ws.send(JSON.stringify({
            type: 'testError',
            message: 'Test parameters are required'
          }))
          return
        }
        
        // Validate parameters
        const { sourceServerId, destinationServerId } = data.params
        if (!sourceServerId || !destinationServerId) {
          ws.send(JSON.stringify({
            type: 'testError',
            message: 'Source and destination servers are required'
          }))
          return
        }
        
        // Start the test asynchronously
        console.log('Starting iperf test:', data.params)
        runIperfTest(data.params)
          .then(test => {
            // Send initial test started notification
            ws.send(JSON.stringify({
              type: 'testStarted',
              testId: test.id,
              timestamp: Date.now()
            }))
            
            // Set up polling to send test progress updates
            const pollInterval = setInterval(() => {
              const updatedTest = getIperfTestStatus(test.id)
              
              if (!updatedTest) {
                clearInterval(pollInterval)
                return
              }
              
              // Check if the test has results to send
              if (updatedTest.results.length > 0) {
                // Send the latest result
                const latestResult = updatedTest.results[updatedTest.results.length - 1]
                ws.send(JSON.stringify({
                  type: 'testProgress',
                  testId: test.id,
                  result: latestResult,
                  timestamp: Date.now()
                }))
              }
              
              // Check if the test is completed
              if (updatedTest.status === 'completed' || updatedTest.status === 'failed' || updatedTest.status === 'stopped') {
                clearInterval(pollInterval)
                
                if (updatedTest.status === 'completed' && updatedTest.summary) {
                  ws.send(JSON.stringify({
                    type: 'testComplete',
                    testId: test.id,
                    summary: updatedTest.summary,
                    timestamp: Date.now()
                  }))
                } else if (updatedTest.status === 'failed') {
                  ws.send(JSON.stringify({
                    type: 'testError',
                    testId: test.id,
                    message: updatedTest.error || 'Test failed',
                    timestamp: Date.now()
                  }))
                } else if (updatedTest.status === 'stopped') {
                  ws.send(JSON.stringify({
                    type: 'testStopped',
                    testId: test.id,
                    timestamp: Date.now()
                  }))
                }
              }
            }, 1000) // Poll every second
            
            // Clean up interval on connection close
            ws.addEventListener('close', () => {
              clearInterval(pollInterval)
            })
          })
          .catch(error => {
            ws.send(JSON.stringify({
              type: 'testError',
              message: error.message || 'Failed to start test',
              timestamp: Date.now()
            }))
          })
        break
        
      case 'stopTest':
        // Stop a running test
        if (!data.testId) {
          ws.send(JSON.stringify({
            type: 'testError',
            message: 'Test ID is required'
          }))
          return
        }
        
        console.log('Stopping iperf test:', data.testId)
        stopIperfTest(data.testId)
          .then(success => {
            if (success) {
              ws.send(JSON.stringify({
                type: 'testStopped',
                testId: data.testId,
                timestamp: Date.now()
              }))
            } else {
              ws.send(JSON.stringify({
                type: 'testError',
                message: 'Failed to stop test or test not found',
                timestamp: Date.now()
              }))
            }
          })
          .catch(error => {
            ws.send(JSON.stringify({
              type: 'testError',
              message: error.message || 'Error stopping test',
              timestamp: Date.now()
            }))
          })
        break
        
      case 'getStatus':
        // Get test status
        if (!data.testId) {
          ws.send(JSON.stringify({
            type: 'testError',
            message: 'Test ID is required'
          }))
          return
        }
        
        const test = getIperfTestStatus(data.testId)
        if (!test) {
          ws.send(JSON.stringify({
            type: 'testError',
            message: 'Test not found',
            timestamp: Date.now()
          }))
          return
        }
        
        ws.send(JSON.stringify({
          type: 'testStatus',
          test,
          timestamp: Date.now()
        }))
        break

      case 'discoverServers':
        // Discover iperf servers on the network
        console.log('WebSocket received discoverServers request')
        const port = data.port || 5201
        const forceRefresh = data.forceRefresh || false
        
        console.log(`Discovery parameters - port: ${port}, forceRefresh: ${forceRefresh}`)
        
        // Send an immediate response to let the client know discovery is in progress
        try {
          console.log('Sending discoveryStarted message to client')
          ws.send(JSON.stringify({
            type: 'discoveryStarted',
            timestamp: Date.now()
          }))
        } catch (err) {
          console.error('Error sending discoveryStarted message:', err)
        }
        
        try {
          // Start the discovery process
          console.log('Starting iperf server discovery process')
          discoverIperfServers(port, forceRefresh)
            .then(servers => {
              console.log(`Discovery completed successfully, found ${servers.length} servers`)
              
              // Send the complete list of servers
              console.log('Sending discoveryComplete message to client')
              ws.send(JSON.stringify({
                type: 'discoveryComplete',
                servers,
                timestamp: Date.now()
              }))
            })
            .catch(error => {
              console.error('Error during iperf server discovery:', error)
              try {
                console.log('Sending discoveryError message to client')
                ws.send(JSON.stringify({
                  type: 'discoveryError',
                  message: error.message || 'Error discovering servers',
                  timestamp: Date.now()
                }))
              } catch (err) {
                console.error('Error sending error message to client:', err)
              }
            })
        } catch (error) {
          console.error('Error starting discovery process:', error)
          try {
            ws.send(JSON.stringify({
              type: 'discoveryError',
              message: 'Failed to start discovery process',
              timestamp: Date.now()
            }))
          } catch (err) {
            console.error('Error sending error message to client:', err)
          }
        }
        break

      case 'checkServer':
        // Check if a specific server is available
        if (!data.address) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Server address is required',
            timestamp: Date.now()
          }))
          return
        }
        
        const serverPort = data.port || 5201
        console.log(`Checking iperf server availability: ${data.address}:${serverPort}`)
        
        checkIperfServerAvailability(data.address, serverPort)
          .then(isAvailable => {
            ws.send(JSON.stringify({
              type: 'serverCheckResult',
              address: data.address,
              port: serverPort,
              available: isAvailable,
              timestamp: Date.now()
            }))
          })
          .catch(error => {
            ws.send(JSON.stringify({
              type: 'error',
              message: error.message || 'Error checking server',
              timestamp: Date.now()
            }))
          })
        break
        
      default:
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Unknown message type',
          timestamp: Date.now()
        }))
    }
  } catch (error) {
    console.error('Error handling iperf message:', error)
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Error processing message',
      timestamp: Date.now()
    }))
  }
}