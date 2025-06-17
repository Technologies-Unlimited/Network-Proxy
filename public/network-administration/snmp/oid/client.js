/**
 * SNMP OID Management for the Network-Proxy application
 * Handles OID (Object Identifiers) for SNMP monitoring
 */

// Using React CDN imports - these will be loaded from the HTML file
const { createElement: h, StrictMode, useState, useEffect, Fragment, useRef } = React
const { createRoot } = ReactDOM

/**
 * Hook to manage MIB Browser functionality
 */
function useMIBBrowser() {
  const [showBrowser, setShowBrowser] = useState(false)
  const [mibData, setMibData] = useState([])
  const [mibLoading, setMibLoading] = useState(false)
  const [mibError, setMibError] = useState(null)
  const [selectedOid, setSelectedOid] = useState(null)
  const [deviceTarget, setDeviceTarget] = useState('')
  const [community, setCommunity] = useState('public')
  const [snmpVersion, setSnmpVersion] = useState('2c')
  const [browsePath, setBrowsePath] = useState('') 
  const [mibTree, setMibTree] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [templates, setTemplates] = useState([])
  const [inventory, setInventory] = useState([])
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [browseMethod, setBrowseMethod] = useState('direct') // 'direct' or 'template'
  const [autoDiscover, setAutoDiscover] = useState(true)
  
  // SNMPv3 credentials
  const [v3Username, setV3Username] = useState('')
  const [v3AuthProtocol, setV3AuthProtocol] = useState('MD5')
  const [v3AuthKey, setV3AuthKey] = useState('')
  const [v3PrivProtocol, setV3PrivProtocol] = useState('DES')
  const [v3PrivKey, setV3PrivKey] = useState('')
  const [v3SecurityLevel, setV3SecurityLevel] = useState('noAuthNoPriv')

  // Common MIB groups for quick browsing
  const commonMibs = [
    { name: 'System', oid: '1.3.6.1.2.1.1', description: 'System information' },
    { name: 'Interfaces', oid: '1.3.6.1.2.1.2', description: 'Network interfaces' },
    { name: 'IP', oid: '1.3.6.1.2.1.4', description: 'IP configuration' },
    { name: 'TCP', oid: '1.3.6.1.2.1.6', description: 'TCP connections' },
    { name: 'UDP', oid: '1.3.6.1.2.1.7', description: 'UDP statistics' },
    { name: 'SNMP', oid: '1.3.6.1.2.1.11', description: 'SNMP agent statistics' },
    { name: 'Host Resources', oid: '1.3.6.1.2.1.25', description: 'System resources' },
    { name: 'IF-MIB', oid: '1.3.6.1.2.1.31', description: 'Extended interface info' }
  ]

  // Fetch templates - simulated for now
  useEffect(() => {
    // Mock SNMP templates
    const mockTemplates = [
      { id: 'template-1', name: 'Cisco Router Template', version: '2c', community: 'public' },
      { id: 'template-2', name: 'HP Switch Template', version: '2c', community: 'public' },
      { id: 'template-3', name: 'Linux Server Template', version: '2c', community: 'public' },
      { id: 'template-4', name: 'Windows Server Template', version: '2c', community: 'public' },
      { 
        id: 'template-5', 
        name: 'Cisco SNMPv3 Template', 
        version: '3',
        v3Username: 'admin',
        v3SecurityLevel: 'authPriv',
        v3AuthProtocol: 'SHA',
        v3AuthKey: 'authPassword123',
        v3PrivProtocol: 'AES',
        v3PrivKey: 'privPassword123'
      }
    ]
    setTemplates(mockTemplates)

    // Mock inventory devices
    const mockInventory = [
      { id: 'device-1', name: 'Router-1', ipAddress: '192.168.1.1', templateId: 'template-1' },
      { id: 'device-2', name: 'Switch-1', ipAddress: '192.168.1.2', templateId: 'template-2' },
      { id: 'device-3', name: 'Linux-Server', ipAddress: '192.168.1.3', templateId: 'template-3' },
      { id: 'device-4', name: 'Windows-Server', ipAddress: '192.168.1.4', templateId: 'template-4' },
      { id: 'device-5', name: 'Secure-Router', ipAddress: '192.168.1.5', templateId: 'template-5' },
    ]
    setInventory(mockInventory)

    // Initial MIB tree for browsing navigation
    const initialMibTree = [
      {
        id: 'iso',
        name: 'ISO',
        oid: '1',
        children: [
          {
            id: 'org',
            name: 'ORG',
            oid: '1.3',
            children: [
              {
                id: 'dod',
                name: 'DOD',
                oid: '1.3.6',
                children: [
                  {
                    id: 'internet',
                    name: 'Internet',
                    oid: '1.3.6.1',
                    children: [
                      {
                        id: 'mgmt',
                        name: 'Management',
                        oid: '1.3.6.1.2',
                        children: [
                          {
                            id: 'mib-2',
                            name: 'MIB-2',
                            oid: '1.3.6.1.2.1',
                            children: commonMibs.map(mib => ({
                              id: mib.name.toLowerCase().replace(/\s+/g, '-'),
                              name: mib.name,
                              oid: mib.oid,
                              description: mib.description,
                              children: []
                            }))
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
    setMibTree(initialMibTree)
  }, [])

  // Toggle MIB browser visibility
  const toggleBrowser = () => {
    setShowBrowser(prev => !prev)
    // Reset error when opening/closing browser
    setMibError(null)
  }

  // Check if server is running
  const checkServerStatus = async () => {
    try {
      const response = await fetch('/health', { method: 'GET' })
      return response.ok
    } catch (error) {
      console.error('Server check failed:', error)
      return false
    }
  }

  // Browse MIB
  const browseMIB = async (oidPath = '1.3.6.1.2.1.1') => {
    setMibLoading(true)
    setMibError(null)
    setBrowsePath(oidPath)

    try {
      // Check if server is running
      const isServerRunning = await checkServerStatus()
      if (!isServerRunning) {
        throw new Error('Server is not running. Please start the server with "bun --hot app.ts" command.')
      }
      
      // Prepare request data
      const requestData = {
        companyId: 'default-company-id', // Replace with actual company ID
        oidPath: oidPath
      }

      // For direct browsing
      if (browseMethod === 'direct') {
        if (!deviceTarget) {
          throw new Error('Device IP address is required')
        }
        
        requestData.host = deviceTarget
        requestData.snmpVersion = snmpVersion
        
        if (snmpVersion === '1' || snmpVersion === '2c') {
          requestData.community = community
        } else if (snmpVersion === '3') {
          // Check if we need SNMPv3 credentials
          requestData.username = v3Username
          requestData.securityLevel = v3SecurityLevel
          
          if (v3SecurityLevel !== 'noAuthNoPriv' && !v3Username) {
            throw new Error('SNMPv3 username is required')
          }
          
          if (v3SecurityLevel === 'authNoPriv' || v3SecurityLevel === 'authPriv') {
            if (!v3AuthKey) {
              throw new Error('Authentication key is required for this security level')
            }
            requestData.authProtocol = v3AuthProtocol
            requestData.authKey = v3AuthKey
          }
          
          if (v3SecurityLevel === 'authPriv') {
            if (!v3PrivKey) {
              throw new Error('Privacy key is required for this security level')
            }
            requestData.privProtocol = v3PrivProtocol
            requestData.privKey = v3PrivKey
          }
        }
      } 
      // For template-based browsing
      else if (browseMethod === 'template') {
        if (!selectedDevice) {
          throw new Error('Please select a device from inventory')
        }
        
        const device = inventory.find(dev => dev.id === selectedDevice.id)
        if (!device) {
          throw new Error('Selected device not found')
        }
        
        requestData.host = device.ipAddress
        requestData.templateId = device.templateId
        
        const template = templates.find(t => t.id === device.templateId)
        if (template) {
          requestData.snmpVersion = template.version
          
          if (template.version === '1' || template.version === '2c') {
            requestData.community = template.community
          } else if (template.version === '3') {
            requestData.username = template.v3Username
            requestData.securityLevel = template.v3SecurityLevel
            
            if (template.v3SecurityLevel === 'authNoPriv' || template.v3SecurityLevel === 'authPriv') {
              requestData.authProtocol = template.v3AuthProtocol
              requestData.authKey = template.v3AuthKey
            }
            
            if (template.v3SecurityLevel === 'authPriv') {
              requestData.privProtocol = template.v3PrivProtocol
              requestData.privKey = template.v3PrivKey
            }
          }
        }
      }

      console.log('Sending MIB browser request:', requestData)

      // Call the real API endpoint
      const response = await fetch('/api/network-administration/snmp/mib', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error browsing MIB')
      }

      const responseData = await response.json()
      setMibData(responseData)
    } catch (err) {
      console.error('Error browsing MIB:', err)
      setMibError(err instanceof Error ? err.message : 'Unknown error occurred')
      setMibData([])
    } finally {
      setMibLoading(false)
    }
  }

  // Browse default root MIB
  const browseRootMIB = () => {
    browseMIB('1.3.6.1.2.1')
  }

  // Select OID from MIB browser
  const selectOIDFromMIB = (oid) => {
    setSelectedOid(oid)
  }

  // Browse OID parent (go up one level)
  const browseParent = () => {
    const parts = browsePath.split('.')
    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join('.')
      browseMIB(parentPath)
    }
  }

  // Set selected device and get its template info
  const handleDeviceSelect = (deviceId) => {
    const device = inventory.find(dev => dev.id === deviceId)
    setSelectedDevice(device)
    
    if (device) {
      const template = templates.find(t => t.id === device.templateId)
      if (template) {
        setSelectedTemplate(template.id)
        setDeviceTarget(device.ipAddress)
        
        if (template.version === '3') {
          setSnmpVersion('3')
          setV3Username(template.v3Username || '')
          setV3SecurityLevel(template.v3SecurityLevel || 'noAuthNoPriv')
          setV3AuthProtocol(template.v3AuthProtocol || 'MD5')
          setV3AuthKey(template.v3AuthKey || '')
          setV3PrivProtocol(template.v3PrivProtocol || 'DES')
          setV3PrivKey(template.v3PrivKey || '')
        } else {
          setSnmpVersion(template.version)
          setCommunity(template.community)
        }
      }
    }
  }

  return {
    showBrowser,
    toggleBrowser,
    mibData,
    mibLoading,
    mibError,
    selectedOid,
    deviceTarget,
    setDeviceTarget,
    community,
    setCommunity,
    snmpVersion,
    setSnmpVersion,
    browseMIB,
    browseRootMIB,
    browseParent,
    selectOIDFromMIB,
    browsePath,
    setBrowsePath,
    mibTree,
    templates,
    inventory,
    selectedTemplate,
    setSelectedTemplate,
    selectedDevice,
    handleDeviceSelect,
    browseMethod,
    setBrowseMethod,
    commonMibs,
    autoDiscover,
    setAutoDiscover,
    // SNMPv3 properties
    v3Username,
    setV3Username,
    v3AuthProtocol,
    setV3AuthProtocol,
    v3AuthKey,
    setV3AuthKey,
    v3PrivProtocol,
    setV3PrivProtocol,
    v3PrivKey,
    setV3PrivKey,
    v3SecurityLevel,
    setV3SecurityLevel
  }
}

/**
 * Hook to fetch and manage SNMP OID data
 */
function useSNMPOIDData(companyId = 'default-company-id') {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [oids, setOids] = useState([])
  const [selectedOID, setSelectedOID] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    oid: '',
    dataType: 'String',
    description: '',
    category: 'System',
    units: '',
  })

  // Function to refresh data
  const refreshData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Mock OID data
      const mockOids = [
        {
          id: 'oid-1',
          companyId: companyId,
          name: 'System Description',
          oid: '1.3.6.1.2.1.1.1.0',
          dataType: 'String',
          description: 'A textual description of the device including manufacturer name and operating system.',
          category: 'System',
          units: '',
          createdAt: Date.now() - 86400000,
          updatedAt: Date.now(),
        },
        {
          id: 'oid-2',
          companyId: companyId,
          name: 'System Uptime',
          oid: '1.3.6.1.2.1.1.3.0',
          dataType: 'TimeTicks',
          description: 'The time (in hundredths of a second) since the network management portion of the system was last re-initialized.',
          category: 'System',
          units: 'Ticks',
          createdAt: Date.now() - 172800000,
          updatedAt: Date.now(),
        },
        {
          id: 'oid-3',
          companyId: companyId,
          name: 'Interface Speed',
          oid: '1.3.6.1.2.1.2.2.1.5',
          dataType: 'Gauge32',
          description: 'An estimate of the interface\'s current bandwidth in bits per second.',
          category: 'Interface',
          units: 'bps',
          createdAt: Date.now() - 259200000,
          updatedAt: Date.now(),
        },
        {
          id: 'oid-4',
          companyId: companyId,
          name: 'CPU Load',
          oid: '1.3.6.1.4.1.9.2.1.58.0',
          dataType: 'Integer',
          description: 'The CPU busy percentage in the last 5 second period.',
          category: 'Performance',
          units: '%',
          createdAt: Date.now() - 345600000,
          updatedAt: Date.now(),
        },
        {
          id: 'oid-5',
          companyId: companyId,
          name: 'Memory Used',
          oid: '1.3.6.1.4.1.9.9.48.1.1.1.5.1',
          dataType: 'Gauge32',
          description: 'The overall memory usage (used memory).',
          category: 'Performance',
          units: 'Bytes',
          createdAt: Date.now() - 432000000,
          updatedAt: Date.now(),
        },
      ]

      setOids(mockOids)
    } catch (err) {
      console.error('Error fetching SNMP OID data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Fetch data on component mount
  useEffect(() => {
    refreshData()
  }, [companyId])

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  // Update form data with an OID from MIB browser
  const updateFormWithMIBData = (mibData) => {
    if (!mibData) return
    
    // Get data type from MIB browser type code
    const getDataType = (typeCode) => {
      const typeMap = {
        2: 'Integer',
        4: 'String',
        6: 'OID',
        64: 'IpAddress',
        65: 'Counter32',
        66: 'Gauge32',
        67: 'TimeTicks',
        70: 'Counter64'
      }
      return typeMap[typeCode] || 'String'
    }
    
    // Determine category based on OID prefix
    const getCategory = (oid) => {
      if (oid.startsWith('1.3.6.1.2.1.1')) return 'System'
      if (oid.startsWith('1.3.6.1.2.1.2')) return 'Interface'
      if (oid.startsWith('1.3.6.1.2.1.25')) return 'Host Resources'
      if (oid.startsWith('1.3.6.1.4.1.9.9.48')) return 'Performance'
      return 'Other'
    }
    
    // Check if this OID already exists in our database
    const existingOid = mibData.existsInDatabase
    
    // If it exists, show a notification
    if (existingOid) {
      console.log(`OID ${mibData.oid} already exists as "${mibData.existingName || 'Unknown'}"`)
      // In a real application, you might show a toast or other UI notification
    }
    
    // Create a descriptive name if none provided
    let suggestedName = mibData.name
    if (!suggestedName) {
      // Try to create a name from the OID parts
      const oidParts = mibData.oid.split('.')
      const lastPart = oidParts[oidParts.length - 1]
      suggestedName = `${getCategory(mibData.oid)}-${lastPart}`
    }
    
    setFormData(prev => ({
      ...prev,
      name: mibData.existingName || suggestedName || prev.name,
      oid: mibData.oid || prev.oid,
      dataType: getDataType(mibData.type) || prev.dataType,
      description: mibData.existingDescription || mibData.description || prev.description,
      category: getCategory(mibData.oid) || prev.category,
      // Include value from discovery if available
      units: mibData.units || prev.units
    }))
  }

  // Handle form submission for creating/updating OIDs
  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      if (editMode && selectedOID) {
        // Update existing OID
        setOids(prev => 
          prev.map(oid => 
            oid.id === selectedOID.id 
              ? { 
                  ...oid, 
                  name: formData.name,
                  oid: formData.oid,
                  dataType: formData.dataType,
                  description: formData.description,
                  category: formData.category,
                  units: formData.units,
                  updatedAt: Date.now() 
                } 
              : oid
          )
        )
      } else {
        // Create new OID
        const newId = `oid-${Date.now()}`
        const newOid = {
          id: newId,
          companyId,
          name: formData.name,
          oid: formData.oid,
          dataType: formData.dataType,
          description: formData.description,
          category: formData.category,
          units: formData.units,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        setOids(prev => [...prev, newOid])
      }

      // Reset form
      resetForm()
    } catch (err) {
      console.error('Error saving SNMP OID:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setLoading(false)
      setEditMode(false)
      setSelectedOID(null)
    }
  }

  // Handle row selection
  const handleSelectOID = oid => {
    setSelectedOID(oid)
    setEditMode(true)
    
    setFormData({
      name: oid.name,
      oid: oid.oid,
      dataType: oid.dataType,
      description: oid.description,
      category: oid.category,
      units: oid.units,
    })
  }

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      oid: '',
      dataType: 'String',
      description: '',
      category: 'System',
      units: '',
    })
    setEditMode(false)
    setSelectedOID(null)
  }

  // Handle delete OID
  const handleDeleteOID = (oidId) => {
    setOids(prev => prev.filter(oid => oid.id !== oidId))
    
    if (selectedOID && selectedOID.id === oidId) {
      resetForm()
    }
  }

  // Filter OIDs based on search term
  const filteredOIDs = oids.filter(oid => 
    oid.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    oid.oid.includes(searchTerm) ||
    oid.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    oid.category.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return {
    loading,
    error,
    oids: filteredOIDs,
    selectedOID,
    editMode,
    searchTerm,
    setSearchTerm,
    formData,
    handleInputChange,
    handleSubmit,
    handleSelectOID,
    handleDeleteOID,
    resetForm,
    refreshData,
    updateFormWithMIBData,
  }
}

/**
 * Main SNMP OID Management component
 */
const SNMPOID = () => {
  // Server status state
  const [serverStatus, setServerStatus] = useState('unknown') // 'unknown', 'running', 'stopped'
  const [checkingServer, setCheckingServer] = useState(false)

  // Check server status on mount
  useEffect(() => {
    const checkServer = async () => {
      setCheckingServer(true)
      try {
        const response = await fetch('/health', { method: 'GET' })
        setServerStatus(response.ok ? 'running' : 'stopped')
      } catch (error) {
        console.error('Server check failed:', error)
        setServerStatus('stopped')
      } finally {
        setCheckingServer(false)
      }
    }
    
    checkServer()
    // Check server status every 30 seconds
    const interval = setInterval(checkServer, 30000)
    return () => clearInterval(interval)
  }, [])

  // Use our custom hooks to fetch and manage data
  const {
    loading,
    error,
    oids,
    selectedOID,
    editMode,
    searchTerm,
    setSearchTerm,
    formData,
    handleInputChange,
    handleSubmit,
    handleSelectOID,
    handleDeleteOID,
    resetForm,
    refreshData,
    updateFormWithMIBData,
  } = useSNMPOIDData()

  // Use MIB Browser hook
  const {
    showBrowser,
    toggleBrowser,
    mibData,
    mibLoading,
    mibError,
    selectedOid,
    deviceTarget,
    setDeviceTarget,
    community,
    setCommunity,
    snmpVersion,
    setSnmpVersion,
    browseMIB,
    browseRootMIB,
    browseParent,
    selectOIDFromMIB,
    browsePath,
    setBrowsePath,
    mibTree,
    templates,
    inventory,
    selectedTemplate,
    setSelectedTemplate,
    selectedDevice,
    handleDeviceSelect,
    browseMethod,
    setBrowseMethod,
    commonMibs,
    autoDiscover,
    setAutoDiscover,
    // SNMPv3 properties
    v3Username,
    setV3Username,
    v3AuthProtocol,
    setV3AuthProtocol,
    v3AuthKey,
    setV3AuthKey,
    v3PrivProtocol,
    setV3PrivProtocol,
    v3PrivKey,
    setV3PrivKey,
    v3SecurityLevel,
    setV3SecurityLevel
  } = useMIBBrowser()

  // Import OID from MIB Browser to form
  const importSelectedOid = () => {
    if (selectedOid) {
      updateFormWithMIBData(selectedOid)
      toggleBrowser()
    }
  }

  // Render loading state
  if (loading && !oids.length) {
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
        h('p', { style: { margin: '0' } }, 'Loading SNMP OIDs...')
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
      'div',
      { 
        style: { 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '8px'
        } 
      },
      h(
        'h1',
        { style: { margin: '0', color: '#333' } },
        'SNMP OID Management'
      ),
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          h('span', { style: { fontWeight: 'bold' } }, 'Server Status:'),
          h(
            'span',
            {
              style: {
                display: 'inline-block',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: 'bold',
                backgroundColor: 
                  serverStatus === 'running' ? '#4caf50' : 
                  serverStatus === 'stopped' ? '#f44336' : '#ff9800',
                color: 'white',
              },
            },
            checkingServer ? 'Checking...' : 
            serverStatus === 'running' ? 'Running' : 
            serverStatus === 'stopped' ? 'Stopped' : 'Unknown'
          )
        ),
        serverStatus !== 'running' && h(
          'button',
          {
            onClick: () => {
              alert('To start the server, run the following command in your terminal:\n\nbun --hot app.ts')
            },
            style: {
              padding: '6px 12px',
              backgroundColor: '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
            },
          },
          'Start Server Instructions'
        )
      )
    ),
    h(
      'p',
      { style: { marginBottom: '24px', color: '#666' } },
      'Manage SNMP Object Identifiers (OIDs) for monitoring network devices'
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
      ),
      h(
        'button',
        {
          onClick: toggleBrowser,
          style: {
            padding: '8px 16px',
            backgroundColor: '#ff9800',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          },
        },
        '🔍 MIB Browser'
      )
    ),

    // MIB Browser Modal (conditionally rendered)
    showBrowser && h(
      'div',
      {
        style: {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 100,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        },
      },
      h(
        'div',
        {
          style: {
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            width: '90%',
            maxWidth: '1000px',
            maxHeight: '90vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          },
        },
        // Modal Header
        h(
          'div',
          {
            style: {
              padding: '16px',
              borderBottom: '1px solid #eee',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            },
          },
          h('h2', { style: { margin: '0', fontSize: '20px' } }, 'MIB Browser'),
          h(
            'button',
            {
              onClick: toggleBrowser,
              style: {
                background: 'none',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '4px 8px',
              },
            },
            '×'
          )
        ),

        // Modal Body
        h(
          'div',
          {
            style: {
              padding: '16px',
              overflowY: 'auto',
              flexGrow: 1,
            },
          },
          // Connection Options with Tabs
          h(
            'div',
            { style: { marginBottom: '16px' } },
            h(
              'div',
              { 
                style: { 
                  display: 'flex', 
                  borderBottom: '1px solid #ddd',
                  marginBottom: '16px' 
                } 
              },
              h(
                'button',
                {
                  onClick: () => setBrowseMethod('direct'),
                  style: {
                    padding: '8px 16px',
                    backgroundColor: browseMethod === 'direct' ? '#e3f2fd' : 'transparent',
                    border: 'none',
                    borderBottom: browseMethod === 'direct' ? '2px solid #1976d2' : 'none',
                    cursor: 'pointer',
                    fontWeight: browseMethod === 'direct' ? 'bold' : 'normal',
                  },
                },
                'Direct Device Connection'
              ),
              h(
                'button',
                {
                  onClick: () => setBrowseMethod('template'),
                  style: {
                    padding: '8px 16px',
                    backgroundColor: browseMethod === 'template' ? '#e3f2fd' : 'transparent',
                    border: 'none',
                    borderBottom: browseMethod === 'template' ? '2px solid #1976d2' : 'none',
                    cursor: 'pointer',
                    fontWeight: browseMethod === 'template' ? 'bold' : 'normal',
                  },
                },
                'Use Device Template'
              )
            ),

            // Direct Connection Form - SNMP v1/v2c
            browseMethod === 'direct' && snmpVersion !== '3' && h(
              'div',
              { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' } },
              h(
                'div',
                null,
                h('label', { style: { display: 'block', marginBottom: '8px', fontWeight: 'bold' } }, 'Device IP'),
                h('input', {
                  type: 'text',
                  value: deviceTarget,
                  onChange: (e) => setDeviceTarget(e.target.value),
                  placeholder: 'e.g. 192.168.1.1',
                  style: {
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                  },
                })
              ),
              h(
                'div',
                null,
                h('label', { style: { display: 'block', marginBottom: '8px', fontWeight: 'bold' } }, 'Community'),
                h('input', {
                  type: 'text',
                  value: community,
                  onChange: (e) => setCommunity(e.target.value),
                  placeholder: 'public',
                  style: {
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                  },
                })
              ),
              h(
                'div',
                null,
                h('label', { style: { display: 'block', marginBottom: '8px', fontWeight: 'bold' } }, 'SNMP Version'),
                h(
                  'select',
                  {
                    value: snmpVersion,
                    onChange: (e) => setSnmpVersion(e.target.value),
                    style: {
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                    },
                  },
                  h('option', { value: '1' }, 'SNMPv1'),
                  h('option', { value: '2c' }, 'SNMPv2c'),
                  h('option', { value: '3' }, 'SNMPv3')
                )
              )
            ),
            
            // Direct Connection Form - SNMPv3
            browseMethod === 'direct' && snmpVersion === '3' && h(
              'div',
              null,
              // Top row - IP and Version
              h(
                'div',
                { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' } },
                h(
                  'div',
                  null,
                  h('label', { style: { display: 'block', marginBottom: '8px', fontWeight: 'bold' } }, 'Device IP'),
                  h('input', {
                    type: 'text',
                    value: deviceTarget,
                    onChange: (e) => setDeviceTarget(e.target.value),
                    placeholder: 'e.g. 192.168.1.1',
                    style: {
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                    },
                  })
                ),
                h(
                  'div',
                  null,
                  h('label', { style: { display: 'block', marginBottom: '8px', fontWeight: 'bold' } }, 'SNMP Version'),
                  h(
                    'select',
                    {
                      value: snmpVersion,
                      onChange: (e) => setSnmpVersion(e.target.value),
                      style: {
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                      },
                    },
                    h('option', { value: '1' }, 'SNMPv1'),
                    h('option', { value: '2c' }, 'SNMPv2c'),
                    h('option', { value: '3' }, 'SNMPv3')
                  )
                )
              ),
              
              // SNMPv3 credentials row 1
              h(
                'div',
                { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' } },
                h(
                  'div',
                  null,
                  h('label', { style: { display: 'block', marginBottom: '8px', fontWeight: 'bold' } }, 'Username *'),
                  h('input', {
                    type: 'text',
                    value: v3Username,
                    onChange: (e) => setV3Username(e.target.value),
                    placeholder: 'SNMP username',
                    style: {
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                    },
                  })
                ),
                h(
                  'div',
                  null,
                  h('label', { style: { display: 'block', marginBottom: '8px', fontWeight: 'bold' } }, 'Security Level'),
                  h(
                    'select',
                    {
                      value: v3SecurityLevel,
                      onChange: (e) => setV3SecurityLevel(e.target.value),
                      style: {
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                      },
                    },
                    h('option', { value: 'noAuthNoPriv' }, 'No Auth, No Privacy'),
                    h('option', { value: 'authNoPriv' }, 'Auth, No Privacy'),
                    h('option', { value: 'authPriv' }, 'Auth and Privacy')
                  )
                )
              ),
              
              // Auth and Priv fields (conditionally shown)
              (v3SecurityLevel === 'authNoPriv' || v3SecurityLevel === 'authPriv') && h(
                'div',
                { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' } },
                h(
                  'div',
                  null,
                  h('label', { style: { display: 'block', marginBottom: '8px', fontWeight: 'bold' } }, 'Auth Protocol'),
                  h(
                    'select',
                    {
                      value: v3AuthProtocol,
                      onChange: (e) => setV3AuthProtocol(e.target.value),
                      style: {
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                      },
                    },
                    h('option', { value: 'MD5' }, 'MD5'),
                    h('option', { value: 'SHA' }, 'SHA'),
                    h('option', { value: 'SHA224' }, 'SHA-224'),
                    h('option', { value: 'SHA256' }, 'SHA-256'),
                    h('option', { value: 'SHA384' }, 'SHA-384'),
                    h('option', { value: 'SHA512' }, 'SHA-512')
                  )
                ),
                h(
                  'div',
                  null,
                  h('label', { style: { display: 'block', marginBottom: '8px', fontWeight: 'bold' } }, 'Auth Key *'),
                  h('input', {
                    type: 'password',
                    value: v3AuthKey,
                    onChange: (e) => setV3AuthKey(e.target.value),
                    placeholder: 'Authentication password',
                    style: {
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                    },
                  })
                )
              ),
              
              // Privacy fields (conditionally shown)
              v3SecurityLevel === 'authPriv' && h(
                'div',
                { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' } },
                h(
                  'div',
                  null,
                  h('label', { style: { display: 'block', marginBottom: '8px', fontWeight: 'bold' } }, 'Privacy Protocol'),
                  h(
                    'select',
                    {
                      value: v3PrivProtocol,
                      onChange: (e) => setV3PrivProtocol(e.target.value),
                      style: {
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                      },
                    },
                    h('option', { value: 'DES' }, 'DES'),
                    h('option', { value: 'AES' }, 'AES'),
                    h('option', { value: 'AES256' }, 'AES-256')
                  )
                ),
                h(
                  'div',
                  null,
                  h('label', { style: { display: 'block', marginBottom: '8px', fontWeight: 'bold' } }, 'Privacy Key *'),
                  h('input', {
                    type: 'password',
                    value: v3PrivKey,
                    onChange: (e) => setV3PrivKey(e.target.value),
                    placeholder: 'Privacy password',
                    style: {
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                    },
                  })
                )
              )
            ),

            // Template-based Connection Form
            browseMethod === 'template' && h(
              'div',
              { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' } },
              h(
                'div',
                null,
                h('label', { style: { display: 'block', marginBottom: '8px', fontWeight: 'bold' } }, 'Select Device'),
                h(
                  'select',
                  {
                    value: selectedDevice?.id || '',
                    onChange: (e) => handleDeviceSelect(e.target.value),
                    style: {
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                    },
                  },
                  h('option', { value: '' }, 'Select a device...'),
                  inventory.map(device => h(
                    'option',
                    { key: device.id, value: device.id },
                    `${device.name} (${device.ipAddress})`
                  ))
                )
              ),
              selectedDevice && h(
                'div',
                { style: { border: '1px solid #ddd', borderRadius: '4px', padding: '8px' } },
                h('p', { style: { margin: '0 0 4px 0' } }, 
                  h('strong', null, 'Using Template: '), 
                  templates.find(t => t.id === selectedDevice.templateId)?.name
                ),
                h('p', { style: { margin: '0 0 4px 0' } }, 
                  h('strong', null, 'SNMP Version: '), 
                  snmpVersion
                ),
                snmpVersion !== '3' && h('p', { style: { margin: '0' } }, 
                  h('strong', null, 'Community: '), 
                  community
                ),
                snmpVersion === '3' && h('p', { style: { margin: '0' } }, 
                  h('strong', null, 'Username: '), 
                  v3Username
                )
              )
            ),
            
            // Auto-discovery option
            h(
              'div',
              { style: { marginTop: '16px', display: 'flex', alignItems: 'center' } },
              h('input', {
                type: 'checkbox',
                id: 'auto-discover',
                checked: autoDiscover,
                onChange: (e) => setAutoDiscover(e.target.checked),
                style: { marginRight: '8px' }
              }),
              h('label', { 
                htmlFor: 'auto-discover',
                style: { margin: '0', cursor: 'pointer' }
              }, 'Auto-discover MIB structure (recommended)')
            )
          ),

          // MIB Browser Controls
          h(
            'div',
            { style: { marginBottom: '16px' } },
            // Current path and navigation
            h(
              'div',
              { style: { 
                display: 'flex', 
                gap: '16px', 
                alignItems: 'center',
                marginBottom: '16px',
                padding: '8px 12px',
                backgroundColor: '#f5f5f5',
                borderRadius: '4px'
              } },
              h(
                'button',
                {
                  onClick: browseRootMIB,
                  disabled: mibLoading,
                  title: 'Go to MIB-II Root',
                  style: {
                    padding: '4px 8px',
                    backgroundColor: '#03a9f4',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: mibLoading ? 'not-allowed' : 'pointer',
                    opacity: mibLoading ? 0.7 : 1,
                  },
                },
                '🏠 Root'
              ),
              h(
                'button',
                {
                  onClick: browseParent,
                  disabled: mibLoading || !browsePath || browsePath.split('.').length <= 1,
                  title: 'Go Up One Level',
                  style: {
                    padding: '4px 8px',
                    backgroundColor: '#03a9f4',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: (mibLoading || !browsePath || browsePath.split('.').length <= 1) ? 'not-allowed' : 'pointer',
                    opacity: (mibLoading || !browsePath || browsePath.split('.').length <= 1) ? 0.7 : 1,
                  },
                },
                '⬆️ Up'
              ),
              h('span', { style: { fontWeight: 'bold', marginRight: '8px' } }, 'Current OID:'),
              h('span', { 
                style: { 
                  fontFamily: 'monospace',
                  flexGrow: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  border: '1px solid #ddd',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'white'
                } 
              }, browsePath || 'None')
            ),
            
            // Common MIBs for quick access
            h(
              'div',
              { style: { marginBottom: '16px' } },
              h('div', { style: { marginBottom: '8px', fontWeight: 'bold' } }, 'Common MIB Groups:'),
              h(
                'div',
                { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
                commonMibs.map(mib => h(
                  'button',
                  {
                    key: mib.oid,
                    onClick: () => browseMIB(mib.oid),
                    disabled: mibLoading,
                    title: mib.description,
                    style: {
                      padding: '4px 8px',
                      backgroundColor: '#4caf50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: mibLoading ? 'not-allowed' : 'pointer',
                      opacity: mibLoading ? 0.7 : 1,
                      fontSize: '13px',
                    },
                  },
                  mib.name
                ))
              )
            ),
            
            // Manual OID browsing
            h(
              'div',
              { style: { display: 'flex', gap: '16px', alignItems: 'flex-end' } },
              h(
                'div',
                { style: { flexGrow: 1 } },
                h('label', { style: { display: 'block', marginBottom: '8px', fontWeight: 'bold' } }, 'Enter OID Path Manually'),
                h('input', {
                  type: 'text',
                  value: browsePath,
                  onChange: (e) => setBrowsePath(e.target.value),
                  placeholder: 'e.g. 1.3.6.1.2.1.1',
                  style: {
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                  },
                })
              ),
              h(
                'div',
                null,
                h(
                  'button',
                  {
                    onClick: () => browseMIB(browsePath),
                    disabled: mibLoading || !browsePath,
                    style: {
                      padding: '8px 16px',
                      backgroundColor: '#1976d2',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: (mibLoading || !browsePath) ? 'not-allowed' : 'pointer',
                      opacity: (mibLoading || !browsePath) ? 0.7 : 1,
                    },
                  },
                  mibLoading ? 'Browsing...' : 'Browse OID'
                )
              )
            )
          ),

          // MIB Loading or Error State
          mibLoading && h(
            'div',
            {
              style: {
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '24px',
              },
            },
            h('div', {
              style: {
                border: '4px solid #f3f3f3',
                borderTop: '4px solid #1976d2',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                animation: 'spin 2s linear infinite',
                marginRight: '16px',
              },
            }),
            h('p', { style: { margin: '0' } }, 'Loading MIB data...')
          ),

          mibError && h(
            'div',
            {
              style: {
                backgroundColor: '#ffebee',
                color: '#c62828',
                padding: '16px',
                borderRadius: '4px',
                marginBottom: '16px',
              },
            },
            h('p', { style: { margin: '0', fontWeight: 'bold' } }, 'Error:'),
            h('p', { style: { margin: '8px 0 0 0' } }, mibError)
          ),

          // MIB Results Table
          !mibLoading && !mibError && mibData.length > 0 && h(
            'div',
            { style: { overflowX: 'auto' } },
            h(
              'div',
              { style: { marginBottom: '8px', fontSize: '14px', color: '#555' } },
              `Found ${mibData.length} OID${mibData.length !== 1 ? 's' : ''} at this level.`,
              autoDiscover && h(
                'span',
                null,
                ' Click any row to select an OID, or "Browse" to explore that branch.'
              )
            ),
            h(
              'table',
              {
                style: {
                  width: '100%',
                  borderCollapse: 'collapse',
                  border: '1px solid #ddd',
                },
              },
              h(
                'thead',
                null,
                h(
                  'tr',
                  { style: { backgroundColor: '#f5f5f5' } },
                  h('th', { style: { padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' } }, 'OID'),
                  h('th', { style: { padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' } }, 'Name'),
                  h('th', { style: { padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' } }, 'Value'),
                  h('th', { style: { padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' } }, 'Type'),
                  h('th', { style: { padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' } }, 'Description'),
                  h('th', { style: { padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' } }, 'Actions')
                )
              ),
              h(
                'tbody',
                null,
                mibData.map((oid, index) => h(
                  'tr',
                  { 
                    key: index,
                    style: { 
                      backgroundColor: selectedOid === oid ? '#e3f2fd' : 'transparent',
                      borderBottom: '1px solid #ddd',
                      cursor: 'pointer'
                    },
                    onClick: () => selectOIDFromMIB(oid),
                  },
                  h('td', { 
                    style: { 
                      padding: '10px', 
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      maxWidth: '200px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    } 
                  }, oid.oid),
                  h('td', { style: { padding: '10px', fontWeight: '500' } }, oid.name),
                  h('td', { 
                    style: { 
                      padding: '10px', 
                      maxWidth: '200px', 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    },
                    title: oid.value
                  }, 
                    String(oid.value).length > 30 
                      ? String(oid.value).substring(0, 30) + '...' 
                      : oid.value
                  ),
                  h('td', { style: { padding: '10px' } }, 
                    h(
                      'span',
                      {
                        style: {
                          padding: '2px 6px',
                          borderRadius: '10px',
                          fontSize: '11px',
                          backgroundColor: getTypeColor(oid.type),
                          color: 'white',
                        },
                      },
                      getDataTypeName(oid.type)
                    )
                  ),
                  h('td', { 
                    style: { 
                      padding: '10px',
                      fontSize: '13px',
                      color: '#555',
                      maxWidth: '250px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    },
                    title: oid.description
                  }, oid.description || '-'),
                  h('td', { 
                    style: { 
                      padding: '10px', 
                      textAlign: 'center' 
                    } 
                  }, 
                    oid.existsInDatabase
                      ? h('span', { 
                          style: { 
                            backgroundColor: '#4caf50', 
                            color: 'white', 
                            padding: '2px 6px', 
                            borderRadius: '4px',
                            fontSize: '12px'
                          } 
                        }, 'Exists')
                      : h('span', { 
                          style: { 
                            backgroundColor: '#ff9800', 
                            color: 'white', 
                            padding: '2px 6px', 
                            borderRadius: '4px',
                            fontSize: '12px'
                          } 
                        }, 'New')
                  ),
                  h('td', { style: { padding: '10px', whiteSpace: 'nowrap' } },
                    h(
                      'button',
                      {
                        onClick: (e) => {
                          e.stopPropagation()
                          setBrowsePath(oid.oid)
                          browseMIB(oid.oid)
                        },
                        style: {
                          padding: '4px 8px',
                          backgroundColor: '#9c27b0',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          marginRight: '8px',
                          fontSize: '12px',
                        },
                      },
                      '🔍 Browse'
                    ),
                    h(
                      'button',
                      {
                        onClick: (e) => {
                          e.stopPropagation()
                          selectOIDFromMIB(oid)
                          updateFormWithMIBData(oid)
                          toggleBrowser()
                        },
                        title: oid.existsInDatabase ? 'View/edit existing OID' : 'Import as new OID',
                        style: {
                          padding: '4px 8px',
                          backgroundColor: oid.existsInDatabase ? '#2196f3' : '#4caf50',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                        },
                      },
                      oid.existsInDatabase ? '👁 View' : '⬇️ Import'
                    )
                  )
                ))
              )
            )
          )
        ),

        // Modal Footer
        h(
          'div',
          {
            style: {
              padding: '16px',
              borderTop: '1px solid #eee',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
            },
          },
          h(
            'button',
            {
              onClick: toggleBrowser,
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
              onClick: importSelectedOid,
              disabled: !selectedOid,
              style: {
                padding: '8px 16px',
                backgroundColor: selectedOid ? '#4caf50' : '#e0e0e0',
                color: selectedOid ? 'white' : '#9e9e9e',
                border: 'none',
                borderRadius: '4px',
                cursor: selectedOid ? 'pointer' : 'not-allowed',
              },
            },
            'Import Selected OID'
          )
        )
      )
    ),

    // Main content area with split layout
    h(
      'div',
      {
        style: {
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: '24px',
        },
      },
      // Left column - OID table with search
      h(
        'div',
        null,
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
            { 
              style: { 
                padding: '16px', 
                borderBottom: '1px solid #eee',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              } 
            },
            h(
              'h2',
              { style: { margin: '0', fontSize: '18px', color: '#333' } },
              'SNMP OIDs'
            ),
            h(
              'div',
              { style: { width: '60%' } },
              h('input', {
                type: 'text',
                placeholder: 'Search OIDs by name, OID string, description, or category...',
                value: searchTerm,
                onChange: (e) => setSearchTerm(e.target.value),
                style: {
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                },
              })
            )
          ),
          h(
            'div',
            { style: { overflowX: 'auto' } },
            h(
              'table',
              {
                style: {
                  width: '100%',
                  borderCollapse: 'collapse',
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
                    'OID'
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
                    'Category'
                  ),
                  h(
                    'th',
                    {
                      style: {
                        padding: '12px',
                        textAlign: 'left',
                        borderBottom: '1px solid #ddd',
                        fontWeight: 'bold',
                        width: '100px',
                      },
                    },
                    'Actions'
                  )
                )
              ),
              h(
                'tbody',
                null,
                oids.length === 0
                  ? h(
                      'tr',
                      null,
                      h(
                        'td',
                        {
                          colSpan: 4,
                          style: {
                            padding: '24px',
                            textAlign: 'center',
                            color: '#666',
                            fontStyle: 'italic',
                          },
                        },
                        searchTerm 
                          ? 'No OIDs match your search criteria' 
                          : 'No SNMP OIDs available'
                      )
                    )
                  : oids.map(oid => {
                      return h(
                        'tr',
                        {
                          key: oid.id,
                          onClick: () => handleSelectOID(oid),
                          style: {
                            cursor: 'pointer',
                            backgroundColor:
                              selectedOID?.id === oid.id
                                ? '#e3f2fd'
                                : 'transparent',
                            borderBottom: '1px solid #eee',
                          },
                          onMouseOver: e => {
                            if (selectedOID?.id !== oid.id) {
                              e.target.closest('tr').style.backgroundColor =
                                '#f5f5f5'
                            }
                          },
                          onMouseOut: e => {
                            if (selectedOID?.id !== oid.id) {
                              e.target.closest('tr').style.backgroundColor =
                                'transparent'
                            }
                          },
                        },
                        h(
                          'td',
                          { style: { padding: '12px' } },
                          oid.name
                        ),
                        h(
                          'td',
                          { 
                            style: { 
                              padding: '12px',
                              fontFamily: 'monospace',
                              fontSize: '13px'
                            } 
                          },
                          oid.oid
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
                                backgroundColor: getCategoryColor(oid.category),
                                color: 'white',
                              },
                            },
                            oid.category
                          )
                        ),
                        // Actions column
                        h(
                          'td',
                          { style: { padding: '12px' } },
                          h(
                            'button',
                            {
                              onClick: e => {
                                e.stopPropagation()
                                handleDeleteOID(oid.id)
                              },
                              style: {
                                padding: '4px 8px',
                                backgroundColor: '#f44336',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px',
                              },
                            },
                            '🗑️ Delete'
                          )
                        )
                      )
                    })
              )
            )
          )
        )
      ),

      // Right column - Add/Edit form
      h(
        'div',
        null,
        h(
          'div',
          {
            style: {
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              padding: '24px',
            },
          },
          h(
            'div', 
            { 
              style: { 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '16px' 
              } 
            },
            h(
              'h2',
              { style: { margin: '0', fontSize: '18px', color: '#333' } },
              editMode 
                ? 'Edit OID'
                : 'Add New OID'
            ),
            h(
              'button',
              {
                onClick: toggleBrowser,
                style: {
                  padding: '6px 12px',
                  backgroundColor: '#673ab7',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                },
              },
              '🔍 Browse OIDs'
            )
          ),
          h(
            'form',
            { onSubmit: handleSubmit },
            // Name field
            h(
              'div',
              { style: { marginBottom: '16px' } },
              h(
                'label',
                {
                  htmlFor: 'name',
                  style: {
                    display: 'block',
                    marginBottom: '8px',
                    color: '#333',
                    fontWeight: 'bold',
                  },
                },
                'Name *'
              ),
              h('input', {
                type: 'text',
                id: 'name',
                name: 'name',
                value: formData.name,
                onChange: handleInputChange,
                required: true,
                style: {
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                },
              })
            ),
            // OID field
            h(
              'div',
              { style: { marginBottom: '16px' } },
              h(
                'label',
                {
                  htmlFor: 'oid',
                  style: {
                    display: 'block',
                    marginBottom: '8px',
                    color: '#333',
                    fontWeight: 'bold',
                  },
                },
                'OID String *'
              ),
              h('input', {
                type: 'text',
                id: 'oid',
                name: 'oid',
                value: formData.oid,
                onChange: handleInputChange,
                required: true,
                placeholder: 'e.g. 1.3.6.1.2.1.1.1.0',
                style: {
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontFamily: 'monospace'
                },
              })
            ),
            // Data Type field
            h(
              'div',
              { style: { marginBottom: '16px' } },
              h(
                'label',
                {
                  htmlFor: 'dataType',
                  style: {
                    display: 'block',
                    marginBottom: '8px',
                    color: '#333',
                    fontWeight: 'bold',
                  },
                },
                'Data Type *'
              ),
              h(
                'select',
                {
                  id: 'dataType',
                  name: 'dataType',
                  value: formData.dataType,
                  onChange: handleInputChange,
                  required: true,
                  style: {
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                  },
                },
                h('option', { value: 'String' }, 'String'),
                h('option', { value: 'Integer' }, 'Integer'),
                h('option', { value: 'Counter32' }, 'Counter32'),
                h('option', { value: 'Counter64' }, 'Counter64'),
                h('option', { value: 'Gauge32' }, 'Gauge32'),
                h('option', { value: 'TimeTicks' }, 'TimeTicks'),
                h('option', { value: 'IpAddress' }, 'IP Address'),
                h('option', { value: 'OID' }, 'OID'),
                h('option', { value: 'Boolean' }, 'Boolean')
              )
            ),
            // Category field
            h(
              'div',
              { style: { marginBottom: '16px' } },
              h(
                'label',
                {
                  htmlFor: 'category',
                  style: {
                    display: 'block',
                    marginBottom: '8px',
                    color: '#333',
                    fontWeight: 'bold',
                  },
                },
                'Category *'
              ),
              h(
                'select',
                {
                  id: 'category',
                  name: 'category',
                  value: formData.category,
                  onChange: handleInputChange,
                  required: true,
                  style: {
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                  },
                },
                h('option', { value: 'System' }, 'System'),
                h('option', { value: 'Interface' }, 'Interface'),
                h('option', { value: 'Performance' }, 'Performance'),
                h('option', { value: 'Storage' }, 'Storage'),
                h('option', { value: 'Network' }, 'Network'),
                h('option', { value: 'Hardware' }, 'Hardware'),
                h('option', { value: 'Software' }, 'Software'),
                h('option', { value: 'Security' }, 'Security'),
                h('option', { value: 'Other' }, 'Other')
              )
            ),
            // Units field
            h(
              'div',
              { style: { marginBottom: '16px' } },
              h(
                'label',
                {
                  htmlFor: 'units',
                  style: {
                    display: 'block',
                    marginBottom: '8px',
                    color: '#333',
                    fontWeight: 'bold',
                  },
                },
                'Units'
              ),
              h('input', {
                type: 'text',
                id: 'units',
                name: 'units',
                value: formData.units,
                onChange: handleInputChange,
                placeholder: 'e.g. Bytes, %, bps, etc.',
                style: {
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                },
              })
            ),
            // Description field
            h(
              'div',
              { style: { marginBottom: '16px' } },
              h(
                'label',
                {
                  htmlFor: 'description',
                  style: {
                    display: 'block',
                    marginBottom: '8px',
                    color: '#333',
                    fontWeight: 'bold',
                  },
                },
                'Description'
              ),
              h('textarea', {
                id: 'description',
                name: 'description',
                value: formData.description,
                onChange: handleInputChange,
                rows: 4,
                style: {
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  resize: 'vertical',
                },
              })
            ),

            // Form buttons
            h(
              'div',
              { style: { display: 'flex', gap: '8px', marginTop: '24px' } },
              h(
                'button',
                {
                  type: 'submit',
                  style: {
                    padding: '10px 16px',
                    backgroundColor: '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  },
                },
                loading ? 'Saving...' : (editMode ? 'Update' : 'Add') + ' OID'
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: resetForm,
                  style: {
                    padding: '10px 16px',
                    backgroundColor: '#f5f5f5',
                    color: '#333',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  },
                },
                'Cancel'
              )
            )
          )
        ),
        // OID detail view when selected
        selectedOID && h(
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
            'h3',
            { style: { margin: '0 0 16px 0', color: '#333' } },
            'OID Details'
          ),
          h(
            'div',
            { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' } },
            h(
              'div',
              null,
              h('p', { style: { margin: '0 0 8px 0' } }, 
                h('strong', null, 'Name: '), 
                selectedOID.name
              ),
              h('p', { style: { margin: '0 0 8px 0' } }, 
                h('strong', null, 'OID: '), 
                h('span', { style: { fontFamily: 'monospace' } }, selectedOID.oid)
              ),
              h('p', { style: { margin: '0 0 8px 0' } }, 
                h('strong', null, 'Data Type: '), 
                selectedOID.dataType
              )
            ),
            h(
              'div',
              null,
              h('p', { style: { margin: '0 0 8px 0' } }, 
                h('strong', null, 'Category: '), 
                h(
                  'span',
                  {
                    style: {
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      backgroundColor: getCategoryColor(selectedOID.category),
                      color: 'white',
                    },
                  },
                  selectedOID.category
                )
              ),
              h('p', { style: { margin: '0 0 8px 0' } }, 
                h('strong', null, 'Units: '), 
                selectedOID.units || '-'
              ),
              h('p', { style: { margin: '0 0 8px 0' } }, 
                h('strong', null, 'Created: '), 
                new Date(selectedOID.createdAt).toLocaleString()
              )
            )
          ),
          h(
            'div',
            { style: { marginTop: '16px' } },
            h('p', { style: { margin: '0 0 8px 0' } }, 
              h('strong', null, 'Description: ')
            ),
            h('p', { style: { margin: '0', fontSize: '14px', lineHeight: '1.5' } }, 
              selectedOID.description || '-'
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
 * Get category color for UI display
 */
function getCategoryColor(category) {
  switch (category) {
    case 'System':
      return '#1976d2' // Blue
    case 'Interface':
      return '#2e7d32' // Green
    case 'Performance':
      return '#f57c00' // Orange
    case 'Storage':
      return '#7b1fa2' // Purple
    case 'Network':
      return '#0288d1' // Light blue
    case 'Hardware':
      return '#5d4037' // Brown
    case 'Software':
      return '#00796b' // Teal
    case 'Security':
      return '#c62828' // Red
    default:
      return '#757575' // Gray
  }
}

/**
 * Get readable data type name from SNMP type code
 */
function getDataTypeName(type) {
  switch (type) {
    case 2:
      return 'Integer'
    case 4:
      return 'String'
    case 5:
      return 'Null'
    case 6:
      return 'OID'
    case 64:
      return 'IP Address'
    case 65:
      return 'Counter32'
    case 66:
      return 'Gauge32'
    case 67:
      return 'TimeTicks'
    case 68:
      return 'Opaque'
    case 70:
      return 'Counter64'
    case 128:
      return 'No Such Object'
    case 129:
      return 'No Such Instance'
    case 130:
      return 'End of MIB View'
    default:
      return `Type ${type}`
  }
}

/**
 * Get color for SNMP data type
 */
function getTypeColor(type) {
  switch (type) {
    case 2: // Integer
      return '#4caf50' // Green
    case 4: // String
      return '#2196f3' // Blue
    case 5: // Null
      return '#9e9e9e' // Gray
    case 6: // OID
      return '#673ab7' // Purple
    case 64: // IP Address
      return '#ff9800' // Orange
    case 65: // Counter32
    case 70: // Counter64
      return '#f44336' // Red
    case 66: // Gauge32
      return '#009688' // Teal
    case 67: // TimeTicks
      return '#3f51b5' // Indigo
    case 68: // Opaque
      return '#795548' // Brown
    case 128: // No Such Object
    case 129: // No Such Instance
    case 130: // End of MIB View
      return '#9e9e9e' // Gray
    default:
      return '#9e9e9e' // Gray
  }
}

/**
 * Initialize the React application
 */
const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(h(StrictMode, null, h(SNMPOID)))
} else {
  console.error('Root element not found!')
}