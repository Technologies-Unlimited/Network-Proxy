/**
 * Device Discovery Tool for the Network-Proxy application
 */

// Using React CDN imports - these will be loaded from the HTML file
const { createElement: h, StrictMode, useState, useEffect } = React
const { createRoot } = ReactDOM

/**
 * Main Device Discovery Tool component
 */
const DeviceDiscoveryTool = () => {
  const [networkRange, setNetworkRange] = useState('192.168.1.0/24')
  const [isScanning, setIsScanning] = useState(false)
  const [discoveredDevices, setDiscoveredDevices] = useState([])
  const [shouldStop, setShouldStop] = useState(false)
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 })
  const [abortController, setAbortController] = useState(null)

  // MIB Browser state
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [showMibBrowser, setShowMibBrowser] = useState(false)
  const [showSnmpDialog, setShowSnmpDialog] = useState(false)
  const [snmpConfig, setSnmpConfig] = useState({
    version: '2c',
    community: 'public',
    username: '',
    authProtocol: 'md5',
    authKey: '',
    privProtocol: 'des',
    privKey: '',
    securityLevel: 'noAuthNoPriv',
  })
  const [mibData, setMibData] = useState([])
  const [isBrowsingMib, setIsBrowsingMib] = useState(false)
  const [mibFilter, setMibFilter] = useState('')
  const [expandedOids, setExpandedOids] = useState(new Set())

  const commonNetworkRanges = [
    '192.168.1.0/24',
    '192.168.0.0/24',
    '10.0.0.0/24',
    '172.16.0.0/24',
    '192.168.2.0/24',
  ]

  const handleStartDiscovery = async () => {
    console.log('=== FRONTEND DEVICE DISCOVERY START ===')

    if (!networkRange.trim()) {
      alert('Please enter a network range')
      return
    }

    // Validate CIDR format
    const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/
    if (!cidrRegex.test(networkRange.trim())) {
      alert('Please enter a valid CIDR network range (e.g., 192.168.1.0/24)')
      return
    }

    console.log('Device discovery parameters:', {
      networkRange: networkRange.trim(),
    })
    setIsScanning(true)
    setShouldStop(false)
    setDiscoveredDevices([])
    setScanProgress({ current: 0, total: 0 })

    // Create AbortController for canceling the request
    const controller = new AbortController()
    setAbortController(controller)

    try {
      console.log('Using streaming endpoint for real-time device discovery')
      const response = await fetch('/api/device-discovery-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          networkRange: networkRange.trim(),
        }),
        signal: controller.signal,
      })

      console.log('Device discovery stream response status:', response.status)
      if (!response.ok) {
        throw new Error('Device discovery stream request failed')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          // Check if we should stop before each read
          if (shouldStop || controller.signal.aborted) {
            console.log('Device discovery stopped by user')
            reader.cancel()
            break
          }

          const { done, value } = await reader.read()
          console.log('Device discovery stream read:', {
            done,
            valueLength: value?.length,
          })

          if (done) {
            console.log('Device discovery stream completed')
            break
          }

          const chunk = decoder.decode(value, { stream: true })
          console.log('Received device discovery chunk:', chunk)
          buffer += chunk

          // Process complete lines
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep incomplete line in buffer

          for (const line of lines) {
            console.log('Processing device discovery line:', line)
            if (line.startsWith('data: ')) {
              try {
                const jsonData = line.slice(6).trim()
                if (jsonData) {
                  const result = JSON.parse(jsonData)
                  console.log('Parsed device discovery result:', result)

                  if (result.type === 'progress') {
                    setScanProgress(result.progress)
                  } else if (result.type === 'device') {
                    setDiscoveredDevices(prev => {
                      const newDevices = [...prev, result.device]
                      console.log(
                        'Updated discovered devices count:',
                        newDevices.length
                      )
                      return newDevices
                    })
                  }
                }
              } catch (e) {
                console.error(
                  'Error parsing device discovery result:',
                  e,
                  'Line:',
                  line
                )
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Device discovery was cancelled by user')
      } else {
        console.error('Device discovery error:', error)
        alert(`Device discovery failed: ${error.message}`)
      }
    } finally {
      console.log('Device discovery operation completed')
      setIsScanning(false)
      setShouldStop(false)
      setAbortController(null)
    }
  }

  const handleStopDiscovery = () => {
    console.log('Stop device discovery requested')
    setShouldStop(true)

    // Abort the fetch request if it's in progress
    if (abortController) {
      console.log('Aborting device discovery request')
      abortController.abort()
    }

    setIsScanning(false)
  }

  const handleBrowseMibClick = device => {
    console.log('Browse MIB clicked for device:', device)
    setSelectedDevice(device)
    setShowSnmpDialog(true)
  }

  const handleSnmpConfigSubmit = () => {
    console.log('SNMP config submitted:', snmpConfig)
    setShowSnmpDialog(false)
    handleBrowseMib(selectedDevice)
  }

  const handleBrowseMib = async device => {
    console.log('=== FRONTEND MIB BROWSE START ===')
    console.log('Browsing MIB for device:', device)
    console.log('Using SNMP config:', snmpConfig)

    setShowMibBrowser(true)
    setIsBrowsingMib(true)
    setMibData([])

    try {
      const requestBody = {
        target: device.ipAddress,
        version: snmpConfig.version,
        community: snmpConfig.community,
      }

      // Add SNMPv3 specific parameters
      if (snmpConfig.version === '3') {
        requestBody.user = {
          name: snmpConfig.username,
          level: snmpConfig.securityLevel,
          authProtocol: snmpConfig.authProtocol,
          authKey: snmpConfig.authKey,
          privProtocol: snmpConfig.privProtocol,
          privKey: snmpConfig.privKey,
        }
      }

      console.log('SNMP browse request body:', requestBody)

      const response = await fetch('/api/snmp-browse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      console.log('SNMP browse response status:', response.status)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'SNMP browse request failed')
      }

      const data = await response.json()
      console.log('Received SNMP data:', data)
      setMibData(data.mibs || [])
    } catch (error) {
      console.error('SNMP browse error:', error)
      alert(`SNMP browse failed: ${error.message}`)
    } finally {
      setIsBrowsingMib(false)
    }
  }

  const handleWalkOid = async oid => {
    console.log('=== FRONTEND SNMP WALK START ===')
    console.log('Walking OID:', oid, 'for device:', selectedDevice?.ipAddress)

    if (!selectedDevice) return

    try {
      const requestBody = {
        target: selectedDevice.ipAddress,
        version: snmpConfig.version,
        community: snmpConfig.community,
        oid: oid,
      }

      // Add SNMPv3 specific parameters
      if (snmpConfig.version === '3') {
        requestBody.user = {
          name: snmpConfig.username,
          level: snmpConfig.securityLevel,
          authProtocol: snmpConfig.authProtocol,
          authKey: snmpConfig.authKey,
          privProtocol: snmpConfig.privProtocol,
          privKey: snmpConfig.privKey,
        }
      }

      const response = await fetch('/api/snmp-walk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      console.log('SNMP walk response status:', response.status)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'SNMP walk request failed')
      }

      const data = await response.json()
      console.log('Received SNMP walk data:', data)

      // Update the MIB data with walk results
      setMibData(prev => {
        const updated = [...prev]
        const parentIndex = updated.findIndex(item => item.oid === oid)
        if (parentIndex !== -1) {
          updated[parentIndex].children = data.results || []
          updated[parentIndex].hasChildren = (data.results || []).length > 0
        }
        return updated
      })

      // Expand the OID
      setExpandedOids(prev => new Set([...prev, oid]))
    } catch (error) {
      console.error('SNMP walk error:', error)
      alert(`SNMP walk failed: ${error.message}`)
    }
  }

  const toggleOidExpansion = oid => {
    setExpandedOids(prev => {
      const newSet = new Set(prev)
      if (newSet.has(oid)) {
        newSet.delete(oid)
      } else {
        newSet.add(oid)
        // Trigger SNMP walk if not already done
        const mibItem = mibData.find(item => item.oid === oid)
        if (mibItem && !mibItem.children) {
          handleWalkOid(oid)
        }
      }
      return newSet
    })
  }

  const filteredMibData = mibData.filter(
    item =>
      !mibFilter ||
      item.name.toLowerCase().includes(mibFilter.toLowerCase()) ||
      item.oid.includes(mibFilter) ||
      (item.description &&
        item.description.toLowerCase().includes(mibFilter.toLowerCase()))
  )

  const renderMibTree = (items, level = 0) => {
    return items.map(item => {
      const isExpanded = expandedOids.has(item.oid)
      const hasChildren =
        item.hasChildren || (item.children && item.children.length > 0)

      return h(
        'div',
        { key: item.oid, style: { marginLeft: `${level * 20}px` } },
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              padding: '4px 8px',
              borderRadius: '4px',
              cursor: hasChildren ? 'pointer' : 'default',
              backgroundColor: level % 2 === 0 ? '#f9f9f9' : 'white',
              border: '1px solid #eee',
              marginBottom: '2px',
            },
            onClick: hasChildren
              ? () => toggleOidExpansion(item.oid)
              : undefined,
          },
          hasChildren &&
            h(
              'span',
              {
                style: {
                  marginRight: '8px',
                  fontSize: '12px',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                },
              },
              '▶'
            ),
          h(
            'div',
            { style: { flex: 1 } },
            h(
              'div',
              { style: { fontWeight: 'bold', fontSize: '14px' } },
              item.name
            ),
            h(
              'div',
              {
                style: {
                  fontSize: '12px',
                  color: '#666',
                  fontFamily: 'monospace',
                },
              },
              item.oid
            ),
            item.value &&
              h(
                'div',
                { style: { fontSize: '12px', color: '#333' } },
                `Value: ${item.value}`
              ),
            item.description &&
              h(
                'div',
                {
                  style: {
                    fontSize: '11px',
                    color: '#888',
                    fontStyle: 'italic',
                  },
                },
                item.description
              )
          )
        ),
        isExpanded && item.children && renderMibTree(item.children, level + 1)
      )
    })
  }

  // SNMP Configuration Dialog
  const renderSnmpDialog = () => {
    if (!showSnmpDialog) return null

    return h(
      'div',
      {
        style: {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        },
      },
      h(
        'div',
        {
          style: {
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto',
          },
        },
        h(
          'h3',
          { style: { marginTop: 0, marginBottom: '16px', color: '#333' } },
          `SNMP Configuration for ${selectedDevice?.ipAddress}`
        ),

        // SNMP Version
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
              },
            },
            'SNMP Version'
          ),
          h(
            'select',
            {
              value: snmpConfig.version,
              onChange: e =>
                setSnmpConfig(prev => ({ ...prev, version: e.target.value })),
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
        ),

        // Community String (for v1 and v2c)
        (snmpConfig.version === '1' || snmpConfig.version === '2c') &&
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
                },
              },
              'Community String'
            ),
            h('input', {
              type: 'text',
              value: snmpConfig.community,
              onChange: e =>
                setSnmpConfig(prev => ({ ...prev, community: e.target.value })),
              placeholder: 'public',
              style: {
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
              },
            })
          ),

        // SNMPv3 Configuration
        snmpConfig.version === '3' &&
          h(
            'div',
            null,
            // Username
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
                  },
                },
                'Username'
              ),
              h('input', {
                type: 'text',
                value: snmpConfig.username,
                onChange: e =>
                  setSnmpConfig(prev => ({
                    ...prev,
                    username: e.target.value,
                  })),
                placeholder: 'Enter username',
                style: {
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                },
              })
            ),

            // Security Level
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
                  },
                },
                'Security Level'
              ),
              h(
                'select',
                {
                  value: snmpConfig.securityLevel,
                  onChange: e =>
                    setSnmpConfig(prev => ({
                      ...prev,
                      securityLevel: e.target.value,
                    })),
                  style: {
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                  },
                },
                h(
                  'option',
                  { value: 'noAuthNoPriv' },
                  'No Authentication, No Privacy'
                ),
                h(
                  'option',
                  { value: 'authNoPriv' },
                  'Authentication, No Privacy'
                ),
                h('option', { value: 'authPriv' }, 'Authentication and Privacy')
              )
            ),

            // Authentication (if authNoPriv or authPriv)
            (snmpConfig.securityLevel === 'authNoPriv' ||
              snmpConfig.securityLevel === 'authPriv') &&
              h(
                'div',
                null,
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
                      },
                    },
                    'Authentication Protocol'
                  ),
                  h(
                    'select',
                    {
                      value: snmpConfig.authProtocol,
                      onChange: e =>
                        setSnmpConfig(prev => ({
                          ...prev,
                          authProtocol: e.target.value,
                        })),
                      style: {
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                      },
                    },
                    h('option', { value: 'md5' }, 'MD5'),
                    h('option', { value: 'sha' }, 'SHA-1'),
                    h('option', { value: 'sha224' }, 'SHA-224'),
                    h('option', { value: 'sha256' }, 'SHA-256'),
                    h('option', { value: 'sha384' }, 'SHA-384'),
                    h('option', { value: 'sha512' }, 'SHA-512')
                  )
                ),
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
                      },
                    },
                    'Authentication Key'
                  ),
                  h('input', {
                    type: 'password',
                    value: snmpConfig.authKey,
                    onChange: e =>
                      setSnmpConfig(prev => ({
                        ...prev,
                        authKey: e.target.value,
                      })),
                    placeholder: 'Enter authentication key',
                    style: {
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                    },
                  })
                )
              ),

            // Privacy (if authPriv)
            snmpConfig.securityLevel === 'authPriv' &&
              h(
                'div',
                null,
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
                      },
                    },
                    'Privacy Protocol'
                  ),
                  h(
                    'select',
                    {
                      value: snmpConfig.privProtocol,
                      onChange: e =>
                        setSnmpConfig(prev => ({
                          ...prev,
                          privProtocol: e.target.value,
                        })),
                      style: {
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                      },
                    },
                    h('option', { value: 'des' }, 'DES'),
                    h('option', { value: 'aes' }, 'AES-128'),
                    h('option', { value: 'aes256b' }, 'AES-256 (Blumenthal)'),
                    h('option', { value: 'aes256r' }, 'AES-256 (Reeder)')
                  )
                ),
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
                      },
                    },
                    'Privacy Key'
                  ),
                  h('input', {
                    type: 'password',
                    value: snmpConfig.privKey,
                    onChange: e =>
                      setSnmpConfig(prev => ({
                        ...prev,
                        privKey: e.target.value,
                      })),
                    placeholder: 'Enter privacy key',
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

        // Dialog Buttons
        h(
          'div',
          {
            style: {
              display: 'flex',
              gap: '8px',
              justifyContent: 'flex-end',
              marginTop: '24px',
            },
          },
          h(
            'button',
            {
              onClick: () => setShowSnmpDialog(false),
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
              onClick: handleSnmpConfigSubmit,
              style: {
                padding: '8px 16px',
                backgroundColor: '#4caf50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              },
            },
            'Connect & Browse MIB'
          )
        )
      )
    )
  }

  return h(
    'div',
    { style: { maxWidth: '1200px', margin: '0 auto', padding: '16px' } },
    h(
      'button',
      {
        onClick: () => (window.location.href = '/network-administration/tools'),
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
      '← Back to Tools'
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
      h(
        'a',
        {
          href: '/network-administration',
          style: { color: '#1976d2', textDecoration: 'none' },
        },
        'Network Administration'
      ),
      ' > ',
      h(
        'a',
        {
          href: '/network-administration/tools',
          style: { color: '#1976d2', textDecoration: 'none' },
        },
        'Tools'
      ),
      ' > ',
      h('span', { style: { color: '#333' } }, 'Device Discovery')
    ),

    h(
      'h1',
      { style: { marginBottom: '8px', color: '#333' } },
      'Tools - Device Discovery'
    ),
    h(
      'p',
      { style: { marginBottom: '24px', color: '#666' } },
      'Discover active devices on your network using ping sweeps and ARP lookups'
    ),

    h(
      'div',
      {
        style: {
          backgroundColor: 'white',
          padding: '16px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          marginBottom: '24px',
        },
      },
      h(
        'label',
        {
          style: { display: 'block', marginBottom: '8px', fontWeight: 'bold' },
        },
        'Network Range (CIDR)'
      ),
      h('input', {
        type: 'text',
        value: networkRange,
        onChange: e => setNetworkRange(e.target.value),
        placeholder: '192.168.1.0/24',
        style: {
          width: '100%',
          padding: '8px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          marginBottom: '8px',
        },
      }),
      h(
        'div',
        { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h(
          'span',
          { style: { fontSize: '12px', color: '#666' } },
          'Common ranges:'
        ),
        ...commonNetworkRanges.map(range =>
          h(
            'button',
            {
              key: range,
              onClick: () => setNetworkRange(range),
              style: {
                fontSize: '12px',
                padding: '4px 8px',
                backgroundColor: networkRange === range ? '#1976d2' : '#f5f5f5',
                color: networkRange === range ? 'white' : '#333',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
              },
            },
            range
          )
        )
      )
    ),

    h(
      'div',
      { style: { display: 'flex', gap: '8px', marginBottom: '24px' } },
      h(
        'button',
        {
          onClick: handleStartDiscovery,
          disabled: isScanning || !networkRange.trim(),
          style: {
            padding: '8px 16px',
            backgroundColor:
              isScanning || !networkRange.trim() ? '#ccc' : '#4caf50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor:
              isScanning || !networkRange.trim() ? 'not-allowed' : 'pointer',
          },
        },
        isScanning ? '⏳ Scanning...' : '▶ Start Discovery'
      ),

      h(
        'button',
        {
          onClick: handleStopDiscovery,
          disabled: !isScanning,
          style: {
            padding: '8px 16px',
            backgroundColor: !isScanning ? '#ccc' : '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: !isScanning ? 'not-allowed' : 'pointer',
          },
        },
        '⏹ Stop Discovery'
      )
    ),

    // Progress indicator
    isScanning &&
      h(
        'div',
        {
          style: {
            backgroundColor: 'white',
            padding: '16px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            marginBottom: '24px',
          },
        },
        h(
          'h3',
          { style: { marginTop: '0', marginBottom: '8px' } },
          'Scan Progress'
        ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '16px' } },
          h(
            'div',
            {
              style: {
                flex: 1,
                backgroundColor: '#f5f5f5',
                borderRadius: '4px',
                height: '8px',
                overflow: 'hidden',
              },
            },
            h('div', {
              style: {
                width:
                  scanProgress.total > 0
                    ? `${(scanProgress.current / scanProgress.total) * 100}%`
                    : '0%',
                height: '100%',
                backgroundColor: '#4caf50',
                transition: 'width 0.3s ease',
              },
            })
          ),
          h(
            'span',
            { style: { fontSize: '14px', color: '#666' } },
            `${scanProgress.current}/${scanProgress.total} hosts`
          )
        )
      ),

    // Discovered Devices Table
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
      h(
        'h2',
        { style: { marginTop: '0', marginBottom: '16px' } },
        `Discovered Devices (${discoveredDevices.length})`
      ),
      discoveredDevices.length === 0
        ? h(
            'p',
            { style: { color: '#666', fontStyle: 'italic' } },
            isScanning ? 'Scanning for devices...' : 'No devices discovered yet'
          )
        : h(
            'div',
            { style: { overflowX: 'auto' } },
            h(
              'table',
              { style: { width: '100%', borderCollapse: 'collapse' } },
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
                      },
                    },
                    'Hostname'
                  ),
                  h(
                    'th',
                    {
                      style: {
                        padding: '12px',
                        textAlign: 'left',
                        borderBottom: '1px solid #ddd',
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
                      },
                    },
                    'Vendor'
                  ),
                  h(
                    'th',
                    {
                      style: {
                        padding: '12px',
                        textAlign: 'left',
                        borderBottom: '1px solid #ddd',
                      },
                    },
                    'Response Time'
                  ),
                  h(
                    'th',
                    {
                      style: {
                        padding: '12px',
                        textAlign: 'left',
                        borderBottom: '1px solid #ddd',
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
                      },
                    },
                    'Actions'
                  )
                )
              ),
              h(
                'tbody',
                null,
                ...discoveredDevices.map(device =>
                  h(
                    'tr',
                    {
                      key: device.id,
                      style: { borderBottom: '1px solid #eee' },
                    },
                    h(
                      'td',
                      { style: { padding: '12px', fontFamily: 'monospace' } },
                      device.ipAddress
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      device.hostname || 'Unknown'
                    ),
                    h(
                      'td',
                      { style: { padding: '12px', fontFamily: 'monospace' } },
                      device.macAddress || 'Unknown'
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      device.vendor || 'Unknown'
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      device.responseTime ? `${device.responseTime}ms` : 'N/A'
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      h(
                        'span',
                        {
                          style: {
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            backgroundColor:
                              device.status === 'online'
                                ? '#e8f5e8'
                                : '#ffebee',
                            color:
                              device.status === 'online'
                                ? '#2e7d32'
                                : '#c62828',
                          },
                        },
                        device.status === 'online' ? 'Online' : 'Offline'
                      )
                    ),
                    h(
                      'td',
                      { style: { padding: '12px' } },
                      h(
                        'button',
                        {
                          onClick: () => handleBrowseMibClick(device),
                          disabled: isBrowsingMib,
                          style: {
                            padding: '6px 12px',
                            fontSize: '12px',
                            backgroundColor: '#1976d2',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isBrowsingMib ? 'not-allowed' : 'pointer',
                            opacity: isBrowsingMib ? 0.6 : 1,
                          },
                        },
                        '🔍 Browse MIB'
                      )
                    )
                  )
                )
              )
            )
          )
    ),

    // SNMP Configuration Dialog
    renderSnmpDialog(),

    // MIB Browser Section
    showMibBrowser &&
      h(
        'div',
        {
          style: {
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
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
            'h2',
            { style: { margin: '0' } },
            `MIB Browser - ${selectedDevice?.ipAddress} (${selectedDevice?.hostname || 'Unknown'})`
          ),
          h(
            'button',
            {
              onClick: () => setShowMibBrowser(false),
              style: {
                padding: '6px 12px',
                backgroundColor: '#666',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              },
            },
            '✕ Close'
          )
        ),

        // Current SNMP Configuration Display
        h(
          'div',
          {
            style: {
              marginBottom: '16px',
              padding: '12px',
              backgroundColor: '#f0f8ff',
              borderRadius: '4px',
              border: '1px solid #e0e0e0',
            },
          },
          h(
            'div',
            { style: { fontSize: '12px', color: '#666', marginBottom: '4px' } },
            'Current SNMP Configuration:'
          ),
          h(
            'div',
            { style: { fontSize: '14px', fontFamily: 'monospace' } },
            `Version: ${snmpConfig.version}${snmpConfig.version === '3' ? `, User: ${snmpConfig.username}, Security: ${snmpConfig.securityLevel}` : `, Community: ${snmpConfig.community}`}`
          )
        ),

        // MIB Filter and Actions
        h(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              marginBottom: '16px',
              padding: '16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '8px',
            },
          },
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
                  fontSize: '12px',
                },
              },
              'Filter MIBs'
            ),
            h('input', {
              type: 'text',
              value: mibFilter,
              onChange: e => setMibFilter(e.target.value),
              placeholder: 'Search OIDs, names, or descriptions...',
              style: {
                width: '100%',
                padding: '6px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '12px',
              },
            })
          ),
          h(
            'div',
            { style: { display: 'flex', alignItems: 'end' } },
            h(
              'button',
              {
                onClick: () => handleBrowseMib(selectedDevice),
                disabled: isBrowsingMib,
                style: {
                  padding: '6px 12px',
                  backgroundColor: isBrowsingMib ? '#ccc' : '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isBrowsingMib ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                },
              },
              isBrowsingMib ? '⏳ Loading...' : '🔄 Refresh MIBs'
            )
          )
        ),

        // MIB Tree Display
        h(
          'div',
          {
            style: {
              border: '1px solid #ddd',
              borderRadius: '8px',
              maxHeight: '600px',
              overflowY: 'auto',
            },
          },
          mibData.length === 0
            ? h(
                'div',
                {
                  style: {
                    padding: '32px',
                    textAlign: 'center',
                    color: '#666',
                  },
                },
                isBrowsingMib
                  ? h(
                      'div',
                      null,
                      h(
                        'div',
                        { style: { marginBottom: '8px' } },
                        '⏳ Browsing SNMP MIBs...'
                      ),
                      h(
                        'div',
                        { style: { fontSize: '12px' } },
                        'This may take a few moments'
                      )
                    )
                  : h(
                      'div',
                      null,
                      h(
                        'div',
                        { style: { marginBottom: '8px' } },
                        '📋 No MIB data available'
                      ),
                      h(
                        'div',
                        { style: { fontSize: '12px' } },
                        'Click "Refresh MIBs" to load SNMP data for this device'
                      )
                    )
              )
            : h(
                'div',
                { style: { padding: '16px' } },
                h(
                  'div',
                  {
                    style: {
                      marginBottom: '16px',
                      fontSize: '14px',
                      color: '#666',
                    },
                  },
                  `Found ${filteredMibData.length} MIB entries${mibFilter ? ` matching "${mibFilter}"` : ''}`
                ),
                h(
                  'div',
                  { style: { fontFamily: 'monospace', fontSize: '13px' } },
                  renderMibTree(filteredMibData)
                )
              )
        ),

        // Quick Actions
        mibData.length > 0 &&
          h(
            'div',
            {
              style: {
                marginTop: '16px',
                padding: '16px',
                backgroundColor: '#f0f8ff',
                borderRadius: '8px',
              },
            },
            h(
              'h4',
              { style: { margin: '0 0 8px 0', color: '#1976d2' } },
              '🚀 Quick Actions'
            ),
            h(
              'div',
              { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
              h(
                'button',
                {
                  onClick: () => handleWalkOid('1.3.6.1.2.1.1'),
                  style: {
                    padding: '6px 12px',
                    fontSize: '12px',
                    backgroundColor: '#2196f3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  },
                },
                '📊 System Info'
              ),
              h(
                'button',
                {
                  onClick: () => handleWalkOid('1.3.6.1.2.1.2'),
                  style: {
                    padding: '6px 12px',
                    fontSize: '12px',
                    backgroundColor: '#ff9800',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  },
                },
                '🌐 Interfaces'
              ),
              h(
                'button',
                {
                  onClick: () => handleWalkOid('1.3.6.1.2.1.25'),
                  style: {
                    padding: '6px 12px',
                    fontSize: '12px',
                    backgroundColor: '#9c27b0',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  },
                },
                '💾 Host Resources'
              ),
              h(
                'button',
                {
                  onClick: () => handleWalkOid('1.3.6.1.2.1.17'),
                  style: {
                    padding: '6px 12px',
                    fontSize: '12px',
                    backgroundColor: '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  },
                },
                '🌉 Bridge MIB'
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
  root.render(h(StrictMode, null, h(DeviceDiscoveryTool)))
} else {
  console.error('Root element not found!')
}
