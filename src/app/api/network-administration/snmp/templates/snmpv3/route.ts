/**
 * SNMPv3 Template API Handler
 * Provides REST API endpoints for SNMPv3 template data
 */

import { SNMPv3TemplateRepository } from '@/database/snmp/templates/snmpv3/index'

export async function handleSNMPv3TemplateRequest(
  req: Request
): Promise<Response> {
  const repository = new SNMPv3TemplateRepository()
  const url = new URL(req.url)
  const method = req.method
  const pathname = url.pathname

  // Handle requests for a specific company's SNMPv3 templates
  if (
    pathname.startsWith('/api/network-administration/snmp/templates/snmpv3')
  ) {
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

    // Get all SNMPv3 templates for a company
    if (method === 'GET') {
      try {
        const templates = await repository.getForCompany(companyId)
        return new Response(JSON.stringify(templates), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error fetching SNMPv3 templates:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch SNMPv3 templates',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Create a new SNMPv3 template
    if (method === 'POST') {
      try {
        const data = await req.json()
        const template = repository.create(companyId, data)
        return new Response(JSON.stringify(template), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error creating SNMPv3 template:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to create SNMPv3 template',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Extract ID from path for specific SNMPv3 template operations
    const matches = pathname.match(
      /\/api\/network-administration\/snmp\/templates\/snmpv3\/([^\/]+)/
    )
    if (matches && matches[1]) {
      const _id = matches[1]

      // Get a specific SNMPv3 template
      if (method === 'GET') {
        try {
          const template = repository.getById(_id, companyId)
          if (!template) {
            return new Response(
              JSON.stringify({
                error: 'SNMPv3 template not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(template), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error fetching SNMPv3 template:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to fetch SNMPv3 template',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Update a specific SNMPv3 template
      if (method === 'PUT') {
        try {
          const data = await req.json()
          const template = repository.update(_id, companyId, data.input)

          if (!template) {
            return new Response(
              JSON.stringify({
                error: 'SNMPv3 template not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(template), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error updating SNMPv3 template:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to update SNMPv3 template',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Delete a specific SNMPv3 template
      if (method === 'DELETE') {
        try {
          const result = repository.delete(_id, companyId)

          if (!result) {
            return new Response(
              JSON.stringify({
                error: 'SNMPv3 template not found',
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
          console.error('Error deleting SNMPv3 template:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to delete SNMPv3 template',
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
