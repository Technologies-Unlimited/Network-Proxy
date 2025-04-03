export function ipToLong(ip: string): number {
  return (
    ip
      .split('.')
      .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
  )
}

export function longToIp(long: number): string {
  return [
    (long >>> 24) & 255,
    (long >>> 16) & 255,
    (long >>> 8) & 255,
    long & 255,
  ].join('.')
}

export function getIpAddressesInRange(
  startIp: string,
  endIp: string
): string[] {
  const start = ipToLong(startIp)
  const end = ipToLong(endIp)
  const ipAddresses: string[] = []

  for (let i = start; i <= end; i++) {
    ipAddresses.push(longToIp(i))
  }

  return ipAddresses
}

export function isValidIpAddress(ip: string): boolean {
  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/
  if (!ipPattern.test(ip)) return false
  return ip.split('.').every(octet => parseInt(octet, 10) <= 255)
}

export function isIpInCidr(ip: string, cidr: string): boolean {
  const [subnet, bits] = cidr.split('/')
  const mask = ~(2 ** (32 - parseInt(bits)) - 1)
  const ipLong = ipToLong(ip)
  const subnetLong = ipToLong(subnet)
  return (ipLong & mask) === (subnetLong & mask)
}
