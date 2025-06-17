/**
 * ICMP Network Monitoring Polling Dashboard
 * Real-time network monitoring similar to Zabbix
 */

// Using React CDN imports
const {
  createElement: h,
  StrictMode,
  useState,
  useEffect,
  useRef,
  useCallback,
} = React
const { createRoot } = ReactDOM

/**
 * API functions for SQLite database operations
 */
const API_BASE = 'http://localhost:3001/api'

const api = {
  // Monitor CRUD operations
  async getMonitors(companyId) {
    const response = await fetch(`${API_BASE}/monitors?companyId=${companyId}`)
    if (!response.ok)
      throw new Error(`Failed to fetch monitors: ${response.statusText}`)
    return response.json()
  },

  async createMonitor(monitorData, companyId = 'default-company-id') {
    console.log('Creating monitor with data:', monitorData)
    console.log('Company ID:', companyId)

    const response = await fetch(
      `${API_BASE}/monitors?companyId=${companyId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(monitorData),
      }
    )

    console.log('Response status:', response.status)
    console.log('Response ok:', response.ok)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Create monitor error response:', errorText)
      throw new Error(
        `Failed to create monitor: ${response.statusText} - ${errorText}`
      )
    }
    return response.json()
  },

  async updateMonitor(monitorId, updates, companyId = 'default-company-id') {
    const response = await fetch(
      `${API_BASE}/monitors/${monitorId}?companyId=${companyId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }
    )
    if (!response.ok)
      throw new Error(`Failed to update monitor: ${response.statusText}`)
    return response.json()
  },

  async deleteMonitor(monitorId, companyId = 'default-company-id') {
    const response = await fetch(
      `${API_BASE}/monitors/${monitorId}?companyId=${companyId}`,
      {
        method: 'DELETE',
      }
    )
    if (!response.ok)
      throw new Error(`Failed to delete monitor: ${response.statusText}`)
    return response.json()
  },

  // Monitor results operations
  async getMonitorResults(monitorId, limit = 50) {
    const response = await fetch(
      `${API_BASE}/monitors/${monitorId}/results?limit=${limit}`
    )
    if (!response.ok)
      throw new Error(`Failed to fetch monitor results: ${response.statusText}`)
    return response.json()
  },

  async createMonitorResult(monitorId, resultData) {
    const response = await fetch(`${API_BASE}/monitors/${monitorId}/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resultData),
    })
    if (!response.ok)
      throw new Error(`Failed to store monitor result: ${response.statusText}`)
    return response.json()
  },

  // Alerts operations
  async getAlerts(companyId) {
    const response = await fetch(`${API_BASE}/alerts?companyId=${companyId}`)
    if (!response.ok)
      throw new Error(`Failed to fetch alerts: ${response.statusText}`)
    return response.json()
  },

  async createAlert(alertData, companyId = 'default-company-id') {
    const response = await fetch(`${API_BASE}/alerts?companyId=${companyId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alertData),
    })
    if (!response.ok)
      throw new Error(`Failed to create alert: ${response.statusText}`)
    return response.json()
  },

  async updateAlert(alertId, updates) {
    const response = await fetch(`${API_BASE}/alerts/${alertId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!response.ok)
      throw new Error(`Failed to update alert: ${response.statusText}`)
    return response.json()
  },
}

/**
 * Hook for managing ICMP monitors with SQLite database persistence
 */
function useICMPMonitors(companyId = 'default-company-id') {
  const [monitors, setMonitors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isConnected, setIsConnected] = useState(true)

  // Real-time monitor results
  const [liveResults, setLiveResults] = useState(new Map())
  const [alerts, setAlerts] = useState([])

  // Load all data from SQLite database
  const refreshData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Test API connectivity first
      console.log('Testing API connectivity to:', API_BASE)

      // Fetch monitors from database
      const monitorsData = await api.getMonitors(companyId)
      console.log('Successfully fetched monitors:', monitorsData)
      setMonitors(monitorsData)

      // Fetch recent results for each monitor
      const resultsMap = new Map()
      for (const monitor of monitorsData) {
        try {
          const results = await api.getMonitorResults(monitor._id || monitor.id)
          resultsMap.set(monitor._id || monitor.id, {
            history: results,
            currentStatus:
              results.length > 0
                ? results[results.length - 1].status
                : 'unknown',
            lastUpdate:
              results.length > 0 ? results[results.length - 1].timestamp : null,
          })
        } catch (err) {
          console.warn(
            `Failed to load results for monitor ${monitor._id || monitor.id}:`,
            err
          )
          resultsMap.set(monitor._id || monitor.id, {
            history: [],
            currentStatus: 'unknown',
            lastUpdate: null,
          })
        }
      }
      setLiveResults(resultsMap)

      // Fetch alerts from database
      const alertsData = await api.getAlerts(companyId)
      setAlerts(alertsData)

      setIsConnected(true)
      console.log('Successfully loaded all data from API')
    } catch (err) {
      console.error('Error fetching data from database:', err)

      if (err.message.includes('Failed to fetch')) {
        setError(
          'Cannot connect to API server on port 3001. Please make sure the WebSocket server is running.'
        )
      } else {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load data from database'
        )
      }
      setIsConnected(false)
    } finally {
      setLoading(false)
    }
  }

  // Add a new monitor to SQLite database
  const addMonitor = async monitorData => {
    try {
      const monitorPayload = {
        name: monitorData.name,
        description: monitorData.description || '',
        ipAddress: monitorData.ipAddress,
        interval: monitorData.interval,
        timeout: monitorData.timeout,
        packetCount: monitorData.packetCount,
        lossThreshold: monitorData.lossThreshold,
        latencyWarningThreshold: monitorData.latencyWarningThreshold,
        latencyCriticalThreshold: monitorData.latencyCriticalThreshold,
        status: 'active',
      }

      const newMonitor = await api.createMonitor(monitorPayload, companyId)

      // Update local state
      setMonitors(prev => [...prev, newMonitor])

      // Initialize live results
      setLiveResults(prev => {
        const updated = new Map(prev)
        updated.set(newMonitor._id || newMonitor.id, {
          history: [],
          currentStatus: 'unknown',
          lastUpdate: null,
        })
        return updated
      })

      return newMonitor
    } catch (err) {
      console.error('Error adding monitor to database:', err)
      throw new Error(`Failed to add monitor: ${err.message}`)
    }
  }

  // Remove a monitor from SQLite database
  const removeMonitor = async monitorId => {
    try {
      await api.deleteMonitor(monitorId, companyId)

      // Update local state
      setMonitors(prev => prev.filter(m => (m._id || m.id) !== monitorId))
      setLiveResults(prev => {
        const updated = new Map(prev)
        updated.delete(monitorId)
        return updated
      })

      // Remove related alerts
      setAlerts(prev => prev.filter(a => a.monitorId !== monitorId))
    } catch (err) {
      console.error('Error removing monitor from database:', err)
      throw new Error(`Failed to remove monitor: ${err.message}`)
    }
  }

  // Update a monitor in SQLite database
  const updateMonitor = async (monitorId, updates) => {
    try {
      const updatedMonitor = await api.updateMonitor(
        monitorId,
        updates,
        companyId
      )

      // Update local state
      setMonitors(prev =>
        prev.map(m => ((m._id || m.id) === monitorId ? updatedMonitor : m))
      )

      return updatedMonitor
    } catch (err) {
      console.error('Error updating monitor in database:', err)
      throw new Error(`Failed to update monitor: ${err.message}`)
    }
  }

  // Perform actual ICMP ping and store results in database
  const performMonitorCheck = useCallback(
    async monitor => {
      try {
        console.log(
          `Performing real ping check for ${monitor.name} (${monitor.ipAddress})`
        )

        // Call the real ping API endpoint
        const pingResponse = await fetch(`${API_BASE}/ping`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ipAddress: monitor.ipAddress,
            count: monitor.packetCount || 3,
            timeout: monitor.timeout || 10,
          }),
        })

        if (!pingResponse.ok) {
          console.error('Ping API call failed:', pingResponse.statusText)
          throw new Error(`Ping API call failed: ${pingResponse.statusText}`)
        }

        const pingResult = await pingResponse.json()
        console.log(`Real ping result for ${monitor.ipAddress}:`, pingResult)

        // Convert ping result to our monitor result format
        const result = {
          monitorId: monitor._id || monitor.id,
          timestamp: Date.now(),
          status: pingResult.isUp ? 'up' : 'down',
          responseTime: pingResult.avgLatency || null,
          packetLoss: pingResult.packetLoss || 0,
          avgLatency: pingResult.avgLatency || null,
          minLatency: pingResult.minLatency || null,
          maxLatency: pingResult.maxLatency || null,
          packetsTransmitted:
            pingResult.packetsTransmitted || monitor.packetCount || 3,
          packetsReceived: pingResult.packetsReceived || 0,
          standardDeviation: pingResult.standardDeviation || 0,
          createdAt: new Date().toISOString(),
        }

        console.log(`Processed result for ${monitor.name}:`, result)

        // Store result in database
        await api.createMonitorResult(monitor._id || monitor.id, result)

        // Update local live results
        setLiveResults(prev => {
          const updated = new Map(prev)
          const existing = updated.get(monitor._id || monitor.id) || {
            history: [],
            currentStatus: 'unknown',
            lastUpdate: null,
          }

          const updatedHistory = [...existing.history.slice(-49), result]
          updated.set(monitor._id || monitor.id, {
            history: updatedHistory,
            currentStatus: pingResult.isUp ? 'up' : 'down',
            lastUpdate: Date.now(),
          })

          return updated
        })

        // Update monitor's last check time in database
        await updateMonitor(monitor._id || monitor.id, {
          lastCheck: new Date().toISOString(),
          lastStatus: pingResult.isUp ? 'up' : 'down',
        })

        // Generate alerts if thresholds are exceeded
        if (
          !pingResult.isUp ||
          (pingResult.avgLatency &&
            pingResult.avgLatency > monitor.latencyWarningThreshold)
        ) {
          try {
            const alertData = {
              monitorId: monitor._id || monitor.id,
              monitorName: monitor.name,
              companyId: monitor.companyId,
              severity: !pingResult.isUp ? 'critical' : 'warning',
              condition: !pingResult.isUp
                ? 'Host is down'
                : 'High latency detected',
              triggeredAt: new Date().toISOString(),
              value: !pingResult.isUp ? 100 : Math.round(pingResult.avgLatency),
              threshold: !pingResult.isUp
                ? monitor.lossThreshold
                : monitor.latencyWarningThreshold,
              status: 'active',
            }

            // Check if alert already exists
            const existingAlert = alerts.find(
              a =>
                a.monitorId === (monitor._id || monitor.id) &&
                a.status === 'active' &&
                a.severity === alertData.severity
            )

            if (!existingAlert) {
              const newAlert = await api.createAlert(
                alertData,
                monitor.companyId || companyId
              )
              setAlerts(prev => [...prev, newAlert])
              console.log(
                `Created ${alertData.severity} alert for ${monitor.name}:`,
                newAlert
              )
            }
          } catch (alertErr) {
            console.warn('Failed to create alert:', alertErr)
          }
        } else {
          // Clear alerts if monitor is healthy
          const activeAlerts = alerts.filter(
            a =>
              a.monitorId === (monitor._id || monitor.id) &&
              a.status === 'active'
          )

          for (const alert of activeAlerts) {
            try {
              await api.updateAlert(alert._id || alert.id, {
                status: 'resolved',
              })
              console.log(`Resolved alert for ${monitor.name}:`, alert)
            } catch (alertErr) {
              console.warn('Failed to resolve alert:', alertErr)
            }
          }

          setAlerts(prev =>
            prev.filter(a => a.monitorId !== (monitor._id || monitor.id))
          )
        }

        return result
      } catch (err) {
        console.error(
          `Error performing monitor check for ${monitor.name}:`,
          err
        )

        // In case of error, create a "down" result
        const errorResult = {
          monitorId: monitor._id || monitor.id,
          timestamp: Date.now(),
          status: 'down',
          responseTime: null,
          packetLoss: 100,
          avgLatency: null,
          createdAt: new Date().toISOString(),
          error: err.message,
        }

        // Store error result in database
        try {
          await api.createMonitorResult(monitor._id || monitor.id, errorResult)
        } catch (storeErr) {
          console.error('Failed to store error result:', storeErr)
        }

        // Update local state to show down status
        setLiveResults(prev => {
          const updated = new Map(prev)
          const existing = updated.get(monitor._id || monitor.id) || {
            history: [],
            currentStatus: 'unknown',
            lastUpdate: null,
          }

          const updatedHistory = [...existing.history.slice(-49), errorResult]
          updated.set(monitor._id || monitor.id, {
            history: updatedHistory,
            currentStatus: 'down',
            lastUpdate: Date.now(),
          })

          return updated
        })

        throw err
      }
    },
    [alerts, companyId, updateMonitor]
  ) // Stable dependencies

  // Real-time monitoring with database persistence
  useEffect(() => {
    if (monitors.length === 0) return

    console.log(
      'Setting up monitoring intervals for',
      monitors.length,
      'monitors'
    )
    const intervals = new Map()
    const activeMonitors = monitors.filter(m => m.status === 'active')

    activeMonitors.forEach(monitor => {
      const intervalMs = monitor.interval * 1000
      console.log(`Setting up ${intervalMs}ms interval for ${monitor.name}`)

      // Create a stable function reference for this specific monitor
      const monitorCheckFn = async () => {
        try {
          console.log(
            `Performing real ping check for ${monitor.name} (${monitor.ipAddress})`
          )

          // Call the real ping API endpoint
          const pingResponse = await fetch(`${API_BASE}/ping`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ipAddress: monitor.ipAddress,
              count: monitor.packetCount || 3,
              timeout: monitor.timeout || 10,
            }),
          })

          if (!pingResponse.ok) {
            console.error('Ping API call failed:', pingResponse.statusText)
            throw new Error(`Ping API call failed: ${pingResponse.statusText}`)
          }

          const pingResult = await pingResponse.json()
          console.log(`Real ping result for ${monitor.ipAddress}:`, pingResult)

          // Convert ping result to our monitor result format
          const result = {
            monitorId: monitor._id || monitor.id,
            timestamp: Date.now(),
            status: pingResult.isUp ? 'up' : 'down',
            responseTime: pingResult.avgLatency || null,
            packetLoss: pingResult.packetLoss || 0,
            avgLatency: pingResult.avgLatency || null,
            minLatency: pingResult.minLatency || null,
            maxLatency: pingResult.maxLatency || null,
            packetsTransmitted:
              pingResult.packetsTransmitted || monitor.packetCount || 3,
            packetsReceived: pingResult.packetsReceived || 0,
            standardDeviation: pingResult.standardDeviation || 0,
            createdAt: new Date().toISOString(),
          }

          console.log(`Processed result for ${monitor.name}:`, result)

          // Store result in database (fire and forget - don't wait for response)
          api
            .createMonitorResult(monitor._id || monitor.id, result)
            .catch(err => {
              console.warn('Failed to store monitor result:', err)
            })

          // Update local live results ONLY (no state changes that trigger re-renders)
          setLiveResults(prev => {
            const updated = new Map(prev)
            const existing = updated.get(monitor._id || monitor.id) || {
              history: [],
              currentStatus: 'unknown',
              lastUpdate: null,
            }

            const updatedHistory = [...existing.history.slice(-49), result]
            updated.set(monitor._id || monitor.id, {
              history: updatedHistory,
              currentStatus: pingResult.isUp ? 'up' : 'down',
              lastUpdate: Date.now(),
            })

            return updated
          })

          // DO NOT update monitor state here - this was causing full page refreshes
          // The monitor's lastCheck and lastStatus will be updated when user manually refreshes

          return result
        } catch (err) {
          console.error(
            `Error performing monitor check for ${monitor.name}:`,
            err
          )

          // In case of error, create a "down" result
          const errorResult = {
            monitorId: monitor._id || monitor.id,
            timestamp: Date.now(),
            status: 'down',
            responseTime: null,
            packetLoss: 100,
            avgLatency: null,
            createdAt: new Date().toISOString(),
            error: err.message,
          }

          // Store error result in database (fire and forget)
          api
            .createMonitorResult(monitor._id || monitor.id, errorResult)
            .catch(storeErr => {
              console.error('Failed to store error result:', storeErr)
            })

          // Update local state to show down status
          setLiveResults(prev => {
            const updated = new Map(prev)
            const existing = updated.get(monitor._id || monitor.id) || {
              history: [],
              currentStatus: 'unknown',
              lastUpdate: null,
            }

            const updatedHistory = [...existing.history.slice(-49), errorResult]
            updated.set(monitor._id || monitor.id, {
              history: updatedHistory,
              currentStatus: 'down',
              lastUpdate: Date.now(),
            })

            return updated
          })
        }
      }

      // Start with an immediate check
      monitorCheckFn()

      // Set up the interval
      const intervalId = setInterval(monitorCheckFn, intervalMs)
      intervals.set(monitor._id || monitor.id, intervalId)
    })

    // Cleanup intervals
    return () => {
      console.log('Cleaning up monitoring intervals')
      intervals.forEach(intervalId => clearInterval(intervalId))
    }
  }, [
    monitors.map(m => `${m._id || m.id}-${m.status}-${m.interval}`).join(','),
  ]) // Removed companyId dependency

  useEffect(() => {
    refreshData()
  }, [companyId]) // Only refresh when companyId changes

  return {
    monitors,
    liveResults,
    alerts,
    loading,
    error,
    isConnected,
    refreshData,
    addMonitor,
    removeMonitor,
    updateMonitor,
  }
}

/**
 * Get status color and icon
 */
function getMonitorStatus(monitor, liveResult) {
  if (monitor.status !== 'active') {
    return { color: '#9e9e9e', text: 'Paused', icon: '⏸️' }
  }

  const status = liveResult?.currentStatus || monitor.lastStatus || 'unknown'

  switch (status) {
    case 'up':
      return { color: '#4caf50', text: 'Up', icon: '🟢' }
    case 'down':
      return { color: '#f44336', text: 'Down', icon: '🔴' }
    default:
      return { color: '#ff9800', text: 'Unknown', icon: '🟡' }
  }
}

/**
 * Format time ago
 */
function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Never'

  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return `${seconds}s ago`
}

/**
 * Mini Chart Component
 */
function MiniChart({ data, type = 'latency', width = 120, height = 40 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data || data.length === 0) return

    const ctx = canvas.getContext('2d')
    const { width: w, height: h } = canvas

    // Clear canvas
    ctx.clearRect(0, 0, w, h)

    // Prepare data
    const values = data
      .map(d =>
        type === 'latency'
          ? d.avgLatency || 0
          : type === 'packetloss'
            ? d.packetLoss
            : 0
      )
      .filter(v => v !== null && v !== undefined)

    if (values.length === 0) return

    const max = Math.max(...values)
    const min = Math.min(...values)
    const range = max - min || 1

    // Draw line chart
    ctx.strokeStyle = type === 'latency' ? '#2196f3' : '#ff9800'
    ctx.lineWidth = 1.5
    ctx.beginPath()

    values.forEach((value, index) => {
      const x = (index / (values.length - 1)) * (w - 20) + 10
      const y = h - 10 - ((value - min) / range) * (h - 20)

      if (index === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })

    ctx.stroke()

    // Draw threshold line for latency
    if (type === 'latency') {
      const threshold = 100 // Warning threshold
      const thresholdY = h - 10 - ((threshold - min) / range) * (h - 20)
      ctx.strokeStyle = '#ff5722'
      ctx.lineWidth = 1
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.moveTo(10, thresholdY)
      ctx.lineTo(w - 10, thresholdY)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [data, type])

  return h('canvas', {
    ref: canvasRef,
    width,
    height,
    style: { width: `${width}px`, height: `${height}px` },
  })
}

/**
 * Monitor Card Component
 */
function MonitorCard({ monitor, liveResult, onSelect, onDelete, onEdit }) {
  const status = getMonitorStatus(monitor, liveResult)
  const lastData = liveResult?.history?.slice(-1)[0]
  const recentData = liveResult?.history?.slice(-20) || []

  return h(
    'div',
    {
      style: {
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        padding: '16px',
        border: `3px solid ${status.color}`,
        transition: 'all 0.2s ease',
        position: 'relative',
      },
      onMouseOver: e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)'
      },
      onMouseOut: e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'
      },
    },
    // Action buttons container
    h(
      'div',
      {
        style: {
          position: 'absolute',
          top: '8px',
          right: '8px',
          display: 'flex',
          gap: '4px',
        },
      },
      // Edit button
      h(
        'button',
        {
          onClick: e => {
            e.stopPropagation()
            onEdit(monitor)
          },
          style: {
            background: 'none',
            border: 'none',
            color: '#2196f3',
            fontSize: '14px',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            opacity: 0.7,
          },
          onMouseOver: e => {
            e.target.style.opacity = 1
            e.target.style.backgroundColor = '#e3f2fd'
          },
          onMouseOut: e => {
            e.target.style.opacity = 0.7
            e.target.style.backgroundColor = 'transparent'
          },
          title: 'Edit monitor',
        },
        '✏️'
      ),
      // Delete button
      h(
        'button',
        {
          onClick: e => {
            e.stopPropagation()
            if (
              confirm(
                `Are you sure you want to delete monitor "${monitor.name}"?`
              )
            ) {
              onDelete(monitor._id)
            }
          },
          style: {
            background: 'none',
            border: 'none',
            color: '#f44336',
            fontSize: '14px',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            opacity: 0.7,
          },
          onMouseOver: e => {
            e.target.style.opacity = 1
            e.target.style.backgroundColor = '#ffebee'
          },
          onMouseOut: e => {
            e.target.style.opacity = 0.7
            e.target.style.backgroundColor = 'transparent'
          },
          title: 'Delete monitor',
        },
        '🗑️'
      )
    ),

    // Clickable area for details
    h(
      'div',
      {
        onClick: () => onSelect(monitor),
        style: { cursor: 'pointer' },
      },
      // Header
      h(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
            paddingRight: '64px', // Space for action buttons
          },
        },
        h(
          'div',
          null,
          h(
            'h3',
            {
              style: {
                margin: '0 0 4px 0',
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#333',
              },
            },
            monitor.name
          ),
          h(
            'p',
            {
              style: {
                margin: '0',
                fontSize: '12px',
                color: '#666',
                fontFamily: 'monospace',
              },
            },
            monitor.ipAddress
          ),
          // Show status description
          h(
            'p',
            {
              style: {
                margin: '4px 0 0 0',
                fontSize: '11px',
                color: '#666',
              },
            },
            monitor.description || 'No description'
          )
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            },
          },
          h('span', { style: { fontSize: '20px' } }, status.icon),
          h(
            'span',
            {
              style: {
                fontSize: '12px',
                fontWeight: 'bold',
                color: status.color,
              },
            },
            status.text
          )
        )
      ),

      // Status indicator for monitor state
      monitor.status !== 'active' &&
        h(
          'div',
          {
            style: {
              backgroundColor:
                monitor.status === 'paused' ? '#fff3e0' : '#ffebee',
              color: monitor.status === 'paused' ? '#f57c00' : '#d32f2f',
              fontSize: '11px',
              padding: '4px 8px',
              borderRadius: '12px',
              marginBottom: '12px',
              textAlign: 'center',
              fontWeight: 'bold',
            },
          },
          monitor.status === 'paused' ? '⏸️ Paused' : '🚫 Disabled'
        ),

      // Metrics
      h(
        'div',
        {
          style: {
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginBottom: '12px',
          },
        },
        h(
          'div',
          null,
          h(
            'div',
            { style: { fontSize: '11px', color: '#666', marginBottom: '4px' } },
            'Latency'
          ),
          h(
            'div',
            { style: { fontSize: '14px', fontWeight: 'bold' } },
            lastData?.avgLatency
              ? `${Math.round(lastData.avgLatency)}ms`
              : 'N/A'
          ),
          recentData.length > 0 &&
            h(MiniChart, {
              data: recentData,
              type: 'latency',
              width: 80,
              height: 25,
            })
        ),
        h(
          'div',
          null,
          h(
            'div',
            { style: { fontSize: '11px', color: '#666', marginBottom: '4px' } },
            'Packet Loss'
          ),
          h(
            'div',
            { style: { fontSize: '14px', fontWeight: 'bold' } },
            lastData?.packetLoss ? `${Math.round(lastData.packetLoss)}%` : 'N/A'
          ),
          recentData.length > 0 &&
            h(MiniChart, {
              data: recentData,
              type: 'packetloss',
              width: 80,
              height: 25,
            })
        )
      ),

      // Footer
      h(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '11px',
            color: '#666',
          },
        },
        h('span', null, `Interval: ${monitor.interval}s`),
        h('span', null, `Last: ${formatTimeAgo(liveResult?.lastUpdate)}`)
      )
    )
  )
}

/**
 * Add Monitor Dialog Component
 */
function AddMonitorDialog({ isOpen, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    ipAddress: '',
    interval: 5,
    timeout: 10,
    packetCount: 3,
    lossThreshold: 10,
    latencyWarningThreshold: 200,
    latencyCriticalThreshold: 1000,
  })
  const [errors, setErrors] = useState({})

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }))
    }
  }

  const validateForm = () => {
    const newErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Monitor name is required'
    }

    if (!formData.ipAddress.trim()) {
      newErrors.ipAddress = 'IP address is required'
    } else {
      // Basic IP validation
      const ipRegex =
        /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
      if (!ipRegex.test(formData.ipAddress)) {
        newErrors.ipAddress = 'Please enter a valid IP address'
      }
    }

    if (formData.interval < 1) {
      newErrors.interval =
        'Interval must be at least 1 second (for realtime monitoring)'
    }

    if (formData.timeout < 1) {
      newErrors.timeout = 'Timeout must be at least 1 second'
    }

    if (formData.packetCount < 1) {
      newErrors.packetCount = 'Packet count must be at least 1'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = e => {
    e.preventDefault()
    if (validateForm()) {
      onSubmit(formData)
      onClose()
      // Reset form
      setFormData({
        name: '',
        description: '',
        ipAddress: '',
        interval: 5,
        timeout: 10,
        packetCount: 3,
        lossThreshold: 10,
        latencyWarningThreshold: 200,
        latencyCriticalThreshold: 1000,
      })
      setErrors({})
    }
  }

  if (!isOpen) return null

  return h(
    'div',
    {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
      },
      onClick: e => {
        if (e.target === e.currentTarget) onClose()
      },
    },
    h(
      'div',
      {
        style: {
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          width: '90%',
          maxWidth: '500px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        },
      },
      // Header
      h(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px',
          },
        },
        h('h2', { style: { margin: 0, color: '#333' } }, 'Add New Monitor'),
        h(
          'button',
          {
            onClick: onClose,
            style: {
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#666',
            },
          },
          '×'
        )
      ),

      // Form
      h(
        'form',
        { onSubmit: handleSubmit },
        // Monitor Name
        h(
          'div',
          { style: { marginBottom: '16px' } },
          h(
            'label',
            {
              style: {
                display: 'block',
                marginBottom: '4px',
                fontWeight: 'bold',
                color: '#333',
              },
            },
            'Monitor Name *'
          ),
          h('input', {
            type: 'text',
            value: formData.name,
            onChange: e => handleInputChange('name', e.target.value),
            style: {
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${errors.name ? '#f44336' : '#ddd'}`,
              borderRadius: '4px',
              fontSize: '14px',
              boxSizing: 'border-box',
            },
            placeholder: 'e.g., Web Server',
          }),
          errors.name &&
            h(
              'div',
              {
                style: { color: '#f44336', fontSize: '12px', marginTop: '4px' },
              },
              errors.name
            )
        ),

        // Description
        h(
          'div',
          { style: { marginBottom: '16px' } },
          h(
            'label',
            {
              style: {
                display: 'block',
                marginBottom: '4px',
                fontWeight: 'bold',
                color: '#333',
              },
            },
            'Description'
          ),
          h('input', {
            type: 'text',
            value: formData.description,
            onChange: e => handleInputChange('description', e.target.value),
            style: {
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              boxSizing: 'border-box',
            },
            placeholder:
              'Optional description (e.g., Critical server - realtime monitoring)',
          })
        ),

        // IP Address
        h(
          'div',
          { style: { marginBottom: '16px' } },
          h(
            'label',
            {
              style: {
                display: 'block',
                marginBottom: '4px',
                fontWeight: 'bold',
                color: '#333',
              },
            },
            'IP Address *'
          ),
          h('input', {
            type: 'text',
            value: formData.ipAddress,
            onChange: e => handleInputChange('ipAddress', e.target.value),
            style: {
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${errors.ipAddress ? '#f44336' : '#ddd'}`,
              borderRadius: '4px',
              fontSize: '14px',
              fontFamily: 'monospace',
              boxSizing: 'border-box',
            },
            placeholder: '192.168.1.1',
          }),
          errors.ipAddress &&
            h(
              'div',
              {
                style: { color: '#f44336', fontSize: '12px', marginTop: '4px' },
              },
              errors.ipAddress
            )
        ),

        // Two column layout for numbers
        h(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '16px',
            },
          },
          // Interval
          h(
            'div',
            null,
            h(
              'label',
              {
                style: {
                  display: 'block',
                  marginBottom: '4px',
                  fontWeight: 'bold',
                  color: '#333',
                },
              },
              'Interval (seconds) * - Realtime supported'
            ),
            h('input', {
              type: 'number',
              value: formData.interval,
              onChange: e =>
                handleInputChange('interval', parseInt(e.target.value) || 0),
              style: {
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${errors.interval ? '#f44336' : '#ddd'}`,
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              },
              min: '1',
              placeholder: 'e.g., 1 for realtime, 30 for normal',
            }),
            errors.interval &&
              h(
                'div',
                {
                  style: {
                    color: '#f44336',
                    fontSize: '12px',
                    marginTop: '4px',
                  },
                },
                errors.interval
              ),
            // Add helpful note for realtime monitoring
            h(
              'div',
              { style: { color: '#666', fontSize: '11px', marginTop: '4px' } },
              'Use 1-5 seconds for realtime monitoring. Lower intervals provide faster updates but use more resources.'
            )
          ),

          // Timeout
          h(
            'div',
            null,
            h(
              'label',
              {
                style: {
                  display: 'block',
                  marginBottom: '4px',
                  fontWeight: 'bold',
                  color: '#333',
                },
              },
              'Timeout (seconds) *'
            ),
            h('input', {
              type: 'number',
              value: formData.timeout,
              onChange: e =>
                handleInputChange('timeout', parseInt(e.target.value) || 0),
              style: {
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${errors.timeout ? '#f44336' : '#ddd'}`,
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              },
              min: '1',
            }),
            errors.timeout &&
              h(
                'div',
                {
                  style: {
                    color: '#f44336',
                    fontSize: '12px',
                    marginTop: '4px',
                  },
                },
                errors.timeout
              )
          )
        ),

        // Packet Count and Loss Threshold
        h(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '16px',
            },
          },
          // Packet Count
          h(
            'div',
            null,
            h(
              'label',
              {
                style: {
                  display: 'block',
                  marginBottom: '4px',
                  fontWeight: 'bold',
                  color: '#333',
                },
              },
              'Packet Count *'
            ),
            h('input', {
              type: 'number',
              value: formData.packetCount,
              onChange: e =>
                handleInputChange('packetCount', parseInt(e.target.value) || 0),
              style: {
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${errors.packetCount ? '#f44336' : '#ddd'}`,
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              },
              min: '1',
            }),
            errors.packetCount &&
              h(
                'div',
                {
                  style: {
                    color: '#f44336',
                    fontSize: '12px',
                    marginTop: '4px',
                  },
                },
                errors.packetCount
              )
          ),

          // Loss Threshold
          h(
            'div',
            null,
            h(
              'label',
              {
                style: {
                  display: 'block',
                  marginBottom: '4px',
                  fontWeight: 'bold',
                  color: '#333',
                },
              },
              'Loss Threshold (%)'
            ),
            h('input', {
              type: 'number',
              value: formData.lossThreshold,
              onChange: e =>
                handleInputChange(
                  'lossThreshold',
                  parseInt(e.target.value) || 0
                ),
              style: {
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              },
              min: '0',
              max: '100',
            })
          )
        ),

        // Latency Thresholds
        h(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '24px',
            },
          },
          // Warning Threshold
          h(
            'div',
            null,
            h(
              'label',
              {
                style: {
                  display: 'block',
                  marginBottom: '4px',
                  fontWeight: 'bold',
                  color: '#333',
                },
              },
              'Warning Latency (ms)'
            ),
            h('input', {
              type: 'number',
              value: formData.latencyWarningThreshold,
              onChange: e =>
                handleInputChange(
                  'latencyWarningThreshold',
                  parseInt(e.target.value) || 0
                ),
              style: {
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              },
              min: '1',
            })
          ),

          // Critical Threshold
          h(
            'div',
            null,
            h(
              'label',
              {
                style: {
                  display: 'block',
                  marginBottom: '4px',
                  fontWeight: 'bold',
                  color: '#333',
                },
              },
              'Critical Latency (ms)'
            ),
            h('input', {
              type: 'number',
              value: formData.latencyCriticalThreshold,
              onChange: e =>
                handleInputChange(
                  'latencyCriticalThreshold',
                  parseInt(e.target.value) || 0
                ),
              style: {
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              },
              min: '1',
            })
          )
        ),

        // Actions
        h(
          'div',
          {
            style: {
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              borderTop: '1px solid #eee',
              paddingTop: '16px',
            },
          },
          h(
            'button',
            {
              type: 'button',
              onClick: onClose,
              style: {
                padding: '8px 16px',
                backgroundColor: '#f5f5f5',
                color: '#333',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
              },
            },
            'Cancel'
          ),
          h(
            'button',
            {
              type: 'submit',
              style: {
                padding: '8px 16px',
                backgroundColor: '#4caf50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              },
            },
            'Add Monitor'
          )
        )
      )
    )
  )
}

/**
 * Edit Monitor Dialog Component
 */
function EditMonitorDialog({ isOpen, onClose, onSubmit, monitor }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    ipAddress: '',
    interval: 5,
    timeout: 10,
    packetCount: 3,
    lossThreshold: 10,
    latencyWarningThreshold: 200,
    latencyCriticalThreshold: 1000,
    status: 'active',
  })
  const [errors, setErrors] = useState({})

  // Update form data when monitor changes
  useEffect(() => {
    if (monitor && isOpen) {
      setFormData({
        name: monitor.name || '',
        description: monitor.description || '',
        ipAddress: monitor.ipAddress || '',
        interval: monitor.interval || 5,
        timeout: monitor.timeout || 10,
        packetCount: monitor.packetCount || 3,
        lossThreshold: monitor.lossThreshold || 10,
        latencyWarningThreshold: monitor.latencyWarningThreshold || 200,
        latencyCriticalThreshold: monitor.latencyCriticalThreshold || 1000,
        status: monitor.status || 'active',
      })
    }
  }, [monitor, isOpen])

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }))
    }
  }

  const validateForm = () => {
    const newErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Monitor name is required'
    }

    if (!formData.ipAddress.trim()) {
      newErrors.ipAddress = 'IP address is required'
    } else {
      // Basic IP validation
      const ipRegex =
        /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
      if (!ipRegex.test(formData.ipAddress)) {
        newErrors.ipAddress = 'Please enter a valid IP address'
      }
    }

    if (formData.interval < 1) {
      newErrors.interval = 'Interval must be at least 1 second'
    }

    if (formData.timeout < 1) {
      newErrors.timeout = 'Timeout must be at least 1 second'
    }

    if (formData.packetCount < 1) {
      newErrors.packetCount = 'Packet count must be at least 1'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = e => {
    e.preventDefault()
    if (validateForm()) {
      onSubmit(formData)
      onClose()
    }
  }

  if (!isOpen || !monitor) return null

  return h(
    'div',
    {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
      },
      onClick: e => {
        if (e.target === e.currentTarget) onClose()
      },
    },
    h(
      'div',
      {
        style: {
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          width: '90%',
          maxWidth: '500px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        },
      },
      // Header
      h(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px',
          },
        },
        h('h2', { style: { margin: 0, color: '#333' } }, 'Edit Monitor'),
        h(
          'button',
          {
            onClick: onClose,
            style: {
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#666',
            },
          },
          '×'
        )
      ),

      // Form
      h(
        'form',
        { onSubmit: handleSubmit },
        // Monitor Name
        h(
          'div',
          { style: { marginBottom: '16px' } },
          h(
            'label',
            {
              style: {
                display: 'block',
                marginBottom: '4px',
                fontWeight: 'bold',
                color: '#333',
              },
            },
            'Monitor Name *'
          ),
          h('input', {
            type: 'text',
            value: formData.name,
            onChange: e => handleInputChange('name', e.target.value),
            style: {
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${errors.name ? '#f44336' : '#ddd'}`,
              borderRadius: '4px',
              fontSize: '14px',
              boxSizing: 'border-box',
            },
            placeholder: 'e.g., Web Server',
          }),
          errors.name &&
            h(
              'div',
              {
                style: { color: '#f44336', fontSize: '12px', marginTop: '4px' },
              },
              errors.name
            )
        ),

        // Status
        h(
          'div',
          { style: { marginBottom: '16px' } },
          h(
            'label',
            {
              style: {
                display: 'block',
                marginBottom: '4px',
                fontWeight: 'bold',
                color: '#333',
              },
            },
            'Status'
          ),
          h(
            'select',
            {
              value: formData.status,
              onChange: e => handleInputChange('status', e.target.value),
              style: {
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              },
            },
            h('option', { value: 'active' }, 'Active'),
            h('option', { value: 'paused' }, 'Paused'),
            h('option', { value: 'disabled' }, 'Disabled')
          )
        ),

        // Description
        h(
          'div',
          { style: { marginBottom: '16px' } },
          h(
            'label',
            {
              style: {
                display: 'block',
                marginBottom: '4px',
                fontWeight: 'bold',
                color: '#333',
              },
            },
            'Description'
          ),
          h('input', {
            type: 'text',
            value: formData.description,
            onChange: e => handleInputChange('description', e.target.value),
            style: {
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              boxSizing: 'border-box',
            },
            placeholder: 'Optional description',
          })
        ),

        // IP Address
        h(
          'div',
          { style: { marginBottom: '16px' } },
          h(
            'label',
            {
              style: {
                display: 'block',
                marginBottom: '4px',
                fontWeight: 'bold',
                color: '#333',
              },
            },
            'IP Address *'
          ),
          h('input', {
            type: 'text',
            value: formData.ipAddress,
            onChange: e => handleInputChange('ipAddress', e.target.value),
            style: {
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${errors.ipAddress ? '#f44336' : '#ddd'}`,
              borderRadius: '4px',
              fontSize: '14px',
              fontFamily: 'monospace',
              boxSizing: 'border-box',
            },
            placeholder: '192.168.1.1',
          }),
          errors.ipAddress &&
            h(
              'div',
              {
                style: { color: '#f44336', fontSize: '12px', marginTop: '4px' },
              },
              errors.ipAddress
            )
        ),

        // Two column layout for numbers
        h(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '16px',
            },
          },
          // Interval
          h(
            'div',
            null,
            h(
              'label',
              {
                style: {
                  display: 'block',
                  marginBottom: '4px',
                  fontWeight: 'bold',
                  color: '#333',
                },
              },
              'Interval (seconds) *'
            ),
            h('input', {
              type: 'number',
              value: formData.interval,
              onChange: e =>
                handleInputChange('interval', parseInt(e.target.value) || 0),
              style: {
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${errors.interval ? '#f44336' : '#ddd'}`,
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              },
              min: '1',
              placeholder: 'e.g., 5 for realtime, 30 for normal',
            }),
            errors.interval &&
              h(
                'div',
                {
                  style: {
                    color: '#f44336',
                    fontSize: '12px',
                    marginTop: '4px',
                  },
                },
                errors.interval
              )
          ),

          // Timeout
          h(
            'div',
            null,
            h(
              'label',
              {
                style: {
                  display: 'block',
                  marginBottom: '4px',
                  fontWeight: 'bold',
                  color: '#333',
                },
              },
              'Timeout (seconds) *'
            ),
            h('input', {
              type: 'number',
              value: formData.timeout,
              onChange: e =>
                handleInputChange('timeout', parseInt(e.target.value) || 0),
              style: {
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${errors.timeout ? '#f44336' : '#ddd'}`,
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              },
              min: '1',
            }),
            errors.timeout &&
              h(
                'div',
                {
                  style: {
                    color: '#f44336',
                    fontSize: '12px',
                    marginTop: '4px',
                  },
                },
                errors.timeout
              )
          )
        ),

        // Packet settings
        h(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '16px',
            },
          },
          // Packet Count
          h(
            'div',
            null,
            h(
              'label',
              {
                style: {
                  display: 'block',
                  marginBottom: '4px',
                  fontWeight: 'bold',
                  color: '#333',
                },
              },
              'Packet Count *'
            ),
            h('input', {
              type: 'number',
              value: formData.packetCount,
              onChange: e =>
                handleInputChange('packetCount', parseInt(e.target.value) || 0),
              style: {
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${errors.packetCount ? '#f44336' : '#ddd'}`,
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              },
              min: '1',
            }),
            errors.packetCount &&
              h(
                'div',
                {
                  style: {
                    color: '#f44336',
                    fontSize: '12px',
                    marginTop: '4px',
                  },
                },
                errors.packetCount
              )
          ),

          // Loss Threshold
          h(
            'div',
            null,
            h(
              'label',
              {
                style: {
                  display: 'block',
                  marginBottom: '4px',
                  fontWeight: 'bold',
                  color: '#333',
                },
              },
              'Loss Threshold (%)'
            ),
            h('input', {
              type: 'number',
              value: formData.lossThreshold,
              onChange: e =>
                handleInputChange(
                  'lossThreshold',
                  parseInt(e.target.value) || 0
                ),
              style: {
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              },
              min: '0',
              max: '100',
            })
          )
        ),

        // Latency Thresholds
        h(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '24px',
            },
          },
          // Warning Threshold
          h(
            'div',
            null,
            h(
              'label',
              {
                style: {
                  display: 'block',
                  marginBottom: '4px',
                  fontWeight: 'bold',
                  color: '#333',
                },
              },
              'Warning Latency (ms)'
            ),
            h('input', {
              type: 'number',
              value: formData.latencyWarningThreshold,
              onChange: e =>
                handleInputChange(
                  'latencyWarningThreshold',
                  parseInt(e.target.value) || 0
                ),
              style: {
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              },
              min: '1',
            })
          ),

          // Critical Threshold
          h(
            'div',
            null,
            h(
              'label',
              {
                style: {
                  display: 'block',
                  marginBottom: '4px',
                  fontWeight: 'bold',
                  color: '#333',
                },
              },
              'Critical Latency (ms)'
            ),
            h('input', {
              type: 'number',
              value: formData.latencyCriticalThreshold,
              onChange: e =>
                handleInputChange(
                  'latencyCriticalThreshold',
                  parseInt(e.target.value) || 0
                ),
              style: {
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              },
              min: '1',
            })
          )
        ),

        // Actions
        h(
          'div',
          {
            style: {
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              borderTop: '1px solid #eee',
              paddingTop: '16px',
            },
          },
          h(
            'button',
            {
              type: 'button',
              onClick: onClose,
              style: {
                padding: '8px 16px',
                backgroundColor: '#f5f5f5',
                color: '#333',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
              },
            },
            'Cancel'
          ),
          h(
            'button',
            {
              type: 'submit',
              style: {
                padding: '8px 16px',
                backgroundColor: '#2196f3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              },
            },
            'Update Monitor'
          )
        )
      )
    )
  )
}

/**
 * Main ICMP Monitoring Dashboard
 */
function ICMPMonitoringDashboard() {
  const [selectedMonitor, setSelectedMonitor] = useState(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingMonitor, setEditingMonitor] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')

  // Use the monitors hook
  const {
    monitors,
    liveResults,
    alerts,
    loading,
    error,
    isConnected,
    refreshData,
    addMonitor,
    removeMonitor,
    updateMonitor,
  } = useICMPMonitors()

  // Handle adding a new monitor
  const handleAddMonitor = async monitorData => {
    try {
      const newMonitor = await addMonitor(monitorData)
      console.log('Successfully added new monitor:', newMonitor)

      // Show success message with more details
      const message = `✅ Monitor "${monitorData.name}" is now actively monitoring ${monitorData.ipAddress} every ${monitorData.interval} seconds and storing results in SQLite database!`

      // Create a better notification
      if (window.Notification && Notification.permission === 'granted') {
        new Notification('Monitor Added Successfully', {
          body: message,
          icon: '/favicon.ico',
        })
      } else {
        alert(message)
      }
    } catch (error) {
      console.error('Error adding monitor:', error)
      alert(`❌ Failed to add monitor to database: ${error.message}`)
    }
  }

  // Handle editing a monitor
  const handleEditMonitor = monitor => {
    console.log('Opening edit dialog for monitor:', monitor)
    setEditingMonitor(monitor)
    setShowEditDialog(true)
  }

  // Handle updating a monitor
  const handleUpdateMonitor = async monitorData => {
    try {
      console.log(
        'Updating monitor:',
        editingMonitor._id,
        'with data:',
        monitorData
      )
      const updatedMonitor = await updateMonitor(
        editingMonitor._id || editingMonitor.id,
        monitorData
      )
      console.log('Successfully updated monitor:', updatedMonitor)

      // Show success message
      const message = `✅ Monitor "${monitorData.name}" has been updated successfully!`

      if (window.Notification && Notification.permission === 'granted') {
        new Notification('Monitor Updated Successfully', {
          body: message,
          icon: '/favicon.ico',
        })
      } else {
        alert(message)
      }

      // Close the edit dialog
      setShowEditDialog(false)
      setEditingMonitor(null)

      // Refresh data to show changes
      await refreshData()
    } catch (error) {
      console.error('Error updating monitor:', error)
      alert(`❌ Failed to update monitor: ${error.message}`)
    }
  }

  // Handle deleting a monitor
  const handleDeleteMonitor = async monitorId => {
    try {
      await removeMonitor(monitorId)
      console.log('Successfully removed monitor:', monitorId)

      // Show success message
      if (window.Notification && Notification.permission === 'granted') {
        new Notification('Monitor Deleted', {
          body: 'Monitor has been removed from the database',
          icon: '/favicon.ico',
        })
      }
    } catch (error) {
      console.error('Error removing monitor:', error)
      alert(`❌ Failed to remove monitor from database: ${error.message}`)
    }
  }

  // Request notification permissions on component mount
  useEffect(() => {
    if (window.Notification && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Filter monitors
  const filteredMonitors = monitors.filter(monitor => {
    if (filterStatus === 'all') return true
    if (filterStatus === 'active') return monitor.status === 'active'
    if (filterStatus === 'paused') return monitor.status === 'paused'
    if (filterStatus === 'down') {
      const liveResult = liveResults.get(monitor._id)
      return liveResult?.currentStatus === 'down'
    }
    return true
  })

  // Calculate statistics
  const stats = {
    total: monitors.length,
    up: monitors.filter(m => {
      const lr = liveResults.get(m._id)
      return m.status === 'active' && lr?.currentStatus === 'up'
    }).length,
    down: monitors.filter(m => {
      const lr = liveResults.get(m._id)
      return m.status === 'active' && lr?.currentStatus === 'down'
    }).length,
    paused: monitors.filter(m => m.status === 'paused').length,
    activeAlerts: alerts.filter(a => a.status === 'active').length,
  }

  if (loading) {
    return h(
      'div',
      { style: { maxWidth: '1400px', margin: '0 auto', padding: '16px' } },
      h(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '48px',
          },
        },
        h('div', {
          style: {
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #1976d2',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            animation: 'spin 2s linear infinite',
            marginRight: '16px',
          },
        }),
        h('p', { style: { margin: '0' } }, 'Loading ICMP monitors...')
      ),
      h(
        'style',
        null,
        `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `
      )
    )
  }

  return h(
    'div',
    { style: { maxWidth: '1400px', margin: '0 auto', padding: '16px' } },

    // Navigation
    h(
      'button',
      {
        onClick: () => (window.location.href = '/'),
        style: {
          marginBottom: '16px',
          padding: '8px 16px',
          backgroundColor: '#1976d2',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        },
      },
      '← Back to Home'
    ),

    h(
      'nav',
      {
        style: {
          marginBottom: '24px',
          fontSize: '14px',
          color: '#666',
        },
      },
      h(
        'a',
        { href: '/', style: { color: '#1976d2', textDecoration: 'none' } },
        'Home'
      ),
      ' > ',
      h('span', { style: { color: '#333' } }, 'ICMP Network Monitoring')
    ),

    // Header with status
    h(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        },
      },
      h(
        'div',
        null,
        h(
          'h1',
          { style: { margin: '0 0 8px 0', color: '#333' } },
          '🌐 ICMP Network Monitoring'
        ),
        h(
          'p',
          { style: { margin: '0', color: '#666' } },
          'Real-time network device monitoring and alerting'
        )
      ),
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        h(
          'span',
          {
            style: {
              padding: '6px 12px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 'bold',
              color: 'white',
              backgroundColor: isConnected ? '#4caf50' : '#f44336',
            },
          },
          isConnected ? '🟢 Connected' : '🔴 Disconnected'
        ),
        h(
          'button',
          {
            onClick: refreshData,
            style: {
              padding: '8px 16px',
              backgroundColor: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            },
          },
          '🔄 Refresh'
        )
      )
    ),

    // Error display
    error &&
      h(
        'div',
        {
          style: {
            backgroundColor: '#ffebee',
            border: '1px solid #f44336',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '24px',
            color: '#c62828',
          },
        },
        `⚠️ ${error}`
      ),

    // Statistics cards
    h(
      'div',
      {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        },
      },
      h(
        'div',
        {
          style: {
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            padding: '20px',
            textAlign: 'center',
          },
        },
        h(
          'div',
          { style: { fontSize: '32px', fontWeight: 'bold', color: '#333' } },
          stats.total
        ),
        h(
          'div',
          { style: { fontSize: '14px', color: '#666' } },
          'Total Monitors'
        )
      ),
      h(
        'div',
        {
          style: {
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            padding: '20px',
            textAlign: 'center',
          },
        },
        h(
          'div',
          { style: { fontSize: '32px', fontWeight: 'bold', color: '#4caf50' } },
          stats.up
        ),
        h('div', { style: { fontSize: '14px', color: '#666' } }, 'Up')
      ),
      h(
        'div',
        {
          style: {
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            padding: '20px',
            textAlign: 'center',
          },
        },
        h(
          'div',
          { style: { fontSize: '32px', fontWeight: 'bold', color: '#f44336' } },
          stats.down
        ),
        h('div', { style: { fontSize: '14px', color: '#666' } }, 'Down')
      ),
      h(
        'div',
        {
          style: {
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            padding: '20px',
            textAlign: 'center',
          },
        },
        h(
          'div',
          { style: { fontSize: '32px', fontWeight: 'bold', color: '#9e9e9e' } },
          stats.paused
        ),
        h('div', { style: { fontSize: '14px', color: '#666' } }, 'Paused')
      ),
      h(
        'div',
        {
          style: {
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            padding: '20px',
            textAlign: 'center',
          },
        },
        h(
          'div',
          { style: { fontSize: '32px', fontWeight: 'bold', color: '#ff9800' } },
          stats.activeAlerts
        ),
        h(
          'div',
          { style: { fontSize: '14px', color: '#666' } },
          'Active Alerts'
        )
      )
    ),

    // Controls
    h(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        },
      },
      h(
        'div',
        { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
        h('span', { style: { fontSize: '14px', color: '#666' } }, 'Filter:'),
        h(
          'select',
          {
            value: filterStatus,
            onChange: e => setFilterStatus(e.target.value),
            style: {
              padding: '6px 12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
            },
          },
          h('option', { value: 'all' }, 'All Monitors'),
          h('option', { value: 'active' }, 'Active'),
          h('option', { value: 'down' }, 'Down'),
          h('option', { value: 'paused' }, 'Paused')
        )
      ),
      h(
        'button',
        {
          onClick: () => setShowAddDialog(true),
          style: {
            padding: '8px 16px',
            backgroundColor: '#4caf50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          },
        },
        '➕ Add Monitor'
      )
    ),

    // Monitors grid
    h(
      'div',
      {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        },
      },
      filteredMonitors.length === 0
        ? h(
            'div',
            {
              style: {
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: '48px',
                color: '#666',
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              },
            },
            monitors.length === 0
              ? h(
                  'div',
                  null,
                  h(
                    'div',
                    { style: { fontSize: '48px', marginBottom: '16px' } },
                    '🌐'
                  ),
                  h(
                    'h3',
                    { style: { margin: '0 0 8px 0', color: '#333' } },
                    'Welcome to ICMP Network Monitoring!'
                  ),
                  h(
                    'p',
                    { style: { margin: '0 0 16px 0' } },
                    'Get started by adding your first network monitor. You can monitor servers, routers, switches, and any networked device.'
                  ),
                  h(
                    'button',
                    {
                      onClick: () => setShowAddDialog(true),
                      style: {
                        padding: '12px 24px',
                        backgroundColor: '#4caf50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '16px',
                        fontWeight: 'bold',
                      },
                    },
                    '➕ Add Your First Monitor'
                  )
                )
              : 'No monitors found for the selected filter.'
          )
        : filteredMonitors.map(monitor =>
            h(MonitorCard, {
              key: monitor._id,
              monitor,
              liveResult: liveResults.get(monitor._id),
              onSelect: setSelectedMonitor,
              onDelete: handleDeleteMonitor,
              onEdit: handleEditMonitor,
            })
          )
    ),

    // Active alerts section
    alerts.length > 0 &&
      h(
        'div',
        {
          style: {
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            padding: '24px',
            marginBottom: '24px',
          },
        },
        h('h2', { style: { margin: '0 0 16px 0' } }, '🚨 Active Alerts'),
        ...alerts.map(alert =>
          h(
            'div',
            {
              key: alert._id,
              style: {
                padding: '12px',
                backgroundColor:
                  alert.severity === 'critical' ? '#ffebee' : '#fff3e0',
                borderLeft: `4px solid ${alert.severity === 'critical' ? '#f44336' : '#ff9800'}`,
                borderRadius: '4px',
                marginBottom: '8px',
              },
            },
            h(
              'div',
              {
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                },
              },
              h(
                'div',
                null,
                h('strong', null, alert.monitorName),
                h(
                  'span',
                  { style: { marginLeft: '8px', color: '#666' } },
                  alert.condition
                )
              ),
              h(
                'span',
                {
                  style: {
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    backgroundColor:
                      alert.severity === 'critical' ? '#f44336' : '#ff9800',
                    color: 'white',
                  },
                },
                alert.severity.toUpperCase()
              )
            ),
            h(
              'div',
              { style: { fontSize: '12px', color: '#666', marginTop: '4px' } },
              `Triggered ${formatTimeAgo(alert.triggeredAt)} • Value: ${alert.value} (Threshold: ${alert.threshold})`
            )
          )
        )
      ),

    // Add Monitor Dialog
    h(AddMonitorDialog, {
      isOpen: showAddDialog,
      onClose: () => setShowAddDialog(false),
      onSubmit: handleAddMonitor,
    }),

    // Edit Monitor Dialog
    h(EditMonitorDialog, {
      isOpen: showEditDialog,
      onClose: () => setShowEditDialog(false),
      onSubmit: handleUpdateMonitor,
      monitor: editingMonitor,
    }),

    // CSS animations
    h(
      'style',
      null,
      `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `
    )
  )
}

/**
 * Initialize the React application
 */
const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(h(StrictMode, null, h(ICMPMonitoringDashboard)))
} else {
  console.error('Root element not found!')
}
