/**
 * SNMP OID API Handler
 * Provides REST API endpoints for SNMP OID data
 */

import { SNMPOIDRepository } from '@/database/snmp/oid/index'

export async function handleSNMPOIDRequest(req: Request): Promise<Response> {
  const repository = new SNMPOIDRepository()
  const url = new URL(req.url)
  const method = req.method
  const pathname = url.pathname

  // Handle requests for a specific company's SNMP OIDs
  if (pathname.startsWith('/api/network-administration/snmp/oid')) {
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

    // Get all SNMP OIDs for a company
    if (method === 'GET') {
      try {
        const oids = await repository.getForCompany(companyId)
        return new Response(JSON.stringify(oids), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error fetching SNMP OIDs:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch SNMP OIDs',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Create a new SNMP OID
    if (method === 'POST') {
      try {
        const data = await req.json()
        const oid = repository.create(companyId, data)
        return new Response(JSON.stringify(oid), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error creating SNMP OID:', error)
        return new Response(
          JSON.stringify({
            error: 'Failed to create SNMP OID',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Extract ID from path for specific SNMP OID operations
    const matches = pathname.match(
      /\/api\/network-administration\/snmp\/oid\/([^\/]+)/
    )
    if (matches && matches[1]) {
      const _id = matches[1]

      // Get a specific SNMP OID
      if (method === 'GET') {
        try {
          const oid = repository.getById(_id, companyId)
          if (!oid) {
            return new Response(
              JSON.stringify({
                error: 'SNMP OID not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(oid), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error fetching SNMP OID:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to fetch SNMP OID',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Update a specific SNMP OID
      if (method === 'PUT') {
        try {
          const data = await req.json()
          const oid = repository.update(_id, companyId, data.input)

          if (!oid) {
            return new Response(
              JSON.stringify({
                error: 'SNMP OID not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          return new Response(JSON.stringify(oid), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error updating SNMP OID:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to update SNMP OID',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Delete a specific SNMP OID
      if (method === 'DELETE') {
        try {
          const result = repository.delete(_id, companyId)

          if (!result) {
            return new Response(
              JSON.stringify({
                error: 'SNMP OID not found',
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
          console.error('Error deleting SNMP OID:', error)
          return new Response(
            JSON.stringify({
              error: 'Failed to delete SNMP OID',
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
