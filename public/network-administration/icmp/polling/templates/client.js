/**
 * ICMP Polling Templates for the Network-Proxy application
 */

// Using React CDN imports - these will be loaded from the HTML file
const { createElement: h, StrictMode, useState, useEffect, useMemo } = React
const { createRoot } = ReactDOM

/**
 * Format a time interval into a human-readable string
 */
function formatTimeInterval(interval) {
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
function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString()
}

/**
 * Hook to fetch ICMP polling templates data
 */
function useICMPPollingTemplates(companyId = 'default-company-id') {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [icmpPollingTemplates, setICMPPollingTemplates] = useState([])
  const [isConnected, setIsConnected] = useState(true)

  // Function to refresh data
  const refreshICMPPollingTemplates = async () => {
    setLoading(true)
    setError(null)

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Mock ICMP polling templates data
      const mockTemplates = [
        {
          _id: 'template-001',
          companyId: companyId,
          name: 'Standard Network Monitoring',
          description: 'Basic ICMP monitoring for network devices',
          frequency: 5, // minutes
          timeout: 5000, // ms
          retries: 3,
          pollingFrequency: { days: 0, hours: 0, minutes: 5, seconds: 0 },
          downtimeTrigger: { days: 0, hours: 0, minutes: 2, seconds: 0 },
          createdAt: Date.now() - 86400000,
          updatedAt: Date.now(),
        },
        {
          _id: 'template-002',
          companyId: companyId,
          name: 'High Frequency Monitoring',
          description: 'Frequent ICMP checks for critical infrastructure',
          frequency: 1, // minutes
          timeout: 3000, // ms
          retries: 5,
          pollingFrequency: { days: 0, hours: 0, minutes: 1, seconds: 0 },
          downtimeTrigger: { days: 0, hours: 0, minutes: 0, seconds: 30 },
          createdAt: Date.now() - 172800000,
          updatedAt: Date.now(),
        },
        {
          _id: 'template-003',
          companyId: companyId,
          name: 'Low Priority Monitoring',
          description: 'Infrequent monitoring for non-critical devices',
          frequency: 15, // minutes
          timeout: 10000, // ms
          retries: 2,
          pollingFrequency: { days: 0, hours: 0, minutes: 15, seconds: 0 },
          downtimeTrigger: { days: 0, hours: 0, minutes: 5, seconds: 0 },
          createdAt: Date.now() - 259200000,
          updatedAt: Date.now(),
        },
        {
          _id: 'template-004',
          companyId: companyId,
          name: 'Server Monitoring',
          description: 'Specialized monitoring template for servers',
          frequency: 2, // minutes
          timeout: 2000, // ms
          retries: 4,
          pollingFrequency: { days: 0, hours: 0, minutes: 2, seconds: 0 },
          downtimeTrigger: { days: 0, hours: 0, minutes: 1, seconds: 0 },
          createdAt: Date.now() - 345600000,
          updatedAt: Date.now(),
        },
      ]

      setICMPPollingTemplates(mockTemplates)
      setIsConnected(true)
    } catch (err) {
      console.error('Error fetching ICMP polling templates data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      setIsConnected(false)
    } finally {
      setLoading(false)
    }
  }

  // Fetch data on component mount
  useEffect(() => {
    refreshICMPPollingTemplates()
  }, [companyId])

  const reconnect = () => {
    setIsConnected(true)
    refreshICMPPollingTemplates()
  }

  return {
    icmpPollingTemplates,
    loading,
    error,
    refreshICMPPollingTemplates,
    isConnected,
    reconnect,
  }
}

/**
 * Main ICMP Polling Templates component
 */
const ICMPPollingTemplatesClient = () => {
  // Use default company ID for demo purposes
  const [companyId] = useState('default-company-id')

  // Use WebSocket-based hook to fetch template data
  const {
    icmpPollingTemplates,
    loading,
    error,
    refreshICMPPollingTemplates,
    isConnected,
    reconnect,
  } = useICMPPollingTemplates(companyId)

  // Sort templates by name
  const sortedTemplates = useMemo(() => {
    return [...icmpPollingTemplates].sort((a, b) =>
      a.name.localeCompare(b.name)
    )
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
        h('p', { style: { margin: '0' } }, 'Loading ICMP templates...')
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
      h('span', { style: { color: '#333' } }, 'ICMP Polling Templates')
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
          'ICMP - Polling Templates'
        ),
        h(
          'p',
          { style: { marginBottom: '0', color: '#666' } },
          'View and manage ICMP polling templates for network device monitoring'
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
              minWidth: '1000px',
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
                'Name'
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
                'Description'
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
                'Frequency'
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
                'Timeout'
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
                'Retries'
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
                'Polling Schedule'
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
                'Downtime Trigger'
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
                'Created'
              )
            )
          ),
          h(
            'tbody',
            null,
            sortedTemplates.length === 0
              ? h(
                  'tr',
                  null,
                  h(
                    'td',
                    {
                      colSpan: 8,
                      style: {
                        padding: '24px',
                        textAlign: 'center',
                        color: '#666',
                        fontStyle: 'italic',
                      },
                    },
                    'No ICMP templates available'
                  )
                )
              : sortedTemplates.map(template =>
                  h(
                    'tr',
                    {
                      key: template._id,
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
                      { style: { padding: '12px', fontWeight: 'bold' } },
                      template.name
                    ),
                    h(
                      'td',
                      { style: { padding: '12px', maxWidth: '200px' } },
                      template.description
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      `${template.frequency} min`
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      `${template.timeout} ms`
                    ),
                    h('td', { style: { padding: '12px' } }, template.retries),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      formatTimeInterval(template.pollingFrequency)
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      formatTimeInterval(template.downtimeTrigger)
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      formatDate(template.createdAt)
                    )
                  )
                )
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
  root.render(h(StrictMode, null, h(ICMPPollingTemplatesClient)))
} else {
  console.error('Root element not found!')
}
