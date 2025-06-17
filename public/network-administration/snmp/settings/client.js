/**
 * SNMP Settings Management for the Network-Proxy application
 * Handles SNMPv2 and SNMPv3 configuration settings
 */

// Using React CDN imports - these will be loaded from the HTML file
const { createElement: h, StrictMode, useState, useEffect, Fragment } = React
const { createRoot } = ReactDOM

/**
 * Hook to fetch and manage SNMP settings data
 */
function useSNMPSettingsData(companyId = 'default-company-id') {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [snmpv2Settings, setSnmpv2Settings] = useState([])
  const [snmpv3Settings, setSnmpv3Settings] = useState([])
  const [activeTab, setActiveTab] = useState('v2')
  const [selectedSetting, setSelectedSetting] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [formData, setFormData] = useState({
    // SNMPv2 fields
    communityName: '',
    communityString: '',
    readCommunity: '',
    writeCommunity: '',
    // SNMPv3 fields
    username: '',
    authMethod: 'MD5',
    authKey: '',
    privMethod: 'DES',
    privKey: '',
    securityLevel: 'authPriv',
  })

  // Function to refresh data
  const refreshData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Mock SNMPv2 settings data
      const mockSnmpv2Settings = [
        {
          id: 'snmpv2-1',
          companyId: companyId,
          name: 'Public Read Only',
          readCommunity: 'public',
          writeCommunity: '',
          port: 161,
          createdAt: Date.now() - 86400000,
          updatedAt: Date.now(),
        },
        {
          id: 'snmpv2-2',
          companyId: companyId,
          name: 'Private Read/Write',
          readCommunity: 'private',
          writeCommunity: 'private',
          port: 161,
          createdAt: Date.now() - 172800000,
          updatedAt: Date.now(),
        },
        {
          id: 'snmpv2-3',
          companyId: companyId,
          name: 'Custom Community',
          readCommunity: 'customread',
          writeCommunity: 'customwrite',
          port: 161,
          createdAt: Date.now() - 259200000,
          updatedAt: Date.now(),
        },
      ]

      // Mock SNMPv3 settings data
      const mockSnmpv3Settings = [
        {
          id: 'snmpv3-1',
          companyId: companyId,
          name: 'Standard Auth',
          username: 'snmpuser',
          securityLevel: 'authPriv',
          authMethod: 'MD5',
          authKey: 'authkey123',
          privMethod: 'DES',
          privKey: 'privkey123',
          port: 161,
          createdAt: Date.now() - 86400000,
          updatedAt: Date.now(),
        },
        {
          id: 'snmpv3-2',
          companyId: companyId,
          name: 'High Security',
          username: 'admin',
          securityLevel: 'authPriv',
          authMethod: 'SHA',
          authKey: 'secureauth',
          privMethod: 'AES',
          privKey: 'securepriv',
          port: 161,
          createdAt: Date.now() - 172800000,
          updatedAt: Date.now(),
        },
      ]

      setSnmpv2Settings(mockSnmpv2Settings)
      setSnmpv3Settings(mockSnmpv3Settings)
    } catch (err) {
      console.error('Error fetching SNMP settings data:', err)
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
  const handleInputChange = e => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }))
  }

  // Handle form submission for creating/updating settings
  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      if (editMode && selectedSetting) {
        // Update existing setting
        if (activeTab === 'v2') {
          setSnmpv2Settings(prev =>
            prev.map(setting =>
              setting.id === selectedSetting.id
                ? {
                    ...setting,
                    name: formData.communityName,
                    readCommunity: formData.readCommunity,
                    writeCommunity: formData.writeCommunity,
                    updatedAt: Date.now(),
                  }
                : setting
            )
          )
        } else {
          setSnmpv3Settings(prev =>
            prev.map(setting =>
              setting.id === selectedSetting.id
                ? {
                    ...setting,
                    name: formData.username,
                    username: formData.username,
                    securityLevel: formData.securityLevel,
                    authMethod: formData.authMethod,
                    authKey: formData.authKey,
                    privMethod: formData.privMethod,
                    privKey: formData.privKey,
                    updatedAt: Date.now(),
                  }
                : setting
            )
          )
        }
      } else {
        // Create new setting
        const newId = `snmpv${activeTab === 'v2' ? '2' : '3'}-${Date.now()}`

        if (activeTab === 'v2') {
          const newSetting = {
            id: newId,
            companyId,
            name: formData.communityName,
            readCommunity: formData.readCommunity,
            writeCommunity: formData.writeCommunity,
            port: 161,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
          setSnmpv2Settings(prev => [...prev, newSetting])
        } else {
          const newSetting = {
            id: newId,
            companyId,
            name: formData.username,
            username: formData.username,
            securityLevel: formData.securityLevel,
            authMethod: formData.authMethod,
            authKey: formData.authKey,
            privMethod: formData.privMethod,
            privKey: formData.privKey,
            port: 161,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
          setSnmpv3Settings(prev => [...prev, newSetting])
        }
      }

      // Reset form
      resetForm()
    } catch (err) {
      console.error('Error saving SNMP settings:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setLoading(false)
      setEditMode(false)
      setSelectedSetting(null)
    }
  }

  // Handle row selection
  const handleSelectSetting = setting => {
    setSelectedSetting(setting)
    setEditMode(true)

    if (activeTab === 'v2') {
      setFormData({
        communityName: setting.name,
        readCommunity: setting.readCommunity,
        writeCommunity: setting.writeCommunity,
        // Reset v3 fields
        username: '',
        authMethod: 'MD5',
        authKey: '',
        privMethod: 'DES',
        privKey: '',
        securityLevel: 'authPriv',
      })
    } else {
      setFormData({
        // Reset v2 fields
        communityName: '',
        readCommunity: '',
        writeCommunity: '',
        // Set v3 fields
        username: setting.username,
        authMethod: setting.authMethod,
        authKey: setting.authKey,
        privMethod: setting.privMethod,
        privKey: setting.privKey,
        securityLevel: setting.securityLevel,
      })
    }
  }

  // Reset form
  const resetForm = () => {
    setFormData({
      communityName: '',
      readCommunity: '',
      writeCommunity: '',
      username: '',
      authMethod: 'MD5',
      authKey: '',
      privMethod: 'DES',
      privKey: '',
      securityLevel: 'authPriv',
    })
    setEditMode(false)
    setSelectedSetting(null)
  }

  // Handle delete setting
  const handleDeleteSetting = settingId => {
    if (activeTab === 'v2') {
      setSnmpv2Settings(prev =>
        prev.filter(setting => setting.id !== settingId)
      )
    } else {
      setSnmpv3Settings(prev =>
        prev.filter(setting => setting.id !== settingId)
      )
    }

    if (selectedSetting && selectedSetting.id === settingId) {
      resetForm()
    }
  }

  return {
    loading,
    error,
    snmpv2Settings,
    snmpv3Settings,
    activeTab,
    setActiveTab,
    selectedSetting,
    editMode,
    formData,
    handleInputChange,
    handleSubmit,
    handleSelectSetting,
    handleDeleteSetting,
    resetForm,
    refreshData,
  }
}

/**
 * Main SNMP Settings Management component
 */
const SNMPSettings = () => {
  // Use our custom hook to fetch and manage data
  const {
    loading,
    error,
    snmpv2Settings,
    snmpv3Settings,
    activeTab,
    setActiveTab,
    selectedSetting,
    editMode,
    formData,
    handleInputChange,
    handleSubmit,
    handleSelectSetting,
    handleDeleteSetting,
    resetForm,
    refreshData,
  } = useSNMPSettingsData()

  // Render loading state
  if (loading && !snmpv2Settings.length && !snmpv3Settings.length) {
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
        h('p', { style: { margin: '0' } }, 'Loading SNMP settings...')
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
      'SNMP Settings Management'
    ),
    h(
      'p',
      { style: { marginBottom: '24px', color: '#666' } },
      'Manage SNMPv2 and SNMPv3 authentication settings for your network devices'
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

    // Tabs for SNMPv2 and SNMPv3
    h(
      'div',
      { style: { marginBottom: '24px' } },
      h(
        'div',
        {
          style: {
            display: 'flex',
            borderBottom: '1px solid #ddd',
          },
        },
        h(
          'button',
          {
            onClick: () => {
              setActiveTab('v2')
              resetForm()
            },
            style: {
              padding: '12px 24px',
              border: 'none',
              borderBottom: activeTab === 'v2' ? '2px solid #1976d2' : 'none',
              backgroundColor: activeTab === 'v2' ? '#e3f2fd' : 'transparent',
              color: activeTab === 'v2' ? '#1976d2' : '#666',
              cursor: 'pointer',
              fontWeight: activeTab === 'v2' ? 'bold' : 'normal',
              marginRight: '8px',
              borderTopLeftRadius: '8px',
              borderTopRightRadius: '8px',
            },
          },
          'SNMPv2'
        ),
        h(
          'button',
          {
            onClick: () => {
              setActiveTab('v3')
              resetForm()
            },
            style: {
              padding: '12px 24px',
              border: 'none',
              borderBottom: activeTab === 'v3' ? '2px solid #1976d2' : 'none',
              backgroundColor: activeTab === 'v3' ? '#e3f2fd' : 'transparent',
              color: activeTab === 'v3' ? '#1976d2' : '#666',
              cursor: 'pointer',
              fontWeight: activeTab === 'v3' ? 'bold' : 'normal',
              borderTopLeftRadius: '8px',
              borderTopRightRadius: '8px',
            },
          },
          'SNMPv3'
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
      // Left column - Settings table
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
            { style: { padding: '16px', borderBottom: '1px solid #eee' } },
            h(
              'h2',
              { style: { margin: '0', fontSize: '18px', color: '#333' } },
              activeTab === 'v2' ? 'SNMPv2 Settings' : 'SNMPv3 Settings'
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
                  activeTab === 'v2'
                    ? [
                        h(
                          'th',
                          {
                            key: 'read',
                            style: {
                              padding: '12px',
                              textAlign: 'left',
                              borderBottom: '1px solid #ddd',
                              fontWeight: 'bold',
                            },
                          },
                          'Read Community'
                        ),
                        h(
                          'th',
                          {
                            key: 'write',
                            style: {
                              padding: '12px',
                              textAlign: 'left',
                              borderBottom: '1px solid #ddd',
                              fontWeight: 'bold',
                            },
                          },
                          'Write Community'
                        ),
                      ]
                    : [
                        h(
                          'th',
                          {
                            key: 'username',
                            style: {
                              padding: '12px',
                              textAlign: 'left',
                              borderBottom: '1px solid #ddd',
                              fontWeight: 'bold',
                            },
                          },
                          'Username'
                        ),
                        h(
                          'th',
                          {
                            key: 'security',
                            style: {
                              padding: '12px',
                              textAlign: 'left',
                              borderBottom: '1px solid #ddd',
                              fontWeight: 'bold',
                            },
                          },
                          'Security Level'
                        ),
                      ],
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
                // Show appropriate settings based on active tab
                (activeTab === 'v2' ? snmpv2Settings : snmpv3Settings)
                  .length === 0
                  ? h(
                      'tr',
                      null,
                      h(
                        'td',
                        {
                          colSpan: activeTab === 'v2' ? 4 : 4,
                          style: {
                            padding: '24px',
                            textAlign: 'center',
                            color: '#666',
                            fontStyle: 'italic',
                          },
                        },
                        `No SNMP${activeTab} settings available`
                      )
                    )
                  : (activeTab === 'v2' ? snmpv2Settings : snmpv3Settings).map(
                      setting => {
                        return h(
                          'tr',
                          {
                            key: setting.id,
                            onClick: () => handleSelectSetting(setting),
                            style: {
                              cursor: 'pointer',
                              backgroundColor:
                                selectedSetting?.id === setting.id
                                  ? '#e3f2fd'
                                  : 'transparent',
                              borderBottom: '1px solid #eee',
                            },
                            onMouseOver: e => {
                              if (selectedSetting?.id !== setting.id) {
                                e.target.closest('tr').style.backgroundColor =
                                  '#f5f5f5'
                              }
                            },
                            onMouseOut: e => {
                              if (selectedSetting?.id !== setting.id) {
                                e.target.closest('tr').style.backgroundColor =
                                  'transparent'
                              }
                            },
                          },
                          h('td', { style: { padding: '12px' } }, setting.name),
                          // Conditional columns based on active tab
                          activeTab === 'v2'
                            ? [
                                h(
                                  'td',
                                  { key: 'read', style: { padding: '12px' } },
                                  setting.readCommunity || '-'
                                ),
                                h(
                                  'td',
                                  { key: 'write', style: { padding: '12px' } },
                                  setting.writeCommunity || '-'
                                ),
                              ]
                            : [
                                h(
                                  'td',
                                  {
                                    key: 'username',
                                    style: { padding: '12px' },
                                  },
                                  setting.username
                                ),
                                h(
                                  'td',
                                  {
                                    key: 'security',
                                    style: { padding: '12px' },
                                  },
                                  setting.securityLevel
                                ),
                              ],
                          // Actions column
                          h(
                            'td',
                            { style: { padding: '12px' } },
                            h(
                              'button',
                              {
                                onClick: e => {
                                  e.stopPropagation()
                                  handleDeleteSetting(setting.id)
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
                      }
                    )
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
            'h2',
            {
              style: { margin: '0 0 16px 0', fontSize: '18px', color: '#333' },
            },
            editMode
              ? `Edit ${activeTab === 'v2' ? 'SNMPv2' : 'SNMPv3'} Setting`
              : `Add New ${activeTab === 'v2' ? 'SNMPv2' : 'SNMPv3'} Setting`
          ),
          h(
            'form',
            { onSubmit: handleSubmit },
            // SNMPv2 form fields
            activeTab === 'v2' && [
              // Community Name
              h(
                'div',
                { key: 'nameField', style: { marginBottom: '16px' } },
                h(
                  'label',
                  {
                    htmlFor: 'communityName',
                    style: {
                      display: 'block',
                      marginBottom: '8px',
                      color: '#333',
                      fontWeight: 'bold',
                    },
                  },
                  'Community Name *'
                ),
                h('input', {
                  type: 'text',
                  id: 'communityName',
                  name: 'communityName',
                  value: formData.communityName,
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
              // Read Community
              h(
                'div',
                { key: 'readField', style: { marginBottom: '16px' } },
                h(
                  'label',
                  {
                    htmlFor: 'readCommunity',
                    style: {
                      display: 'block',
                      marginBottom: '8px',
                      color: '#333',
                      fontWeight: 'bold',
                    },
                  },
                  'Read Community *'
                ),
                h('input', {
                  type: 'text',
                  id: 'readCommunity',
                  name: 'readCommunity',
                  value: formData.readCommunity,
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
              // Write Community
              h(
                'div',
                { key: 'writeField', style: { marginBottom: '16px' } },
                h(
                  'label',
                  {
                    htmlFor: 'writeCommunity',
                    style: {
                      display: 'block',
                      marginBottom: '8px',
                      color: '#333',
                      fontWeight: 'bold',
                    },
                  },
                  'Write Community'
                ),
                h('input', {
                  type: 'text',
                  id: 'writeCommunity',
                  name: 'writeCommunity',
                  value: formData.writeCommunity,
                  onChange: handleInputChange,
                  style: {
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                  },
                })
              ),
            ],

            // SNMPv3 form fields
            activeTab === 'v3' && [
              // Username
              h(
                'div',
                { key: 'usernameField', style: { marginBottom: '16px' } },
                h(
                  'label',
                  {
                    htmlFor: 'username',
                    style: {
                      display: 'block',
                      marginBottom: '8px',
                      color: '#333',
                      fontWeight: 'bold',
                    },
                  },
                  'Username *'
                ),
                h('input', {
                  type: 'text',
                  id: 'username',
                  name: 'username',
                  value: formData.username,
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
              // Security Level
              h(
                'div',
                { key: 'securityField', style: { marginBottom: '16px' } },
                h(
                  'label',
                  {
                    htmlFor: 'securityLevel',
                    style: {
                      display: 'block',
                      marginBottom: '8px',
                      color: '#333',
                      fontWeight: 'bold',
                    },
                  },
                  'Security Level *'
                ),
                h(
                  'select',
                  {
                    id: 'securityLevel',
                    name: 'securityLevel',
                    value: formData.securityLevel,
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
                  h(
                    'option',
                    { value: 'noAuthNoPriv' },
                    'No Auth, No Privacy (noAuthNoPriv)'
                  ),
                  h(
                    'option',
                    { value: 'authNoPriv' },
                    'Auth, No Privacy (authNoPriv)'
                  ),
                  h('option', { value: 'authPriv' }, 'Auth, Privacy (authPriv)')
                )
              ),
              // Auth Method
              h(
                'div',
                { key: 'authMethodField', style: { marginBottom: '16px' } },
                h(
                  'label',
                  {
                    htmlFor: 'authMethod',
                    style: {
                      display: 'block',
                      marginBottom: '8px',
                      color: '#333',
                      fontWeight: 'bold',
                    },
                  },
                  'Authentication Method'
                ),
                h(
                  'select',
                  {
                    id: 'authMethod',
                    name: 'authMethod',
                    value: formData.authMethod,
                    onChange: handleInputChange,
                    disabled: formData.securityLevel === 'noAuthNoPriv',
                    style: {
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '14px',
                    },
                  },
                  h('option', { value: 'MD5' }, 'MD5'),
                  h('option', { value: 'SHA' }, 'SHA'),
                  h('option', { value: 'SHA256' }, 'SHA-256')
                )
              ),
              // Auth Key
              h(
                'div',
                { key: 'authKeyField', style: { marginBottom: '16px' } },
                h(
                  'label',
                  {
                    htmlFor: 'authKey',
                    style: {
                      display: 'block',
                      marginBottom: '8px',
                      color: '#333',
                      fontWeight: 'bold',
                    },
                  },
                  'Authentication Password'
                ),
                h('input', {
                  type: 'password',
                  id: 'authKey',
                  name: 'authKey',
                  value: formData.authKey,
                  onChange: handleInputChange,
                  disabled: formData.securityLevel === 'noAuthNoPriv',
                  style: {
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                  },
                })
              ),
              // Privacy Method
              h(
                'div',
                { key: 'privMethodField', style: { marginBottom: '16px' } },
                h(
                  'label',
                  {
                    htmlFor: 'privMethod',
                    style: {
                      display: 'block',
                      marginBottom: '8px',
                      color: '#333',
                      fontWeight: 'bold',
                    },
                  },
                  'Privacy Method'
                ),
                h(
                  'select',
                  {
                    id: 'privMethod',
                    name: 'privMethod',
                    value: formData.privMethod,
                    onChange: handleInputChange,
                    disabled: formData.securityLevel !== 'authPriv',
                    style: {
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '14px',
                    },
                  },
                  h('option', { value: 'DES' }, 'DES'),
                  h('option', { value: 'AES' }, 'AES')
                )
              ),
              // Privacy Key
              h(
                'div',
                { key: 'privKeyField', style: { marginBottom: '16px' } },
                h(
                  'label',
                  {
                    htmlFor: 'privKey',
                    style: {
                      display: 'block',
                      marginBottom: '8px',
                      color: '#333',
                      fontWeight: 'bold',
                    },
                  },
                  'Privacy Password'
                ),
                h('input', {
                  type: 'password',
                  id: 'privKey',
                  name: 'privKey',
                  value: formData.privKey,
                  onChange: handleInputChange,
                  disabled: formData.securityLevel !== 'authPriv',
                  style: {
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                  },
                })
              ),
            ],

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
                loading
                  ? 'Saving...'
                  : (editMode ? 'Update' : 'Add') + ' Setting'
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
  root.render(h(StrictMode, null, h(SNMPSettings)))
} else {
  console.error('Root element not found!')
}
