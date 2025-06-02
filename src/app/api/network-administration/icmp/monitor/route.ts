/**
 * ICMP Monitor API Handler
 * Provides REST API endpoints for continuous ICMP monitoring
 */

import { ICMPMonitorRepository } from '@/database/icmp/monitor/index'
import { monitoringService } from '@/services/icmp-monitor'
import {
  ICMPMonitorFields,
  ICMPAlertRuleFields,
} from '@/schema/network-administration/icmp/monitor/schema'

export async function handleICMPMonitorRequest(
  req: Request
): Promise<Response> {
  const repository = new ICMPMonitorRepository()
  const url = new URL(req.url)
  const method = req.method
  const pathname = url.pathname

  // Handle requests for a specific company's ICMP monitors
  if (pathname.startsWith('/api/network-administration/icmp/monitor')) {
    const companyId = url.searchParams.get('companyId')

    if (!companyId) {
      return new Response(
        JSON.stringify({
          error: 'Missing companyId parameter',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Extract monitor ID from path
    const pathParts = pathname.split('/')
    const monitorIdIndex = pathParts.indexOf('monitor') + 1
    const monitorId = pathParts[monitorIdIndex]
    const subResource = pathParts[monitorIdIndex + 1]

    // Handle monitor history endpoint
    if (monitorId && subResource === 'history') {
      if (method === 'GET') {
        try {
          const startTime = url.searchParams.get('startTime')
          const endTime = url.searchParams.get('endTime')
          const limit = url.searchParams.get('limit')

          const history = repository.getMonitorHistory(
            monitorId,
            startTime ? parseInt(startTime) : undefined,
            endTime ? parseInt(endTime) : undefined,
            limit ? parseInt(limit) : undefined
          )

          return new Response(JSON.stringify(history), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error fetching monitor history:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to fetch monitor history',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }
    }

    // Handle alert rules endpoint
    if (monitorId && subResource === 'alerts') {
      if (method === 'GET') {
        try {
          const rules = repository.getAlertRules(monitorId)
          return new Response(JSON.stringify(rules), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error fetching alert rules:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to fetch alert rules',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      if (method === 'POST') {
        try {
          const data = (await req.json()) as Partial<ICMPAlertRuleFields>
          const rule = repository.createAlertRule(companyId, {
            ...data,
            monitorId,
          })
          return new Response(JSON.stringify(rule), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error creating alert rule:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to create alert rule',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }
    }

    // Handle active alerts endpoint
    if (pathname.endsWith('/active-alerts')) {
      if (method === 'GET') {
        try {
          const monitorId = url.searchParams.get('monitorId')
          const alerts = repository.getActiveAlerts(monitorId || undefined)
          return new Response(JSON.stringify(alerts), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error fetching active alerts:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to fetch active alerts',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }
    }

    // Handle specific monitor operations
    if (monitorId && !subResource) {
      // Get a specific monitor
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
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          // Add real-time status from monitoring service
          const status = monitoringService.getMonitorStatus(monitorId)
          const response = {
            ...monitor,
            nextRun: status?.nextRun,
          }

          return new Response(JSON.stringify(response), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error fetching monitor:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to fetch monitor',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Update a specific monitor
      if (method === 'PUT') {
        try {
          const data = (await req.json()) as Partial<ICMPMonitorFields>
          const monitor = repository.updateMonitor(monitorId, companyId, data)

          if (!monitor) {
            return new Response(
              JSON.stringify({
                error: 'Monitor not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          // Update in monitoring service
          if (monitor.status === 'active') {
            monitoringService.addMonitor(monitor)
          } else {
            monitoringService.removeMonitor(monitor._id)
          }

          return new Response(JSON.stringify(monitor), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error updating monitor:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to update monitor',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Delete a specific monitor
      if (method === 'DELETE') {
        try {
          const result = repository.deleteMonitor(monitorId, companyId)

          if (!result) {
            return new Response(
              JSON.stringify({
                error: 'Monitor not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          // Remove from monitoring service
          monitoringService.removeMonitor(monitorId)

          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error deleting monitor:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to delete monitor',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }
    }

    // Get all monitors for a company
    if (method === 'GET' && !monitorId) {
      try {
        const monitors = repository.getMonitorsForCompany(companyId)

        // Add real-time status from monitoring service
        const statuses = monitoringService.getAllMonitorStatuses()
        const statusMap = new Map(statuses.map(s => [s.monitor._id, s.nextRun]))

        const monitorsWithStatus = monitors.map(monitor => ({
          ...monitor,
          nextRun: statusMap.get(monitor._id),
        }))

        return new Response(JSON.stringify(monitorsWithStatus), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error fetching monitors:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch monitors',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Create a new monitor
    if (method === 'POST' && !monitorId) {
      try {
        const data = (await req.json()) as Partial<ICMPMonitorFields>
        const monitor = repository.createMonitor(companyId, data)

        // Add to monitoring service if active
        if (monitor.status === 'active') {
          monitoringService.addMonitor(monitor)
        }

        return new Response(JSON.stringify(monitor), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error creating monitor:', error)
        return new Response(
          JSON.stringify({
            error:
              error instanceof Error
                ? error.message
                : 'Failed to create monitor',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
    }
  )
}
