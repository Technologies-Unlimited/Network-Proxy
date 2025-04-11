'use client'

import React, { useState, useEffect, useMemo } from 'react'
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
  Button,
  IconButton,
  Tooltip,
  Alert,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useICMPPollingStatus } from '@/websockets/client/icmp/polling/status'
import { DeviceStatus } from '@/types/network-administration/icmp/polling/status/types'

/**
 * Format timestamp to date string
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

/**
 * Format uptime/downtime in milliseconds to a human-readable string
 */
function formatTime(ms: number): string {
  if (ms === 0) return '0s'

  // Calculate days, hours, minutes, seconds
  const seconds = Math.floor((ms / 1000) % 60)
  const minutes = Math.floor((ms / (1000 * 60)) % 60)
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24)
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (seconds > 0) parts.push(`${seconds}s`)

  return parts.length > 0 ? parts.join(' ') : '0s'
}

/**
 * Get color and display text for device status
 */
function getStatusInfo(status: DeviceStatus): { color: string; text: string } {
  switch (status) {
    case 'online':
      return { color: 'success', text: 'Online' }
    case 'offline':
      return { color: 'error', text: 'Offline' }
    case 'unknown':
    default:
      return { color: 'default', text: 'Unknown' }
  }
}

/**
 * Main ICMP Device Status component
 */
const ICMPDeviceStatusClient: React.FC = () => {
  // Use default company ID for demo purposes (should be fetched from auth context in production)
  const [companyId] = useState<string>('default-company-id')

  // Use the ICMP polling status hook
  const {
    icmpPollingStatuses,
    loading,
    error,
    refreshICMPPollingStatus,
    isConnected,
    reconnect,
  } = useICMPPollingStatus(companyId)

  // Sort statuses by device status (online first, then offline, etc.)
  const sortedStatuses = useMemo(() => {
    const statusOrder: Record<DeviceStatus, number> = {
      offline: 0,
      online: 2,
      unknown: 3,
    }

    return [...icmpPollingStatuses].sort(
      (a, b) =>
        (statusOrder[a.deviceStatus] || 3) - (statusOrder[b.deviceStatus] || 3)
    )
  }, [icmpPollingStatuses])

  // Handle refresh button click
  const handleRefresh = () => {
    refreshICMPPollingStatus()
  }

  // Handle reconnect button click
  const handleReconnect = () => {
    reconnect()
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
        <Typography>Loading device status data...</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="h5" gutterBottom>
            ICMP - Device Status
          </Typography>
          <Typography color="text.secondary">
            Real-time network device status monitoring via ICMP
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Chip
            label={isConnected ? 'Connected' : 'Disconnected'}
            color={isConnected ? 'success' : 'error'}
            size="small"
          />
          {!isConnected && (
            <Button
              variant="outlined"
              color="primary"
              size="small"
              onClick={handleReconnect}
              startIcon={<RefreshIcon />}
            >
              Reconnect
            </Button>
          )}
          <Tooltip title="Refresh data">
            <IconButton onClick={handleRefresh} color="primary">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table sx={{ minWidth: 650 }} aria-label="device status table">
          <TableHead>
            <TableRow>
              <TableCell>Status</TableCell>
              <TableCell>Template ID</TableCell>
              <TableCell>Product ID</TableCell>
              <TableCell>Uptime</TableCell>
              <TableCell>Downtime</TableCell>
              <TableCell>Last Updated</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedStatuses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  No device status data available
                </TableCell>
              </TableRow>
            ) : (
              sortedStatuses.map(device => {
                const statusInfo = getStatusInfo(device.deviceStatus)
                return (
                  <TableRow key={device._id} hover>
                    <TableCell>
                      <Chip
                        label={statusInfo.text}
                        color={
                          statusInfo.color as
                            | 'success'
                            | 'error'
                            | 'warning'
                            | 'default'
                        }
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{device.icmpPollingTemplateId}</TableCell>
                    <TableCell>{device.productId || 'N/A'}</TableCell>
                    <TableCell>{formatTime(device.uptime || 0)}</TableCell>
                    <TableCell>{formatTime(device.downtime || 0)}</TableCell>
                    <TableCell>{formatDate(device.updatedAt)}</TableCell>
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

export default ICMPDeviceStatusClient
