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
import { useICMPMonitoringTemplates } from '@/websockets/client/icmp/templates'

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
    icmpMonitoringTemplates,
    loading,
    error,
    refreshICMPMonitoringTemplates,
    isConnected,
    reconnect,
  } = useICMPMonitoringTemplates(companyId)

  // Sort templates by name
  const sortedTemplates = useMemo(() => {
    return [...icmpMonitoringTemplates].sort((a, b) =>
      a.templateName.localeCompare(b.templateName)
    )
  }, [icmpMonitoringTemplates])

  // Handle refresh button click
  const handleRefresh = () => {
    refreshICMPMonitoringTemplates()
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
            ICMP - Monitoring Templates
          </Typography>
          <Typography color="text.secondary" paragraph>
            View and manage ICMP monitoring templates for network device
            monitoring
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
              <TableCell>Loss Threshold</TableCell>
              <TableCell>Latency Threshold</TableCell>
              <TableCell>Product ID</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Updated</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedTemplates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  No ICMP templates available
                </TableCell>
              </TableRow>
            ) : (
              sortedTemplates.map(template => (
                <TableRow key={template._id} hover>
                  <TableCell>{template.templateName}</TableCell>
                  <TableCell>{template.templateDescription}</TableCell>
                  <TableCell>{template.icmpLossThreshold}%</TableCell>
                  <TableCell>{template.icmpLatencyThreshold} ms</TableCell>
                  <TableCell>{template.productId || 'N/A'}</TableCell>
                  <TableCell>{formatDate(template.createdAt)}</TableCell>
                  <TableCell>{formatDate(template.updatedAt)}</TableCell>
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
