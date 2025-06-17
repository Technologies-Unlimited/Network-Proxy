import { NextRequest, NextResponse } from 'next/server'
import { runIperfTest } from '../../../../../services/iperf'

/**
 * Handle iperf3 test requests
 * This endpoint is for one-off tests, for real-time results use the WebSocket
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    if (!body.sourceServerId) {
      return NextResponse.json(
        { success: false, message: 'Source server ID is required' },
        { status: 400 }
      )
    }

    if (!body.destinationServerId) {
      return NextResponse.json(
        { success: false, message: 'Destination server ID is required' },
        { status: 400 }
      )
    }

    // Run the test
    const result = await runIperfTest({
      sourceServerId: body.sourceServerId,
      destinationServerId: body.destinationServerId,
      duration: body.duration || 10,
      protocol: body.protocol || 'tcp',
      parallel: body.parallel || 1,
      windowSize: body.windowSize || 128,
      port: body.port || 5201,
    })

    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('Error running iperf test:', error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * Get a list of previously run iperf tests
 */
export async function GET() {
  try {
    // This could be expanded to retrieve test history from a database
    return NextResponse.json({
      success: true,
      message:
        'Iperf test history feature will be implemented in a future update',
    })
  } catch (error) {
    console.error('Error getting iperf test history:', error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
