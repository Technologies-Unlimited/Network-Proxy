import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface ArpEntry {
  ipAddress: string
  macAddress: string
}

export async function getArpTable(): Promise<ArpEntry[]> {
  try {
    let command: string
    if (process.platform === 'win32') {
      command = 'arp -a'
    } else {
      command = 'arp -e'
    }

    const { stdout } = await execAsync(command)
    return parseArpOutput(stdout)
  } catch (error) {
    console.error('Error getting ARP table:', error)
    return []
  }
}

function parseArpOutput(output: string): ArpEntry[] {
  const lines = output.split('\n')
  const entries: ArpEntry[] = []

  for (const line of lines) {
    if (process.platform === 'win32') {
      const match = line.match(/(\d+\.\d+\.\d+\.\d+)\s+([0-9A-Fa-f-]+)/)
      if (match) {
        entries.push({
          ipAddress: match[1],
          macAddress: match[2].replace(/-/g, ':'),
        })
      }
    } else {
      const match = line.match(/(\d+\.\d+\.\d+\.\d+)\s+\w+\s+([0-9A-Fa-f:]+)/)
      if (match) {
        entries.push({
          ipAddress: match[1],
          macAddress: match[2],
        })
      }
    }
  }

  return entries
}
