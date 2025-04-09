/**
 * ICMP Polling Templates API Handler
 * Provides REST API endpoints for ICMP polling templates data
 */

import { ICMPPollingTemplateRepository } from '@/database/icmp/polling/templates/index'

export async function handleICMPPollingTemplatesRequest(
  req: Request
): Promise<Response> {
  const repository = new ICMPPollingTemplateRepository()
  const url = new URL(req.url)
  const method = req.method
  const pathname = url.pathname

  // Handle requests for a specific company's ICMP polling templates
  if (
    pathname.startsWith('/api/network-administration/icmp/polling/templates')
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

    // Get all ICMP polling templates for a company
    if (method === 'GET') {
      try {
        const templates = await repository.getForCompany(companyId)
        return new Response(JSON.stringify(templates), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error fetching ICMP polling templates:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch ICMP polling templates',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Create a new ICMP polling template
    if (method === 'POST') {
      try {
        const data = await req.json()
        const template = repository.create(companyId, data)
        return new Response(JSON.stringify(template), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error creating ICMP polling template:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to create ICMP polling template',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Extract ID from path for specific ICMP polling template operations
    const matches = pathname.match(
      /\/api\/network-administration\/icmp\/polling\/templates\/([^\/]+)/
    )
    if (matches && matches[1]) {
      const _id = matches[1]

      // Get a specific ICMP polling template
      if (method === 'GET') {
        try {
          const template = repository.getById(_id, companyId)
          if (!template) {
            return new Response(
              JSON.stringify({
                error: 'ICMP polling template not found',
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
          console.error('Error fetching ICMP polling template:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to fetch ICMP polling template',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Update a specific ICMP polling template
      if (method === 'PUT') {
        try {
          const data = await req.json()
          const template = repository.update(_id, companyId, data.input)

          if (!template) {
            return new Response(
              JSON.stringify({
                error: 'ICMP polling template not found',
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
          console.error('Error updating ICMP polling template:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to update ICMP polling template',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Delete a specific ICMP polling template
      if (method === 'DELETE') {
        try {
          const result = repository.delete(_id, companyId)

          if (!result) {
            return new Response(
              JSON.stringify({
                error: 'ICMP polling template not found',
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
          console.error('Error deleting ICMP polling template:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to delete ICMP polling template',
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
