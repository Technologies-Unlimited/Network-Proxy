/**
 * IP Subnet API Handler
 * Provides REST API endpoints for IP subnet data
 */

import { IPSubnetRepository } from '@/database/ipam/subnet/index'

export async function handleIPSubnetRequest(req: Request): Promise<Response> {
  const repository = new IPSubnetRepository()
  const url = new URL(req.url)
  const method = req.method
  const pathname = url.pathname

  // Handle requests for a specific company's IP subnets
  if (pathname.startsWith('/api/network-administration/ipam/subnet')) {
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

    // Get subnets by supernet ID if specified
    const supernetId = url.searchParams.get('supernetId')
    if (supernetId && method === 'GET') {
      try {
        const subnets = await repository.getBySupernetId(supernetId, companyId)
        return new Response(JSON.stringify(subnets), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error fetching IP subnets by supernet ID:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch IP subnets',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Get all IP subnets for a company
    if (method === 'GET') {
      try {
        const subnets = await repository.getForCompany(companyId)
        return new Response(JSON.stringify(subnets), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error fetching IP subnets:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch IP subnets',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Create a new IP subnet
    if (method === 'POST') {
      try {
        const data = await req.json()
        const subnet = repository.create(companyId, data)
        return new Response(JSON.stringify(subnet), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error creating IP subnet:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to create IP subnet',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Extract ID from path for specific IP subnet operations
    const matches = pathname.match(
      /\/api\/network-administration\/ipam\/subnet\/([^\/]+)/
    )
    if (matches && matches[1]) {
      const _id = matches[1]

      // Get a specific IP subnet
      if (method === 'GET') {
        try {
          const subnet = repository.getById(_id, companyId)
          if (!subnet) {
            return new Response(
              JSON.stringify({
                error: 'IP subnet not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(subnet), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error fetching IP subnet:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to fetch IP subnet',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Update a specific IP subnet
      if (method === 'PUT') {
        try {
          const data = await req.json()
          const subnet = repository.update(_id, companyId, data.input)

          if (!subnet) {
            return new Response(
              JSON.stringify({
                error: 'IP subnet not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(subnet), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error updating IP subnet:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to update IP subnet',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Delete a specific IP subnet
      if (method === 'DELETE') {
        try {
          const result = repository.delete(_id, companyId)

          if (!result) {
            return new Response(
              JSON.stringify({
                error: 'IP subnet not found',
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
          console.error('Error deleting IP subnet:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to delete IP subnet',
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
