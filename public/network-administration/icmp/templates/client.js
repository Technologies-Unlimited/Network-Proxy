/**
 * ICMP Templates for the Network-Proxy application
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
 * Hook to fetch ICMP monitoring templates data
 */
function useICMPMonitoringTemplates(companyId = 'default-company-id') {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [icmpMonitoringTemplates, setICMPMonitoringTemplates] = useState([])
  const [isConnected, setIsConnected] = useState(true)

  // Function to refresh data
  const refreshICMPMonitoringTemplates = async () => {
    setLoading(true)
    setError(null)

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Mock ICMP monitoring templates data
      const mockTemplates = [
        {
          _id: 'icmp-template-001',
          companyId: companyId,
          templateName: 'Standard Network Monitoring',
          templateDescription:
            'Basic ICMP monitoring template for general network devices',
          icmpLossThreshold: 10, // percentage
          icmpLatencyThreshold: 100, // ms
          productId: 'prod-001',
          createdAt: Date.now() - 86400000,
          updatedAt: Date.now(),
        },
        {
          _id: 'icmp-template-002',
          companyId: companyId,
          templateName: 'Critical Infrastructure Monitoring',
          templateDescription:
            'High-sensitivity monitoring for critical network infrastructure',
          icmpLossThreshold: 5, // percentage
          icmpLatencyThreshold: 50, // ms
          productId: 'prod-002',
          createdAt: Date.now() - 172800000,
          updatedAt: Date.now(),
        },
        {
          _id: 'icmp-template-003',
          companyId: companyId,
          templateName: 'Server Monitoring Template',
          templateDescription:
            'Specialized monitoring template for server infrastructure',
          icmpLossThreshold: 3, // percentage
          icmpLatencyThreshold: 25, // ms
          productId: 'prod-003',
          createdAt: Date.now() - 259200000,
          updatedAt: Date.now(),
        },
        {
          _id: 'icmp-template-004',
          companyId: companyId,
          templateName: 'Low Priority Monitoring',
          templateDescription: 'Relaxed monitoring for non-critical devices',
          icmpLossThreshold: 25, // percentage
          icmpLatencyThreshold: 500, // ms
          productId: null,
          createdAt: Date.now() - 345600000,
          updatedAt: Date.now(),
        },
        {
          _id: 'icmp-template-005',
          companyId: companyId,
          templateName: 'WAN Link Monitoring',
          templateDescription:
            'Monitoring template optimized for WAN connections',
          icmpLossThreshold: 15, // percentage
          icmpLatencyThreshold: 200, // ms
          productId: 'prod-005',
          createdAt: Date.now() - 432000000,
          updatedAt: Date.now(),
        },
      ]

      setICMPMonitoringTemplates(mockTemplates)
      setIsConnected(true)
    } catch (err) {
      console.error('Error fetching ICMP monitoring templates data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      setIsConnected(false)
    } finally {
      setLoading(false)
    }
  }

  // Fetch data on component mount
  useEffect(() => {
    refreshICMPMonitoringTemplates()
  }, [companyId])

  const reconnect = () => {
    setIsConnected(true)
    refreshICMPMonitoringTemplates()
  }

  return {
    icmpMonitoringTemplates,
    loading,
    error,
    refreshICMPMonitoringTemplates,
    isConnected,
    reconnect,
  }
}

/**
 * Main ICMP Templates component
 */
const ICMPTemplatesClient = () => {
  // Use default company ID for demo purposes
  const [companyId] = useState('default-company-id')

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
      h('span', { style: { color: '#333' } }, 'ICMP Templates')
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
          'ICMP - Monitoring Templates'
        ),
        h(
          'p',
          { style: { marginBottom: '0', color: '#666' } },
          'View and manage ICMP monitoring templates for network device monitoring'
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
              minWidth: '900px',
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
                'Loss Threshold'
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
                'Latency Threshold'
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
                'Created'
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
                'Updated'
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
                      colSpan: 7,
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
                      template.templateName
                    ),
                    h(
                      'td',
                      { style: { padding: '12px', maxWidth: '250px' } },
                      template.templateDescription
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      `${template.icmpLossThreshold}%`
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      `${template.icmpLatencyThreshold} ms`
                    ),
                    h(
                      'td',
                      { style: { padding: '12px', fontFamily: 'monospace' } },
                      template.productId || 'N/A'
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      formatDate(template.createdAt)
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      formatDate(template.updatedAt)
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
  root.render(h(StrictMode, null, h(ICMPTemplatesClient)))
} else {
  console.error('Root element not found!')
}
