/**
 * Real ICMP Ping Service
 * Performs actual network pings using system commands
 */

import { spawn } from 'child_process'

export interface PingResult {
  isUp: boolean
  latency?: number
  packetLoss: number
  packetsTransmitted: number
  packetsReceived: number
  minLatency?: number
  maxLatency?: number
  avgLatency?: number
  standardDeviation?: number
  error?: string
}

export interface PingOptions {
  count?: number
  timeout?: number
  interval?: number
}

/**
 * Perform actual ICMP ping to a target host
 */
export async function performPing(
  target: string,
  options: PingOptions = {}
): Promise<PingResult> {
  const { count = 3, timeout = 10 } = options

  return new Promise(resolve => {
    let command: string
    let args: string[]

    // Determine OS and use appropriate ping command
    if (process.platform === 'win32') {
      // Windows ping command - reduce timeout to be more responsive
      command = 'ping'
      args = [
        '-n',
        count.toString(),
        '-w',
        Math.min(timeout * 1000, 5000).toString(),
        target,
      ]
    } else {
      // Unix/Linux/macOS ping command
      command = 'ping'
      args = ['-c', count.toString(), '-W', timeout.toString(), target]
    }

    console.log(`Executing ping: ${command} ${args.join(' ')}`)

    const pingProcess = spawn(command, args)
    let stdout = ''
    let stderr = ''
    let resolved = false

    const resolveOnce = (result: PingResult) => {
      if (!resolved) {
        resolved = true
        resolve(result)
      }
    }

    pingProcess.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    pingProcess.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    pingProcess.on('close', (code: number | null) => {
      if (!resolved) {
        const exitCode = code || 0
        console.log(`Ping completed with code ${exitCode}`)
        console.log('Stdout:', stdout)

        if (stderr) {
          console.log('Stderr:', stderr)
        }

        const result = parsePingOutput(stdout, stderr, exitCode, count)
        resolveOnce(result)
      }
    })

    pingProcess.on('error', error => {
      console.error('Ping process error:', error)
      resolveOnce({
        isUp: false,
        latency: undefined,
        packetLoss: 100,
        packetsTransmitted: count,
        packetsReceived: 0,
        error: error.message,
      })
    })

    // Add timeout to prevent hanging - be more generous with timeout
    const totalTimeout = Math.max((timeout + 5) * 1000, 15000) // At least 15 seconds
    setTimeout(() => {
      if (!resolved && !pingProcess.killed) {
        console.log('Ping process timeout, killing...')
        pingProcess.kill('SIGKILL')
        resolveOnce({
          isUp: false,
          latency: undefined,
          packetLoss: 100,
          packetsTransmitted: count,
          packetsReceived: 0,
          error: 'Ping timeout',
        })
      }
    }, totalTimeout)
  })
}

/**
 * Parse ping command output to extract metrics
 */
function parsePingOutput(
  stdout: string,
  stderr: string,
  exitCode: number,
  expectedPackets: number
): PingResult {
  console.log('Parsing ping output:', { stdout, stderr, exitCode })

  // Check for obvious failure conditions
  if (
    stderr.includes('unreachable') ||
    stderr.includes('failed') ||
    stderr.includes('could not find host')
  ) {
    return {
      isUp: false,
      latency: undefined,
      packetLoss: 100,
      packetsTransmitted: expectedPackets,
      packetsReceived: 0,
      error: stderr || 'Host unreachable',
    }
  }

  // Even if exit code is non-zero, check if we got any successful responses
  try {
    if (process.platform === 'win32') {
      return parseWindowsPingOutput(stdout, expectedPackets)
    } else {
      return parseUnixPingOutput(stdout, expectedPackets)
    }
  } catch (error) {
    console.error('Error parsing ping output:', error)
    return {
      isUp: false,
      latency: undefined,
      packetLoss: 100,
      packetsTransmitted: expectedPackets,
      packetsReceived: 0,
      error: 'Failed to parse ping output',
    }
  }
}

/**
 * Parse Windows ping output
 */
function parseWindowsPingOutput(
  output: string,
  expectedPackets: number
): PingResult {
  const lines = output.split('\n')
  const latencies: number[] = []
  let packetsReceived = 0

  // Extract individual ping times - look for various Windows ping response patterns
  for (const line of lines) {
    // Look for successful ping responses
    if (line.includes('Reply from')) {
      // Look for "time=123ms" or "time<1ms"
      const timeMatch = line.match(/time[<=](\d+)ms/i)
      if (timeMatch) {
        const time = parseInt(timeMatch[1])
        latencies.push(time)
        packetsReceived++
      } else if (line.includes('time<1ms')) {
        latencies.push(0.5) // Sub-millisecond ping
        packetsReceived++
      }
    }

    // Also check for timeout messages
    if (
      line.includes('Request timed out') ||
      line.includes('Destination host unreachable')
    ) {
      // These count as transmitted but not received
      continue
    }
  }

  // Extract packet loss info from statistics
  let packetLoss = 0
  const lossMatch = output.match(/\((\d+)% loss\)/i)
  if (lossMatch) {
    packetLoss = parseInt(lossMatch[1])
  } else {
    // Calculate packet loss from received vs transmitted
    packetLoss = Math.round(
      ((expectedPackets - packetsReceived) / expectedPackets) * 100
    )
  }

  // Calculate statistics
  const isUp = packetsReceived > 0 // Host is up if we received ANY replies
  const avgLatency =
    latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : undefined
  const minLatency = latencies.length > 0 ? Math.min(...latencies) : undefined
  const maxLatency = latencies.length > 0 ? Math.max(...latencies) : undefined

  // Calculate standard deviation
  let standardDeviation: number | undefined
  if (latencies.length > 1 && avgLatency !== undefined) {
    const variance =
      latencies.reduce((acc, val) => acc + Math.pow(val - avgLatency, 2), 0) /
      latencies.length
    standardDeviation = Math.sqrt(variance)
  }

  console.log(
    `Windows ping result: isUp=${isUp}, packetsReceived=${packetsReceived}/${expectedPackets}, avgLatency=${avgLatency}`
  )

  return {
    isUp,
    latency: avgLatency,
    packetLoss,
    packetsTransmitted: expectedPackets,
    packetsReceived,
    minLatency,
    maxLatency,
    avgLatency,
    standardDeviation,
  }
}

/**
 * Parse Unix/Linux/macOS ping output
 */
function parseUnixPingOutput(
  output: string,
  expectedPackets: number
): PingResult {
  const lines = output.split('\n')
  const latencies: number[] = []
  let packetsReceived = 0

  // Extract individual ping times
  for (const line of lines) {
    // Look for successful ping responses
    if (line.includes('bytes from') || line.includes('64 bytes from')) {
      const timeMatch = line.match(/time=([0-9.]+)\s*ms/i)
      if (timeMatch) {
        const time = parseFloat(timeMatch[1])
        latencies.push(time)
        packetsReceived++
      }
    }
  }

  // Extract packet loss and statistics from summary line
  let packetLoss = 0
  const lossMatch = output.match(/(\d+)% packet loss/i)
  if (lossMatch) {
    packetLoss = parseInt(lossMatch[1])
  } else {
    // Calculate from received vs transmitted
    packetLoss = Math.round(
      ((expectedPackets - packetsReceived) / expectedPackets) * 100
    )
  }

  // Extract round-trip statistics (min/avg/max/stddev)
  let minLatency: number | undefined
  let avgLatency: number | undefined
  let maxLatency: number | undefined
  let standardDeviation: number | undefined

  const statsMatch = output.match(
    /min\/avg\/max\/(?:stddev|mdev) = ([0-9.]+)\/([0-9.]+)\/([0-9.]+)\/([0-9.]+)/i
  )
  if (statsMatch) {
    minLatency = parseFloat(statsMatch[1])
    avgLatency = parseFloat(statsMatch[2])
    maxLatency = parseFloat(statsMatch[3])
    standardDeviation = parseFloat(statsMatch[4])
  } else if (latencies.length > 0) {
    // Fallback to calculated values
    avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length
    minLatency = Math.min(...latencies)
    maxLatency = Math.max(...latencies)

    if (latencies.length > 1) {
      const variance =
        latencies.reduce(
          (acc, val) => acc + Math.pow(val - avgLatency!, 2),
          0
        ) / latencies.length
      standardDeviation = Math.sqrt(variance)
    }
  }

  const isUp = packetsReceived > 0 // Host is up if we received ANY replies

  console.log(
    `Unix ping result: isUp=${isUp}, packetsReceived=${packetsReceived}/${expectedPackets}, avgLatency=${avgLatency}`
  )

  return {
    isUp,
    latency: avgLatency,
    packetLoss,
    packetsTransmitted: expectedPackets,
    packetsReceived,
    minLatency,
    maxLatency,
    avgLatency,
    standardDeviation,
  }
}
