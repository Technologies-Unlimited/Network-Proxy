/**
 * Main server entry point for the Network-Proxy application
 * This file serves both the frontend UI and WebSocket server for real-time network monitoring
 */

import { serve } from 'bun'
import { startWebSocketServer } from './src/websockets/server'
import { getDatabase } from './src/database/index'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'util'
import { exec, spawn } from 'child_process'

const execAsync = promisify(exec)

// Define the port for the WebSocket server
const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 3001
const HTTP_PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000

// Initialize the database
getDatabase()

// Try to start the WebSocket server with fallback ports
let wsServer
let actualWsPort = WS_PORT
const MAX_PORT_ATTEMPTS = 5

for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
  try {
    // Try starting the server with the current port
    const attemptPort = WS_PORT + i
    wsServer = startWebSocketServer(attemptPort)
    actualWsPort = attemptPort
    break // If successful, exit the loop
  } catch (error) {
    if (i === MAX_PORT_ATTEMPTS - 1) {
      // If we've tried all ports and failed, log an error
      console.error(
        `Failed to start WebSocket server after ${MAX_PORT_ATTEMPTS} attempts.`
      )
      console.error(
        'Please check if multiple instances are running or specify a different port with WS_PORT env variable.'
      )
      process.exit(1)
    }

    console.log(`Port ${WS_PORT + i} is in use, trying ${WS_PORT + i + 1}...`)
    // Continue to the next iteration to try the next port
  }
}

// Ensure public directory exists
const publicDir = path.join(import.meta.dir, 'public')
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true })
}

// Start the Bun server
const server = serve({
  port: HTTP_PORT,

  // Define the routes
  routes: {
    // API routes
    '/api/network': {
      async GET(req) {
        // Placeholder for network data API
        return Response.json({ status: 'ok' })
      },
    },
    '/api/ping': {
      async POST(req) {
        console.log('=== PING API REQUEST ===')
        try {
          const body = await req.json()
          console.log('Request body:', body)
          const { target, count = 4, continuous = false } = body

          if (!target) {
            console.log('Error: No target provided')
            return Response.json(
              { error: 'Target is required' },
              { status: 400 }
            )
          }

          // Validate target (basic validation)
          const targetRegex = /^[a-zA-Z0-9.-]+$/
          if (!targetRegex.test(target)) {
            console.log('Error: Invalid target format:', target)
            return Response.json(
              { error: 'Invalid target format' },
              { status: 400 }
            )
          }

          console.log(
            `Starting ping to ${target}, count: ${count}, continuous: ${continuous}`
          )
          const results: any[] = []
          const maxPings = continuous ? 20 : count // Reduce continuous to 20 for better performance

          for (let i = 0; i < maxPings; i++) {
            console.log(`Ping attempt ${i + 1}/${maxPings}`)
            try {
              const startTime = Date.now()

              // Use platform-specific ping command
              const isWindows = process.platform === 'win32'
              const pingCmd = isWindows
                ? `ping -n 1 -w 3000 ${target}`
                : `ping -c 1 -W 3 ${target}`

              console.log(`Executing command: ${pingCmd}`)
              const { stdout, stderr } = await execAsync(pingCmd)
              const endTime = Date.now()
              console.log(`Command completed in ${endTime - startTime}ms`)
              console.log('Stdout:', stdout.substring(0, 200) + '...')
              if (stderr) console.log('Stderr:', stderr)

              // Parse ping output to extract time and resolved IP
              let responseTime = endTime - startTime
              let resolvedTarget = target
              let success = true

              if (isWindows) {
                // Check for Windows ping success patterns
                if (stdout.includes('Reply from')) {
                  console.log('Windows ping success detected')
                  const timeMatch = stdout.match(/time[<=](\d+)ms/i)
                  if (timeMatch) {
                    responseTime = parseInt(timeMatch[1])
                    console.log('Extracted response time:', responseTime)
                  }

                  // Extract the IP address from "Reply from X.X.X.X:"
                  const ipMatch = stdout.match(/Reply from ([^:]+):/i)
                  if (ipMatch) {
                    resolvedTarget = ipMatch[1]
                    console.log('Resolved target:', resolvedTarget)
                  }
                } else if (
                  stdout.includes('Request timed out') ||
                  stdout.includes('could not find host') ||
                  stdout.includes('Destination host unreachable')
                ) {
                  console.log('Windows ping failure detected')
                  success = false
                } else {
                  console.log('Windows ping - unknown response format')
                  success = false
                }
              } else {
                // Unix/Linux ping parsing
                if (stdout.includes('bytes from')) {
                  console.log('Unix ping success detected')
                  const timeMatch = stdout.match(/time=(\d+\.?\d*)/i)
                  if (timeMatch) {
                    responseTime = Math.round(parseFloat(timeMatch[1]))
                    console.log('Extracted response time:', responseTime)
                  }

                  // Extract IP from "64 bytes from X.X.X.X:"
                  const ipMatch = stdout.match(/bytes from ([^:]+):/i)
                  if (ipMatch) {
                    resolvedTarget = ipMatch[1]
                    console.log('Resolved target:', resolvedTarget)
                  }
                } else {
                  console.log('Unix ping failure detected')
                  success = false
                }
              }

              const result = success
                ? {
                    id: `ping-${Date.now()}-${i}`,
                    timestamp: Date.now(),
                    target: resolvedTarget,
                    originalTarget: target,
                    bytes: 32,
                    time: responseTime,
                    ttl: 64,
                    success: true,
                    message: null,
                  }
                : {
                    id: `ping-${Date.now()}-${i}`,
                    timestamp: Date.now(),
                    target: target,
                    originalTarget: target,
                    bytes: 32,
                    time: null,
                    ttl: null,
                    success: false,
                    message: 'Request timed out.',
                  }

              console.log('Ping result:', result)
              results.push(result)
            } catch (error) {
              console.log('Ping command error:', error)
              const result = {
                id: `ping-${Date.now()}-${i}`,
                timestamp: Date.now(),
                target: target,
                originalTarget: target,
                bytes: 32,
                time: null,
                ttl: null,
                success: false,
                message: 'Request timed out.',
              }
              console.log('Error result:', result)
              results.push(result)
            }

            // For continuous mode, don't add delay - let it run as fast as possible
            if (!continuous && i < maxPings - 1) {
              console.log('Adding 1 second delay...')
              await new Promise(resolve => setTimeout(resolve, 1000))
            }
          }

          console.log(`Ping completed. Total results: ${results.length}`)
          console.log('Final results:', results)
          return Response.json({ results, continuous })
        } catch (error) {
          console.error('Ping API error:', error)
          return Response.json(
            { error: 'Internal server error' },
            { status: 500 }
          )
        }
      },
    },
    '/api/ping-stream': {
      async POST(req) {
        console.log('=== PING STREAM API REQUEST ===')
        try {
          const body = await req.json()
          console.log('Stream request body:', body)
          const { target, count = 4, continuous = false } = body

          if (!target) {
            console.log('Stream error: No target provided')
            return Response.json(
              { error: 'Target is required' },
              { status: 400 }
            )
          }

          // Validate target (basic validation)
          const targetRegex = /^[a-zA-Z0-9.-]+$/
          if (!targetRegex.test(target)) {
            console.log('Stream error: Invalid target format:', target)
            return Response.json(
              { error: 'Invalid target format' },
              { status: 400 }
            )
          }

          console.log(
            `Starting stream ping to ${target}, continuous: ${continuous}`
          )

          // Create a readable stream for real-time ping results
          const stream = new ReadableStream({
            async start(controller) {
              console.log('Stream started')
              const maxPings = continuous ? 50 : count

              for (let i = 0; i < maxPings; i++) {
                console.log(`Stream ping attempt ${i + 1}/${maxPings}`)
                try {
                  const startTime = Date.now()

                  // Use platform-specific ping command
                  const isWindows = process.platform === 'win32'
                  const pingCmd = isWindows
                    ? `ping -n 1 -w 3000 ${target}`
                    : `ping -c 1 -W 3 ${target}`

                  console.log(`Stream executing command: ${pingCmd}`)
                  const { stdout } = await execAsync(pingCmd)
                  const endTime = Date.now()
                  console.log(
                    `Stream command completed in ${endTime - startTime}ms`
                  )

                  // Parse ping output
                  let responseTime = endTime - startTime
                  let resolvedTarget = target
                  let success = true

                  if (isWindows) {
                    if (stdout.includes('Reply from')) {
                      console.log('Stream Windows ping success detected')
                      const timeMatch = stdout.match(/time[<=](\d+)ms/i)
                      if (timeMatch) {
                        responseTime = parseInt(timeMatch[1])
                        console.log(
                          'Stream extracted response time:',
                          responseTime
                        )
                      }

                      const ipMatch = stdout.match(/Reply from ([^:]+):/i)
                      if (ipMatch) {
                        resolvedTarget = ipMatch[1]
                        console.log('Stream resolved target:', resolvedTarget)
                      }
                    } else {
                      console.log('Stream Windows ping failure detected')
                      success = false
                    }
                  } else {
                    if (stdout.includes('bytes from')) {
                      console.log('Stream Unix ping success detected')
                      const timeMatch = stdout.match(/time=(\d+\.?\d*)/i)
                      if (timeMatch) {
                        responseTime = Math.round(parseFloat(timeMatch[1]))
                        console.log(
                          'Stream extracted response time:',
                          responseTime
                        )
                      }

                      const ipMatch = stdout.match(/bytes from ([^:]+):/i)
                      if (ipMatch) {
                        resolvedTarget = ipMatch[1]
                        console.log('Stream resolved target:', resolvedTarget)
                      }
                    } else {
                      console.log('Stream Unix ping failure detected')
                      success = false
                    }
                  }

                  const result = success
                    ? {
                        id: `ping-${Date.now()}-${i}`,
                        timestamp: Date.now(),
                        target: resolvedTarget,
                        originalTarget: target,
                        bytes: 32,
                        time: responseTime,
                        ttl: 64,
                        success: true,
                        message: null,
                      }
                    : {
                        id: `ping-${Date.now()}-${i}`,
                        timestamp: Date.now(),
                        target: target,
                        originalTarget: target,
                        bytes: 32,
                        time: null,
                        ttl: null,
                        success: false,
                        message: 'Request timed out.',
                      }

                  console.log('Stream ping result:', result)

                  // Send the result immediately in proper SSE format
                  const sseData = `data: ${JSON.stringify(result)}\n\n`
                  console.log('Sending SSE data:', sseData)
                  controller.enqueue(new TextEncoder().encode(sseData))

                  // Add delay between pings
                  if (i < maxPings - 1) {
                    console.log('Stream adding 1 second delay...')
                    await new Promise(resolve => setTimeout(resolve, 1000))
                  }
                } catch (error) {
                  console.log('Stream ping command error:', error)
                  const result = {
                    id: `ping-${Date.now()}-${i}`,
                    timestamp: Date.now(),
                    target: target,
                    originalTarget: target,
                    bytes: 32,
                    time: null,
                    ttl: null,
                    success: false,
                    message: 'Request timed out.',
                  }

                  console.log('Stream error result:', result)
                  const sseData = `data: ${JSON.stringify(result)}\n\n`
                  console.log('Sending SSE error data:', sseData)
                  controller.enqueue(new TextEncoder().encode(sseData))

                  if (i < maxPings - 1) {
                    console.log('Stream adding 1 second delay after error...')
                    await new Promise(resolve => setTimeout(resolve, 1000))
                  }
                }
              }

              console.log('Stream closing')
              controller.close()
            },
          })

          console.log('Returning stream response')
          return new Response(stream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          })
        } catch (error) {
          console.error('Ping stream error:', error)
          return Response.json(
            { error: 'Internal server error' },
            { status: 500 }
          )
        }
      },
    },
    '/api/traceroute': {
      async POST(req) {
        console.log('=== TRACEROUTE API REQUEST ===')
        try {
          const body = await req.json()
          console.log('Traceroute request body:', body)
          const { target, maxHops = 20 } = body

          if (!target) {
            console.log('Error: No target provided')
            return Response.json(
              { error: 'Target is required' },
              { status: 400 }
            )
          }

          // Validate target (basic validation)
          const targetRegex = /^[a-zA-Z0-9.-]+$/
          if (!targetRegex.test(target)) {
            console.log('Error: Invalid target format:', target)
            return Response.json(
              { error: 'Invalid target format' },
              { status: 400 }
            )
          }

          const maxHopsNum = parseInt(maxHops, 10)
          if (isNaN(maxHopsNum) || maxHopsNum <= 0 || maxHopsNum > 30) {
            console.log('Error: Invalid max hops:', maxHops)
            return Response.json(
              { error: 'Max hops must be between 1 and 30' },
              { status: 400 }
            )
          }

          console.log(
            `Starting traceroute to ${target}, max hops: ${maxHopsNum}`
          )
          const results: any[] = []

          try {
            const startTime = Date.now()

            // Use platform-specific traceroute command with faster options
            const isWindows = process.platform === 'win32'
            const command = isWindows ? 'tracert' : 'traceroute'
            const args = isWindows
              ? ['-h', maxHopsNum.toString(), '-w', '1000', target] // Reduced timeout from 3000ms to 1000ms
              : ['-m', maxHopsNum.toString(), '-w', '1', '-q', '1', target] // Added -q 1 for single query per hop

            console.log(`Executing command: ${command} ${args.join(' ')}`)
            const traceCmd = `${command} ${args.join(' ')}`
            const { stdout, stderr } = await execAsync(traceCmd)
            const endTime = Date.now()
            console.log(`Traceroute completed in ${endTime - startTime}ms`)
            console.log('Stdout:', stdout.substring(0, 500) + '...')
            if (stderr) console.log('Stderr:', stderr)

            // Parse traceroute output
            const lines = stdout.split('\n')
            let hopNumber = 1

            for (const line of lines) {
              const trimmedLine = line.trim()
              if (!trimmedLine) continue

              if (isWindows) {
                // Windows tracert format: "  1    <1 ms    <1 ms    <1 ms  192.168.1.1"
                const windowsMatch = trimmedLine.match(/^\s*(\d+)\s+(.+)/)
                if (windowsMatch) {
                  const hop = parseInt(windowsMatch[1])
                  const hopData = windowsMatch[2]

                  // Extract times and IP
                  const timeMatches = hopData.match(
                    /(\d+)\s*ms|<(\d+)\s*ms|\*|Request timed out/g
                  )
                  const ipMatch = hopData.match(/(\d+\.\d+\.\d+\.\d+)/)
                  const hostnameMatch = hopData.match(
                    /([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
                  )

                  if (timeMatches && timeMatches.length >= 3) {
                    const times = timeMatches.slice(0, 3).map(t => {
                      if (t === '*' || t.includes('timed out')) return null
                      const match = t.match(/(\d+)/)
                      return match ? parseInt(match[1]) : null
                    })

                    results.push({
                      id: `hop-${hop}`,
                      hop: hop,
                      ip: ipMatch ? ipMatch[1] : '*',
                      hostname: hostnameMatch ? hostnameMatch[1] : '',
                      time1: times[0],
                      time2: times[1],
                      time3: times[2],
                      success: times.some(t => t !== null),
                    })
                  }
                }
              } else {
                // Unix traceroute format: " 1  gateway (192.168.1.1)  0.123 ms  0.456 ms  0.789 ms"
                const unixMatch = trimmedLine.match(/^\s*(\d+)\s+(.+)/)
                if (unixMatch) {
                  const hop = parseInt(unixMatch[1])
                  const hopData = unixMatch[2]

                  // Extract hostname, IP, and times
                  const ipMatch = hopData.match(/\((\d+\.\d+\.\d+\.\d+)\)/)
                  const hostnameMatch = hopData.match(/^([^\s(]+)/)
                  const timeMatches = hopData.match(/(\d+\.?\d*)\s*ms/g)

                  if (timeMatches && timeMatches.length >= 3) {
                    const times = timeMatches.slice(0, 3).map(t => {
                      const match = t.match(/(\d+\.?\d*)/)
                      return match ? Math.round(parseFloat(match[1])) : null
                    })

                    results.push({
                      id: `hop-${hop}`,
                      hop: hop,
                      ip: ipMatch ? ipMatch[1] : '*',
                      hostname: hostnameMatch ? hostnameMatch[1] : '',
                      time1: times[0],
                      time2: times[1],
                      time3: times[2],
                      success: times.some(t => t !== null),
                    })
                  }
                }
              }
            }
          } catch (error) {
            console.log('Traceroute command error:', error)
            // Return partial results if any were collected
          }

          console.log(`Traceroute completed. Total hops: ${results.length}`)
          console.log('Final results:', results)
          return Response.json({ results })
        } catch (error) {
          console.error('Traceroute API error:', error)
          return Response.json(
            { error: 'Internal server error' },
            { status: 500 }
          )
        }
      },
    },
    '/api/traceroute-stream': {
      async POST(req) {
        console.log('=== TRACEROUTE STREAM API REQUEST ===')
        try {
          const body = await req.json()
          console.log('Traceroute stream request body:', body)
          const { target, maxHops = 20 } = body

          if (!target) {
            console.log('Stream error: No target provided')
            return Response.json(
              { error: 'Target is required' },
              { status: 400 }
            )
          }

          // Validate target (basic validation)
          const targetRegex = /^[a-zA-Z0-9.-]+$/
          if (!targetRegex.test(target)) {
            console.log('Stream error: Invalid target format:', target)
            return Response.json(
              { error: 'Invalid target format' },
              { status: 400 }
            )
          }

          const maxHopsNum = parseInt(maxHops, 10)
          if (isNaN(maxHopsNum) || maxHopsNum <= 0 || maxHopsNum > 30) {
            console.log('Stream error: Invalid max hops:', maxHops)
            return Response.json(
              { error: 'Max hops must be between 1 and 30' },
              { status: 400 }
            )
          }

          console.log(
            `Starting stream traceroute to ${target}, max hops: ${maxHopsNum}`
          )

          // Create a readable stream for real-time traceroute results
          const stream = new ReadableStream({
            async start(controller) {
              console.log('Traceroute stream started')

              try {
                // Use platform-specific traceroute command with faster options
                const isWindows = process.platform === 'win32'
                const command = isWindows ? 'tracert' : 'traceroute'
                const args = isWindows
                  ? ['-h', maxHopsNum.toString(), '-w', '1000', target] // Reduced timeout from 3000ms to 1000ms
                  : ['-m', maxHopsNum.toString(), '-w', '1', '-q', '1', target] // Added -q 1 for single query per hop

                console.log(
                  `Stream executing command: ${command} ${args.join(' ')}`
                )

                const tracerouteProcess = spawn(command, args)
                let buffer = ''
                let hopNumber = 1

                // Process stdout line by line
                tracerouteProcess.stdout.on('data', data => {
                  buffer += data.toString()
                  const lines = buffer.split('\n')
                  buffer = lines.pop() || '' // Keep incomplete line in buffer

                  for (const line of lines) {
                    const trimmedLine = line.trim()
                    if (!trimmedLine) continue

                    console.log(`Processing traceroute line: ${trimmedLine}`)

                    let result: any = null

                    if (isWindows) {
                      // Windows tracert format: "  1    <1 ms    <1 ms    <1 ms  192.168.1.1"
                      const windowsMatch = trimmedLine.match(/^\s*(\d+)\s+(.+)/)
                      if (windowsMatch) {
                        const hop = parseInt(windowsMatch[1])
                        const hopData = windowsMatch[2]

                        // Extract times and IP
                        const timeMatches = hopData.match(
                          /(\d+)\s*ms|<(\d+)\s*ms|\*|Request timed out/g
                        )
                        const ipMatch = hopData.match(/(\d+\.\d+\.\d+\.\d+)/)
                        const hostnameMatch = hopData.match(
                          /([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
                        )

                        if (timeMatches && timeMatches.length >= 3) {
                          const times = timeMatches.slice(0, 3).map(t => {
                            if (t === '*' || t.includes('timed out'))
                              return null
                            const match = t.match(/(\d+)/)
                            return match ? parseInt(match[1]) : null
                          })

                          result = {
                            id: `hop-${hop}`,
                            hop: hop,
                            ip: ipMatch ? ipMatch[1] : '*',
                            hostname: hostnameMatch ? hostnameMatch[1] : '',
                            time1: times[0],
                            time2: times[1],
                            time3: times[2],
                            success: times.some(t => t !== null),
                          }
                        }
                      }
                    } else {
                      // Unix traceroute format: " 1  gateway (192.168.1.1)  0.123 ms  0.456 ms  0.789 ms"
                      const unixMatch = trimmedLine.match(/^\s*(\d+)\s+(.+)/)
                      if (unixMatch) {
                        const hop = parseInt(unixMatch[1])
                        const hopData = unixMatch[2]

                        // Extract hostname, IP, and times
                        const ipMatch = hopData.match(
                          /\((\d+\.\d+\.\d+\.\d+)\)/
                        )
                        const hostnameMatch = hopData.match(/^([^\s(]+)/)
                        const timeMatches = hopData.match(/(\d+\.?\d*)\s*ms/g)

                        if (timeMatches && timeMatches.length >= 3) {
                          const times = timeMatches.slice(0, 3).map(t => {
                            const match = t.match(/(\d+\.?\d*)/)
                            return match
                              ? Math.round(parseFloat(match[1]))
                              : null
                          })

                          result = {
                            id: `hop-${hop}`,
                            hop: hop,
                            ip: ipMatch ? ipMatch[1] : '*',
                            hostname: hostnameMatch ? hostnameMatch[1] : '',
                            time1: times[0],
                            time2: times[1],
                            time3: times[2],
                            success: times.some(t => t !== null),
                          }
                        }
                      }
                    }

                    if (result) {
                      console.log('Stream traceroute hop result:', result)
                      const sseData = `data: ${JSON.stringify(result)}\n\n`
                      console.log('Sending traceroute SSE data:', sseData)
                      controller.enqueue(new TextEncoder().encode(sseData))
                    }
                  }
                })

                // Handle process completion
                tracerouteProcess.on('close', code => {
                  console.log(`Traceroute process exited with code ${code}`)
                  console.log('Traceroute stream closing')
                  controller.close()
                })

                // Handle process errors
                tracerouteProcess.on('error', error => {
                  console.log('Traceroute process error:', error)
                  controller.close()
                })
              } catch (error) {
                console.log('Stream traceroute command error:', error)
                controller.close()
              }
            },
          })

          console.log('Returning traceroute stream response')
          return new Response(stream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          })
        } catch (error) {
          console.error('Traceroute stream error:', error)
          return Response.json(
            { error: 'Internal server error' },
            { status: 500 }
          )
        }
      },
    },
    '/api/port-scan-stream': {
      async POST(req) {
        console.log('=== PORT SCAN STREAM API REQUEST ===')
        try {
          const body = await req.json()
          console.log('Port scan stream request body:', body)
          const { target, startPort = 1, endPort = 1000 } = body

          if (!target) {
            console.log('Stream error: No target provided')
            return Response.json(
              { error: 'Target is required' },
              { status: 400 }
            )
          }

          // Validate target (basic validation)
          const targetRegex = /^[a-zA-Z0-9.-]+$/
          if (!targetRegex.test(target)) {
            console.log('Stream error: Invalid target format:', target)
            return Response.json(
              { error: 'Invalid target format' },
              { status: 400 }
            )
          }

          const startPortNum = parseInt(startPort, 10)
          const endPortNum = parseInt(endPort, 10)

          if (
            isNaN(startPortNum) ||
            isNaN(endPortNum) ||
            startPortNum <= 0 ||
            endPortNum <= 0
          ) {
            console.log('Stream error: Invalid port numbers')
            return Response.json(
              { error: 'Invalid port numbers' },
              { status: 400 }
            )
          }

          if (startPortNum > endPortNum) {
            console.log('Stream error: Start port greater than end port')
            return Response.json(
              { error: 'Start port must be less than or equal to end port' },
              { status: 400 }
            )
          }

          if (endPortNum - startPortNum > 10000) {
            console.log('Stream error: Port range too large')
            return Response.json(
              { error: 'Port range too large. Maximum 10,000 ports allowed.' },
              { status: 400 }
            )
          }

          console.log(
            `Starting stream port scan to ${target}, ports: ${startPortNum}-${endPortNum}`
          )

          // Common service mappings
          const commonServices = {
            21: 'FTP',
            22: 'SSH',
            23: 'Telnet',
            25: 'SMTP',
            53: 'DNS',
            80: 'HTTP',
            110: 'POP3',
            143: 'IMAP',
            443: 'HTTPS',
            993: 'IMAPS',
            995: 'POP3S',
            3389: 'RDP',
            5432: 'PostgreSQL',
            3306: 'MySQL',
            1433: 'MSSQL',
            6379: 'Redis',
            27017: 'MongoDB',
          }

          // Create a readable stream for real-time port scan results
          const stream = new ReadableStream({
            async start(controller) {
              console.log('Port scan stream started')

              try {
                const net = require('net')

                for (let port = startPortNum; port <= endPortNum; port++) {
                  console.log(`Scanning port ${port}`)

                  const result = await new Promise(resolve => {
                    const socket = new net.Socket()
                    const timeout = 2000 // 2 second timeout

                    socket.setTimeout(timeout)

                    socket.on('connect', () => {
                      console.log(`Port ${port} is open`)
                      socket.destroy()
                      resolve({
                        port: port,
                        open: true,
                        service: commonServices[port] || 'Unknown',
                      })
                    })

                    socket.on('timeout', () => {
                      console.log(`Port ${port} timed out`)
                      socket.destroy()
                      resolve({
                        port: port,
                        open: false,
                        service: null,
                      })
                    })

                    socket.on('error', err => {
                      console.log(`Port ${port} error: ${err.code}`)
                      socket.destroy()
                      resolve({
                        port: port,
                        open: false,
                        service: null,
                      })
                    })

                    socket.connect(port, target)
                  })

                  console.log('Port scan result:', result)
                  const sseData = `data: ${JSON.stringify(result)}\n\n`
                  console.log('Sending port scan SSE data:', sseData)
                  controller.enqueue(new TextEncoder().encode(sseData))

                  // Small delay to prevent overwhelming the target
                  await new Promise(resolve => setTimeout(resolve, 10))
                }

                console.log('Port scan stream closing')
                controller.close()
              } catch (error) {
                console.log('Stream port scan error:', error)
                controller.close()
              }
            },
          })

          console.log('Returning port scan stream response')
          return new Response(stream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          })
        } catch (error) {
          console.error('Port scan stream error:', error)
          return Response.json(
            { error: 'Internal server error' },
            { status: 500 }
          )
        }
      },
    },
    '/api/dns-lookup': {
      async POST(req) {
        console.log('=== DNS LOOKUP API REQUEST ===')
        try {
          const body = await req.json()
          console.log('DNS lookup request body:', body)
          const { domain, recordType = 'A' } = body

          if (!domain) {
            console.log('Error: No domain provided')
            return Response.json(
              { error: 'Domain is required' },
              { status: 400 }
            )
          }

          // Validate domain (basic validation)
          const domainRegex = /^[a-zA-Z0-9.-]+$/
          if (!domainRegex.test(domain)) {
            console.log('Error: Invalid domain format:', domain)
            return Response.json(
              { error: 'Invalid domain format' },
              { status: 400 }
            )
          }

          console.log(`Starting DNS lookup for ${domain}, type: ${recordType}`)

          try {
            const dns = require('dns').promises
            let records: any[] = []
            let status = 'success'
            let error: string | null = null

            try {
              switch (recordType.toUpperCase()) {
                case 'A':
                  const aRecords = await dns.resolve4(domain)
                  records = aRecords.map(address => ({ type: 'A', address }))
                  break
                case 'AAAA':
                  const aaaaRecords = await dns.resolve6(domain)
                  records = aaaaRecords.map(address => ({
                    type: 'AAAA',
                    address,
                  }))
                  break
                case 'CNAME':
                  const cnameRecords = await dns.resolveCname(domain)
                  records = cnameRecords.map(value => ({
                    type: 'CNAME',
                    value,
                  }))
                  break
                case 'MX':
                  const mxRecords = await dns.resolveMx(domain)
                  records = mxRecords.map(record => ({
                    type: 'MX',
                    priority: record.priority,
                    exchange: record.exchange,
                  }))
                  break
                case 'NS':
                  const nsRecords = await dns.resolveNs(domain)
                  records = nsRecords.map(value => ({ type: 'NS', value }))
                  break
                case 'TXT':
                  const txtRecords = await dns.resolveTxt(domain)
                  records = txtRecords.map(entries => ({
                    type: 'TXT',
                    entries,
                  }))
                  break
                case 'SOA':
                  const soaRecord = await dns.resolveSoa(domain)
                  records = [
                    {
                      type: 'SOA',
                      primary: soaRecord.nsname,
                      admin: soaRecord.hostmaster,
                      serial: soaRecord.serial,
                      refresh: soaRecord.refresh,
                      retry: soaRecord.retry,
                      expiration: soaRecord.expire,
                      minimum: soaRecord.minttl,
                    },
                  ]
                  break
                case 'PTR':
                  const ptrRecords = await dns.resolvePtr(domain)
                  records = ptrRecords.map(value => ({ type: 'PTR', value }))
                  break
                default:
                  throw new Error(`Unsupported record type: ${recordType}`)
              }
            } catch (dnsError) {
              console.log('DNS resolution error:', dnsError)
              status = 'error'
              error = dnsError.message
            }

            const result = {
              query: domain,
              type: recordType.toUpperCase(),
              status: status,
              records: records,
              error: error,
            }

            console.log('DNS lookup completed:', result)
            return Response.json(result)
          } catch (error) {
            console.log('DNS lookup command error:', error)
            return Response.json({
              query: domain,
              type: recordType.toUpperCase(),
              status: 'error',
              records: [],
              error: error.message,
            })
          }
        } catch (error) {
          console.error('DNS lookup API error:', error)
          return Response.json(
            { error: 'Internal server error' },
            { status: 500 }
          )
        }
      },
    },
    '/api/whois-lookup': {
      async POST(req) {
        console.log('=== WHOIS LOOKUP API REQUEST ===')
        try {
          const body = await req.json()
          console.log('WHOIS lookup request body:', body)
          const { domain } = body

          if (!domain) {
            console.log('Error: No domain provided')
            return Response.json(
              { error: 'Domain is required' },
              { status: 400 }
            )
          }

          // Validate domain (basic validation)
          const domainRegex = /^[a-zA-Z0-9.-]+$/
          if (!domainRegex.test(domain)) {
            console.log('Error: Invalid domain format:', domain)
            return Response.json(
              { error: 'Invalid domain format' },
              { status: 400 }
            )
          }

          console.log(`Starting WHOIS lookup for ${domain}`)

          try {
            // Use platform-specific whois command
            const isWindows = process.platform === 'win32'
            let whoisCmd

            if (isWindows) {
              // On Windows, we'll try to use nslookup as a fallback since whois might not be available
              whoisCmd = `nslookup ${domain}`
            } else {
              // On Unix/Linux, use the whois command
              whoisCmd = `whois ${domain}`
            }

            console.log(`Executing command: ${whoisCmd}`)
            const { stdout, stderr } = await execAsync(whoisCmd)
            console.log('WHOIS command completed')
            if (stderr) console.log('Stderr:', stderr)

            let status = 'success'
            let error: string | null = null
            let server: string | null = null

            if (isWindows && stdout.includes('Non-authoritative answer')) {
              // nslookup output - limited information
              status = 'limited'
              error =
                'Limited information available on Windows. Install whois tool for full details.'
            } else if (
              stdout.includes('No match') ||
              stdout.includes('No entries found')
            ) {
              status = 'not_found'
              error = 'Domain not found in WHOIS database'
            }

            // Try to extract WHOIS server from output
            const serverMatch = stdout.match(/Whois Server:\s*(.+)/i)
            if (serverMatch) {
              server = serverMatch[1].trim()
            }

            const result = {
              query: domain,
              status: status,
              data: stdout,
              server: server,
              error: error,
            }

            console.log('WHOIS lookup completed')
            return Response.json(result)
          } catch (error) {
            console.log('WHOIS lookup command error:', error)
            return Response.json({
              query: domain,
              status: 'error',
              data: null,
              server: null,
              error: error.message,
            })
          }
        } catch (error) {
          console.error('WHOIS lookup API error:', error)
          return Response.json(
            { error: 'Internal server error' },
            { status: 500 }
          )
        }
      },
    },
    '/api/device-discovery-stream': {
      async POST(req) {
        console.log('=== DEVICE DISCOVERY STREAM API REQUEST ===')
        try {
          const body = await req.json()
          console.log('Device discovery stream request body:', body)
          const { networkRange } = body

          if (!networkRange) {
            console.log('Stream error: No network range provided')
            return Response.json(
              { error: 'Network range is required' },
              { status: 400 }
            )
          }

          // Validate CIDR format
          const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/
          if (!cidrRegex.test(networkRange)) {
            console.log('Stream error: Invalid CIDR format:', networkRange)
            return Response.json(
              { error: 'Invalid CIDR format' },
              { status: 400 }
            )
          }

          console.log(`Starting stream device discovery for ${networkRange}`)

          // Parse CIDR notation
          const [network, prefixLength] = networkRange.split('/')
          const prefix = parseInt(prefixLength, 10)

          if (prefix < 8 || prefix > 30) {
            console.log('Stream error: Invalid prefix length:', prefix)
            return Response.json(
              { error: 'Prefix length must be between 8 and 30' },
              { status: 400 }
            )
          }

          // Calculate IP range
          const networkParts = network.split('.').map(Number)
          const hostBits = 32 - prefix
          const totalHosts = Math.pow(2, hostBits) - 2 // Exclude network and broadcast

          // Limit scan to reasonable size
          const maxHosts = Math.min(totalHosts, 254)

          console.log(`Scanning ${maxHosts} hosts in ${networkRange}`)

          // Create a readable stream for real-time device discovery results
          const stream = new ReadableStream({
            async start(controller) {
              console.log('Device discovery stream started')

              try {
                // Send initial progress
                const progressData = `data: ${JSON.stringify({
                  type: 'progress',
                  progress: { current: 0, total: maxHosts },
                })}\n\n`
                controller.enqueue(new TextEncoder().encode(progressData))

                // Generate IP addresses to scan
                const baseIp = networkParts.slice(0, 3).join('.') + '.'
                const startHost = prefix >= 24 ? 1 : networkParts[3]

                for (let i = 0; i < maxHosts; i++) {
                  // Check if the client has disconnected
                  try {
                    controller.enqueue(new TextEncoder().encode(''))
                  } catch (error) {
                    console.log(
                      'Client disconnected, stopping device discovery'
                    )
                    return
                  }

                  const hostNum = startHost + i
                  if (hostNum > 254) break

                  const targetIp = baseIp + hostNum
                  console.log(`Scanning host ${i + 1}/${maxHosts}: ${targetIp}`)

                  try {
                    const startTime = Date.now()

                    // Use platform-specific ping command
                    const isWindows = process.platform === 'win32'
                    const pingCmd = isWindows
                      ? `ping -n 1 -w 1000 ${targetIp}`
                      : `ping -c 1 -W 1 ${targetIp}`

                    const { stdout } = await execAsync(pingCmd)
                    const endTime = Date.now()
                    const responseTime = endTime - startTime

                    // Check if ping was successful
                    let isOnline = false
                    if (isWindows) {
                      isOnline = stdout.includes('Reply from')
                    } else {
                      isOnline = stdout.includes('bytes from')
                    }

                    if (isOnline) {
                      console.log(
                        `Host ${targetIp} is online (${responseTime}ms)`
                      )

                      // Try to get hostname
                      let hostname = 'Unknown'
                      try {
                        const { stdout: nslookupOutput } = await execAsync(
                          `nslookup ${targetIp}`
                        )
                        const hostnameMatch =
                          nslookupOutput.match(/name = (.+)/i)
                        if (hostnameMatch) {
                          hostname = hostnameMatch[1].trim().replace(/\.$/, '')
                        }
                      } catch (e) {
                        // Hostname lookup failed, keep as Unknown
                      }

                      // Try to get MAC address (ARP table lookup)
                      let macAddress = 'Unknown'
                      let vendor = 'Unknown'
                      try {
                        const arpCmd = isWindows
                          ? `arp -a ${targetIp}`
                          : `arp -n ${targetIp}`
                        const { stdout: arpOutput } = await execAsync(arpCmd)

                        if (isWindows) {
                          const macMatch = arpOutput.match(
                            /([0-9a-f]{2}-[0-9a-f]{2}-[0-9a-f]{2}-[0-9a-f]{2}-[0-9a-f]{2}-[0-9a-f]{2})/i
                          )
                          if (macMatch) {
                            macAddress = macMatch[1]
                              .replace(/-/g, ':')
                              .toUpperCase()
                          }
                        } else {
                          const macMatch = arpOutput.match(
                            /([0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2})/i
                          )
                          if (macMatch) {
                            macAddress = macMatch[1].toUpperCase()
                          }
                        }

                        // Simple vendor detection based on MAC OUI
                        if (macAddress !== 'Unknown') {
                          const oui = macAddress
                            .substring(0, 8)
                            .replace(/:/g, '')
                          const vendors = {
                            '00:50:56': 'VMware',
                            '08:00:27': 'VirtualBox',
                            '52:54:00': 'QEMU',
                            '00:0C:29': 'VMware',
                            '00:1C:42': 'Parallels',
                            '00:15:5D': 'Microsoft Hyper-V',
                          }

                          for (const [prefix, vendorName] of Object.entries(
                            vendors
                          )) {
                            if (macAddress.startsWith(prefix)) {
                              vendor = vendorName
                              break
                            }
                          }
                        }
                      } catch (e) {
                        // ARP lookup failed, keep as Unknown
                      }

                      const device = {
                        id: `device-${targetIp}`,
                        ipAddress: targetIp,
                        hostname: hostname,
                        macAddress: macAddress,
                        vendor: vendor,
                        responseTime: responseTime,
                        status: 'online',
                      }

                      console.log('Device discovery result:', device)
                      const deviceData = `data: ${JSON.stringify({
                        type: 'device',
                        device: device,
                      })}\n\n`

                      try {
                        controller.enqueue(new TextEncoder().encode(deviceData))
                      } catch (error) {
                        console.log(
                          'Client disconnected while sending device data, stopping'
                        )
                        return
                      }
                    }
                  } catch (error) {
                    console.log(`Host ${targetIp} ping failed:`, error.message)
                    // Host is offline, don't report it
                  }

                  // Send progress update
                  const progressData = `data: ${JSON.stringify({
                    type: 'progress',
                    progress: { current: i + 1, total: maxHosts },
                  })}\n\n`

                  try {
                    controller.enqueue(new TextEncoder().encode(progressData))
                  } catch (error) {
                    console.log(
                      'Client disconnected while sending progress, stopping'
                    )
                    return
                  }

                  // Small delay to prevent overwhelming the network
                  await new Promise(resolve => setTimeout(resolve, 50))
                }

                console.log('Device discovery stream closing')
                controller.close()
              } catch (error) {
                console.log('Stream device discovery error:', error)
                controller.close()
              }
            },
            cancel() {
              console.log('Device discovery stream cancelled by client')
            },
          })

          console.log('Returning device discovery stream response')
          return new Response(stream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          })
        } catch (error) {
          console.error('Device discovery stream error:', error)
          return Response.json(
            { error: 'Internal server error' },
            { status: 500 }
          )
        }
      },
    },
    '/api/snmp-browse': {
      async POST(req) {
        console.log('=== SNMP BROWSE API REQUEST ===')
        try {
          const body = await req.json()
          console.log('SNMP browse request body:', body)
          const { target, community = 'public', version = '2c', user } = body

          if (!target) {
            console.log('Error: No target provided')
            return Response.json(
              { error: 'Target is required' },
              { status: 400 }
            )
          }

          // Validate target (basic validation)
          const targetRegex = /^[a-zA-Z0-9.-]+$/
          if (!targetRegex.test(target)) {
            console.log('Error: Invalid target format:', target)
            return Response.json(
              { error: 'Invalid target format' },
              { status: 400 }
            )
          }

          console.log(`Starting SNMP browse for ${target}, version: ${version}`)

          try {
            // Import net-snmp library
            const snmp = require('net-snmp')

            let session

            // Create SNMP session based on version
            if (version === '3') {
              if (!user || !user.name) {
                return Response.json(
                  { error: 'Username is required for SNMPv3' },
                  { status: 400 }
                )
              }

              // Map security levels
              const securityLevelMap = {
                noAuthNoPriv: snmp.SecurityLevel.noAuthNoPriv,
                authNoPriv: snmp.SecurityLevel.authNoPriv,
                authPriv: snmp.SecurityLevel.authPriv,
              }

              // Map auth protocols
              const authProtocolMap = {
                md5: snmp.AuthProtocols.md5,
                sha: snmp.AuthProtocols.sha,
                sha224: snmp.AuthProtocols.sha224,
                sha256: snmp.AuthProtocols.sha256,
                sha384: snmp.AuthProtocols.sha384,
                sha512: snmp.AuthProtocols.sha512,
              }

              // Map privacy protocols
              const privProtocolMap = {
                des: snmp.PrivProtocols.des,
                aes: snmp.PrivProtocols.aes,
                aes256b: snmp.PrivProtocols.aes256b,
                aes256r: snmp.PrivProtocols.aes256r,
              }

              const userOptions: any = {
                name: user.name,
                level:
                  securityLevelMap[user.level] ||
                  snmp.SecurityLevel.noAuthNoPriv,
              }

              // Add authentication if required
              if (user.level === 'authNoPriv' || user.level === 'authPriv') {
                if (!user.authKey) {
                  return Response.json(
                    {
                      error:
                        'Authentication key is required for this security level',
                    },
                    { status: 400 }
                  )
                }
                userOptions.authProtocol =
                  authProtocolMap[user.authProtocol] || snmp.AuthProtocols.md5
                userOptions.authKey = user.authKey
              }

              // Add privacy if required
              if (user.level === 'authPriv') {
                if (!user.privKey) {
                  return Response.json(
                    {
                      error:
                        'Privacy key is required for authPriv security level',
                    },
                    { status: 400 }
                  )
                }
                userOptions.privProtocol =
                  privProtocolMap[user.privProtocol] || snmp.PrivProtocols.des
                userOptions.privKey = user.privKey
              }

              console.log(
                'Creating SNMPv3 session with user:',
                userOptions.name
              )
              session = snmp.createV3Session(target, userOptions)
            } else {
              // SNMPv1 or v2c
              const versionMap = {
                '1': snmp.Version1,
                '2c': snmp.Version2c,
              }

              console.log(`Creating SNMP session with community: ${community}`)
              session = snmp.createSession(target, community, {
                version: versionMap[version] || snmp.Version2c,
                timeout: 3000,
                retries: 1,
              })
            }

            // Get basic system information
            const systemOids = [
              '1.3.6.1.2.1.1.1.0', // sysDescr
              '1.3.6.1.2.1.1.2.0', // sysObjectID
              '1.3.6.1.2.1.1.3.0', // sysUpTime
              '1.3.6.1.2.1.1.4.0', // sysContact
              '1.3.6.1.2.1.1.5.0', // sysName
              '1.3.6.1.2.1.1.6.0', // sysLocation
            ]

            const mibs: any[] = []

            // Perform SNMP get request with timeout
            const varbinds: any = await Promise.race([
              new Promise((resolve, reject) => {
                session.get(systemOids, (error: any, varbinds: any) => {
                  session.close()
                  if (error) {
                    reject(error)
                  } else {
                    resolve(varbinds)
                  }
                })
              }),
              new Promise((_, reject) => {
                setTimeout(() => {
                  session.close()
                  reject(new Error('SNMP request timed out after 5 seconds'))
                }, 5000)
              }),
            ])

            // Process varbinds
            const oidNames = {
              '1.3.6.1.2.1.1.1.0': 'sysDescr',
              '1.3.6.1.2.1.1.2.0': 'sysObjectID',
              '1.3.6.1.2.1.1.3.0': 'sysUpTime',
              '1.3.6.1.2.1.1.4.0': 'sysContact',
              '1.3.6.1.2.1.1.5.0': 'sysName',
              '1.3.6.1.2.1.1.6.0': 'sysLocation',
            }

            const oidDescriptions = {
              '1.3.6.1.2.1.1.1.0': 'A textual description of the entity',
              '1.3.6.1.2.1.1.2.0':
                "The vendor's authoritative identification of the network management subsystem",
              '1.3.6.1.2.1.1.3.0':
                'Time since the network management portion of the system was last re-initialized',
              '1.3.6.1.2.1.1.4.0':
                'The textual identification of the contact person for this managed node',
              '1.3.6.1.2.1.1.5.0':
                'An administratively-assigned name for this managed node',
              '1.3.6.1.2.1.1.6.0': 'The physical location of this node',
            }

            for (const varbind of varbinds) {
              if (!snmp.isVarbindError(varbind)) {
                mibs.push({
                  oid: varbind.oid,
                  name: oidNames[varbind.oid] || 'Unknown',
                  value: varbind.value.toString(),
                  type: varbind.type,
                  description: oidDescriptions[varbind.oid] || 'SNMP object',
                  hasChildren: false,
                })
              }
            }

            // Add common MIB groups
            const commonGroups = [
              {
                oid: '1.3.6.1.2.1.1',
                name: 'system',
                value: '',
                description: 'System group - basic system information',
                hasChildren: true,
              },
              {
                oid: '1.3.6.1.2.1.2',
                name: 'interfaces',
                value: '',
                description: 'Interfaces group - network interface information',
                hasChildren: true,
              },
              {
                oid: '1.3.6.1.2.1.25',
                name: 'host',
                value: '',
                description:
                  'Host Resources MIB - system resources information',
                hasChildren: true,
              },
              {
                oid: '1.3.6.1.2.1.17',
                name: 'bridge',
                value: '',
                description: 'Bridge MIB - bridge/switch information',
                hasChildren: true,
              },
            ]

            // Merge with discovered MIBs
            const allMibs = [...commonGroups, ...mibs]

            const result = {
              target: target,
              version: version,
              mibs: allMibs,
              status: 'success',
            }

            console.log('SNMP browse completed successfully')
            return Response.json(result)
          } catch (error) {
            console.log('SNMP browse error:', error)

            // Provide detailed error information
            let errorMessage = error.message
            let errorType = 'unknown'
            let suggestions: string[] = []

            if (
              error.name === 'RequestTimedOutError' ||
              error.message.includes('timed out')
            ) {
              errorType = 'timeout'
              errorMessage = 'SNMP request timed out'
              suggestions = [
                'Check if SNMP is enabled on the target device',
                'Verify the community string is correct',
                'Ensure the device is reachable on the network',
                'Check if SNMP is running on port 161',
                'Try a different SNMP version (v1 instead of v2c)',
              ]
            } else if (error.message.includes('ECONNREFUSED')) {
              errorType = 'connection_refused'
              errorMessage = 'Connection refused - SNMP service not available'
              suggestions = [
                'SNMP service is not running on the target device',
                'Check if SNMP is enabled in device configuration',
                'Verify firewall settings allow SNMP traffic on port 161',
              ]
            } else if (error.message.includes('EHOSTUNREACH')) {
              errorType = 'host_unreachable'
              errorMessage = 'Host unreachable'
              suggestions = [
                'Check network connectivity to the target device',
                'Verify the IP address is correct',
                'Check routing and firewall rules',
              ]
            } else if (error.message.includes('Authentication')) {
              errorType = 'authentication'
              errorMessage = 'SNMP authentication failed'
              suggestions = [
                'Check the community string is correct',
                'Verify SNMP version matches device configuration',
                'For SNMPv3, check username and credentials',
              ]
            }

            return Response.json({
              target: target,
              version: version,
              mibs: [],
              status: 'error',
              error: errorMessage,
              errorType: errorType,
              suggestions: suggestions,
              rawError: error.toString(),
            })
          }
        } catch (error) {
          console.error('SNMP browse API error:', error)
          return Response.json(
            { error: 'Internal server error' },
            { status: 500 }
          )
        }
      },
    },
    '/api/snmp-walk': {
      async POST(req) {
        console.log('=== SNMP WALK API REQUEST ===')
        try {
          const body = await req.json()
          console.log('SNMP walk request body:', body)
          const {
            target,
            community = 'public',
            version = '2c',
            oid,
            user,
          } = body

          if (!target || !oid) {
            console.log('Error: Target and OID are required')
            return Response.json(
              { error: 'Target and OID are required' },
              { status: 400 }
            )
          }

          // Validate target (basic validation)
          const targetRegex = /^[a-zA-Z0-9.-]+$/
          if (!targetRegex.test(target)) {
            console.log('Error: Invalid target format:', target)
            return Response.json(
              { error: 'Invalid target format' },
              { status: 400 }
            )
          }

          console.log(`Starting SNMP walk for ${target}, OID: ${oid}`)

          try {
            // Import net-snmp library
            const snmp = require('net-snmp')

            let session: any

            // Create SNMP session based on version
            if (version === '3') {
              if (!user || !user.name) {
                return Response.json(
                  { error: 'Username is required for SNMPv3' },
                  { status: 400 }
                )
              }

              // Map security levels
              const securityLevelMap: any = {
                noAuthNoPriv: snmp.SecurityLevel.noAuthNoPriv,
                authNoPriv: snmp.SecurityLevel.authNoPriv,
                authPriv: snmp.SecurityLevel.authPriv,
              }

              // Map auth protocols
              const authProtocolMap: any = {
                md5: snmp.AuthProtocols.md5,
                sha: snmp.AuthProtocols.sha,
                sha224: snmp.AuthProtocols.sha224,
                sha256: snmp.AuthProtocols.sha256,
                sha384: snmp.AuthProtocols.sha384,
                sha512: snmp.AuthProtocols.sha512,
              }

              // Map privacy protocols
              const privProtocolMap: any = {
                des: snmp.PrivProtocols.des,
                aes: snmp.PrivProtocols.aes,
                aes256b: snmp.PrivProtocols.aes256b,
                aes256r: snmp.PrivProtocols.aes256r,
              }

              const userOptions: any = {
                name: user.name,
                level:
                  securityLevelMap[user.level] ||
                  snmp.SecurityLevel.noAuthNoPriv,
              }

              // Add authentication if required
              if (user.level === 'authNoPriv' || user.level === 'authPriv') {
                if (!user.authKey) {
                  return Response.json(
                    {
                      error:
                        'Authentication key is required for this security level',
                    },
                    { status: 400 }
                  )
                }
                userOptions.authProtocol =
                  authProtocolMap[user.authProtocol] || snmp.AuthProtocols.md5
                userOptions.authKey = user.authKey
              }

              // Add privacy if required
              if (user.level === 'authPriv') {
                if (!user.privKey) {
                  return Response.json(
                    {
                      error:
                        'Privacy key is required for authPriv security level',
                    },
                    { status: 400 }
                  )
                }
                userOptions.privProtocol =
                  privProtocolMap[user.privProtocol] || snmp.PrivProtocols.des
                userOptions.privKey = user.privKey
              }

              console.log(
                'Creating SNMPv3 session for walk with user:',
                userOptions.name
              )
              session = snmp.createV3Session(target, userOptions)
            } else {
              // SNMPv1 or v2c
              const versionMap: any = {
                '1': snmp.Version1,
                '2c': snmp.Version2c,
              }

              console.log(
                `Creating SNMP session for walk with community: ${community}`
              )
              session = snmp.createSession(target, community, {
                version: versionMap[version] || snmp.Version2c,
              })
            }

            const results: any[] = []

            // Perform SNMP subtree walk
            const walkResults: any = await new Promise((resolve, reject) => {
              session.subtree(
                oid,
                20,
                (varbinds: any) => {
                  // Process each varbind
                  for (const varbind of varbinds) {
                    if (!snmp.isVarbindError(varbind)) {
                      results.push({
                        oid: varbind.oid,
                        name: varbind.oid.split('.').pop() || 'Unknown',
                        value: varbind.value.toString(),
                        type: varbind.type,
                      })
                    }
                  }
                },
                (error: any) => {
                  session.close()
                  if (error) {
                    reject(error)
                  } else {
                    resolve(results)
                  }
                }
              )
            })

            const result = {
              target: target,
              version: version,
              baseOid: oid,
              results: results,
              status: 'success',
            }

            console.log('SNMP walk completed successfully')
            return Response.json(result)
          } catch (error) {
            console.log('SNMP walk error:', error)
            return Response.json({
              target: target,
              version: version,
              baseOid: oid,
              results: [],
              status: 'error',
              error: error.message,
            })
          }
        } catch (error) {
          console.error('SNMP walk API error:', error)
          return Response.json(
            { error: 'Internal server error' },
            { status: 500 }
          )
        }
      },
    },
  },

  // Enable development mode for hot reloading
  development: process.env.NODE_ENV !== 'production',

  // Fallback handler for routing
  async fetch(req) {
    const url = new URL(req.url)
    const pathname = url.pathname

    // Log incoming request for debugging
    console.log(`Received request for: ${pathname}`)

    // Handle the root path
    if (pathname === '/') {
      return new Response(Bun.file(path.join(publicDir, 'index.html')))
    }

    // Handle inventory path
    if (
      pathname === '/inventory' ||
      pathname === '/network-administration/inventory'
    ) {
      return new Response(
        Bun.file(
          path.join(publicDir, 'network-administration/inventory/index.html')
        )
      )
    }

    // Handle tools path
    if (pathname === '/tools' || pathname === '/network-administration/tools') {
      return new Response(
        Bun.file(
          path.join(publicDir, 'network-administration/tools/index.html')
        )
      )
    }

    // Handle individual tool paths
    if (pathname === '/network-administration/tools/ping') {
      return new Response(
        Bun.file(
          path.join(publicDir, 'network-administration/tools/ping/index.html')
        )
      )
    }

    if (pathname === '/network-administration/tools/traceroute') {
      return new Response(
        Bun.file(
          path.join(
            publicDir,
            'network-administration/tools/traceroute/index.html'
          )
        )
      )
    }

    if (pathname === '/network-administration/tools/discover-devices') {
      return new Response(
        Bun.file(
          path.join(
            publicDir,
            'network-administration/tools/discover-devices/index.html'
          )
        )
      )
    }

    if (pathname === '/network-administration/tools/port-scan') {
      return new Response(
        Bun.file(
          path.join(
            publicDir,
            'network-administration/tools/port-scan/index.html'
          )
        )
      )
    }

    if (pathname === '/network-administration/tools/dns-lookup') {
      return new Response(
        Bun.file(
          path.join(
            publicDir,
            'network-administration/tools/dns-lookup/index.html'
          )
        )
      )
    }

    if (pathname === '/network-administration/tools/whois-lookup') {
      return new Response(
        Bun.file(
          path.join(
            publicDir,
            'network-administration/tools/whois-lookup/index.html'
          )
        )
      )
    }

    // Handle SNMP device polling path
    if (pathname === '/network-administration/snmp/device-polling') {
      return new Response(
        Bun.file(
          path.join(
            publicDir,
            'network-administration/snmp/device-polling/index.html'
          )
        )
      )
    }

    // Handle ICMP device status path
    if (pathname === '/network-administration/icmp/polling/device-status') {
      return new Response(
        Bun.file(
          path.join(
            publicDir,
            'network-administration/icmp/polling/device-status/index.html'
          )
        )
      )
    }

    // Handle ICMP polling templates path
    if (pathname === '/network-administration/icmp/polling/templates') {
      return new Response(
        Bun.file(
          path.join(
            publicDir,
            'network-administration/icmp/polling/templates/index.html'
          )
        )
      )
    }

    // Handle ICMP templates path
    if (pathname === '/network-administration/icmp/templates') {
      return new Response(
        Bun.file(
          path.join(
            publicDir,
            'network-administration/icmp/templates/index.html'
          )
        )
      )
    }

    // Serve files from public directory
    const filePath = path.join(publicDir, pathname)

    // Serve static files
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      console.log(`Serving file: ${filePath}`)

      // Set appropriate content type based on file extension
      const ext = path.extname(filePath).toLowerCase()
      let contentType = 'text/plain'

      switch (ext) {
        case '.html':
          contentType = 'text/html'
          break
        case '.js':
          contentType = 'application/javascript'
          break
        case '.css':
          contentType = 'text/css'
          break
        case '.json':
          contentType = 'application/json'
          break
      }

      return new Response(Bun.file(filePath), {
        headers: { 'Content-Type': contentType },
      })
    }

    // If pathname doesn't have an extension, try to serve it as an HTML file
    if (!pathname.includes('.')) {
      const htmlPath = path.join(publicDir, `${pathname}.html`)
      if (fs.existsSync(htmlPath)) {
        console.log(`Serving HTML file: ${htmlPath}`)
        return new Response(Bun.file(htmlPath))
      }
    }

    // Default fallback for unknown routes
    return new Response(
      `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>Page Not Found</title>
          <style>
            body { 
              font-family: sans-serif; 
              text-align: center; 
              padding: 50px; 
            }
            h1 { color: #d32f2f; }
            a { color: #1976d2; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <h1>404 - Page Not Found</h1>
          <p>The page you're looking for doesn't exist.</p>
          <p>Requested path: ${pathname}</p>
          <p><a href="/">Go back to home</a></p>
        </body>
      </html>
    `,
      {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      }
    )
  },
})

// Handle graceful shutdown
const handleShutdown = () => {
  console.log('Shutting down servers...')
  process.exit(0)
}

process.on('SIGINT', handleShutdown)
process.on('SIGTERM', handleShutdown)

console.log(`Frontend server is running on ${server.url}`)
console.log(`WebSocket server is running on ws://localhost:${actualWsPort}`)
console.log('Press Ctrl+C to stop the servers')
