/**
 * VLAN API Handler
 * Provides REST API endpoints for VLAN data
 */

import { VLANRepository } from '@/database/ipam/vlan/index'

export async function handleVLANRequest(req: Request): Promise<Response> {
  const repository = new VLANRepository()
  const url = new URL(req.url)
  const method = req.method
  const pathname = url.pathname

  // Handle requests for a specific company's VLANs
  if (pathname.startsWith('/api/network-administration/ipam/vlan')) {
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

    // Get all VLANs for a company
    if (method === 'GET') {
      try {
        const vlans = await repository.getForCompany(companyId)
        return new Response(JSON.stringify(vlans), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error fetching VLANs:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch VLANs',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Create a new VLAN
    if (method === 'POST') {
      try {
        const data = await req.json()
        const vlan = repository.create(companyId, data)
        return new Response(JSON.stringify(vlan), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error creating VLAN:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to create VLAN',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Extract ID from path for specific VLAN operations
    const matches = pathname.match(
      /\/api\/network-administration\/ipam\/vlan\/([^\/]+)/
    )
    if (matches && matches[1]) {
      const _id = matches[1]

      // Get a specific VLAN
      if (method === 'GET') {
        try {
          const vlan = repository.getById(_id, companyId)
          if (!vlan) {
            return new Response(
              JSON.stringify({
                error: 'VLAN not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(vlan), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error fetching VLAN:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to fetch VLAN',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Update a specific VLAN
      if (method === 'PUT') {
        try {
          const data = await req.json()
          const vlan = repository.update(_id, companyId, data.input)

          if (!vlan) {
            return new Response(
              JSON.stringify({
                error: 'VLAN not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(vlan), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error updating VLAN:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to update VLAN',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Delete a specific VLAN
      if (method === 'DELETE') {
        try {
          const result = repository.delete(_id, companyId)

          if (!result) {
            return new Response(
              JSON.stringify({
                error: 'VLAN not found',
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
          console.error('Error deleting VLAN:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to delete VLAN',
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
