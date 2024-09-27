import dns from 'dns'
import { promisify } from 'util'

const reverse = promisify(dns.reverse)

export async function reverseDnsLookup(ip: string): Promise<string | null> {
  try {
    const hostnames = await reverse(ip)
    return hostnames[0] || null
  } catch (error) {
    console.error(`Reverse DNS lookup failed for IP ${ip}:`, error)
    return null
  }
}

export async function batchReverseDnsLookup(
  ips: string[]
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>()

  const lookupPromises = ips.map(async ip => {
    const hostname = await reverseDnsLookup(ip)
    results.set(ip, hostname)
  })

  await Promise.all(lookupPromises)

  return results
}
