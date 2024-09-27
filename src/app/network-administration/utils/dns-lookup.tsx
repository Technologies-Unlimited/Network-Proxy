import { promisify } from 'util'
import { exec } from 'child_process'

const execAsync = promisify(exec)

export async function performDnsLookup(ip: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`nslookup ${ip}`)
    const hostnameMatch = stdout.match(/name = (.+)/)
    return hostnameMatch ? hostnameMatch[1].trim() : null
  } catch (error) {
    console.error(`DNS lookup failed for ${ip}:`, error)
    return null
  }
}
