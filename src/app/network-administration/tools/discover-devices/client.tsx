'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  Box,
  Typography,
  Button,
  Paper,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Divider,
  Grid,
  SelectChangeEvent,
  Stack,
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import ImportExportIcon from '@mui/icons-material/ImportExport'
import { atom, useAtom } from 'jotai'
import { startScan, stopScan, SnmpScanResult } from '@/utils/snmp/'
import { reverseDnsLookup } from '@/utils/dns/reverse'
import { getArpTable } from '@/utils/arp/lookup/'
import { ObjectId } from 'mongodb'

/**
 * Interface for Pool data
 */
interface Pool {
  id: string
  companyId: string
  subnetId: string
  name: string
  startIp: string
  endIp: string
  createdAt: number
}

/**
 * Interface for Subnet data
 */
interface Subnet {
  id: string
  companyId: string
  name: string
  cidr: string
  networkAddress: string
  broadcastAddress: string
  gateway: string
  createdAt: number
}

/**
 * Interface to match the expected ExtendedSubnetFields type for startScan
 */
interface ExtendedSubnetFields {
  _id: ObjectId
  id: string
  companyId: ObjectId
  name: string
  cidr: string
  networkAddress: string
  broadcastAddress: string
  gateway: string
  supernetId: ObjectId
  subnetAddress: string
  description: string
  createdAt: number
}

/**
 * Interface to match the expected ExtendedPoolFields type for startScan
 */
interface ExtendedPoolFields {
  _id: ObjectId
  companyId: ObjectId
  name: string
  startIp: string
  endIp: string
  description: string
  subnetId: ObjectId
  supernetId: ObjectId
}

/**
 * Interface for IPAddress data
 */
interface IPAddress {
  id: string
  companyId: string
  address: string
  subnetId: string
  networkInventoryId?: string
  status: string
  createdAt: number
}

/**
 * Interface for NetworkInventory data
 */
interface NetworkInventory {
  id: string
  companyId: string
  productId: string
  stockId: string
  macAddress: string
  ipAddress?: string
  subnetMask?: string
  gateway?: string
  createdAt: number
  updatedAt: number
}

/**
 * Interface for SNMP Settings
 */
interface SNMPSettings {
  id: string
  companyId: string
  version: 'v2' | 'v3'
  community?: string // v2 only
  username?: string // v3 only
  securityLevel?: string // v3 only
  authProtocol?: string // v3 only
  authKey?: string // v3 only
  privProtocol?: string // v3 only
  privKey?: string // v3 only
  createdAt: number
}

/**
 * Interface for OID data
 */
interface OID {
  id: string
  companyId: string
  oidName: string
  oid: string
  description?: string
  createdAt: number
}

/**
 * Interface for discovered device row
 */
interface DeviceRow {
  id: string
  hostname: string
  ipAddress: string
  macAddress: string
}

/**
 * Interface for MIB data row
 */
interface MibDataRow {
  id: string
  oidName: string
  oid: string
  value: string
}

// Define the Jotai atom for storing MIB data
const mibDataAtom = atom<MibDataRow[]>([])

/**
 * Hook to fetch network data for device discovery
 */
function useNetworkData(companyId: string = 'default-company-id') {
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [pools, setPools] = useState<Pool[]>([])
  const [subnets, setSubnets] = useState<Subnet[]>([])
  const [ipAddresses, setIPAddresses] = useState<IPAddress[]>([])
  const [networkInventory, setNetworkInventory] = useState<NetworkInventory[]>(
    []
  )
  const [snmpSettings, setSnmpSettings] = useState<SNMPSettings[]>([])

  // Function to fetch data from API
  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch pools
      const poolsResponse = await fetch(
        `/api/network-administration/ipam/pools?companyId=${companyId}`
      )
      if (!poolsResponse.ok) {
        throw new Error(`Failed to fetch pools: ${poolsResponse.statusText}`)
      }
      const poolsData = await poolsResponse.json()
      setPools(poolsData)

      // Fetch subnets
      const subnetsResponse = await fetch(
        `/api/network-administration/ipam/subnets?companyId=${companyId}`
      )
      if (!subnetsResponse.ok) {
        throw new Error(
          `Failed to fetch subnets: ${subnetsResponse.statusText}`
        )
      }
      const subnetsData = await subnetsResponse.json()
      setSubnets(subnetsData)

      // Fetch IP addresses
      const ipAddressesResponse = await fetch(
        `/api/network-administration/ipam/ipaddress?companyId=${companyId}`
      )
      if (!ipAddressesResponse.ok) {
        throw new Error(
          `Failed to fetch IP addresses: ${ipAddressesResponse.statusText}`
        )
      }
      const ipAddressesData = await ipAddressesResponse.json()
      setIPAddresses(ipAddressesData)

      // Fetch network inventory
      const networkInventoryResponse = await fetch(
        `/api/network-administration/inventory?companyId=${companyId}`
      )
      if (!networkInventoryResponse.ok) {
        throw new Error(
          `Failed to fetch network inventory: ${networkInventoryResponse.statusText}`
        )
      }
      const networkInventoryData = await networkInventoryResponse.json()
      setNetworkInventory(networkInventoryData)

      // Fetch SNMP settings (both v2 and v3)
      const snmpSettingsResponse = await fetch(
        `/api/network-administration/snmp/settings?companyId=${companyId}`
      )
      if (!snmpSettingsResponse.ok) {
        throw new Error(
          `Failed to fetch SNMP settings: ${snmpSettingsResponse.statusText}`
        )
      }
      const snmpSettingsData = await snmpSettingsResponse.json()
      setSnmpSettings(snmpSettingsData)
    } catch (err) {
      console.error('Error fetching network data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Import OIDs function
  const importOIDs = async (oids: MibDataRow[]) => {
    try {
      const response = await fetch(
        `/api/network-administration/snmp/oids?companyId=${companyId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ oids }),
        }
      )

      if (!response.ok) {
        throw new Error(`Failed to import OIDs: ${response.statusText}`)
      }

      return await response.json()
    } catch (err) {
      console.error('Error importing OIDs:', err)
      throw err
    }
  }

  // Fetch data on component mount
  useEffect(() => {
    fetchData()

    // Optional: Setup WebSocket connection for real-time updates
    const ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'}/ws?companyId=${companyId}`
    )

    ws.onopen = () => {
      console.log('WebSocket connection established')
    }

    ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data)

        // Handle different message types for real-time updates
        if (data.type === 'poolUpdate') {
          setPools(prev => {
            const index = prev.findIndex(p => p.id === data.pool.id)
            if (index >= 0) {
              const newPools = [...prev]
              newPools[index] = data.pool
              return newPools
            }
            return [...prev, data.pool]
          })
        } else if (data.type === 'subnetUpdate') {
          setSubnets(prev => {
            const index = prev.findIndex(s => s.id === data.subnet.id)
            if (index >= 0) {
              const newSubnets = [...prev]
              newSubnets[index] = data.subnet
              return newSubnets
            }
            return [...prev, data.subnet]
          })
        }
      } catch (err) {
        console.error('Error processing WebSocket message:', err)
      }
    }

    ws.onerror = error => {
      console.error('WebSocket error:', error)
    }

    ws.onclose = () => {
      console.log('WebSocket connection closed')
    }

    // Clean up WebSocket connection
    return () => {
      ws.close()
    }
  }, [companyId])

  return {
    loading,
    error,
    pools,
    subnets,
    ipAddresses,
    networkInventory,
    snmpSettings,
    refreshData: fetchData,
    importOIDs,
  }
}

/**
 * Main Discover Devices component
 */
const DiscoverDevices: React.FC = () => {
  // Use default company ID for demo purposes
  const companyId = 'default-company-id'
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [discoveredDevices, setDiscoveredDevices] = useState<DeviceRow[]>([])
  const [mibData, setMibData] = useAtom(mibDataAtom)
  const [arpTable, setArpTable] = useState<{ [ip: string]: string }>({})

  // Get network data using our custom hook
  const {
    loading,
    error,
    pools,
    subnets,
    ipAddresses,
    networkInventory,
    snmpSettings,
    importOIDs,
  } = useNetworkData(companyId)

  // Fetch ARP table on component mount
  useEffect(() => {
    const fetchArpTable = async () => {
      const table = await getArpTable()
      const arpMap = table.reduce(
        (
          acc: { [ip: string]: string },
          entry: { ipAddress: string; macAddress: string }
        ) => {
          acc[entry.ipAddress] = entry.macAddress
          return acc
        },
        {} as { [ip: string]: string }
      )
      setArpTable(arpMap)
    }
    fetchArpTable()
  }, [])

  // Handle pool selection
  const handlePoolChange = (event: SelectChangeEvent) => {
    const poolId = event.target.value
    const selectedPool = pools.find(p => p.id === poolId)
    setSelectedPool(selectedPool || null)
  }

  // Start discovery scan
  const handleStartDiscovery = async () => {
    if (!selectedPool) return

    setIsScanning(true)
    setDiscoveredDevices([])
    setMibData([])

    const subnet = subnets.find(s => s.id === selectedPool.subnetId)
    if (!subnet) {
      console.error('Subnet not found')
      setIsScanning(false)
      return
    }

    try {
      const onProgress = async (result: SnmpScanResult) => {
        const hostname = await reverseDnsLookup(result.ipAddress)
        const macAddress = arpTable[result.ipAddress] || ''

        setDiscoveredDevices(prev => [
          ...prev,
          {
            id: `${result.ipAddress}`,
            hostname: hostname || '',
            ipAddress: result.ipAddress,
            macAddress,
          },
        ])

        setMibData(prev => [
          ...prev,
          ...Object.entries(result.oids).map(([oid, value]) => ({
            id: `${result.ipAddress}-${oid}`,
            oidName: '',
            oid,
            value: String(value),
          })),
        ])
      }

      // Create an extended subnet that matches the expected type
      const extendedSubnet: ExtendedSubnetFields = {
        _id: new ObjectId(subnet.id),
        id: subnet.id,
        companyId: new ObjectId(subnet.companyId),
        name: subnet.name,
        cidr: subnet.cidr,
        networkAddress: subnet.networkAddress,
        broadcastAddress: subnet.broadcastAddress,
        gateway: subnet.gateway,
        supernetId: new ObjectId(),
        subnetAddress: subnet.networkAddress,
        description: '',
        createdAt: subnet.createdAt,
      }

      // Create an extended pool that matches the expected type
      const extendedPool: ExtendedPoolFields = {
        _id: new ObjectId(selectedPool.id),
        companyId: new ObjectId(selectedPool.companyId),
        name: selectedPool.name,
        startIp: selectedPool.startIp,
        endIp: selectedPool.endIp,
        description: '',
        subnetId: new ObjectId(selectedPool.subnetId),
        supernetId: new ObjectId(),
      }

      await startScan(
        extendedSubnet,
        extendedPool,
        snmpSettings,
        ipAddresses,
        networkInventory,
        onProgress
      )
    } catch (error) {
      console.error('Error during SNMP scan:', error)
    } finally {
      setIsScanning(false)
    }
  }

  // Stop discovery scan
  const handleStopDiscovery = () => {
    stopScan()
    setIsScanning(false)
  }

  // Import OIDs
  const handleImportOIDs = async () => {
    try {
      await importOIDs(mibData)
      alert('OIDs imported successfully')
    } catch (error) {
      console.error('Error importing OIDs:', error)
      alert('Error importing OIDs')
    }
  }

  // Render loading state
  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          p: 3,
        }}
      >
        <CircularProgress sx={{ mb: 2 }} />
        <Typography>Loading network data...</Typography>
      </Box>
    )
  }

  // Render error state
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error" variant="h6">
          Error
        </Typography>
        <Typography>{error}</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Tools - Discover Devices
      </Typography>
      <Typography color="text.secondary" paragraph>
        Discover network devices and browse MIBs with pool subnet, IP address
        range start and end, hostname, IP address, and MAC address
      </Typography>

      <Box sx={{ mb: 3 }}>
        <FormControl fullWidth>
          <InputLabel id="pool-select-label">Available Pool Subnets</InputLabel>
          <Select
            labelId="pool-select-label"
            id="pool-select"
            value={selectedPool?.id || ''}
            label="Available Pool Subnets"
            onChange={handlePoolChange}
          >
            {pools.map(pool => (
              <MenuItem key={pool.id} value={pool.id}>
                {pool.name} ({pool.startIp} - {pool.endIp})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {selectedPool && (
        <Typography paragraph>
          IP Range: {selectedPool.startIp} - {selectedPool.endIp}
        </Typography>
      )}

      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          onClick={handleStartDiscovery}
          disabled={isScanning || !selectedPool}
        >
          Start Discovery
        </Button>

        <Button
          variant="outlined"
          startIcon={<StopIcon />}
          onClick={handleStopDiscovery}
          disabled={!isScanning}
        >
          Stop Discovery
        </Button>

        <Button
          variant="outlined"
          startIcon={<ImportExportIcon />}
          onClick={handleImportOIDs}
          disabled={mibData.length === 0}
        >
          Import OIDs
        </Button>
      </Stack>

      <Grid container spacing={3}>
        {/* Discovered Devices Table */}
        <Grid item xs={12}>
          <Box>
            <Typography variant="h6" gutterBottom>
              Discovered Devices
            </Typography>
            <TableContainer component={Paper}>
              <Table aria-label="discovered devices table">
                <TableHead>
                  <TableRow>
                    <TableCell>Hostname</TableCell>
                    <TableCell>IP Address</TableCell>
                    <TableCell>MAC Address</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {discoveredDevices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center">
                        {isScanning
                          ? 'Scanning...'
                          : 'No devices discovered yet'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    discoveredDevices.map(device => (
                      <TableRow key={device.id} hover>
                        <TableCell>{device.hostname || 'Unknown'}</TableCell>
                        <TableCell>{device.ipAddress}</TableCell>
                        <TableCell>{device.macAddress || 'N/A'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Grid>

        {/* MIB Data Table */}
        <Grid item xs={12}>
          <Box>
            <Typography variant="h6" gutterBottom>
              MIB Browser
            </Typography>
            <TableContainer component={Paper}>
              <Table aria-label="MIB data table">
                <TableHead>
                  <TableRow>
                    <TableCell>OID Name</TableCell>
                    <TableCell>OID</TableCell>
                    <TableCell>Value</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mibData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center">
                        No MIB data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    mibData.map(row => (
                      <TableRow key={row.id} hover>
                        <TableCell>{row.oidName || 'Unknown'}</TableCell>
                        <TableCell>{row.oid}</TableCell>
                        <TableCell>{row.value}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Grid>
      </Grid>
    </Box>
  )
}

export default DiscoverDevices
