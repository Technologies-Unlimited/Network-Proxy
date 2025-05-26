/**
 * ICMP Device Status for the Network-Proxy application
 */

// Using React CDN imports - these will be loaded from the HTML file
const { createElement: h, StrictMode, useState, useEffect, useMemo } = React
const { createRoot } = ReactDOM

/**
 * Format timestamp to date string
 */
function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString()
}

/**
 * Format uptime/downtime in milliseconds to a human-readable string
 */
function formatTime(ms) {
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
function getStatusInfo(status) {
  switch (status) {
    case 'online':
      return { color: '#4caf50', text: 'Online' }
    case 'offline':
      return { color: '#f44336', text: 'Offline' }
    case 'unknown':
    default:
      return { color: '#9e9e9e', text: 'Unknown' }
  }
}

/**
 * Hook to fetch ICMP polling status data
 */
function useICMPPollingStatus(companyId = 'default-company-id') {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [icmpPollingStatuses, setICMPPollingStatuses] = useState([])
  const [isConnected, setIsConnected] = useState(true)

  // Function to refresh data
  const refreshICMPPollingStatus = async () => {
    setLoading(true)
    setError(null)

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Mock ICMP polling status data
      const mockStatuses = [
        {
          _id: 'icmp-status-1',
          companyId: companyId,
          icmpPollingTemplateId: 'template-001',
          productId: 'prod-001',
          deviceStatus: 'online',
          uptime: 86400000, // 1 day in ms
          downtime: 0,
          createdAt: Date.now() - 86400000,
          updatedAt: Date.now(),
        },
        {
          _id: 'icmp-status-2',
          companyId: companyId,
          icmpPollingTemplateId: 'template-002',
          productId: 'prod-002',
          deviceStatus: 'offline',
          uptime: 0,
          downtime: 3600000, // 1 hour in ms
          createdAt: Date.now() - 172800000,
          updatedAt: Date.now() - 3600000,
        },
        {
          _id: 'icmp-status-3',
          companyId: companyId,
          icmpPollingTemplateId: 'template-001',
          productId: 'prod-003',
          deviceStatus: 'online',
          uptime: 172800000, // 2 days in ms
          downtime: 0,
          createdAt: Date.now() - 259200000,
          updatedAt: Date.now(),
        },
        {
          _id: 'icmp-status-4',
          companyId: companyId,
          icmpPollingTemplateId: 'template-003',
          productId: 'prod-004',
          deviceStatus: 'unknown',
          uptime: 0,
          downtime: 0,
          createdAt: Date.now() - 345600000,
          updatedAt: Date.now() - 7200000,
        },
        {
          _id: 'icmp-status-5',
          companyId: companyId,
          icmpPollingTemplateId: 'template-002',
          productId: 'prod-005',
          deviceStatus: 'offline',
          uptime: 0,
          downtime: 7200000, // 2 hours in ms
          createdAt: Date.now() - 432000000,
          updatedAt: Date.now() - 7200000,
        },
      ]

      setICMPPollingStatuses(mockStatuses)
      setIsConnected(true)
    } catch (err) {
      console.error('Error fetching ICMP polling status data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      setIsConnected(false)
    } finally {
      setLoading(false)
    }
  }

  // Fetch data on component mount
  useEffect(() => {
    refreshICMPPollingStatus()
  }, [companyId])

  const reconnect = () => {
    setIsConnected(true)
    refreshICMPPollingStatus()
  }

  return {
    icmpPollingStatuses,
    loading,
    error,
    refreshICMPPollingStatus,
    isConnected,
    reconnect,
  }
}

/**
 * Main ICMP Device Status component
 */
const ICMPDeviceStatusClient = () => {
  // Use default company ID for demo purposes
  const [companyId] = useState('default-company-id')

  // Use the ICMP polling status hook
  const {
    icmpPollingStatuses,
    loading,
    error,
    refreshICMPPollingStatus,
    isConnected,
    reconnect,
  } = useICMPPollingStatus(companyId)

  // Sort statuses by device status (offline first, then online, etc.)
  const sortedStatuses = useMemo(() => {
    const statusOrder = {
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
    return h(
      'div',
      { style: { maxWidth: '1200px', margin: '0 auto', padding: '16px' } },
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
        h('p', { style: { margin: '0' } }, 'Loading device status data...')
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
    { style: { maxWidth: '1200px', margin: '0 auto', padding: '16px' } },
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
          marginBottom: '16px',
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
      h('span', { style: { color: '#333' } }, 'ICMP Device Status')
    ),

    h(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '24px',
        },
      },
      h(
        'div',
        null,
        h(
          'h1',
          { style: { marginBottom: '8px', color: '#333' } },
          'ICMP - Device Status'
        ),
        h(
          'p',
          { style: { marginBottom: '0', color: '#666' } },
          'Real-time network device status monitoring via ICMP'
        )
      ),

      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        h(
          'span',
          {
            style: {
              padding: '4px 8px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 'bold',
              color: 'white',
              backgroundColor: isConnected ? '#4caf50' : '#f44336',
            },
          },
          isConnected ? 'Connected' : 'Disconnected'
        ),

        !isConnected &&
          h(
            'button',
            {
              onClick: handleReconnect,
              style: {
                padding: '6px 12px',
                backgroundColor: '#1976d2',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              },
            },
            '🔄 Reconnect'
          ),

        h(
          'button',
          {
            onClick: handleRefresh,
            style: {
              padding: '6px 12px',
              backgroundColor: '#666',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            },
          },
          '🔄'
        )
      )
    ),

    error &&
      h(
        'div',
        {
          style: {
            backgroundColor: '#ffebee',
            border: '1px solid #f44336',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '16px',
            color: '#c62828',
          },
        },
        error
      ),

    h(
      'div',
      {
        style: {
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        },
      },
      h(
        'div',
        { style: { overflowX: 'auto' } },
        h(
          'table',
          {
            style: {
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: '800px',
            },
          },
          h(
            'thead',
            null,
            h(
              'tr',
              { style: { backgroundColor: '#f5f5f5' } },
              h(
                'th',
                {
                  style: {
                    padding: '12px',
                    textAlign: 'left',
                    borderBottom: '1px solid #ddd',
                    fontWeight: 'bold',
                  },
                },
                'Status'
              ),
              h(
                'th',
                {
                  style: {
                    padding: '12px',
                    textAlign: 'left',
                    borderBottom: '1px solid #ddd',
                    fontWeight: 'bold',
                  },
                },
                'Template ID'
              ),
              h(
                'th',
                {
                  style: {
                    padding: '12px',
                    textAlign: 'left',
                    borderBottom: '1px solid #ddd',
                    fontWeight: 'bold',
                  },
                },
                'Product ID'
              ),
              h(
                'th',
                {
                  style: {
                    padding: '12px',
                    textAlign: 'left',
                    borderBottom: '1px solid #ddd',
                    fontWeight: 'bold',
                  },
                },
                'Uptime'
              ),
              h(
                'th',
                {
                  style: {
                    padding: '12px',
                    textAlign: 'left',
                    borderBottom: '1px solid #ddd',
                    fontWeight: 'bold',
                  },
                },
                'Downtime'
              ),
              h(
                'th',
                {
                  style: {
                    padding: '12px',
                    textAlign: 'left',
                    borderBottom: '1px solid #ddd',
                    fontWeight: 'bold',
                  },
                },
                'Last Updated'
              )
            )
          ),
          h(
            'tbody',
            null,
            sortedStatuses.length === 0
              ? h(
                  'tr',
                  null,
                  h(
                    'td',
                    {
                      colSpan: 6,
                      style: {
                        padding: '24px',
                        textAlign: 'center',
                        color: '#666',
                        fontStyle: 'italic',
                      },
                    },
                    'No device status data available'
                  )
                )
              : sortedStatuses.map(device => {
                  const statusInfo = getStatusInfo(device.deviceStatus)
                  return h(
                    'tr',
                    {
                      key: device._id,
                      style: {
                        borderBottom: '1px solid #eee',
                      },
                      onMouseOver: e => {
                        e.target.closest('tr').style.backgroundColor = '#f5f5f5'
                      },
                      onMouseOut: e => {
                        e.target.closest('tr').style.backgroundColor =
                          'transparent'
                      },
                    },
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      h(
                        'span',
                        {
                          style: {
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            color: 'white',
                            backgroundColor: statusInfo.color,
                          },
                        },
                        statusInfo.text
                      )
                    ),
                    h(
                      'td',
                      { style: { padding: '12px', fontFamily: 'monospace' } },
                      device.icmpPollingTemplateId
                    ),
                    h(
                      'td',
                      { style: { padding: '12px', fontFamily: 'monospace' } },
                      device.productId || 'N/A'
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      formatTime(device.uptime || 0)
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      formatTime(device.downtime || 0)
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      formatDate(device.updatedAt)
                    )
                  )
                })
          )
        )
      )
    ),

    // Add CSS animation for loading spinner
    h(
      'style',
      null,
      `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      table tr:hover {
        background-color: #f5f5f5 !important;
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
  root.render(h(StrictMode, null, h(ICMPDeviceStatusClient)))
} else {
  console.error('Root element not found!')
}
