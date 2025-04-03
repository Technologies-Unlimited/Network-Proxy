/**
 * Inventory API Handler
 * Provides REST API endpoints for company network inventory data
 */

import { CompanyNetworkInventoryRepository } from '@/database/inventory/index'

export async function handleInventoryRequest(req: Request): Promise<Response> {
  const repository = new CompanyNetworkInventoryRepository()
  const url = new URL(req.url)
  const method = req.method
  const pathname = url.pathname

  // Handle requests for a specific company's network inventory
  if (pathname.startsWith('/api/network-administration/inventory')) {
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

    // Get all inventory items for a company
    if (method === 'GET') {
      try {
        const inventoryItems = await repository.getForCompany(companyId)
        return new Response(JSON.stringify(inventoryItems), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error fetching inventory items:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch inventory items',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Create a new inventory item
    if (method === 'POST') {
      try {
        const data = await req.json()
        const inventoryItem = repository.create(companyId, data)
        return new Response(JSON.stringify(inventoryItem), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error creating inventory item:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to create inventory item',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Extract ID from path for specific inventory item operations
    const matches = pathname.match(
      /\/api\/network-administration\/inventory\/([^\/]+)/
    )
    if (matches && matches[1]) {
      const _id = matches[1]

      // Get a specific inventory item
      if (method === 'GET') {
        try {
          const inventoryItem = repository.getById(_id, companyId)
          if (!inventoryItem) {
            return new Response(
              JSON.stringify({
                error: 'Inventory item not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(inventoryItem), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error fetching inventory item:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to fetch inventory item',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Update a specific inventory item
      if (method === 'PUT') {
        try {
          const data = await req.json()
          const inventoryItem = repository.update(_id, companyId, data.input)

          if (!inventoryItem) {
            return new Response(
              JSON.stringify({
                error: 'Inventory item not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(inventoryItem), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error updating inventory item:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to update inventory item',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Delete a specific inventory item
      if (method === 'DELETE') {
        try {
          const result = repository.delete(_id, companyId)

          if (!result) {
            return new Response(
              JSON.stringify({
                error: 'Inventory item not found',
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
          console.error('Error deleting inventory item:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to delete inventory item',
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
