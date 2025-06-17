/**
 * SNMP MIB Browser API Handler
 * Provides REST API endpoints for browsing MIB structures of network devices
 */

import * as snmp from 'net-snmp'
import { SNMPOIDRepository } from '@/database/snmp/oid/index'
import { SNMPv2Repository } from '@/database/snmp/snmpv2/index'
import { SNMPv3Repository } from '@/database/snmp/snmpv3/index'

/**
 * Handles MIB browsing requests for network devices using SNMP
 */
export async function handleSNMPMIBRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const method = req.method
  const pathname = url.pathname

  // Handle requests for MIB browsing
  if (pathname.startsWith('/api/network-administration/snmp/mib') && method === 'POST') {
    try {
      const data = await req.json()
      const companyId = data.companyId

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

      // Extract required parameters
      const { host, oidPath, snmpVersion } = data

      if (!host) {
        return new Response(
          JSON.stringify({
            error: 'Missing host parameter',
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      // Default OID path if not provided
      const targetOidPath = oidPath || '1.3.6.1.2.1.1' // Default to system MIB

      let session
      let mibResults

      // Handle different SNMP versions
      if (snmpVersion === '3') {
        // SNMPv3 requires authentication parameters
        const {
          username,
          securityLevel,
          authProtocol,
          authKey,
          privProtocol,
          privKey
        } = data

        if (!username) {
          return new Response(
            JSON.stringify({
              error: 'SNMPv3 requires a username',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }

        // Configure SNMPv3 options
        const options: any = {
          port: data.port || 161,
          retries: 1,
          timeout: 5000,
          version: snmp.Version3,
          engineID: Buffer.from('', 'hex'),
          context: '',
        }

        // Set security level and corresponding options
        switch (securityLevel) {
          case 'authPriv':
            if (!authKey || !privKey) {
              return new Response(
                JSON.stringify({
                  error: 'authPriv security level requires both authKey and privKey',
                }),
                {
                  status: 400,
                  headers: { 'Content-Type': 'application/json' },
                }
              )
            }
            options.level = snmp.SecurityLevel.authPriv
            options.authProtocol = getAuthProtocol(authProtocol)
            options.authKey = authKey
            options.privProtocol = getPrivProtocol(privProtocol)
            options.privKey = privKey
            break
          case 'authNoPriv':
            if (!authKey) {
              return new Response(
                JSON.stringify({
                  error: 'authNoPriv security level requires authKey',
                }),
                {
                  status: 400,
                  headers: { 'Content-Type': 'application/json' },
                }
              )
            }
            options.level = snmp.SecurityLevel.authNoPriv
            options.authProtocol = getAuthProtocol(authProtocol)
            options.authKey = authKey
            break
          case 'noAuthNoPriv':
          default:
            options.level = snmp.SecurityLevel.noAuthNoPriv
            break
        }

        // Create SNMPv3 session
        try {
          session = snmp.createV3Session(host, {
            name: username,
            ...options
          })
          mibResults = await browseMIB(session, targetOidPath)
        } catch (error) {
          console.error('SNMPv3 session error:', error)
          return new Response(
            JSON.stringify({
              error: `Failed to create SNMPv3 session: ${error.message}`,
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      } else {
        // SNMPv1 or SNMPv2c
        const community = data.community || 'public'
        
        try {
          session = snmp.createSession(host, community, {
            port: data.port || 161,
            retries: 1,
            timeout: 5000,
            version: snmpVersion === '1' ? snmp.Version1 : snmp.Version2c,
          })
          mibResults = await browseMIB(session, targetOidPath)
        } catch (error) {
          console.error('SNMP session error:', error)
          return new Response(
            JSON.stringify({
              error: `Failed to create SNMP session: ${error.message}`,
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // Process any existing OIDs to add metadata
      const oidRepository = new SNMPOIDRepository()
      const existingOids = await oidRepository.getForCompany(companyId)
      
      // Add 'exists' flag to any OIDs that are already in the database
      const resultsWithMetadata = mibResults.map(item => {
        const existingOid = existingOids.find(oid => oid.oid === item.oid)
        return {
          ...item,
          existsInDatabase: !!existingOid,
          existingName: existingOid?.oidName,
          existingDescription: existingOid?.description
        }
      })

      // Return the results
      return new Response(JSON.stringify(resultsWithMetadata), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      console.error('Error in MIB browser:', error)
      return new Response(
        JSON.stringify({
          error: `Failed to browse MIB: ${error.message}`,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  }

  // If the request doesn't match any handler, return 404
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

/**
 * Performs an SNMP walk to browse the MIB tree at the specified OID path
 */
async function browseMIB(session, oidPath: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const results: any[] = []

    session.subtree(oidPath, 10, (varbinds) => {
      for (const vb of varbinds) {
        if (snmp.isVarbindError(vb)) {
          // Skip errors like endOfMibView
          continue
        }
        
        // Format the OID and add metadata about its type
        results.push({
          oid: vb.oid,
          value: formatValue(vb.value, vb.type),
          type: vb.type,
          typeName: getTypeName(vb.type),
          displayName: vb.oid.split('.').pop(), // Just the last part of the OID
        })
      }
    }, (error) => {
      if (error) {
        reject(error)
      } else {
        resolve(results)
      }
      
      // Close the session
      session.close()
    })
  })
}

/**
 * Maps SNMPv3 auth protocol strings to net-snmp constants
 */
function getAuthProtocol(protocol: string) {
  const protocols = {
    'MD5': snmp.AuthProtocols.md5,
    'SHA': snmp.AuthProtocols.sha,
    'SHA-224': snmp.AuthProtocols.sha224,
    'SHA-256': snmp.AuthProtocols.sha256,
    'SHA-384': snmp.AuthProtocols.sha384,
    'SHA-512': snmp.AuthProtocols.sha512,
  }
  
  return protocols[protocol] || snmp.AuthProtocols.md5
}

/**
 * Maps SNMPv3 privacy protocol strings to net-snmp constants
 */
function getPrivProtocol(protocol: string) {
  const protocols = {
    'DES': snmp.PrivProtocols.des,
    'AES': snmp.PrivProtocols.aes,
    'AES-256': snmp.PrivProtocols.aes256,
  }
  
  return protocols[protocol] || snmp.PrivProtocols.des
}

/**
 * Returns a human-readable name for SNMP data types
 */
function getTypeName(type: number): string {
  const typeMap = {
    1: 'Boolean',
    2: 'Integer',
    4: 'OctetString',
    5: 'Null',
    6: 'OID',
    64: 'IpAddress',
    65: 'Counter',
    66: 'Gauge',
    67: 'TimeTicks',
    68: 'Opaque',
    70: 'Counter64',
    128: 'NoSuchObject',
    129: 'NoSuchInstance',
    130: 'EndOfMibView'
  }
  
  return typeMap[type] || `Unknown(${type})`
}

/**
 * Formats SNMP values based on their type for display
 */
function formatValue(value: any, type: number): string {
  if (value === null || value === undefined) {
    return 'N/A'
  }
  
  // Handle special formats based on type
  switch (type) {
    case 4: // OctetString
      // Try to convert to string if it's a Buffer
      if (Buffer.isBuffer(value)) {
        // Check if it's printable ASCII
        const isPrintable = value.every(byte => byte >= 32 && byte <= 126)
        if (isPrintable) {
          return value.toString('utf8')
        } else {
          return value.toString('hex')
        }
      }
      return String(value)
    
    case 6: // OID
      return value.toString()
    
    case 64: // IpAddress
      // Format as IP address if it's a buffer
      if (Buffer.isBuffer(value) && value.length === 4) {
        return Array.from(value).join('.')
      }
      return String(value)
    
    case 67: // TimeTicks (convert to time format)
      // TimeTicks are in hundredths of a second
      const seconds = Math.floor(value / 100)
      const days = Math.floor(seconds / 86400)
      const hours = Math.floor((seconds % 86400) / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      const remainingSeconds = seconds % 60
      
      return `${days}d ${hours}h ${minutes}m ${remainingSeconds}s (${value} timeticks)`
    
    default:
      return String(value)
  }
}