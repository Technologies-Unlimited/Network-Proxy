import { ExtendedSubnetFields } from '../../schema/network-administration/ipam/subnet/schema'
import { ExtendedPoolFields } from '../../schema/network-administration/ipam/pool/schema'
import { performIcmpPing } from './icmp-ping'
import { getIpAddressesInRange, isValidIpAddress, isIpInCidr } from './ip-utils'
import { DeviceStatus } from '../../types/network-administration/icmp/polling/status/types'

interface IPAddressScanResult {
  address: string
  deviceStatus: {
    deviceStatus: DeviceStatus
    latency: number | undefined
  }[]
}

let isScanningActive = false

export async function scanSubnetPool(
  subnet: ExtendedSubnetFields,
  pool: ExtendedPoolFields,
  options: {
    onStart?: () => void
    onProgress?: (progress: number) => void
    onResult?: (result: IPAddressScanResult) => void
    onStop?: () => void
    pingCount?: number
  } = {}
): Promise<IPAddressScanResult[]> {
  const { onStart, onProgress, onResult, onStop, pingCount = 5 } = options

  const poolIpAddresses = getIpAddressesInRange(pool.startIp, pool.endIp)
  const subnetIpAddresses = poolIpAddresses.filter(ip =>
    isIpInCidr(ip, subnet.cidr)
  )
  const totalAddresses = subnetIpAddresses.length

  if (isScanningActive) {
    throw new Error('A scan is already in progress')
  }

  isScanningActive = true

  if (onStart) {
    onStart()
  }

  const results: IPAddressScanResult[] = []

  try {
    for (let i = 0; i < subnetIpAddresses.length; i++) {
      const ip = subnetIpAddresses[i]
      if (isValidIpAddress(ip)) {
        const pingResults = await performIcmpPing(ip, {
          pingCount,
          onResult: pingResult => {
            if (onResult) {
              onResult({
                address: ip,
                deviceStatus: [pingResult],
              })
            }
          },
          onProgress: pingProgress => {
            if (onProgress) {
              onProgress((i + pingProgress) / totalAddresses)
            }
          },
        })

        const result: IPAddressScanResult = {
          address: ip,
          deviceStatus: pingResults,
        }

        results.push(result)

        if (onResult) {
          onResult(result)
        }
      }

      if (onProgress) {
        onProgress((i + 1) / totalAddresses)
      }
    }

    return results
  } finally {
    isScanningActive = false
    if (onStop) {
      onStop()
    }
  }
}
