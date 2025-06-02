/**
 * ICMP Alerts API Handler
 * Provides REST API endpoints for ICMP alert management
 */

import { ICMPMonitorRepository } from '@/database/icmp/monitor/index'

export async function handleICMPAlertsRequest(req: Request): Promise<Response> {
  const repository = new ICMPMonitorRepository()
  const url = new URL(req.url)
  const method = req.method
  const pathname = url.pathname

  try {
    // Initialize tables if needed
    repository.initTables()

    // Handle /api/alerts requests
    if (pathname === '/api/alerts') {
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

      // GET /api/alerts - Get all active alerts for a company
      if (method === 'GET') {
        try {
          const alerts = repository.getActiveAlerts()
          // Filter by company by checking monitor ownership
          const monitors = repository.getMonitorsForCompany(companyId)
          const monitorIds = new Set(monitors.map(m => m._id))
          
          const companyAlerts = alerts.filter(alert => 
            monitorIds.has(alert.monitorId)
          )
          
          return new Response(JSON.stringify(companyAlerts), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error fetching alerts:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to fetch alerts',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // POST /api/alerts - Create a new alert
      if (method === 'POST') {
        try {
          const body = await req.json()
          
          // Verify the monitor belongs to the company
          const monitor = repository.getMonitorById(body.monitorId, companyId)
          if (!monitor) {
            return new Response(
              JSON.stringify({
                error: 'Monitor not found or not accessible',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          const alertData = {
            alertRuleId: `rule-${body.monitorId}-${body.severity}`, // Generate a rule ID
            monitorId: body.monitorId,
            triggeredAt: Date.now(),
            resolvedAt: undefined,
            severity: body.severity,
            condition: body.condition,
            value: body.value,
            threshold: body.threshold,
            notificationsSent: [],
          }
          
          const newAlert = repository.createAlertHistory(alertData)
          
          return new Response(JSON.stringify(newAlert), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error creating alert:', error)
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Failed to create alert',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }
    }

    // Handle /api/alerts/:id requests
    const alertIdMatch = pathname.match(/^\/api\/alerts\/([^\/]+)$/)
    if (alertIdMatch) {
      const alertId = alertIdMatch[1]

      // PUT /api/alerts/:id - Update an alert (usually to resolve it)
      if (method === 'PUT') {
        try {
          const body = await req.json()
          
          let success = false
          
          if (body.status === 'resolved') {
            // Resolve the alert
            success = repository.resolveAlert(alertId)
          }
          
          if (!success) {
            return new Response(
              JSON.stringify({
                error: 'Alert not found or already resolved',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(
            JSON.stringify({
              success: true,
              message: 'Alert updated successfully',
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        } catch (error) {
          console.error('Error updating alert:', error)
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Failed to update alert',
            }),
            {
              status: 400,
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

  } catch (error) {
    console.error('ICMP Alerts API error:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
} 