/**
 * Network Inventory for the Network-Proxy application
 */

// Using React CDN imports - these will be loaded from the HTML file
const { createElement: h, StrictMode, useState, useEffect } = React
const { createRoot } = ReactDOM

/**
 * Hook to fetch network inventory data from WebSocket API
 */
function useNetworkInventoryData(companyId = 'default-company-id') {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [networkInventories, setNetworkInventories] = useState([])
  const [products, setProducts] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [selectedInventory, setSelectedInventory] = useState(null)

  // Function to refresh data
  const refreshData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Mock network inventories data
      const mockInventories = [
        {
          id: 'inv-001',
          companyId: companyId,
          productId: 'prod-001',
          stockId: 'stock-001',
          macAddress: '00:1A:2B:3C:4D:5E',
          ipAddress: '192.168.1.10',
          subnetMask: '255.255.255.0',
          gateway: '192.168.1.1',
          createdAt: Date.now() - 86400000,
          updatedAt: Date.now(),
        },
        {
          id: 'inv-002',
          companyId: companyId,
          productId: 'prod-002',
          stockId: 'stock-002',
          macAddress: '00:2B:3C:4D:5E:6F',
          ipAddress: '192.168.1.11',
          subnetMask: '255.255.255.0',
          gateway: '192.168.1.1',
          createdAt: Date.now() - 172800000,
          updatedAt: Date.now(),
        },
        {
          id: 'inv-003',
          companyId: companyId,
          productId: 'prod-003',
          stockId: 'stock-003',
          macAddress: '00:3C:4D:5E:6F:70',
          ipAddress: '192.168.1.12',
          subnetMask: '255.255.255.0',
          gateway: '192.168.1.1',
          createdAt: Date.now() - 259200000,
          updatedAt: Date.now(),
        },
        {
          id: 'inv-004',
          companyId: companyId,
          productId: 'prod-001',
          stockId: 'stock-004',
          macAddress: '00:4D:5E:6F:70:81',
          ipAddress: '192.168.1.13',
          subnetMask: '255.255.255.0',
          gateway: '192.168.1.1',
          createdAt: Date.now() - 345600000,
          updatedAt: Date.now(),
        },
        {
          id: 'inv-005',
          companyId: companyId,
          productId: 'prod-004',
          stockId: 'stock-005',
          macAddress: '00:5E:6F:70:81:92',
          ipAddress: '192.168.1.14',
          subnetMask: '255.255.255.0',
          gateway: '192.168.1.1',
          createdAt: Date.now() - 432000000,
          updatedAt: Date.now(),
        },
      ]

      // Mock products data
      const mockProducts = [
        {
          id: 'prod-001',
          companyId: companyId,
          name: 'Cisco Catalyst 2960 Switch',
          description: '24-port Gigabit Ethernet switch',
          category: 'Network Switch',
          price: 899.99,
          createdAt: Date.now() - 86400000,
        },
        {
          id: 'prod-002',
          companyId: companyId,
          name: 'HP ProCurve 2510 Switch',
          description: '48-port Fast Ethernet switch',
          category: 'Network Switch',
          price: 599.99,
          createdAt: Date.now() - 172800000,
        },
        {
          id: 'prod-003',
          companyId: companyId,
          name: 'Ubiquiti UniFi Switch',
          description: '16-port PoE+ Gigabit switch',
          category: 'Network Switch',
          price: 379.99,
          createdAt: Date.now() - 259200000,
        },
        {
          id: 'prod-004',
          companyId: companyId,
          name: 'Netgear ProSafe Router',
          description: 'Business-grade wireless router',
          category: 'Router',
          price: 249.99,
          createdAt: Date.now() - 345600000,
        },
      ]

      // Mock stock items data
      const mockStockItems = [
        {
          id: 'stock-001',
          companyId: companyId,
          productId: 'prod-001',
          serialNumber: 'CS2960-001-ABC123',
          skuNumber: 'WS-C2960-24TT-L',
          status: 'deployed',
          location: 'Server Room A',
          createdAt: Date.now() - 86400000,
        },
        {
          id: 'stock-002',
          companyId: companyId,
          productId: 'prod-002',
          serialNumber: 'HP2510-002-DEF456',
          skuNumber: 'J9019B',
          status: 'deployed',
          location: 'Server Room B',
          createdAt: Date.now() - 172800000,
        },
        {
          id: 'stock-003',
          companyId: companyId,
          productId: 'prod-003',
          serialNumber: 'UB-US-16-GHI789',
          skuNumber: 'US-16-150W',
          status: 'deployed',
          location: 'Office Floor 2',
          createdAt: Date.now() - 259200000,
        },
        {
          id: 'stock-004',
          companyId: companyId,
          productId: 'prod-001',
          serialNumber: 'CS2960-004-JKL012',
          skuNumber: 'WS-C2960-24TT-L',
          status: 'deployed',
          location: 'Server Room C',
          createdAt: Date.now() - 345600000,
        },
        {
          id: 'stock-005',
          companyId: companyId,
          productId: 'prod-004',
          serialNumber: 'NG-PSR-005-MNO345',
          skuNumber: 'FVS318N',
          status: 'deployed',
          location: 'Office Floor 1',
          createdAt: Date.now() - 432000000,
        },
      ]

      setNetworkInventories(mockInventories)
      setProducts(mockProducts)
      setStockItems(mockStockItems)
    } catch (err) {
      console.error('Error fetching network inventory data:', err)
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
  const handleSelectInventory = inventory => {
    setSelectedInventory(inventory)
  }

  return {
    loading,
    error,
    networkInventories,
    products,
    stockItems,
    selectedInventory,
    handleSelectInventory,
    refreshData,
  }
}

/**
 * Simple Add Network Inventory Dialog Component
 */
function AddNetworkInventoryDialog({ open, onClose }) {
  if (!open) return null

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
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      },
      onClick: onClose,
    },
    h(
      'div',
      {
        style: {
          backgroundColor: 'white',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          maxWidth: '500px',
          width: '90%',
        },
        onClick: e => e.stopPropagation(),
      },
      h(
        'h2',
        { style: { marginTop: '0', marginBottom: '16px' } },
        'Add Network Inventory'
      ),
      h(
        'p',
        { style: { marginBottom: '24px', color: '#666' } },
        'This would be the form to add new network inventory. For the purposes of this example, this is a placeholder.'
      ),
      h(
        'div',
        { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
        h(
          'button',
          {
            onClick: onClose,
            style: {
              padding: '8px 16px',
              backgroundColor: '#666',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            },
          },
          'Cancel'
        ),
        h(
          'button',
          {
            onClick: onClose,
            style: {
              padding: '8px 16px',
              backgroundColor: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            },
          },
          'Add Inventory'
        )
      )
    )
  )
}

/**
 * Simple Manage Network Inventory Dialog Component
 */
function ManageNetworkInventoryDialog({ open, onClose, inventoryId }) {
  if (!open) return null

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
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      },
      onClick: onClose,
    },
    h(
      'div',
      {
        style: {
          backgroundColor: 'white',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          maxWidth: '500px',
          width: '90%',
        },
        onClick: e => e.stopPropagation(),
      },
      h(
        'h2',
        { style: { marginTop: '0', marginBottom: '16px' } },
        'Manage Network Inventory'
      ),
      h(
        'p',
        { style: { marginBottom: '24px', color: '#666' } },
        `This would be the form to manage network inventory with ID: ${inventoryId}. For the purposes of this example, this is a placeholder.`
      ),
      h(
        'div',
        { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
        h(
          'button',
          {
            onClick: onClose,
            style: {
              padding: '8px 16px',
              backgroundColor: '#666',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            },
          },
          'Cancel'
        ),
        h(
          'button',
          {
            onClick: onClose,
            style: {
              padding: '8px 16px',
              backgroundColor: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            },
          },
          'Save Changes'
        )
      )
    )
  )
}

/**
 * Main Network Inventory component
 */
const Inventory = () => {
  const [addOpen, setAddOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)

  // Use our custom hook to fetch data
  const {
    loading,
    error,
    networkInventories,
    products,
    stockItems,
    selectedInventory,
    handleSelectInventory,
    refreshData,
  } = useNetworkInventoryData()

  // Create lookup maps for efficient access
  const productMap = products.reduce((map, product) => {
    map[product.id] = product
    return map
  }, {})

  const stockMap = stockItems.reduce((map, stock) => {
    map[stock.id] = stock
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
        h('p', { style: { margin: '0' } }, 'Loading network inventory...')
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
      h('span', { style: { color: '#333' } }, 'Network Inventory')
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
          'IPAM - Network Inventory'
        ),
        h(
          'p',
          { style: { marginBottom: '0', color: '#666' } },
          'Manage network inventory with inventory item, SKU, serial number, and MAC address'
        )
      ),

      h(
        'div',
        { style: { display: 'flex', gap: '8px' } },
        h(
          'button',
          {
            onClick: () => setAddOpen(true),
            style: {
              padding: '8px 16px',
              backgroundColor: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            },
          },
          '➕ Add'
        ),

        h(
          'button',
          {
            onClick: () => setManageOpen(true),
            disabled: !selectedInventory,
            style: {
              padding: '8px 16px',
              backgroundColor: !selectedInventory ? '#ccc' : '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: !selectedInventory ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            },
          },
          '✏️ Manage'
        ),

        h(
          'button',
          {
            onClick: refreshData,
            style: {
              padding: '8px 16px',
              backgroundColor: '#666',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            },
          },
          '🔄'
        )
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
              minWidth: '700px',
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
                'Product Name'
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
                'MAC Address'
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
                'Serial Number'
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
                'SKU Number'
              )
            )
          ),
          h(
            'tbody',
            null,
            networkInventories.length === 0
              ? h(
                  'tr',
                  null,
                  h(
                    'td',
                    {
                      colSpan: 5,
                      style: {
                        padding: '24px',
                        textAlign: 'center',
                        color: '#666',
                        fontStyle: 'italic',
                      },
                    },
                    'No network inventory data available'
                  )
                )
              : networkInventories.map(inventory => {
                  const product = productMap[inventory.productId]
                  const stock = stockMap[inventory.stockId]

                  return h(
                    'tr',
                    {
                      key: inventory.id,
                      onClick: () => handleSelectInventory(inventory),
                      style: {
                        cursor: 'pointer',
                        backgroundColor:
                          selectedInventory?.id === inventory.id
                            ? '#e3f2fd'
                            : 'transparent',
                        borderBottom: '1px solid #eee',
                      },
                      onMouseOver: e => {
                        if (selectedInventory?.id !== inventory.id) {
                          e.target.closest('tr').style.backgroundColor =
                            '#f5f5f5'
                        }
                      },
                      onMouseOut: e => {
                        if (selectedInventory?.id !== inventory.id) {
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
                      inventory.id.substring(0, 8) + '...'
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      product?.name || 'Unknown'
                    ),
                    h(
                      'td',
                      { style: { padding: '12px', fontFamily: 'monospace' } },
                      inventory.macAddress
                    ),
                    h(
                      'td',
                      { style: { padding: '12px', fontFamily: 'monospace' } },
                      stock?.serialNumber || 'N/A'
                    ),
                    h(
                      'td',
                      { style: { padding: '12px', fontFamily: 'monospace' } },
                      stock?.skuNumber || 'N/A'
                    )
                  )
                })
          )
        )
      )
    ),

    // Selected inventory details
    selectedInventory &&
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
          h(
            'h3',
            { style: { margin: '0', color: '#333' } },
            'Inventory Details'
          ),
          h(
            'button',
            {
              onClick: () => handleSelectInventory(null),
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
            h('p', null, h('strong', null, 'ID: '), selectedInventory.id),
            h(
              'p',
              null,
              h('strong', null, 'Product: '),
              productMap[selectedInventory.productId]?.name || 'Unknown'
            ),
            h(
              'p',
              null,
              h('strong', null, 'Category: '),
              productMap[selectedInventory.productId]?.category || 'Unknown'
            ),
            h(
              'p',
              null,
              h('strong', null, 'MAC Address: '),
              selectedInventory.macAddress
            )
          ),

          h(
            'div',
            null,
            h(
              'h4',
              { style: { marginTop: '0', color: '#666' } },
              'Network Configuration'
            ),
            h(
              'p',
              null,
              h('strong', null, 'IP Address: '),
              selectedInventory.ipAddress || 'Not assigned'
            ),
            h(
              'p',
              null,
              h('strong', null, 'Subnet Mask: '),
              selectedInventory.subnetMask || 'Not configured'
            ),
            h(
              'p',
              null,
              h('strong', null, 'Gateway: '),
              selectedInventory.gateway || 'Not configured'
            )
          ),

          h(
            'div',
            null,
            h(
              'h4',
              { style: { marginTop: '0', color: '#666' } },
              'Stock Information'
            ),
            h(
              'p',
              null,
              h('strong', null, 'Serial Number: '),
              stockMap[selectedInventory.stockId]?.serialNumber || 'N/A'
            ),
            h(
              'p',
              null,
              h('strong', null, 'SKU Number: '),
              stockMap[selectedInventory.stockId]?.skuNumber || 'N/A'
            ),
            h(
              'p',
              null,
              h('strong', null, 'Status: '),
              stockMap[selectedInventory.stockId]?.status || 'Unknown'
            ),
            h(
              'p',
              null,
              h('strong', null, 'Location: '),
              stockMap[selectedInventory.stockId]?.location || 'Unknown'
            )
          )
        )
      ),

    // Dialogs
    h(AddNetworkInventoryDialog, {
      open: addOpen,
      onClose: () => setAddOpen(false),
    }),

    selectedInventory &&
      h(ManageNetworkInventoryDialog, {
        open: manageOpen,
        onClose: () => setManageOpen(false),
        inventoryId: selectedInventory.id,
      }),

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
  root.render(h(StrictMode, null, h(Inventory)))
} else {
  console.error('Root element not found!')
}
