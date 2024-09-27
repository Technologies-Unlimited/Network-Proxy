import { promisify } from 'util'
import { exec } from 'child_process'
import { ICMPPollingStatusFields } from '../../types/network-administration/icmp/polling/status/types'

const execAsync = promisify(exec)

export type IcmpPingResult = {
  deviceStatus: ICMPPollingStatusFields['deviceStatus']
  latency: number | undefined
}

let isPingingActive = false

export async function performIcmpPing(
  ip: string,
  options: {
    onStart?: () => void
    onProgress?: (progress: number) => void
    onResult?: (result: IcmpPingResult) => void
    onStop?: () => void
    pingCount?: number
  } = {}
): Promise<IcmpPingResult[]> {
  const { onStart, onProgress, onResult, onStop, pingCount = 5 } = options

  if (isPingingActive) {
    throw new Error('A ping operation is already in progress')
  }

  isPingingActive = true

  if (onStart) {
    onStart()
  }

  const results: IcmpPingResult[] = []

  try {
    for (let i = 0; i < pingCount; i++) {
      try {
        const startTime = Date.now()
        await execAsync(`ping -c 1 -W 1 ${ip}`)
        const latency = Date.now() - startTime
        const result: IcmpPingResult = { deviceStatus: 'online', latency }

        results.push(result)

        if (onResult) {
          onResult(result)
        }
      } catch {
        const result: IcmpPingResult = {
          deviceStatus: 'offline',
          latency: undefined,
        }

        results.push(result)

        if (onResult) {
          onResult(result)
        }
      }

      if (onProgress) {
        onProgress((i + 1) / pingCount)
      }
    }

    return results
  } finally {
    isPingingActive = false
    if (onStop) {
      onStop()
    }
  }
}
