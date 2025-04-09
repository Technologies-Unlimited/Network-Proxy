/**
 * IP Address API Handler
 * Provides REST API endpoints for IP address data
 */

import { IPAddressRepository } from '@/database/ipam/ipaddress/index'

export async function handleIPAddressRequest(req: Request): Promise<Response> {
  const repository = new IPAddressRepository()
  const url = new URL(req.url)
  const method = req.method
  const pathname = url.pathname

  // Handle requests for a specific company's IP addresses
  if (pathname.startsWith('/api/network-administration/ipam/ipaddress')) {
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

    // Get IP addresses by pool ID if specified
    const poolId = url.searchParams.get('poolId')
    if (poolId && method === 'GET') {
      try {
        const addresses = await repository.getByPoolId(poolId, companyId)
        return new Response(JSON.stringify(addresses), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error fetching IP addresses by pool ID:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch IP addresses',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Get IP addresses by subnet ID if specified
    const subnetId = url.searchParams.get('subnetId')
    if (subnetId && method === 'GET') {
      try {
        const addresses = await repository.getBySubnetId(subnetId, companyId)
        return new Response(JSON.stringify(addresses), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error fetching IP addresses by subnet ID:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch IP addresses',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Get all IP addresses for a company
    if (method === 'GET') {
      try {
        const addresses = await repository.getForCompany(companyId)
        return new Response(JSON.stringify(addresses), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error fetching IP addresses:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch IP addresses',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Create a new IP address
    if (method === 'POST') {
      try {
        const data = await req.json()
        const address = repository.create(companyId, data)
        return new Response(JSON.stringify(address), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error creating IP address:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to create IP address',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Extract ID from path for specific IP address operations
    const matches = pathname.match(
      /\/api\/network-administration\/ipam\/ipaddress\/([^\/]+)/
    )
    if (matches && matches[1]) {
      const _id = matches[1]

      // Get a specific IP address
      if (method === 'GET') {
        try {
          const address = repository.getById(_id, companyId)
          if (!address) {
            return new Response(
              JSON.stringify({
                error: 'IP address not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(address), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error fetching IP address:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to fetch IP address',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Update a specific IP address
      if (method === 'PUT') {
        try {
          const data = await req.json()
          const address = repository.update(_id, companyId, data.input)

          if (!address) {
            return new Response(
              JSON.stringify({
                error: 'IP address not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(address), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error updating IP address:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to update IP address',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Delete a specific IP address
      if (method === 'DELETE') {
        try {
          const result = repository.delete(_id, companyId)

          if (!result) {
            return new Response(
              JSON.stringify({
                error: 'IP address not found',
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
          console.error('Error deleting IP address:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to delete IP address',
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
