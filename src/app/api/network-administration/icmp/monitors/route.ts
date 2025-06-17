/**
 * ICMP Monitors API Handler
 * Provides REST API endpoints for ICMP monitor CRUD operations
 */

import { ICMPMonitorRepository } from '@/database/icmp/monitor/index'
import { performPing } from '@/services/ping'

// Request body interfaces
interface CreateMonitorRequest {
  name: string
  description?: string
  ipAddress: string
  interval: number
  timeout: number
  packetSize?: number
  packetCount?: number
  lossThreshold: number
  latencyWarningThreshold: number
  latencyCriticalThreshold: number
  status?: 'active' | 'paused' | 'disabled'
}

interface UpdateMonitorRequest {
  name?: string
  description?: string
  ipAddress?: string
  interval?: number
  timeout?: number
  packetSize?: number
  packetCount?: number
  lossThreshold?: number
  latencyWarningThreshold?: number
  latencyCriticalThreshold?: number
  status?: 'active' | 'paused' | 'disabled'
  lastCheck?: number
  lastStatus?: 'up' | 'down' | 'unknown'
}

interface CreateResultRequest {
  timestamp?: number
  status: 'up' | 'down'
  responseTime?: number
  packetLoss: number
  packetCount?: number
  packetsReceived?: number
  avgLatency?: number
}

interface PingTestRequest {
  ipAddress: string
  count?: number
  timeout?: number
}

export async function handleICMPMonitorsRequest(
  req: Request
): Promise<Response> {
  const repository = new ICMPMonitorRepository()
  const url = new URL(req.url)
  const method = req.method
  const pathname = url.pathname

  // Add CORS headers to all responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  }

  try {
    // Handle preflight requests
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      })
    }

    // Initialize tables if needed
    console.log('Initializing database tables...')
    repository.initTables()
    console.log('Database tables initialized successfully')

    // Handle /api/ping requests - Real ping testing endpoint
    if (pathname === '/api/ping') {
      if (method === 'POST') {
        try {
          const body = (await req.json()) as PingTestRequest
          console.log('Performing real ping to:', body.ipAddress)

          const pingResult = await performPing(body.ipAddress, {
            count: body.count || 3,
            timeout: body.timeout || 10,
          })

          console.log('Ping result:', pingResult)

          return new Response(JSON.stringify(pingResult), {
            status: 200,
            headers: corsHeaders,
          })
        } catch (error) {
          console.error('Error performing ping:', error)
          return new Response(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to perform ping',
            }),
            {
              status: 500,
              headers: corsHeaders,
            }
          )
        }
      }
    }

    // Handle /api/monitors requests
    if (pathname === '/api/monitors') {
      const companyId = url.searchParams.get('companyId')

      if (!companyId) {
        return new Response(
          JSON.stringify({
            error: 'Missing companyId parameter',
          }),
          {
            status: 400,
            headers: corsHeaders,
          }
        )
      }

      // GET /api/monitors - Get all monitors for a company
      if (method === 'GET') {
        try {
          console.log('Fetching monitors for company:', companyId)
          const monitors = repository.getMonitorsForCompany(companyId)
          console.log('Found monitors:', monitors.length)
          return new Response(JSON.stringify(monitors), {
            status: 200,
            headers: corsHeaders,
          })
        } catch (error) {
          console.error('Error fetching monitors:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to fetch monitors',
            }),
            {
              status: 500,
              headers: corsHeaders,
            }
          )
        }
      }

      // POST /api/monitors - Create a new monitor
      if (method === 'POST') {
        try {
          const body = (await req.json()) as CreateMonitorRequest
          console.log('Received monitor creation request:')
          console.log('Company ID:', companyId)
          console.log('Request body:', body)

          // Create the monitor
          const newMonitor = repository.createMonitor(companyId, body)
          console.log('Successfully created monitor:', newMonitor)

          return new Response(JSON.stringify(newMonitor), {
            status: 201,
            headers: corsHeaders,
          })
        } catch (error) {
          console.error('Error creating monitor:', error)
          console.error(
            'Error stack:',
            error instanceof Error ? error.stack : 'No stack'
          )
          return new Response(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to create monitor',
            }),
            {
              status: 400,
              headers: corsHeaders,
            }
          )
        }
      }
    }

    // Handle /api/monitors/:id requests
    const monitorIdMatch = pathname.match(/^\/api\/monitors\/([^/]+)$/)
    if (monitorIdMatch) {
      const monitorId = monitorIdMatch[1]
      const companyId = url.searchParams.get('companyId')

      if (!companyId) {
        return new Response(
          JSON.stringify({
            error: 'Missing companyId parameter',
          }),
          {
            status: 400,
            headers: corsHeaders,
          }
        )
      }

      // GET /api/monitors/:id - Get a specific monitor
      if (method === 'GET') {
        try {
          const monitor = repository.getMonitorById(monitorId, companyId)
          if (!monitor) {
            return new Response(
              JSON.stringify({
                error: 'Monitor not found',
              }),
              {
                status: 404,
                headers: corsHeaders,
              }
            )
          }
          return new Response(JSON.stringify(monitor), {
            status: 200,
            headers: corsHeaders,
          })
        } catch (error) {
          console.error('Error fetching monitor:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to fetch monitor',
            }),
            {
              status: 500,
              headers: corsHeaders,
            }
          )
        }
      }

      // PUT /api/monitors/:id - Update a monitor
      if (method === 'PUT') {
        try {
          const body = (await req.json()) as UpdateMonitorRequest
          const updatedMonitor = repository.updateMonitor(
            monitorId,
            companyId,
            body
          )

          if (!updatedMonitor) {
            return new Response(
              JSON.stringify({
                error: 'Monitor not found',
              }),
              {
                status: 404,
                headers: corsHeaders,
              }
            )
          }

          return new Response(JSON.stringify(updatedMonitor), {
            status: 200,
            headers: corsHeaders,
          })
        } catch (error) {
          console.error('Error updating monitor:', error)
          return new Response(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to update monitor',
            }),
            {
              status: 400,
              headers: corsHeaders,
            }
          )
        }
      }

      // DELETE /api/monitors/:id - Delete a monitor
      if (method === 'DELETE') {
        try {
          const success = repository.deleteMonitor(monitorId, companyId)

          if (!success) {
            return new Response(
              JSON.stringify({
                error: 'Monitor not found',
              }),
              {
                status: 404,
                headers: corsHeaders,
              }
            )
          }

          return new Response(
            JSON.stringify({
              success: true,
              message: 'Monitor deleted successfully',
            }),
            {
              status: 200,
              headers: corsHeaders,
            }
          )
        } catch (error) {
          console.error('Error deleting monitor:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to delete monitor',
            }),
            {
              status: 500,
              headers: corsHeaders,
            }
          )
        }
      }
    }

    // Handle /api/monitors/:id/results requests
    const resultsMatch = pathname.match(/^\/api\/monitors\/([^/]+)\/results$/)
    if (resultsMatch) {
      const monitorId = resultsMatch[1]
      const limit = parseInt(url.searchParams.get('limit') || '50')

      // GET /api/monitors/:id/results - Get monitor history/results
      if (method === 'GET') {
        try {
          const results = repository.getMonitorHistory(
            monitorId,
            undefined,
            undefined,
            limit
          )
          return new Response(JSON.stringify(results), {
            status: 200,
            headers: corsHeaders,
          })
        } catch (error) {
          console.error('Error fetching monitor results:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to fetch monitor results',
            }),
            {
              status: 500,
              headers: corsHeaders,
            }
          )
        }
      }

      // POST /api/monitors/:id/results - Store a new monitor result
      if (method === 'POST') {
        try {
          const body = (await req.json()) as CreateResultRequest
          const result = repository.addMonitorHistory({
            monitorId,
            timestamp: body.timestamp || Date.now(),
            status: body.status,
            responseTime: body.responseTime || null,
            packetLoss: body.packetLoss,
            packetsTransmitted: body.packetCount || 3,
            packetsReceived: body.packetsReceived || 0,
            minLatency: body.responseTime || null,
            maxLatency: body.responseTime || null,
            avgLatency: body.avgLatency || body.responseTime || null,
            standardDeviation: 0,
          })

          return new Response(JSON.stringify(result), {
            status: 201,
            headers: corsHeaders,
          })
        } catch (error) {
          console.error('Error storing monitor result:', error)
          return new Response(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to store monitor result',
            }),
            {
              status: 400,
              headers: corsHeaders,
            }
          )
        }
      }
    }

    // If none of the above handlers matched, return 404
    return new Response(
      JSON.stringify({
        error: 'Not found',
      }),
      {
        status: 404,
        headers: corsHeaders,
      }
    )
  } catch (error) {
    console.error('ICMP Monitors API error:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    )
  }
}
