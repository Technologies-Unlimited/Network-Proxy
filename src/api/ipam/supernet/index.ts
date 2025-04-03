/**
 * IP Supernet API Handler
 * Provides REST API endpoints for IP supernet data
 */

import { IPSupernetRepository } from '@/database/ipam/supernet/index'

export async function handleIPSupernetRequest(req: Request): Promise<Response> {
  const repository = new IPSupernetRepository()
  const url = new URL(req.url)
  const method = req.method
  const pathname = url.pathname

  // Handle requests for a specific company's IP supernets
  if (pathname.startsWith('/api/network-administration/ipam/supernet')) {
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

    // Get all IP supernets for a company
    if (method === 'GET') {
      try {
        const supernets = await repository.getForCompany(companyId)
        return new Response(JSON.stringify(supernets), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error fetching IP supernets:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch IP supernets',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Create a new IP supernet
    if (method === 'POST') {
      try {
        const data = await req.json()
        const supernet = repository.create(companyId, data)
        return new Response(JSON.stringify(supernet), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error creating IP supernet:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to create IP supernet',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Extract ID from path for specific IP supernet operations
    const matches = pathname.match(
      /\/api\/network-administration\/ipam\/supernet\/([^\/]+)/
    )
    if (matches && matches[1]) {
      const _id = matches[1]

      // Get a specific IP supernet
      if (method === 'GET') {
        try {
          const supernet = repository.getById(_id, companyId)
          if (!supernet) {
            return new Response(
              JSON.stringify({
                error: 'IP supernet not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(supernet), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error fetching IP supernet:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to fetch IP supernet',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Update a specific IP supernet
      if (method === 'PUT') {
        try {
          const data = await req.json()
          const supernet = repository.update(_id, companyId, data.input)

          if (!supernet) {
            return new Response(
              JSON.stringify({
                error: 'IP supernet not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(supernet), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error updating IP supernet:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to update IP supernet',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Delete a specific IP supernet
      if (method === 'DELETE') {
        try {
          const result = repository.delete(_id, companyId)

          if (!result) {
            return new Response(
              JSON.stringify({
                error: 'IP supernet not found',
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
          console.error('Error deleting IP supernet:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to delete IP supernet',
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
