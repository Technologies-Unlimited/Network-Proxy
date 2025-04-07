'use client'

import React, { useEffect, useState } from 'react'
import {
  Box,
  Typography,
  Button,
  Paper,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Grid,
  SelectChangeEvent,
  Stack,
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'

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
 * Interface for ping request
 */
interface PingRequest {
  target: string
  duration: number
}

/**
 * Interface for ping result
 */
interface PingResult {
  id: string
  timestamp: number
  target: string
  bytes: number
  time: number
  ttl: number
  success: boolean
  message?: string
}

/**
 * Hook to fetch network pools and subnets data
 */
function useNetworkData(companyId: string = 'default-company-id') {
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [pools, setPools] = useState<Pool[]>([])
  const [subnets, setSubnets] = useState<Subnet[]>([])

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
    } catch (err) {
      console.error('Error fetching network data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setLoading(false)
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
    refreshData: fetchData,
  }
}

/**
 * Hook for ping functionality
 */
function usePing() {
  const [isPinging, setIsPinging] = useState<boolean>(false)
  const [pingResults, setPingResults] = useState<PingResult[]>([])
  const [ws, setWs] = useState<WebSocket | null>(null)

  useEffect(() => {
    // Create WebSocket connection for ping data
    const pingWs = new WebSocket(
      `${process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'}/ping`
    )

    pingWs.onopen = () => {
      console.log('Ping WebSocket connection established')
      setWs(pingWs)
    }

    pingWs.onmessage = event => {
      try {
        const result = JSON.parse(event.data) as PingResult
        setPingResults(prev => [...prev, result])
      } catch (err) {
        console.error('Error processing ping WebSocket message:', err)
      }
    }

    pingWs.onerror = error => {
      console.error('Ping WebSocket error:', error)
    }

    pingWs.onclose = () => {
      console.log('Ping WebSocket connection closed')
      setWs(null)
      setIsPinging(false)
    }

    // Clean up WebSocket connection
    return () => {
      pingWs.close()
    }
  }, [])

  const startPing = (request: PingRequest) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket connection not available')
      return false
    }

    setPingResults([])
    setIsPinging(true)
    ws.send(JSON.stringify({ type: 'start', ...request }))
    return true
  }

  const stopPing = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket connection not available')
      return false
    }

    setIsPinging(false)
    ws.send(JSON.stringify({ type: 'stop' }))
    return true
  }

  return {
    isPinging,
    pingResults,
    startPing,
    stopPing,
  }
}

/**
 * Main PingClient component
 */
const PingClient: React.FC = () => {
  // Use default company ID for demo purposes
  const companyId = 'default-company-id'
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null)
  const [ipAddress, setIpAddress] = useState<string>('')
  const [hostname, setHostname] = useState<string>('')
  const [duration, setDuration] = useState<string>('5')

  // Get network data using our custom hook
  const { loading, error, pools, subnets } = useNetworkData(companyId)

  // Get ping functionality from our custom hook
  const { isPinging, pingResults, startPing, stopPing } = usePing()

  // Handle pool selection
  const handlePoolChange = (event: SelectChangeEvent) => {
    const poolId = event.target.value
    const selectedPool = pools.find(p => p.id === poolId)
    setSelectedPool(selectedPool || null)
  }

  // Handle start ping
  const handleStartPing = () => {
    const target = ipAddress || hostname
    if (!target) {
      alert('Please enter an IP address or hostname')
      return
    }

    const durationNum = parseInt(duration, 10)
    if (isNaN(durationNum) || durationNum <= 0) {
      alert('Please enter a valid ping duration')
      return
    }

    startPing({
      target,
      duration: durationNum,
    })
  }

  // Handle stop ping
  const handleStopPing = () => {
    stopPing()
  }

  // Format ping result for display
  const formatPingResult = (result: PingResult) => {
    if (!result.success) {
      return `${result.message || 'Request timed out.'}`
    }

    return `Reply from ${result.target}: bytes=${result.bytes} time=${result.time}ms TTL=${result.ttl}`
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
        Tools - Ping
      </Typography>
      <Typography color="text.secondary" paragraph>
        Perform ping tests with pool subnet, ping duration, IP address, and
        hostname
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <FormControl fullWidth>
            <InputLabel id="pool-select-label">
              Available Pool Subnets
            </InputLabel>
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
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="Ping Duration (seconds)"
            placeholder="5"
            value={duration}
            onChange={e => setDuration(e.target.value)}
            type="number"
            inputProps={{ min: 1 }}
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="IP Address"
            placeholder="192.168.0.3"
            value={ipAddress}
            onChange={e => setIpAddress(e.target.value)}
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="Hostname"
            placeholder="host.ip.local"
            value={hostname}
            onChange={e => setHostname(e.target.value)}
          />
        </Grid>

        <Grid item xs={12}>
          <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={handleStartPing}
              disabled={isPinging || (!ipAddress && !hostname)}
            >
              Start Ping
            </Button>

            <Button
              variant="outlined"
              startIcon={<StopIcon />}
              onClick={handleStopPing}
              disabled={!isPinging}
            >
              Stop Ping
            </Button>
          </Stack>
        </Grid>

        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom>
            Ping Results
          </Typography>
          <Paper sx={{ p: 2 }}>
            {pingResults.length === 0 ? (
              <Typography color="text.secondary">
                {isPinging ? 'Pinging...' : 'No ping results yet'}
              </Typography>
            ) : (
              <>
                <Typography sx={{ mb: 2 }}>
                  Pinging {pingResults[0].target} with {pingResults[0].bytes}{' '}
                  bytes of data:
                </Typography>
                <Box sx={{ fontFamily: 'monospace', whiteSpace: 'pre-line' }}>
                  {pingResults.map((result, index) => (
                    <Typography key={result.id || index}>
                      {formatPingResult(result)}
                    </Typography>
                  ))}
                </Box>
              </>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}

export default PingClient
