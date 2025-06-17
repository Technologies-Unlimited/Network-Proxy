/**
 * SNMP Device Polling for the Network-Proxy application
 */

// Using React CDN imports - these will be loaded from the HTML file
const { createElement: h, StrictMode, useState, useEffect } = React
const { createRoot } = ReactDOM

/**
 * Hook to fetch SNMP polling data via WebSocket/REST API
 */
function useSNMPPollingData(companyId = 'default-company-id') {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [snmpPollingStatuses, setSNMPPollingStatuses] = useState([])
  const [snmpPollingTemplates, setSNMPPollingTemplates] = useState([])
  const [snmpTemplates, setSNMPTemplates] = useState([])
  const [networkInventories, setNetworkInventories] = useState([])
  const [ipAddresses, setIPAddresses] = useState([])
  const [selectedStatus, setSelectedStatus] = useState(null)

  // Function to refresh data
  const refreshData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Mock SNMP polling statuses data
      const mockStatuses = [
        {
          id: 'snmp-status-1',
          companyId: companyId,
          snmpPollingTemplateId: 'template-1',
          snmpTemplateId: 'snmp-template-1',
          manufacturerId: 'cisco-001',
          modelNameId: 'catalyst-2960',
          productId: 'product-1',
          stockIds: ['stock-1'],
          networkInventoryIds: ['inv-1'],
          uptime: 86400, // 1 day
          downtime: 0,
          deviceStatus: 'up',
          createdAt: Date.now() - 86400000,
          updatedAt: Date.now(),
        },
        {
          id: 'snmp-status-2',
          companyId: companyId,
          snmpPollingTemplateId: 'template-2',
          snmpTemplateId: 'snmp-template-2',
          manufacturerId: 'hp-001',
          modelNameId: 'procurve-2510',
          productId: 'product-2',
          stockIds: ['stock-2'],
          networkInventoryIds: ['inv-2'],
          uptime: 172800, // 2 days
          downtime: 3600, // 1 hour
          deviceStatus: 'warning',
          createdAt: Date.now() - 172800000,
          updatedAt: Date.now(),
        },
        {
          id: 'snmp-status-3',
          companyId: companyId,
          snmpPollingTemplateId: 'template-1',
          snmpTemplateId: 'snmp-template-1',
          manufacturerId: 'ubiquiti-001',
          modelNameId: 'unifi-switch',
          productId: 'product-3',
          stockIds: ['stock-3'],
          networkInventoryIds: ['inv-3'],
          uptime: 0,
          downtime: 7200, // 2 hours
          deviceStatus: 'down',
          createdAt: Date.now() - 259200000,
          updatedAt: Date.now(),
        },
      ]

      // Mock SNMP polling templates
      const mockPollingTemplates = [
        {
          id: 'template-1',
          companyId: companyId,
          name: 'Standard Polling Template',
          version: 'v2',
          frequency: 300, // 5 minutes
          timeout: 5,
          retries: 3,
          createdAt: Date.now() - 86400000,
        },
        {
          id: 'template-2',
          companyId: companyId,
          name: 'High Frequency Template',
          version: 'v3',
          frequency: 60, // 1 minute
          timeout: 3,
          retries: 2,
          createdAt: Date.now() - 86400000,
        },
      ]

      // Mock SNMP templates
      const mockSNMPTemplates = [
        {
          id: 'snmp-template-1',
          companyId: companyId,
          templateName: 'Public Community Template',
          version: 'v2',
          community: 'public',
          createdAt: Date.now() - 86400000,
        },
        {
          id: 'snmp-template-2',
          companyId: companyId,
          templateName: 'Secure v3 Template',
          version: 'v3',
          username: 'snmpuser',
          securityLevel: 'authPriv',
          authProtocol: 'SHA',
          authKey: 'authkey123',
          privProtocol: 'AES',
          privKey: 'privkey123',
          createdAt: Date.now() - 86400000,
        },
      ]

      // Mock network inventories
      const mockNetworkInventories = [
        {
          id: 'inv-1',
          companyId: companyId,
          productId: 'product-1',
          stockId: 'stock-1',
          macAddress: '00:1A:2B:3C:4D:5E',
          ipAddress: '192.168.1.10',
          subnetMask: '255.255.255.0',
          gateway: '192.168.1.1',
          createdAt: Date.now() - 86400000,
          updatedAt: Date.now(),
        },
        {
          id: 'inv-2',
          companyId: companyId,
          productId: 'product-2',
          stockId: 'stock-2',
          macAddress: '00:2B:3C:4D:5E:6F',
          ipAddress: '192.168.1.11',
          subnetMask: '255.255.255.0',
          gateway: '192.168.1.1',
          createdAt: Date.now() - 172800000,
          updatedAt: Date.now(),
        },
        {
          id: 'inv-3',
          companyId: companyId,
          productId: 'product-3',
          stockId: 'stock-3',
          macAddress: '00:3C:4D:5E:6F:70',
          ipAddress: '192.168.1.12',
          subnetMask: '255.255.255.0',
          gateway: '192.168.1.1',
          createdAt: Date.now() - 259200000,
          updatedAt: Date.now(),
        },
      ]

      // Mock IP addresses
      const mockIPAddresses = [
        {
          id: 'ip-1',
          companyId: companyId,
          address: '192.168.1.10',
          subnetId: 'subnet-1',
          networkInventoryId: 'inv-1',
          status: 'assigned',
          createdAt: Date.now() - 86400000,
        },
        {
          id: 'ip-2',
          companyId: companyId,
          address: '192.168.1.11',
          subnetId: 'subnet-1',
          networkInventoryId: 'inv-2',
          status: 'assigned',
          createdAt: Date.now() - 172800000,
        },
        {
          id: 'ip-3',
          companyId: companyId,
          address: '192.168.1.12',
          subnetId: 'subnet-1',
          networkInventoryId: 'inv-3',
          status: 'assigned',
          createdAt: Date.now() - 259200000,
        },
      ]

      setSNMPPollingStatuses(mockStatuses)
      setSNMPPollingTemplates(mockPollingTemplates)
      setSNMPTemplates(mockSNMPTemplates)
      setNetworkInventories(mockNetworkInventories)
      setIPAddresses(mockIPAddresses)
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
  }, [companyId])

  // Handle row selection
  const handleSelectStatus = status => {
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
function formatDuration(seconds) {
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
function getStatusColor(status) {
  switch (status.toLowerCase()) {
    case 'up':
      return '#4caf50' // green
    case 'down':
      return '#f44336' // red
    case 'warning':
      return '#ff9800' // orange
    default:
      return '#9e9e9e' // gray
  }
}

/**
 * Main SNMP Device Polling component
 */
const DevicePolling = () => {
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
  const templateMap = snmpPollingTemplates.reduce((map, template) => {
    map[template.id] = template
    return map
  }, {})

  const snmpTemplateMap = snmpTemplates.reduce((map, template) => {
    map[template.id] = template
    return map
  }, {})

  const networkInventoryMap = networkInventories.reduce((map, inv) => {
    map[inv.id] = inv
    return map
  }, {})

  // Create a map of IP addresses by network inventory ID
  const ipAddressesByNetworkInventory = ipAddresses.reduce((map, ip) => {
    if (ip.networkInventoryId) {
      map[ip.networkInventoryId] = ip
    }
    return map
  }, {})

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
        h('p', { style: { margin: '0' } }, 'Loading SNMP polling status...')
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

  // Render error state
  if (error) {
    return h(
      'div',
      { style: { maxWidth: '1200px', margin: '0 auto', padding: '16px' } },
      h(
        'div',
        {
          style: {
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          },
        },
        h('h2', { style: { color: '#f44336', marginTop: '0' } }, 'Error'),
        h('p', null, error)
      )
    )
  }

  return h(
    'div',
    { style: { maxWidth: '1200px', margin: '0 auto', padding: '16px' } },
    h(
      'button',
      {
        onClick: () => (window.location.href = '/network-administration/snmp'),
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
      '← Back to SNMP Management'
    ),

    h(
      'h1',
      { style: { marginBottom: '8px', color: '#333' } },
      'SNMP - Device Polling Status'
    ),
    h(
      'p',
      { style: { marginBottom: '24px', color: '#666' } },
      'View SNMP device polling status with uptime, downtime, and device status'
    ),

    h(
      'div',
      { style: { display: 'flex', gap: '8px', marginBottom: '24px' } },
      h(
        'button',
        {
          onClick: refreshData,
          style: {
            padding: '8px 16px',
            backgroundColor: '#4caf50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          },
        },
        '🔄 Refresh Data'
      )
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
                'ID'
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
                'SNMP Polling Template'
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
                'SNMP Template'
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
                'Network Devices'
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
                'IP Address'
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
                'Status'
              )
            )
          ),
          h(
            'tbody',
            null,
            snmpPollingStatuses.length === 0
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
                    'No SNMP polling status data available'
                  )
                )
              : snmpPollingStatuses.map(status => {
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

                  return h(
                    'tr',
                    {
                      key: status.id,
                      onClick: () => handleSelectStatus(status),
                      style: {
                        cursor: 'pointer',
                        backgroundColor:
                          selectedStatus?.id === status.id
                            ? '#e3f2fd'
                            : 'transparent',
                        borderBottom: '1px solid #eee',
                      },
                      onMouseOver: e => {
                        if (selectedStatus?.id !== status.id) {
                          e.target.closest('tr').style.backgroundColor =
                            '#f5f5f5'
                        }
                      },
                      onMouseOut: e => {
                        if (selectedStatus?.id !== status.id) {
                          e.target.closest('tr').style.backgroundColor =
                            'transparent'
                        }
                      },
                    },
                    h(
                      'td',
                      {
                        style: {
                          padding: '12px',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                        },
                      },
                      status.id.substring(0, 8) + '...'
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      pollingTemplate?.name || 'Unknown'
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      snmpTemplate?.templateName || 'Unknown'
                    ),
                    h(
                      'td',
                      {
                        style: {
                          padding: '12px',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                        },
                      },
                      devices.length > 0
                        ? devices.map(d => d.macAddress).join(', ')
                        : 'No devices'
                    ),
                    h(
                      'td',
                      { style: { padding: '12px', fontFamily: 'monospace' } },
                      ipAddress
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      formatDuration(status.uptime)
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      formatDuration(status.downtime)
                    ),
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
                            backgroundColor: getStatusColor(
                              status.deviceStatus
                            ),
                          },
                        },
                        status.deviceStatus.toUpperCase()
                      )
                    )
                  )
                })
          )
        )
      )
    ),

    // Selected status details
    selectedStatus &&
      h(
        'div',
        {
          style: {
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            padding: '24px',
            marginTop: '24px',
          },
        },
        h(
          'div',
          {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            },
          },
          h('h3', { style: { margin: '0', color: '#333' } }, 'Device Details'),
          h(
            'button',
            {
              onClick: () => setSelectedStatus(null),
              style: {
                padding: '4px 8px',
                backgroundColor: '#666',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              },
            },
            '✕ Close'
          )
        ),

        h(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '16px',
            },
          },
          h(
            'div',
            null,
            h(
              'h4',
              { style: { marginTop: '0', color: '#666' } },
              'Basic Information'
            ),
            h('p', null, h('strong', null, 'ID: '), selectedStatus.id),
            h(
              'p',
              null,
              h('strong', null, 'Status: '),
              h(
                'span',
                {
                  style: {
                    padding: '2px 6px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: 'white',
                    backgroundColor: getStatusColor(
                      selectedStatus.deviceStatus
                    ),
                  },
                },
                selectedStatus.deviceStatus.toUpperCase()
              )
            ),
            h(
              'p',
              null,
              h('strong', null, 'Manufacturer: '),
              selectedStatus.manufacturerId || 'Unknown'
            ),
            h(
              'p',
              null,
              h('strong', null, 'Model: '),
              selectedStatus.modelNameId || 'Unknown'
            )
          ),

          h(
            'div',
            null,
            h(
              'h4',
              { style: { marginTop: '0', color: '#666' } },
              'Timing Information'
            ),
            h(
              'p',
              null,
              h('strong', null, 'Uptime: '),
              formatDuration(selectedStatus.uptime)
            ),
            h(
              'p',
              null,
              h('strong', null, 'Downtime: '),
              formatDuration(selectedStatus.downtime)
            ),
            h(
              'p',
              null,
              h('strong', null, 'Created: '),
              new Date(selectedStatus.createdAt).toLocaleString()
            ),
            h(
              'p',
              null,
              h('strong', null, 'Updated: '),
              new Date(selectedStatus.updatedAt).toLocaleString()
            )
          ),

          h(
            'div',
            null,
            h(
              'h4',
              { style: { marginTop: '0', color: '#666' } },
              'Template Information'
            ),
            h(
              'p',
              null,
              h('strong', null, 'Polling Template: '),
              templateMap[selectedStatus.snmpPollingTemplateId]?.name ||
                'Unknown'
            ),
            h(
              'p',
              null,
              h('strong', null, 'SNMP Template: '),
              selectedStatus.snmpTemplateId
                ? snmpTemplateMap[selectedStatus.snmpTemplateId]
                    ?.templateName || 'Unknown'
                : 'None'
            ),
            h(
              'p',
              null,
              h('strong', null, 'SNMP Version: '),
              selectedStatus.snmpTemplateId
                ? snmpTemplateMap[selectedStatus.snmpTemplateId]?.version ||
                    'Unknown'
                : 'Unknown'
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
  root.render(h(StrictMode, null, h(DevicePolling)))
} else {
  console.error('Root element not found!')
}
