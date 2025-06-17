/**
 * Network Discovery Service
 * Provides functionality to discover iperf servers and other network devices on the local network
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { networkInterfaces } from 'os';

const execAsync = promisify(exec);

export interface NetworkInterface {
  name: string;
  address: string;
  netmask: string;
  family: string;
  mac: string;
  internal: boolean;
  cidr: string | null;
}

export interface DiscoveredService {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  type: 'iperf' | 'snmp' | 'other';
  responseTime?: number;
  status: 'online' | 'offline';
  discoveredAt: number;
}

/**
 * Get all network interfaces on the current machine
 * @returns List of network interfaces
 */
export function getNetworkInterfaces(): NetworkInterface[] {
  const interfaces = networkInterfaces();
  const result: NetworkInterface[] = [];

  Object.keys(interfaces).forEach((ifaceName) => {
    const iface = interfaces[ifaceName];
    if (iface) {
      iface.forEach((details) => {
        if (details.family === 'IPv4' && !details.internal) {
          result.push({
            name: ifaceName,
            address: details.address,
            netmask: details.netmask,
            family: details.family,
            mac: details.mac,
            internal: details.internal,
            cidr: details.cidr
          });
        }
      });
    }
  });

  return result;
}

/**
 * Get subnet CIDR notation from IP address and netmask
 * @param ipAddress IP address
 * @param netmask Subnet mask
 * @returns CIDR notation (e.g., 192.168.1.0/24)
 */
export function getSubnetCIDR(ipAddress: string, netmask: string): string {
  // Convert IP and netmask to binary
  const ipBinary = ipAddress.split('.').map(octet => parseInt(octet, 10).toString(2).padStart(8, '0')).join('');
  const maskBinary = netmask.split('.').map(octet => parseInt(octet, 10).toString(2).padStart(8, '0')).join('');
  
  // Count the number of 1s in the netmask
  const prefixLength = maskBinary.split('').filter(bit => bit === '1').length;
  
  // Calculate the network address
  const networkBinary = ipBinary.substring(0, prefixLength).padEnd(32, '0');
  const networkAddress = [
    parseInt(networkBinary.substring(0, 8), 2),
    parseInt(networkBinary.substring(8, 16), 2),
    parseInt(networkBinary.substring(16, 24), 2),
    parseInt(networkBinary.substring(24, 32), 2)
  ].join('.');
  
  return `${networkAddress}/${prefixLength}`;
}

/**
 * Discover active hosts on a subnet using ping
 * @param subnet Subnet in CIDR notation (e.g., 192.168.1.0/24)
 * @returns List of active IP addresses
 */
export async function discoverActiveHosts(subnet: string): Promise<string[]> {
  const [network, prefixLength] = subnet.split('/');
  const networkParts = network.split('.');
  const prefix = parseInt(prefixLength, 10);
  
  // Calculate number of hosts
  const numHosts = Math.pow(2, 32 - prefix) - 2; // Subtract 2 for network and broadcast
  if (numHosts > 254) {
    console.warn(`Large subnet detected (${numHosts} hosts). Limiting scan to first 254 hosts.`);
  }
  
  const maxHosts = Math.min(numHosts, 254); // Limit to avoid excessive scanning
  const baseIP = networkParts.slice(0, 3).join('.');
  const results: string[] = [];
  
  // Use OS-specific commands for faster scanning
  try {
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      // Use arp-scan on Windows (if available)
      try {
        const { stdout } = await execAsync(`arp-scan ${subnet}`);
        const matches = stdout.match(/(\d+\.\d+\.\d+\.\d+)/g);
        if (matches) {
          return matches;
        }
      } catch (error) {
        // Fall back to ping if arp-scan is not available
        console.log('arp-scan not available, falling back to ping');
      }
      
      // Use ping sweep
      for (let i = 1; i <= maxHosts; i++) {
        try {
          const ip = `${baseIP}.${i}`;
          const { stdout } = await execAsync(`ping -n 1 -w 100 ${ip}`);
          if (stdout.includes('Reply from')) {
            results.push(ip);
          }
        } catch (error) {
          // Ignore ping failures
        }
      }
    } else {
      // Use nmap on Linux/macOS (if available)
      try {
        const { stdout } = await execAsync(`nmap -sn ${subnet} | grep "Nmap scan report for"`);
        const matches = stdout.match(/Nmap scan report for\s+(\d+\.\d+\.\d+\.\d+)/g);
        if (matches) {
          return matches.map(line => line.match(/(\d+\.\d+\.\d+\.\d+)/)?.[1] || '').filter(Boolean);
        }
      } catch (error) {
        // Fall back to ping if nmap is not available
        console.log('nmap not available, falling back to ping');
      }
      
      // Use ping sweep
      for (let i = 1; i <= maxHosts; i++) {
        try {
          const ip = `${baseIP}.${i}`;
          const { stdout } = await execAsync(`ping -c 1 -W 1 ${ip}`);
          if (stdout.includes(' 0% packet loss')) {
            results.push(ip);
          }
        } catch (error) {
          // Ignore ping failures
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error scanning network:', error);
    return [];
  }
}

/**
 * Discover iperf3 servers on the network
 * @param hosts List of IP addresses to check
 * @param port The port to check for iperf3 servers (default: 5201)
 * @returns List of discovered iperf3 servers
 */
export async function discoverIperfServers(hosts: string[], port: number = 5201): Promise<DiscoveredService[]> {
  const results: DiscoveredService[] = [];
  
  for (const host of hosts) {
    try {
      // Check if the port is open using a simple TCP connection
      const isWindows = process.platform === 'win32';
      let isOpen = false;
      
      if (isWindows) {
        // Use PowerShell Test-NetConnection on Windows
        try {
          const { stdout } = await execAsync(`powershell -command "Test-NetConnection -ComputerName ${host} -Port ${port} -InformationLevel Quiet -WarningAction SilentlyContinue"`);
          isOpen = stdout.trim() === "True";
        } catch (error) {
          // Ignore errors, connection failed
        }
      } else {
        // Use nc (netcat) on Linux/macOS
        try {
          await execAsync(`nc -z -w 1 ${host} ${port}`);
          isOpen = true;
        } catch (error) {
          // Ignore errors, connection failed
        }
      }
      
      if (isOpen) {
        // Port is open, attempt to verify it's an iperf server
        // We can't directly check if it's iperf without making a connection,
        // so we'll just assume it's iperf for now and validate when connecting
        
        // Measure response time
        const startTime = Date.now();
        if (isWindows) {
          await execAsync(`powershell -command "Test-NetConnection -ComputerName ${host} -Port ${port} -InformationLevel Quiet -WarningAction SilentlyContinue"`);
        } else {
          await execAsync(`nc -z -w 1 ${host} ${port}`);
        }
        const responseTime = Date.now() - startTime;
        
        results.push({
          id: `iperf-${host}-${port}`,
          name: `iperf @ ${host}`,
          ipAddress: host,
          port,
          type: 'iperf',
          responseTime,
          status: 'online',
          discoveredAt: Date.now()
        });
      }
    } catch (error) {
      console.error(`Error checking iperf on ${host}:${port}:`, error);
    }
  }
  
  return results;
}

/**
 * Discover all available iperf3 servers on the local network
 * @param port The port to check for iperf3 servers (default: 5201)
 * @returns List of discovered iperf3 servers
 */
export async function discoverAllIperfServers(port: number = 5201): Promise<DiscoveredService[]> {
  try {
    console.log(`Starting iperf server discovery on port ${port}`);
    
    // Get all network interfaces
    const interfaces = getNetworkInterfaces();
    console.log(`Found ${interfaces.length} network interfaces`);
    interfaces.forEach(iface => {
      console.log(`Interface: ${iface.name}, Address: ${iface.address}, Mask: ${iface.netmask}`);
    });
    
    const activeHosts: string[] = [];
    
    // Scan each interface's subnet for active hosts
    for (const iface of interfaces) {
      try {
        const subnet = iface.cidr || getSubnetCIDR(iface.address, iface.netmask);
        console.log(`Scanning subnet ${subnet} on interface ${iface.name}`);
        const hosts = await discoverActiveHosts(subnet);
        console.log(`Found ${hosts.length} active hosts on subnet ${subnet}`);
        activeHosts.push(...hosts);
      } catch (error) {
        console.error(`Error scanning subnet for interface ${iface.name}:`, error);
      }
    }
    
    // If no hosts found, add localhost for testing
    if (activeHosts.length === 0) {
      console.log('No hosts found on network, adding localhost for testing');
      activeHosts.push('127.0.0.1');
      // Try to add the machine's own IP as well
      try {
        for (const iface of interfaces) {
          if (!iface.internal && iface.family === 'IPv4') {
            console.log(`Adding own IP address: ${iface.address}`);
            activeHosts.push(iface.address);
          }
        }
      } catch (error) {
        console.error('Error adding own IP address:', error);
      }
    }
    
    // Remove duplicates
    const uniqueHosts = [...new Set(activeHosts)];
    console.log(`Found ${uniqueHosts.length} unique active hosts across all interfaces`);
    
    // Check each host for iperf3 server
    console.log(`Checking each host for iperf3 server on port ${port}...`);
    const servers = await discoverIperfServers(uniqueHosts, port);
    console.log(`Found ${servers.length} iperf servers on the network`);
    
    return servers;
  } catch (error) {
    console.error('Error discovering iperf servers:', error);
    return [];
  }
}