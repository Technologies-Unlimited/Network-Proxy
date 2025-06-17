/**
 * SNMP Templates Management for the Network-Proxy application
 * Handles SNMP monitoring templates that combine SNMPv2/v3 settings with OIDs
 */

// Using React CDN imports - these will be loaded from the HTML file
const { createElement: h, StrictMode, useState, useEffect, Fragment } = React
const { createRoot } = ReactDOM

/**
 * Hook to fetch and manage SNMP templates data
 */
function useSNMPTemplatesData(companyId = 'default-company-id') {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [templates, setTemplates] = useState([])
  const [snmpv2Settings, setSnmpv2Settings] = useState([])
  const [snmpv3Settings, setSnmpv3Settings] = useState([])
  const [oids, setOids] = useState([])
  const [manufacturers, setManufacturers] = useState([])
  const [models, setModels] = useState([])
  const [activeTab, setActiveTab] = useState('v2')
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    version: 'v2',
    snmpSettingId: '',
    manufacturerId: '',
    modelId: '',
    oidIds: [],
  })

  // Function to refresh data
  const refreshData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Mock templates data
      const mockTemplates = [
        {
          id: 'template-1',
          companyId: companyId,
          name: 'Cisco Router Template',
          description: 'Standard template for Cisco routers',
          version: 'v2',
          snmpSettingId: 'snmpv2-1',
          manufacturerId: 'cisco',
          modelId: 'router',
          oidIds: ['oid-1', 'oid-2', 'oid-4'],
          createdAt: Date.now() - 86400000,
          updatedAt: Date.now(),
        },
        {
          id: 'template-2',
          companyId: companyId,
          name: 'HP Switch Template',
          description: 'Enhanced monitoring for HP switches',
          version: 'v2',
          snmpSettingId: 'snmpv2-2',
          manufacturerId: 'hp',
          modelId: 'switch',
          oidIds: ['oid-1', 'oid-3', 'oid-5'],
          createdAt: Date.now() - 172800000,
          updatedAt: Date.now(),
        },
        {
          id: 'template-3',
          companyId: companyId,
          name: 'Juniper Secure Template',
          description: 'Secure monitoring for Juniper devices',
          version: 'v3',
          snmpSettingId: 'snmpv3-2',
          manufacturerId: 'juniper',
          modelId: 'router',
          oidIds: ['oid-1', 'oid-2', 'oid-3', 'oid-4', 'oid-5'],
          createdAt: Date.now() - 259200000,
          updatedAt: Date.now(),
        },
      ]

      // Mock SNMPv2 settings
      const mockSnmpv2Settings = [
        {
          id: 'snmpv2-1',
          companyId: companyId,
          name: 'Public Read Only',
          readCommunity: 'public',
          writeCommunity: '',
          port: 161,
        },
        {
          id: 'snmpv2-2',
          companyId: companyId,
          name: 'Private Read/Write',
          readCommunity: 'private',
          writeCommunity: 'private',
          port: 161,
        },
      ]

      // Mock SNMPv3 settings
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
        },
      ]

      // Mock OIDs
      const mockOids = [
        {
          id: 'oid-1',
          companyId: companyId,
          name: 'System Description',
          oid: '1.3.6.1.2.1.1.1.0',
          dataType: 'String',
          category: 'System',
        },
        {
          id: 'oid-2',
          companyId: companyId,
          name: 'System Uptime',
          oid: '1.3.6.1.2.1.1.3.0',
          dataType: 'TimeTicks',
          category: 'System',
        },
        {
          id: 'oid-3',
          companyId: companyId,
          name: 'Interface Speed',
          oid: '1.3.6.1.2.1.2.2.1.5',
          dataType: 'Gauge32',
          category: 'Interface',
        },
        {
          id: 'oid-4',
          companyId: companyId,
          name: 'CPU Load',
          oid: '1.3.6.1.4.1.9.2.1.58.0',
          dataType: 'Integer',
          category: 'Performance',
        },
        {
          id: 'oid-5',
          companyId: companyId,
          name: 'Memory Used',
          oid: '1.3.6.1.4.1.9.9.48.1.1.1.5.1',
          dataType: 'Gauge32',
          category: 'Performance',
        },
      ]

      // Mock manufacturers
      const mockManufacturers = [
        { id: 'cisco', name: 'Cisco Systems' },
        { id: 'hp', name: 'Hewlett Packard' },
        { id: 'juniper', name: 'Juniper Networks' },
        { id: 'arista', name: 'Arista Networks' },
        { id: 'dell', name: 'Dell' },
      ]

      // Mock models
      const mockModels = [
        { id: 'router', name: 'Router' },
        { id: 'switch', name: 'Switch' },
        { id: 'firewall', name: 'Firewall' },
        { id: 'accesspoint', name: 'Access Point' },
        { id: 'server', name: 'Server' },
      ]

      setTemplates(mockTemplates)
      setSnmpv2Settings(mockSnmpv2Settings)
      setSnmpv3Settings(mockSnmpv3Settings)
      setOids(mockOids)
      setManufacturers(mockManufacturers)
      setModels(mockModels)
    } catch (err) {
      console.error('Error fetching SNMP templates data:', err)
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

    // Reset SNMP settings if version changes
    if (name === 'version') {
      setFormData(prev => ({
        ...prev,
        snmpSettingId: '',
      }))
    }
  }

  // Handle OID selection changes
  const handleOidChange = oidId => {
    setFormData(prev => {
      const newOidIds = prev.oidIds.includes(oidId)
        ? prev.oidIds.filter(id => id !== oidId) // Remove if already exists
        : [...prev.oidIds, oidId] // Add if doesn't exist

      return {
        ...prev,
        oidIds: newOidIds,
      }
    })
  }

  // Handle form submission for creating/updating templates
  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      if (editMode && selectedTemplate) {
        // Update existing template
        setTemplates(prev =>
          prev.map(template =>
            template.id === selectedTemplate.id
              ? {
                  ...template,
                  name: formData.name,
                  description: formData.description,
                  version: formData.version,
                  snmpSettingId: formData.snmpSettingId,
                  manufacturerId: formData.manufacturerId,
                  modelId: formData.modelId,
                  oidIds: formData.oidIds,
                  updatedAt: Date.now(),
                }
              : template
          )
        )
      } else {
        // Create new template
        const newId = `template-${Date.now()}`
        const newTemplate = {
          id: newId,
          companyId,
          name: formData.name,
          description: formData.description,
          version: formData.version,
          snmpSettingId: formData.snmpSettingId,
          manufacturerId: formData.manufacturerId,
          modelId: formData.modelId,
          oidIds: formData.oidIds,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        setTemplates(prev => [...prev, newTemplate])
      }

      // Reset form
      resetForm()
    } catch (err) {
      console.error('Error saving SNMP template:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setLoading(false)
      setEditMode(false)
      setSelectedTemplate(null)
    }
  }

  // Handle row selection
  const handleSelectTemplate = template => {
    setSelectedTemplate(template)
    setEditMode(true)
    setActiveTab(template.version)

    setFormData({
      name: template.name,
      description: template.description,
      version: template.version,
      snmpSettingId: template.snmpSettingId,
      manufacturerId: template.manufacturerId,
      modelId: template.modelId,
      oidIds: template.oidIds,
    })
  }

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      version: activeTab,
      snmpSettingId: '',
      manufacturerId: '',
      modelId: '',
      oidIds: [],
    })
    setEditMode(false)
    setSelectedTemplate(null)
  }

  // Handle delete template
  const handleDeleteTemplate = templateId => {
    setTemplates(prev => prev.filter(template => template.id !== templateId))

    if (selectedTemplate && selectedTemplate.id === templateId) {
      resetForm()
    }
  }

  // Filter templates based on search term and active tab
  const filteredTemplates = templates.filter(
    template =>
      (activeTab === 'all' || template.version === activeTab) &&
      (template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        manufacturers
          .find(m => m.id === template.manufacturerId)
          ?.name.toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        models
          .find(m => m.id === template.modelId)
          ?.name.toLowerCase()
          .includes(searchTerm.toLowerCase()))
  )

  return {
    loading,
    error,
    templates: filteredTemplates,
    snmpv2Settings,
    snmpv3Settings,
    oids,
    manufacturers,
    models,
    activeTab,
    setActiveTab,
    selectedTemplate,
    editMode,
    searchTerm,
    setSearchTerm,
    formData,
    handleInputChange,
    handleOidChange,
    handleSubmit,
    handleSelectTemplate,
    handleDeleteTemplate,
    resetForm,
    refreshData,
  }
}

/**
 * Main SNMP Templates Management component
 */
const SNMPTemplates = () => {
  // Use our custom hook to fetch and manage data
  const {
    loading,
    error,
    templates,
    snmpv2Settings,
    snmpv3Settings,
    oids,
    manufacturers,
    models,
    activeTab,
    setActiveTab,
    selectedTemplate,
    editMode,
    searchTerm,
    setSearchTerm,
    formData,
    handleInputChange,
    handleOidChange,
    handleSubmit,
    handleSelectTemplate,
    handleDeleteTemplate,
    resetForm,
    refreshData,
  } = useSNMPTemplatesData()

  // Render loading state
  if (loading && !templates.length) {
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
        h('p', { style: { margin: '0' } }, 'Loading SNMP templates...')
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
      'SNMP Templates Management'
    ),
    h(
      'p',
      { style: { marginBottom: '24px', color: '#666' } },
      'Manage SNMP monitoring templates for network devices'
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

    // Tabs for SNMPv2, SNMPv3, and All templates
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
              setActiveTab('all')
              if (!editMode) resetForm()
            },
            style: {
              padding: '12px 24px',
              border: 'none',
              borderBottom: activeTab === 'all' ? '2px solid #1976d2' : 'none',
              backgroundColor: activeTab === 'all' ? '#e3f2fd' : 'transparent',
              color: activeTab === 'all' ? '#1976d2' : '#666',
              cursor: 'pointer',
              fontWeight: activeTab === 'all' ? 'bold' : 'normal',
              marginRight: '8px',
              borderTopLeftRadius: '8px',
              borderTopRightRadius: '8px',
            },
          },
          'All Templates'
        ),
        h(
          'button',
          {
            onClick: () => {
              setActiveTab('v2')
              if (!editMode) {
                resetForm()
                setFormData(prev => ({ ...prev, version: 'v2' }))
              }
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
          'SNMPv2 Templates'
        ),
        h(
          'button',
          {
            onClick: () => {
              setActiveTab('v3')
              if (!editMode) {
                resetForm()
                setFormData(prev => ({ ...prev, version: 'v3' }))
              }
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
          'SNMPv3 Templates'
        )
      ),
      h(
        'div',
        {
          style: {
            padding: '16px 0',
            display: 'flex',
            justifyContent: 'flex-end',
          },
        },
        h('input', {
          type: 'text',
          placeholder: 'Search templates...',
          value: searchTerm,
          onChange: e => setSearchTerm(e.target.value),
          style: {
            width: '300px',
            padding: '8px 12px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '14px',
          },
        })
      )
    ),

    // Main content area - Templates table and form
    h(
      'div',
      {
        style: {
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '24px',
        },
      },
      // Left column - Templates table
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
              activeTab === 'all'
                ? 'All SNMP Templates'
                : `${activeTab === 'v2' ? 'SNMPv2' : 'SNMPv3'} Templates`
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
                    'Manufacturer'
                  ),
                  activeTab === 'all' &&
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
                      'Version'
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
                templates.length === 0
                  ? h(
                      'tr',
                      null,
                      h(
                        'td',
                        {
                          colSpan: activeTab === 'all' ? 4 : 3,
                          style: {
                            padding: '24px',
                            textAlign: 'center',
                            color: '#666',
                            fontStyle: 'italic',
                          },
                        },
                        searchTerm
                          ? 'No templates match your search criteria'
                          : `No ${activeTab === 'all' ? '' : activeTab + ' '}SNMP templates available`
                      )
                    )
                  : templates.map(template => {
                      const manufacturer = manufacturers.find(
                        m => m.id === template.manufacturerId
                      )

                      return h(
                        'tr',
                        {
                          key: template.id,
                          onClick: () => handleSelectTemplate(template),
                          style: {
                            cursor: 'pointer',
                            backgroundColor:
                              selectedTemplate?.id === template.id
                                ? '#e3f2fd'
                                : 'transparent',
                            borderBottom: '1px solid #eee',
                          },
                          onMouseOver: e => {
                            if (selectedTemplate?.id !== template.id) {
                              e.target.closest('tr').style.backgroundColor =
                                '#f5f5f5'
                            }
                          },
                          onMouseOut: e => {
                            if (selectedTemplate?.id !== template.id) {
                              e.target.closest('tr').style.backgroundColor =
                                'transparent'
                            }
                          },
                        },
                        h('td', { style: { padding: '12px' } }, template.name),
                        h(
                          'td',
                          { style: { padding: '12px' } },
                          manufacturer ? manufacturer.name : 'Unknown'
                        ),
                        activeTab === 'all' &&
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
                                  backgroundColor:
                                    template.version === 'v2'
                                      ? '#1976d2'
                                      : '#7b1fa2',
                                  color: 'white',
                                },
                              },
                              template.version === 'v2' ? 'SNMPv2' : 'SNMPv3'
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
                                handleDeleteTemplate(template.id)
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
        ),
        // Template Details when selected
        selectedTemplate &&
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
              'h3',
              { style: { margin: '0 0 16px 0', color: '#333' } },
              'Template Details'
            ),
            h(
              'div',
              {
                style: {
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '16px',
                },
              },
              h(
                'div',
                null,
                h(
                  'p',
                  { style: { margin: '0 0 8px 0' } },
                  h('strong', null, 'Name: '),
                  selectedTemplate.name
                ),
                h(
                  'p',
                  { style: { margin: '0 0 8px 0' } },
                  h('strong', null, 'Version: '),
                  h(
                    'span',
                    {
                      style: {
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        backgroundColor:
                          selectedTemplate.version === 'v2'
                            ? '#1976d2'
                            : '#7b1fa2',
                        color: 'white',
                      },
                    },
                    selectedTemplate.version === 'v2' ? 'SNMPv2' : 'SNMPv3'
                  )
                ),
                h(
                  'p',
                  { style: { margin: '0 0 8px 0' } },
                  h('strong', null, 'Manufacturer: '),
                  manufacturers.find(
                    m => m.id === selectedTemplate.manufacturerId
                  )?.name || 'Unknown'
                ),
                h(
                  'p',
                  { style: { margin: '0 0 8px 0' } },
                  h('strong', null, 'Model: '),
                  models.find(m => m.id === selectedTemplate.modelId)?.name ||
                    'Unknown'
                )
              ),
              h(
                'div',
                null,
                h(
                  'p',
                  { style: { margin: '0 0 8px 0' } },
                  h('strong', null, 'SNMP Setting: '),
                  selectedTemplate.version === 'v2'
                    ? snmpv2Settings.find(
                        s => s.id === selectedTemplate.snmpSettingId
                      )?.name || 'Unknown'
                    : snmpv3Settings.find(
                        s => s.id === selectedTemplate.snmpSettingId
                      )?.name || 'Unknown'
                ),
                h(
                  'p',
                  { style: { margin: '0 0 8px 0' } },
                  h('strong', null, 'OIDs Count: '),
                  selectedTemplate.oidIds.length
                ),
                h(
                  'p',
                  { style: { margin: '0 0 8px 0' } },
                  h('strong', null, 'Created: '),
                  new Date(selectedTemplate.createdAt).toLocaleString()
                )
              )
            ),
            h(
              'div',
              { style: { marginTop: '16px' } },
              h(
                'p',
                { style: { margin: '0 0 8px 0' } },
                h('strong', null, 'Description: ')
              ),
              h(
                'p',
                {
                  style: {
                    margin: '0 0 16px 0',
                    fontSize: '14px',
                    lineHeight: '1.5',
                  },
                },
                selectedTemplate.description || 'No description available'
              ),
              h(
                'p',
                { style: { margin: '0 0 8px 0' } },
                h('strong', null, 'Monitored OIDs: ')
              ),
              h(
                'ul',
                { style: { margin: '0', paddingLeft: '20px' } },
                selectedTemplate.oidIds.map(oidId => {
                  const oid = oids.find(o => o.id === oidId)
                  return h(
                    'li',
                    {
                      key: oidId,
                      style: {
                        margin: '0 0 4px 0',
                        fontSize: '14px',
                      },
                    },
                    oid ? `${oid.name} (${oid.oid})` : 'Unknown OID'
                  )
                })
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
              ? `Edit ${formData.version === 'v2' ? 'SNMPv2' : 'SNMPv3'} Template`
              : `Add New ${formData.version === 'v2' ? 'SNMPv2' : 'SNMPv3'} Template`
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
                'Template Name *'
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
                rows: 3,
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
            // Version field (disabled in edit mode)
            h(
              'div',
              { style: { marginBottom: '16px' } },
              h(
                'label',
                {
                  htmlFor: 'version',
                  style: {
                    display: 'block',
                    marginBottom: '8px',
                    color: '#333',
                    fontWeight: 'bold',
                  },
                },
                'SNMP Version *'
              ),
              h(
                'select',
                {
                  id: 'version',
                  name: 'version',
                  value: formData.version,
                  onChange: handleInputChange,
                  disabled: editMode,
                  required: true,
                  style: {
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                    backgroundColor: editMode ? '#f5f5f5' : 'white',
                  },
                },
                h('option', { value: 'v2' }, 'SNMPv2'),
                h('option', { value: 'v3' }, 'SNMPv3')
              )
            ),
            // SNMP Setting field
            h(
              'div',
              { style: { marginBottom: '16px' } },
              h(
                'label',
                {
                  htmlFor: 'snmpSettingId',
                  style: {
                    display: 'block',
                    marginBottom: '8px',
                    color: '#333',
                    fontWeight: 'bold',
                  },
                },
                'SNMP Setting *'
              ),
              h(
                'select',
                {
                  id: 'snmpSettingId',
                  name: 'snmpSettingId',
                  value: formData.snmpSettingId,
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
                h('option', { value: '' }, '-- Select SNMP Setting --'),
                (formData.version === 'v2'
                  ? snmpv2Settings
                  : snmpv3Settings
                ).map(setting =>
                  h(
                    'option',
                    { key: setting.id, value: setting.id },
                    setting.name
                  )
                )
              )
            ),
            // Manufacturer field
            h(
              'div',
              { style: { marginBottom: '16px' } },
              h(
                'label',
                {
                  htmlFor: 'manufacturerId',
                  style: {
                    display: 'block',
                    marginBottom: '8px',
                    color: '#333',
                    fontWeight: 'bold',
                  },
                },
                'Manufacturer *'
              ),
              h(
                'select',
                {
                  id: 'manufacturerId',
                  name: 'manufacturerId',
                  value: formData.manufacturerId,
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
                h('option', { value: '' }, '-- Select Manufacturer --'),
                manufacturers.map(manufacturer =>
                  h(
                    'option',
                    { key: manufacturer.id, value: manufacturer.id },
                    manufacturer.name
                  )
                )
              )
            ),
            // Model field
            h(
              'div',
              { style: { marginBottom: '16px' } },
              h(
                'label',
                {
                  htmlFor: 'modelId',
                  style: {
                    display: 'block',
                    marginBottom: '8px',
                    color: '#333',
                    fontWeight: 'bold',
                  },
                },
                'Device Model *'
              ),
              h(
                'select',
                {
                  id: 'modelId',
                  name: 'modelId',
                  value: formData.modelId,
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
                h('option', { value: '' }, '-- Select Model --'),
                models.map(model =>
                  h('option', { key: model.id, value: model.id }, model.name)
                )
              )
            ),
            // OIDs selection
            h(
              'div',
              { style: { marginBottom: '16px' } },
              h(
                'label',
                {
                  style: {
                    display: 'block',
                    marginBottom: '8px',
                    color: '#333',
                    fontWeight: 'bold',
                  },
                },
                'OIDs to Monitor *'
              ),
              h(
                'div',
                {
                  style: {
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    padding: '8px',
                  },
                },
                oids.length === 0
                  ? h(
                      'p',
                      {
                        style: {
                          margin: '8px',
                          color: '#666',
                          fontStyle: 'italic',
                        },
                      },
                      'No OIDs available'
                    )
                  : oids.map(oid =>
                      h(
                        'div',
                        {
                          key: oid.id,
                          style: {
                            margin: '4px 0',
                            padding: '6px',
                            backgroundColor: formData.oidIds.includes(oid.id)
                              ? '#e3f2fd'
                              : 'transparent',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          },
                          onClick: () => handleOidChange(oid.id),
                        },
                        h(
                          'label',
                          {
                            style: {
                              display: 'flex',
                              alignItems: 'center',
                              cursor: 'pointer',
                            },
                          },
                          h('input', {
                            type: 'checkbox',
                            checked: formData.oidIds.includes(oid.id),
                            onChange: () => handleOidChange(oid.id),
                            style: { marginRight: '8px' },
                          }),
                          h(
                            'span',
                            null,
                            h('strong', null, oid.name),
                            h('br'),
                            h(
                              'span',
                              {
                                style: {
                                  fontSize: '12px',
                                  fontFamily: 'monospace',
                                },
                              },
                              oid.oid
                            ),
                            h(
                              'span',
                              {
                                style: {
                                  fontSize: '12px',
                                  marginLeft: '8px',
                                  color: '#666',
                                },
                              },
                              `(${oid.category})`
                            )
                          )
                        )
                      )
                    )
              ),
              formData.oidIds.length === 0 &&
                h(
                  'p',
                  {
                    style: {
                      color: '#f44336',
                      fontSize: '12px',
                      margin: '4px 0 0 0',
                    },
                  },
                  'At least one OID must be selected'
                )
            ),

            // Form buttons
            h(
              'div',
              { style: { display: 'flex', gap: '8px', marginTop: '24px' } },
              h(
                'button',
                {
                  type: 'submit',
                  disabled: formData.oidIds.length === 0,
                  style: {
                    padding: '10px 16px',
                    backgroundColor:
                      formData.oidIds.length === 0 ? '#cccccc' : '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor:
                      formData.oidIds.length === 0 ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                  },
                },
                loading
                  ? 'Saving...'
                  : (editMode ? 'Update' : 'Add') + ' Template'
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
  root.render(h(StrictMode, null, h(SNMPTemplates)))
} else {
  console.error('Root element not found!')
}
