/**
 * IP Pool API Handler
 * Provides REST API endpoints for IP pool data
 */

import { IPPoolRepository } from '@/database/ipam/pool/index'

export async function handleIPPoolRequest(req: Request): Promise<Response> {
  const repository = new IPPoolRepository()
  const url = new URL(req.url)
  const method = req.method
  const pathname = url.pathname

  // Handle requests for a specific company's IP pools
  if (pathname.startsWith('/api/network-administration/ipam/pool')) {
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

    // Get pools by subnet ID if specified
    const subnetId = url.searchParams.get('subnetId')
    if (subnetId && method === 'GET') {
      try {
        const pools = await repository.getBySubnetId(subnetId, companyId)
        return new Response(JSON.stringify(pools), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error fetching IP pools by subnet ID:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch IP pools',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Get all IP pools for a company
    if (method === 'GET') {
      try {
        const pools = await repository.getForCompany(companyId)
        return new Response(JSON.stringify(pools), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error fetching IP pools:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch IP pools',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Create a new IP pool
    if (method === 'POST') {
      try {
        const data = await req.json()
        const pool = repository.create(companyId, data)
        return new Response(JSON.stringify(pool), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error creating IP pool:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to create IP pool',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Extract ID from path for specific IP pool operations
    const matches = pathname.match(
      /\/api\/network-administration\/ipam\/pool\/([^\/]+)/
    )
    if (matches && matches[1]) {
      const _id = matches[1]

      // Get a specific IP pool
      if (method === 'GET') {
        try {
          const pool = repository.getById(_id, companyId)
          if (!pool) {
            return new Response(
              JSON.stringify({
                error: 'IP pool not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(pool), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error fetching IP pool:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to fetch IP pool',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Update a specific IP pool
      if (method === 'PUT') {
        try {
          const data = await req.json()
          const pool = repository.update(_id, companyId, data.input)

          if (!pool) {
            return new Response(
              JSON.stringify({
                error: 'IP pool not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(pool), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error updating IP pool:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to update IP pool',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Delete a specific IP pool
      if (method === 'DELETE') {
        try {
          const result = repository.delete(_id, companyId)

          if (!result) {
            return new Response(
              JSON.stringify({
                error: 'IP pool not found',
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
          console.error('Error deleting IP pool:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to delete IP pool',
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
