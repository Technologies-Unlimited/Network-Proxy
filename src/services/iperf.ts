/**
 * iPerf3 Service for Network-Proxy
 * This service provides functionality to run iperf3 tests between network proxy servers
 * and automatically discover iperf servers on the local network
 */

import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import { v4 as uuidv4 } from 'uuid'
import { discoverAllIperfServers, DiscoveredService } from './network-discovery'

const execAsync = promisify(exec)

// Define type for test parameters
export interface IperfTestParams {
  sourceServerId: string
  destinationServerId: string
  duration?: number
  protocol?: 'tcp' | 'udp'
  parallel?: number
  windowSize?: number
  port?: number
  bidirectional?: boolean
  reverse?: boolean
  bandwidth?: number  // For UDP tests, in Mbps
  buffer?: number     // Buffer length in KB
  interval?: number   // Reporting interval in seconds
  mss?: number        // Maximum segment size
  tos?: number        // Type of service value
  zerocopy?: boolean  // Use zero-copy method
  title?: string      // Test title
}

// Define types for test results
export interface IperfResult {
  startTime: number
  endTime: number
  transfer: string
  bandwidth: string
  retransmits?: number
  jitter?: number
  lostPackets?: string
  packetLoss?: string
}

export interface IperfSummary {
  duration: number
  transfer: string
  bandwidth: string
  jitter?: string
  lostPackets?: string
  packetLoss?: string
}

export interface IperfTest {
  id: string
  status: 'running' | 'completed' | 'failed' | 'stopped'
  params: IperfTestParams
  results: IperfResult[]
  summary?: IperfSummary
  error?: string
  startTime: number
  endTime?: number
}

// Active tests map
const activeTests: Map<string, IperfTest> = new Map()

/**
 * Get server details from the database
 * @param serverId The ID of the server
 * @returns The server IP address or hostname
 */
async function getServerAddress(serverId: string): Promise<string> {
  // In a real implementation, this would fetch the server details from the database
  // For now, we'll assume the serverId is a valid IP address or hostname
  return serverId
}

/**
 * Run an iperf3 test with the given parameters
 * @param params Test parameters
 * @returns The test result
 */
export async function runIperfTest(params: IperfTestParams): Promise<IperfTest> {
  const testId = uuidv4()
  
  // Get server addresses
  const sourceServer = await getServerAddress(params.sourceServerId)
  const destServer = await getServerAddress(params.destinationServerId)
  
  // Set default values
  const protocol = params.protocol || 'tcp'
  const duration = params.duration || 10
  const parallel = params.parallel || 1
  const windowSize = params.windowSize || 128
  const port = params.port || 5201
  const bidirectional = params.bidirectional || false
  const reverse = params.reverse || false
  const bandwidth = params.bandwidth || 0  // 0 means unlimited for TCP
  const buffer = params.buffer || 0        // 0 means system default
  const interval = params.interval || 1    // Default 1 second reporting interval
  
  // Create test object
  const test: IperfTest = {
    id: testId,
    status: 'running',
    params,
    results: [],
    startTime: Date.now(),
  }
  
  // Store in active tests
  activeTests.set(testId, test)
  
  try {
    console.log(`Starting iperf3 test from ${sourceServer} to ${destServer}`)
    
    // Start iperf3 server on destination server
    // In a real-world scenario, you would SSH to the destination server and start iperf3 in server mode
    // For this implementation, we'll assume iperf3 is already running in server mode on the destination
    
    // Build iperf3 command args
    const args: string[] = []
    
    // Client mode
    args.push('-c', destServer)
    
    // Protocol
    if (protocol === 'udp') {
      args.push('-u')
      
      // For UDP, set bandwidth if specified
      if (bandwidth > 0) {
        args.push('-b', `${bandwidth}M`)
      }
    }
    
    // Test duration
    args.push('-t', duration.toString())
    
    // Parallel streams
    if (parallel > 1) {
      args.push('-P', parallel.toString())
    }
    
    // Window size
    if (windowSize > 0) {
      args.push('-w', `${windowSize}K`)
    }
    
    // Port
    args.push('-p', port.toString())
    
    // Bidirectional test
    if (bidirectional) {
      args.push('--bidir')
    }
    
    // Reverse mode (server sends, client receives)
    if (reverse) {
      args.push('-R')
    }
    
    // Buffer length
    if (buffer > 0) {
      args.push('-l', `${buffer}K`)
    }
    
    // JSON output
    args.push('-J')
    
    // Interval
    args.push('-i', interval.toString())
    
    // MSS (Maximum segment size)
    if (params.mss) {
      args.push('-M', params.mss.toString())
    }
    
    // Type of service
    if (params.tos) {
      args.push('-S', params.tos.toString())
    }
    
    // Zero-copy
    if (params.zerocopy) {
      args.push('-Z')
    }
    
    // Test title
    if (params.title) {
      args.push('-T', params.title)
    }
    
    console.log(`Running iperf3 command: iperf3 ${args.join(' ')}`)
    
    // Execute iperf3 command
    const iperf = spawn('iperf3', args)
    let output = ''
    
    // Handle stdout data
    iperf.stdout.on('data', (data) => {
      const chunk = data.toString()
      output += chunk
      
      // Try to parse interval results from the output
      try {
        // Look for interval updates in the output
        if (chunk.includes('"intervals"')) {
          const match = /{"intervals":\[{"streams":\[.*?"end":([\d.]+),"seconds":([\d.]+),"bytes":([\d]+),"bits_per_second":([\d.]+)(,"retransmits":([\d]+))?/g.exec(chunk)
          
          if (match) {
            const endTime = parseFloat(match[1])
            const seconds = parseFloat(match[2])
            const bytes = parseInt(match[3], 10)
            const bitsPerSecond = parseFloat(match[4])
            const retransmits = match[6] ? parseInt(match[6], 10) : undefined
            
            const startTime = endTime - seconds
            
            // Format transfer and bandwidth
            const transfer = formatBytes(bytes)
            const bandwidth = formatBits(bitsPerSecond)
            
            const result: IperfResult = {
              startTime: Math.round(startTime),
              endTime: Math.round(endTime),
              transfer,
              bandwidth,
              retransmits
            }
            
            // Update test results
            test.results.push(result)
            activeTests.set(testId, test)
          }
        }
      } catch (error) {
        console.error('Error parsing iperf3 output:', error)
      }
    })
    
    // Handle stderr data
    iperf.stderr.on('data', (data) => {
      console.error(`iperf3 stderr: ${data}`)
    })
    
    // Handle process completion
    const exitCode = await new Promise<number>((resolve) => {
      iperf.on('close', resolve)
    })
    
    test.endTime = Date.now()
    
    if (exitCode !== 0) {
      console.error(`iperf3 process exited with code ${exitCode}`)
      test.status = 'failed'
      test.error = `iperf3 process exited with code ${exitCode}`
    } else {
      test.status = 'completed'
      
      // Parse JSON output for summary
      try {
        const jsonStartIndex = output.indexOf('{')
        const jsonEndIndex = output.lastIndexOf('}') + 1
        
        if (jsonStartIndex >= 0 && jsonEndIndex > jsonStartIndex) {
          const jsonStr = output.substring(jsonStartIndex, jsonEndIndex)
          const result = JSON.parse(jsonStr)
          
          // Extract summary from JSON result
          if (result.end) {
            const summaryData = protocol === 'tcp' ? result.end.sum_sent : result.end.sum
            
            test.summary = {
              duration: result.end.sum.seconds,
              transfer: formatBytes(summaryData.bytes),
              bandwidth: formatBits(summaryData.bits_per_second)
            }
            
            // Add UDP-specific fields if applicable
            if (protocol === 'udp') {
              test.summary.jitter = `${result.end.sum.jitter_ms.toFixed(3)} ms`
              test.summary.lostPackets = `${result.end.sum.lost_packets} / ${result.end.sum.packets}`
              test.summary.packetLoss = `${result.end.sum.lost_percent.toFixed(2)}%`
            }
          }
        }
      } catch (error) {
        console.error('Error parsing iperf3 JSON output:', error)
      }
    }
    
    // Update active tests map
    activeTests.set(testId, test)
    
    console.log(`iperf3 test completed with status: ${test.status}`)
    return test
  } catch (error) {
    console.error('Error running iperf3 test:', error)
    
    test.status = 'failed'
    test.error = error instanceof Error ? error.message : String(error)
    test.endTime = Date.now()
    
    activeTests.set(testId, test)
    return test
  }
}

/**
 * Stop a running iperf3 test
 * @param testId The ID of the test to stop
 * @returns Success status
 */
export async function stopIperfTest(testId: string): Promise<boolean> {
  const test = activeTests.get(testId)
  
  if (!test || test.status !== 'running') {
    return false
  }
  
  try {
    // Find and kill the iperf3 process
    // This implementation is platform-specific and may need adjustment
    const isWindows = process.platform === 'win32'
    
    if (isWindows) {
      await execAsync(`taskkill /F /IM iperf3.exe`)
    } else {
      await execAsync(`pkill -f "iperf3 -c ${test.params.destinationServerId}"`)
    }
    
    test.status = 'stopped'
    test.endTime = Date.now()
    activeTests.set(testId, test)
    
    console.log(`iperf3 test ${testId} stopped successfully`)
    return true
  } catch (error) {
    console.error(`Failed to stop iperf3 test ${testId}:`, error)
    return false
  }
}

/**
 * Get the status of an iperf3 test
 * @param testId The ID of the test
 * @returns The test status
 */
export function getIperfTestStatus(testId: string): IperfTest | null {
  return activeTests.get(testId) || null
}

/**
 * List all iperf3 tests
 * @returns List of all tests
 */
export function listIperfTests(): IperfTest[] {
  return Array.from(activeTests.values())
}

// Cache for discovered iperf servers
const discoveredServers: Map<string, DiscoveredService> = new Map()

/**
 * Discover iperf3 servers on the local network
 * @param port The port to check for iperf3 servers (default: 5201)
 * @param forceRefresh Force a refresh of the cache (default: false)
 * @returns List of discovered iperf3 servers
 */
export async function discoverIperfServers(port: number = 5201, forceRefresh: boolean = false): Promise<DiscoveredService[]> {
  console.log(`discoverIperfServers called with port=${port}, forceRefresh=${forceRefresh}`);
  
  // Check if we have a recent cache (less than 5 minutes old)
  const cacheAge = Math.max(...Array.from(discoveredServers.values()).map(s => s.discoveredAt), 0)
  const isCacheValid = !forceRefresh && cacheAge > 0 && (Date.now() - cacheAge < 5 * 60 * 1000)
  
  if (isCacheValid) {
    console.log('Using cached iperf servers, skipping discovery')
    return Array.from(discoveredServers.values())
  }
  
  console.log('Starting discovery process for iperf servers on the network...')
  try {
    // Clear the cache if we're refreshing
    if (forceRefresh) {
      console.log('Force refresh requested, clearing cache')
      discoveredServers.clear()
    }
    
    // Always add the local server if possible
    try {
      console.log('Adding localhost as a potential server')
      const localServer: DiscoveredService = {
        id: `iperf-127.0.0.1-${port}`,
        name: `Local iperf @ 127.0.0.1`,
        ipAddress: '127.0.0.1',
        port,
        type: 'iperf',
        responseTime: 1, // Local connection should be very fast
        status: 'online',
        discoveredAt: Date.now()
      }
      discoveredServers.set(localServer.id, localServer)
    } catch (error) {
      console.error('Error adding localhost as server:', error)
    }
    
    // Discover new servers on the network
    console.log('Starting network discovery for iperf servers')
    const servers = await discoverAllIperfServers(port)
    console.log(`Network discovery found ${servers.length} iperf servers`)
    
    // Update the cache with newly discovered servers
    servers.forEach(server => {
      console.log(`Adding/updating server in cache: ${server.name} (${server.ipAddress}:${server.port})`)
      discoveredServers.set(server.id, server)
    })
    
    const allServers = Array.from(discoveredServers.values())
    console.log(`Total servers available (including cached): ${allServers.length}`)
    
    return allServers
  } catch (error) {
    console.error('Error during iperf server discovery:', error)
    // On error, return whatever is in the cache
    const cachedServers = Array.from(discoveredServers.values())
    console.log(`Returning ${cachedServers.length} cached servers due to error`)
    return cachedServers
  }
}

/**
 * Check if an iperf3 server is available
 * @param address The IP address or hostname of the server
 * @param port The port to check (default: 5201)
 * @returns True if the server is available, false otherwise
 */
export async function checkIperfServerAvailability(address: string, port: number = 5201): Promise<boolean> {
  try {
    const isWindows = process.platform === 'win32'
    
    if (isWindows) {
      // Use PowerShell Test-NetConnection on Windows
      const { stdout } = await execAsync(`powershell -command "Test-NetConnection -ComputerName ${address} -Port ${port} -InformationLevel Quiet -WarningAction SilentlyContinue"`)
      return stdout.trim() === "True"
    } else {
      // Use nc (netcat) on Linux/macOS
      await execAsync(`nc -z -w 1 ${address} ${port}`)
      return true
    }
  } catch (error) {
    return false
  }
}

/**
 * Get the local IP address that would be used to connect to a server
 * This is useful for discovering which network interface will be used
 * @param serverAddress The IP address of the server
 * @returns The local IP address
 */
export async function getLocalAddress(serverAddress: string): Promise<string> {
  try {
    const isWindows = process.platform === 'win32'
    
    if (isWindows) {
      // Windows doesn't provide an easy way to get this information
      // We'll return the first non-internal IPv4 address
      const { networkInterfaces } = require('os')
      const interfaces = networkInterfaces()
      
      for (const iface of Object.values(interfaces)) {
        for (const addr of iface as any) {
          if (addr.family === 'IPv4' && !addr.internal) {
            return addr.address
          }
        }
      }
      
      return '127.0.0.1' // Fallback
    } else {
      // Use ip route on Linux/macOS
      const { stdout } = await execAsync(`ip route get ${serverAddress} | head -1 | awk '{print $7}'`)
      return stdout.trim() || '127.0.0.1'
    }
  } catch (error) {
    console.error('Error getting local address:', error)
    return '127.0.0.1' // Fallback
  }
}

/**
 * Format bytes to human-readable string
 * @param bytes Number of bytes
 * @returns Formatted string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Format bits per second to human-readable string
 * @param bps Bits per second
 * @returns Formatted string
 */
function formatBits(bps: number): string {
  if (bps === 0) return '0 bits/sec'
  
  const k = 1000
  const sizes = ['bits/sec', 'Kbits/sec', 'Mbits/sec', 'Gbits/sec', 'Tbits/sec']
  const i = Math.floor(Math.log(bps) / Math.log(k))
  
  return parseFloat((bps / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}