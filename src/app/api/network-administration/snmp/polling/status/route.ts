/**
 * SNMP Polling Status API Handler
 * Provides REST API endpoints for SNMP polling status data
 */

import { SNMPPollingStatusRepository } from '@/database/snmp/polling/status/index'

export async function handleSNMPPollingStatusRequest(
  req: Request
): Promise<Response> {
  const repository = new SNMPPollingStatusRepository()
  const url = new URL(req.url)
  const method = req.method
  const pathname = url.pathname

  // Handle requests for a specific company's SNMP polling statuses
  if (pathname.startsWith('/api/network-administration/snmp/polling/status')) {
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

    // Get all SNMP polling statuses for a company
    if (method === 'GET') {
      try {
        const statuses = await repository.getForCompany(companyId)
        return new Response(JSON.stringify(statuses), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error fetching SNMP polling statuses:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch SNMP polling statuses',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Create a new SNMP polling status
    if (method === 'POST') {
      try {
        const data = await req.json()
        const status = repository.create(companyId, data)
        return new Response(JSON.stringify(status), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error creating SNMP polling status:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to create SNMP polling status',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Extract ID from path for specific SNMP polling status operations
    const matches = pathname.match(
      /\/api\/network-administration\/snmp\/polling\/status\/([^\/]+)/
    )
    if (matches && matches[1]) {
      const _id = matches[1]

      // Get a specific SNMP polling status
      if (method === 'GET') {
        try {
          const status = repository.getById(_id, companyId)
          if (!status) {
            return new Response(
              JSON.stringify({
                error: 'SNMP polling status not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(status), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error fetching SNMP polling status:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to fetch SNMP polling status',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Update a specific SNMP polling status
      if (method === 'PUT') {
        try {
          const data = await req.json()
          const status = repository.update(_id, companyId, data.input)

          if (!status) {
            return new Response(
              JSON.stringify({
                error: 'SNMP polling status not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(status), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error updating SNMP polling status:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to update SNMP polling status',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Delete a specific SNMP polling status
      if (method === 'DELETE') {
        try {
          const result = repository.delete(_id, companyId)

          if (!result) {
            return new Response(
              JSON.stringify({
                error: 'SNMP polling status not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(true), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error deleting SNMP polling status:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to delete SNMP polling status',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
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
