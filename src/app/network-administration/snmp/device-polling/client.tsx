'use client'

import React, { useState, useEffect } from 'react'
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Box,
  CircularProgress,
  Chip,
} from '@mui/material'

/**
 * Interface for SNMP polling status
 */
interface SNMPPollingStatus {
  id: string
  companyId: string
  snmpPollingTemplateId: string
  snmpTemplateId?: string
  manufacturerId?: string
  modelNameId?: string
  productId?: string
  stockIds?: string[]
  networkInventoryIds?: string[]
  uptime?: number
  downtime?: number
  deviceStatus: string
  createdAt: number
  updatedAt: number
}

/**
 * Interface for SNMP polling template
 */
interface SNMPPollingTemplate {
  id: string
  companyId: string
  name: string
  version: 'v2' | 'v3'
  frequency?: number
  timeout?: number
  retries?: number
  createdAt: number
}

/**
 * Interface for SNMP template
 */
interface SNMPTemplate {
  id: string
  companyId: string
  templateName: string
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
 * Interface for Network Inventory
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
 * Interface for IP Address
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
 * Hook to fetch SNMP polling data via WebSocket/REST API
 */
function useSNMPPollingData(companyId: string = 'default-company-id') {
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [snmpPollingStatuses, setSNMPPollingStatuses] = useState<
    SNMPPollingStatus[]
  >([])
  const [snmpPollingTemplates, setSNMPPollingTemplates] = useState<
    SNMPPollingTemplate[]
  >([])
  const [snmpTemplates, setSNMPTemplates] = useState<SNMPTemplate[]>([])
  const [networkInventories, setNetworkInventories] = useState<
    NetworkInventory[]
  >([])
  const [ipAddresses, setIPAddresses] = useState<IPAddress[]>([])
  const [selectedStatus, setSelectedStatus] =
    useState<SNMPPollingStatus | null>(null)

  // Function to refresh data
  const refreshData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch SNMP polling statuses
      const statusResponse = await fetch(
        `/api/network-administration/snmp/polling/status?companyId=${companyId}`
      )
      if (!statusResponse.ok) {
        throw new Error(
          `Failed to fetch SNMP polling statuses: ${statusResponse.statusText}`
        )
      }
      const statusData = await statusResponse.json()
      setSNMPPollingStatuses(statusData)

      // Fetch SNMP polling templates (both v2 and v3)
      const templateResponse = await fetch(
        `/api/network-administration/snmp/polling/templates?companyId=${companyId}`
      )
      if (!templateResponse.ok) {
        throw new Error(
          `Failed to fetch SNMP polling templates: ${templateResponse.statusText}`
        )
      }
      const templateData = await templateResponse.json()
      setSNMPPollingTemplates(templateData)

      // Fetch SNMP templates (both v2 and v3)
      const snmpTemplateResponse = await fetch(
        `/api/network-administration/snmp/templates?companyId=${companyId}`
      )
      if (!snmpTemplateResponse.ok) {
        throw new Error(
          `Failed to fetch SNMP templates: ${snmpTemplateResponse.statusText}`
        )
      }
      const snmpTemplateData = await snmpTemplateResponse.json()
      setSNMPTemplates(snmpTemplateData)

      // Extract network inventory IDs from polling statuses
      const networkInvIds = statusData.flatMap(
        (status: SNMPPollingStatus) => status.networkInventoryIds || []
      )

      if (networkInvIds.length > 0) {
        // Fetch network inventories
        const networkInvResponse = await fetch(
          `/api/network-administration/inventory?companyId=${companyId}&ids=${networkInvIds.join(',')}`
        )
        if (!networkInvResponse.ok) {
          throw new Error(
            `Failed to fetch network inventories: ${networkInvResponse.statusText}`
          )
        }
        const networkInvData = await networkInvResponse.json()
        setNetworkInventories(networkInvData)

        // Fetch IP addresses
        const ipResponse = await fetch(
          `/api/network-administration/ipam/ipaddress?companyId=${companyId}`
        )
        if (!ipResponse.ok) {
          throw new Error(
            `Failed to fetch IP addresses: ${ipResponse.statusText}`
          )
        }
        const ipData = await ipResponse.json()
        setIPAddresses(ipData)
      }
    } catch (err) {
      console.error('Error fetching SNMP polling data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Fetch data on component mount
  useEffect(() => {
    refreshData()

    // Optional: Setup WebSocket connection for real-time updates
    const ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'}/ws?companyId=${companyId}`
    )

    ws.onopen = () => {
      console.log('WebSocket connection established')
      // Request initial data
      ws.send(JSON.stringify({ type: 'requestInitialSNMPData' }))
    }

    ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data)

        // Handle different message types
        if (data.type === 'initialSNMPData' && Array.isArray(data.statuses)) {
          setSNMPPollingStatuses(data.statuses)
          if (data.templates) setSNMPPollingTemplates(data.templates)
          if (data.snmpTemplates) setSNMPTemplates(data.snmpTemplates)
          if (data.networkInventories)
            setNetworkInventories(data.networkInventories)
          if (data.ipAddresses) setIPAddresses(data.ipAddresses)
          setLoading(false)
        } else if (data.type === 'snmp') {
          // Handle individual SNMP status update
          setSNMPPollingStatuses(prev => {
            const index = prev.findIndex(status => status.id === data._id)
            if (index >= 0) {
              const newStatuses = [...prev]
              newStatuses[index] = {
                id: data._id,
                companyId: data.companyId,
                snmpPollingTemplateId: data.snmpPollingTemplateId,
                snmpTemplateId: data.snmpTemplateId,
                manufacturerId: data.manufacturerId,
                modelNameId: data.modelNameId,
                productId: data.productId,
                stockIds: data.stockIds,
                networkInventoryIds: data.networkInventoryIds,
                uptime: data.uptime,
                downtime: data.downtime,
                deviceStatus: data.deviceStatus,
                createdAt: data.createdAt || Date.now(),
                updatedAt: data.updatedAt || Date.now(),
              }
              return newStatuses
            }
            return prev
          })
        } else if (data.type === 'deleteSNMP') {
          // Handle SNMP status deletion
          setSNMPPollingStatuses(prev =>
            prev.filter(status => status.id !== data.id)
          )
        } else if (data.type === 'error') {
          console.error('WebSocket error:', data.message)
          setError(data.message)
        }
      } catch (err) {
        console.error('Error processing WebSocket message:', err)
      }
    }

    ws.onerror = error => {
      console.error('WebSocket error:', error)
      setError('WebSocket connection error')
    }

    ws.onclose = () => {
      console.log('WebSocket connection closed')
    }

    // Clean up WebSocket connection
    return () => {
      ws.close()
    }
  }, [companyId])

  // Handle row selection
  const handleSelectStatus = (status: SNMPPollingStatus) => {
    setSelectedStatus(status)
  }

  return {
    loading,
    error,
    snmpPollingStatuses,
    snmpPollingTemplates,
    snmpTemplates,
    networkInventories,
    ipAddresses,
    selectedStatus,
    handleSelectStatus,
    refreshData,
  }
}

/**
 * Format seconds into a human-readable duration
 */
function formatDuration(seconds?: number): string {
  if (seconds === undefined || seconds === 0) return '0 seconds'

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  const parts = []
  if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`)
  if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`)
  if (minutes > 0) parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`)
  if (remainingSeconds > 0 || parts.length === 0)
    parts.push(`${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`)

  return parts.join(', ')
}

/**
 * Get status chip color based on device status
 */
function getStatusColor(
  status: string
): 'success' | 'error' | 'warning' | 'default' {
  switch (status.toLowerCase()) {
    case 'up':
      return 'success'
    case 'down':
      return 'error'
    case 'warning':
      return 'warning'
    default:
      return 'default'
  }
}

/**
 * Main SNMP Device Polling component
 */
const DevicePolling: React.FC = () => {
  // Use our custom hook to fetch data
  const {
    loading,
    error,
    snmpPollingStatuses,
    snmpPollingTemplates,
    snmpTemplates,
    networkInventories,
    ipAddresses,
    selectedStatus,
    handleSelectStatus,
    refreshData,
  } = useSNMPPollingData()

  // Create lookup maps for efficient access
  const templateMap = snmpPollingTemplates.reduce(
    (map, template) => {
      map[template.id] = template
      return map
    },
    {} as Record<string, SNMPPollingTemplate>
  )

  const snmpTemplateMap = snmpTemplates.reduce(
    (map, template) => {
      map[template.id] = template
      return map
    },
    {} as Record<string, SNMPTemplate>
  )

  const networkInventoryMap = networkInventories.reduce(
    (map, inv) => {
      map[inv.id] = inv
      return map
    },
    {} as Record<string, NetworkInventory>
  )

  // Create a map of IP addresses by network inventory ID
  const ipAddressesByNetworkInventory = ipAddresses.reduce(
    (map, ip) => {
      if (ip.networkInventoryId) {
        map[ip.networkInventoryId] = ip
      }
      return map
    },
    {} as Record<string, IPAddress>
  )

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
        <Typography>Loading SNMP polling status...</Typography>
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
        SNMP - Device Polling Status
      </Typography>
      <Typography color="text.secondary" paragraph>
        View SNMP device polling status with uptime, downtime, and device status
      </Typography>

      <TableContainer component={Paper} sx={{ mt: 2 }}>
        <Table sx={{ minWidth: 650 }} aria-label="SNMP polling status table">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>SNMP Polling Template</TableCell>
              <TableCell>SNMP Template</TableCell>
              <TableCell>Network Devices</TableCell>
              <TableCell>IP Address</TableCell>
              <TableCell>Uptime</TableCell>
              <TableCell>Downtime</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {snmpPollingStatuses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  No SNMP polling status data available
                </TableCell>
              </TableRow>
            ) : (
              snmpPollingStatuses.map(status => {
                const pollingTemplate =
                  templateMap[status.snmpPollingTemplateId]
                const snmpTemplate = status.snmpTemplateId
                  ? snmpTemplateMap[status.snmpTemplateId]
                  : undefined

                // Get network devices
                const devices = status.networkInventoryIds
                  ? status.networkInventoryIds
                      .map(id => networkInventoryMap[id])
                      .filter(Boolean)
                  : []

                // Get IP address of first device
                let ipAddress = 'No IP Assigned'
                if (
                  devices.length > 0 &&
                  ipAddressesByNetworkInventory[devices[0].id]
                ) {
                  ipAddress =
                    ipAddressesByNetworkInventory[devices[0].id].address
                }

                return (
                  <TableRow
                    key={status.id}
                    hover
                    onClick={() => handleSelectStatus(status)}
                    selected={selectedStatus?.id === status.id}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>{status.id.substring(0, 8)}...</TableCell>
                    <TableCell>{pollingTemplate?.name || 'Unknown'}</TableCell>
                    <TableCell>
                      {snmpTemplate?.templateName || 'Unknown'}
                    </TableCell>
                    <TableCell>
                      {devices.length > 0
                        ? devices.map(d => d.macAddress).join(', ')
                        : 'No devices'}
                    </TableCell>
                    <TableCell>{ipAddress}</TableCell>
                    <TableCell>{formatDuration(status.uptime)}</TableCell>
                    <TableCell>{formatDuration(status.downtime)}</TableCell>
                    <TableCell>
                      <Chip
                        label={status.deviceStatus}
                        color={getStatusColor(status.deviceStatus)}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}

export default DevicePolling
