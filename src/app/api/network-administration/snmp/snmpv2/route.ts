/**
 * SNMPv2 API Handler
 * Provides REST API endpoints for SNMPv2 settings data
 */

import { SNMPv2Repository } from '@/database/snmp/snmpv2/index'

export async function handleSNMPv2Request(req: Request): Promise<Response> {
  const repository = new SNMPv2Repository()
  const url = new URL(req.url)
  const method = req.method
  const pathname = url.pathname

  // Handle requests for a specific company's SNMPv2 settings
  if (pathname.startsWith('/api/network-administration/snmp/snmpv2')) {
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

    // Get all SNMPv2 settings for a company
    if (method === 'GET') {
      try {
        const settings = await repository.getForCompany(companyId)
        return new Response(JSON.stringify(settings), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error fetching SNMPv2 settings:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch SNMPv2 settings',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Create a new SNMPv2 setting
    if (method === 'POST') {
      try {
        const data = await req.json()
        const setting = repository.create(companyId, data)
        return new Response(JSON.stringify(setting), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error creating SNMPv2 setting:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to create SNMPv2 setting',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Extract ID from path for specific SNMPv2 setting operations
    const matches = pathname.match(
      /\/api\/network-administration\/snmp\/snmpv2\/([^\/]+)/
    )
    if (matches && matches[1]) {
      const _id = matches[1]

      // Get a specific SNMPv2 setting
      if (method === 'GET') {
        try {
          const setting = repository.getById(_id, companyId)
          if (!setting) {
            return new Response(
              JSON.stringify({
                error: 'SNMPv2 setting not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(setting), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error fetching SNMPv2 setting:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to fetch SNMPv2 setting',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Update a specific SNMPv2 setting
      if (method === 'PUT') {
        try {
          const data = await req.json()
          const setting = repository.update(_id, companyId, data.input)

          if (!setting) {
            return new Response(
              JSON.stringify({
                error: 'SNMPv2 setting not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(setting), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error updating SNMPv2 setting:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to update SNMPv2 setting',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Delete a specific SNMPv2 setting
      if (method === 'DELETE') {
        try {
          const result = repository.delete(_id, companyId)

          if (!result) {
            return new Response(
              JSON.stringify({
                error: 'SNMPv2 setting not found',
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
          console.error('Error deleting SNMPv2 setting:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to delete SNMPv2 setting',
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
