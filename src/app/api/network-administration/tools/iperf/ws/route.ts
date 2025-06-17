import { NextResponse } from 'next/server'
import { WebSocketHandler } from '../../../../../../websockets/server'

// Handle WebSocket connections for iperf tests
// This API route is used to establish a WebSocket connection for real-time iperf test results
export function GET() {
  // Redirect to the WebSocket server for tools/iperf
  return new NextResponse(null, {
    status: 200,
    headers: {
      Upgrade: 'websocket',
      Connection: 'Upgrade',
      'Sec-WebSocket-Protocol': 'tools.iperf',
    },
  })
}

export const dynamic = 'force-dynamic'
