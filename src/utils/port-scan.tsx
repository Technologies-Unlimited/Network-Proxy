import { ExtendedSubnetFields } from '../../schema/network-administration/ipam/subnet/schema'
import { ExtendedPoolFields } from '../../schema/network-administration/ipam/pool/schema'
import { getIpAddressesInRange, isValidIpAddress } from './ip-utils'
import net from 'net'

interface PortScanResult {
  port: number
  status: 'open' | 'closed' | 'filtered' | 'error'
  service: string | null
}

interface IPAddressPortScanResult {
  address: string
  portScanResults: PortScanResult[]
}

export async function scanSubnetPoolPorts(
  subnet: ExtendedSubnetFields,
  pool: ExtendedPoolFields,
  onStart?: () => void,
  onProgress?: (progress: number) => void,
  onStop?: () => void
): Promise<IPAddressPortScanResult[]> {
  const ipAddresses = getIpAddressesInRange(pool.startIp, pool.endIp)
  const totalAddresses = ipAddresses.length

  if (onStart) {
    onStart()
  }

  const scanPromises = ipAddresses.map(async (ip, index) => {
    if (!isValidIpAddress(ip)) {
      console.warn(`Invalid IP address: ${ip}`)
      return null
    }

    const portScanResults = await performPortScan(ip)

    if (onProgress) {
      onProgress((index + 1) / totalAddresses)
    }

    return {
      address: ip,
      portScanResults,
    }
  })

  const scanResults = await Promise.all(scanPromises)

  if (onStop) {
    onStop()
  }

  return scanResults.filter(
    (result): result is IPAddressPortScanResult => result !== null
  )
}

async function performPortScan(ip: string): Promise<PortScanResult[]> {
  const results: PortScanResult[] = []
  const maxPort = 65535

  for (let port = 1; port <= maxPort; port++) {
    try {
      const socket = new net.Socket()
      const status = await new Promise<'open' | 'closed' | 'filtered'>(
        resolve => {
          socket.setTimeout(1000)
          socket.on('connect', () => {
            socket.destroy()
            resolve('open')
          })
          socket.on('timeout', () => {
            socket.destroy()
            resolve('filtered')
          })
          socket.on('error', error => {
            socket.destroy()
            if (error.message.includes('ECONNREFUSED')) {
              resolve('closed')
            } else {
              resolve('filtered')
            }
          })
          socket.connect(port, ip)
        }
      )

      results.push({
        port,
        status,
        service: getServiceName(port),
      })
    } catch (error) {
      console.error(`Port scan failed for ${ip}:${port}:`, error)
      results.push({
        port,
        status: 'error',
        service: null,
      })
    }
  }

  return results
}

function getServiceName(port: number): string | null {
  const commonPorts: { [key: number]: string } = {
    21: 'FTP',
    22: 'SSH',
    23: 'Telnet',
    25: 'SMTP',
    53: 'DNS',
    80: 'HTTP',
    110: 'POP3',
    143: 'IMAP',
    443: 'HTTPS',
    3389: 'RDP',
    // Add more as needed
  }

  return commonPorts[port] || null
}
