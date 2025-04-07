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
 * Interface for ICMP polling status from SQLite
 */
interface ICMPPollingStatus {
  id: string
  companyId: string
  icmpPollingTemplateId: string
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
 * Interface for ICMP polling template from SQLite
 */
interface ICMPPollingTemplate {
  id: string
  companyId: string
  name: string
  description?: string
  frequency?: number
  timeout?: number
  retries?: number
  pollingFrequencyDays?: number
  pollingFrequencyHours?: number
  pollingFrequencyMinutes?: number
  pollingFrequencySeconds?: number
  downtimeTriggerDays?: number
  downtimeTriggerHours?: number
  downtimeTriggerMinutes?: number
  downtimeTriggerSeconds?: number
  createdAt: number
}

/**
 * Hook to fetch ICMP polling status data from WebSocket API
 */
function useICMPData(companyId: string = 'default-company-id') {
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [icmpPollingStatuses, setIcmpPollingStatuses] = useState<
    ICMPPollingStatus[]
  >([])
  const [pollingTemplates, setPollingTemplates] = useState<
    ICMPPollingTemplate[]
  >([])

  // Function to refresh ICMP data
  const refreshData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch ICMP polling statuses
      const statusResponse = await fetch(
        `/api/network-administration/icmp/polling/status?companyId=${companyId}`
      )
      if (!statusResponse.ok) {
        throw new Error(
          `Failed to fetch ICMP polling statuses: ${statusResponse.statusText}`
        )
      }
      const statusData = await statusResponse.json()
      setIcmpPollingStatuses(statusData)

      // Fetch ICMP polling templates
      const templateResponse = await fetch(
        `/api/network-administration/icmp/polling/templates?companyId=${companyId}`
      )
      if (!templateResponse.ok) {
        throw new Error(
          `Failed to fetch ICMP polling templates: ${templateResponse.statusText}`
        )
      }
      const templateData = await templateResponse.json()
      setPollingTemplates(templateData)
    } catch (err) {
      console.error('Error fetching ICMP data:', err)
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
      ws.send(JSON.stringify({ type: 'requestInitialICMPData' }))
    }

    ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data)

        // Handle different message types
        if (data.type === 'initialICMPData' && Array.isArray(data.statuses)) {
          setIcmpPollingStatuses(data.statuses)
          setLoading(false)
        } else if (data.type === 'icmp') {
          // Handle individual ICMP update
          setIcmpPollingStatuses(prev => {
            // Replace the updated status in the array
            const index = prev.findIndex(status => status.id === data._id)
            if (index >= 0) {
              const newStatuses = [...prev]
              newStatuses[index] = {
                id: data._id,
                companyId: data.companyId,
                icmpPollingTemplateId: data.icmpPollingTemplateId,
                manufacturerId: data.manufacturerId,
                modelNameId: data.modelNameId,
                productId: data.productId,
                stockIds: data.stockIds,
                networkInventoryIds: data.networkInventoryIds,
                uptime: data.uptime,
                downtime: data.downtime,
                deviceStatus: data.deviceStatus,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              }
              return newStatuses
            }
            return prev
          })
        } else if (data.type === 'deleteICMP') {
          // Handle ICMP deletion
          setIcmpPollingStatuses(prev =>
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

  return {
    loading,
    error,
    icmpPollingStatuses,
    pollingTemplates,
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
 * Main device polling component
 */
const DevicePolling: React.FC = () => {
  // Use default company ID for demo purposes
  const { loading, error, icmpPollingStatuses, pollingTemplates, refreshData } =
    useICMPData()

  // Handle multiple template lookups efficiently with a map
  const templateMap = pollingTemplates.reduce(
    (map, template) => {
      map[template.id] = template
      return map
    },
    {} as Record<string, ICMPPollingTemplate>
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
        <Typography>Loading ICMP polling status...</Typography>
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
        ICMP - Device Polling Status
      </Typography>
      <Typography color="text.secondary" paragraph>
        View ICMP device polling status with uptime, downtime, and device status
      </Typography>

      <TableContainer component={Paper} sx={{ mt: 2 }}>
        <Table sx={{ minWidth: 650 }} aria-label="ICMP polling status table">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Template</TableCell>
              <TableCell>Uptime</TableCell>
              <TableCell>Downtime</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {icmpPollingStatuses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  No ICMP polling status data available
                </TableCell>
              </TableRow>
            ) : (
              icmpPollingStatuses.map(status => (
                <TableRow key={status.id} hover>
                  <TableCell>{status.id.substring(0, 8)}...</TableCell>
                  <TableCell>
                    {templateMap[status.icmpPollingTemplateId]?.name ||
                      'Unknown Template'}
                  </TableCell>
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
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}

export default DevicePolling
