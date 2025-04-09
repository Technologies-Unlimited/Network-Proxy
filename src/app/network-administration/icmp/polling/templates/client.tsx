'use client'

import React, { useState, useMemo } from 'react'
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
import { useICMPPollingTemplates } from '@/websockets/client/icmp/polling/templates'
import { TimeInterval } from '@/types/network-administration/icmp/polling/template/types'

/**
 * Format a time interval into a human-readable string
 */
function formatTimeInterval(interval?: TimeInterval): string {
  if (!interval) return 'Not set'

  const parts = []
  if (interval.days > 0) parts.push(`${interval.days}d`)
  if (interval.hours > 0) parts.push(`${interval.hours}h`)
  if (interval.minutes > 0) parts.push(`${interval.minutes}m`)
  if (interval.seconds > 0) parts.push(`${interval.seconds}s`)
  
  return parts.length > 0 ? parts.join(' ') : '0s'
}

/**
 * Format timestamp to date string
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

/**
 * Main ICMP Templates component
 */
const ICMPTemplatesClient: React.FC = () => {
  // Use default company ID for demo purposes (should be fetched from auth context in production)
  const [companyId] = useState<string>('default-company-id')
  
  // Use WebSocket-based hook to fetch template data
  const {
    icmpPollingTemplates,
    loading,
    error,
    refreshICMPPollingTemplates,
    isConnected,
    reconnect
  } = useICMPPollingTemplates(companyId)

  // Sort templates by name
  const sortedTemplates = useMemo(() => {
    return [...icmpPollingTemplates].sort((a, b) => a.name.localeCompare(b.name))
  }, [icmpPollingTemplates])

  // Handle refresh button click
  const handleRefresh = () => {
    refreshICMPPollingTemplates()
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
        <Typography>Loading ICMP templates...</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h5" gutterBottom>
            ICMP - Polling Templates
          </Typography>
          <Typography color="text.secondary" paragraph>
            View and manage ICMP polling templates for network device monitoring
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

      <TableContainer component={Paper} sx={{ mt: 2 }}>
        <Table sx={{ minWidth: 650 }} aria-label="ICMP templates table">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Frequency</TableCell>
              <TableCell>Timeout</TableCell>
              <TableCell>Retries</TableCell>
              <TableCell>Polling Schedule</TableCell>
              <TableCell>Downtime Trigger</TableCell>
              <TableCell>Created</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedTemplates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  No ICMP templates available
                </TableCell>
              </TableRow>
            ) : (
              sortedTemplates.map(template => (
                <TableRow key={template._id} hover>
                  <TableCell>{template.name}</TableCell>
                  <TableCell>{template.description}</TableCell>
                  <TableCell>{template.frequency} min</TableCell>
                  <TableCell>{template.timeout} ms</TableCell>
                  <TableCell>{template.retries}</TableCell>
                  <TableCell>{formatTimeInterval(template.pollingFrequency)}</TableCell>
                  <TableCell>{formatTimeInterval(template.downtimeTrigger)}</TableCell>
                  <TableCell>{formatDate(template.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}

export default ICMPTemplatesClient
