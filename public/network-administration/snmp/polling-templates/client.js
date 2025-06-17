/**
 * SNMP Polling Templates Management for the Network-Proxy application
 * Handles the configuration of SNMP polling frequency, retries, and timeouts
 */

// Using React CDN imports - these will be loaded from the HTML file
const { createElement: h, StrictMode, useState, useEffect, Fragment } = React
const { createRoot } = ReactDOM

/**
 * Hook to fetch and manage SNMP polling templates data
 */
function useSNMPPollingTemplatesData(companyId = 'default-company-id') {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pollingTemplates, setPollingTemplates] = useState([])
  const [snmpTemplates, setSnmpTemplates] = useState([])
  const [activeTab, setActiveTab] = useState('v2')
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    version: 'v2',
    frequency: 300,
    timeout: 5,
    retries: 3,
    downTrigger: 3,
    snmpTemplateIds: [],
  })

  // Function to refresh data
  const refreshData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Mock polling templates data
      const mockPollingTemplates = [
        {
          id: 'polling-1',
          companyId: companyId,
          name: 'Standard Polling',
          description: 'Default polling template with 5-minute interval',
          version: 'v2',
          frequency: 300, // 5 minutes in seconds
          timeout: 5,
          retries: 3,
          downTrigger: 3,
          snmpTemplateIds: ['template-1', 'template-2'],
          createdAt: Date.now() - 86400000,
          updatedAt: Date.now(),
        },
        {
          id: 'polling-2',
          companyId: companyId,
          name: 'High Frequency',
          description: 'Fast polling for critical devices (1-minute interval)',
          version: 'v2',
          frequency: 60, // 1 minute in seconds
          timeout: 2,
          retries: 2,
          downTrigger: 2,
          snmpTemplateIds: ['template-2'],
          createdAt: Date.now() - 172800000,
          updatedAt: Date.now(),
        },
        {
          id: 'polling-3',
          companyId: companyId,
          name: 'Secure Polling',
          description: 'SNMPv3 secure polling for sensitive devices',
          version: 'v3',
          frequency: 900, // 15 minutes in seconds
          timeout: 10,
          retries: 3,
          downTrigger: 2,
          snmpTemplateIds: ['template-3'],
          createdAt: Date.now() - 259200000,
          updatedAt: Date.now(),
        },
      ]

      // Mock SNMP templates
      const mockSnmpTemplates = [
        {
          id: 'template-1',
          companyId: companyId,
          name: 'Cisco Router Template',
          description: 'Standard template for Cisco routers',
          version: 'v2',
        },
        {
          id: 'template-2',
          companyId: companyId,
          name: 'HP Switch Template',
          description: 'Enhanced monitoring for HP switches',
          version: 'v2',
        },
        {
          id: 'template-3',
          companyId: companyId,
          name: 'Juniper Secure Template',
          description: 'Secure monitoring for Juniper devices',
          version: 'v3',
        },
      ]

      setPollingTemplates(mockPollingTemplates)
      setSnmpTemplates(mockSnmpTemplates)
    } catch (err) {
      console.error('Error fetching SNMP polling templates data:', err)
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
      [name]:
        name === 'frequency' ||
        name === 'timeout' ||
        name === 'retries' ||
        name === 'downTrigger'
          ? parseInt(value, 10)
          : value,
    }))

    // Reset SNMP templates selection if version changes
    if (name === 'version') {
      setFormData(prev => ({
        ...prev,
        snmpTemplateIds: [],
      }))
    }
  }

  // Handle SNMP template selection changes
  const handleTemplateChange = templateId => {
    setFormData(prev => {
      const newTemplateIds = prev.snmpTemplateIds.includes(templateId)
        ? prev.snmpTemplateIds.filter(id => id !== templateId) // Remove if already exists
        : [...prev.snmpTemplateIds, templateId] // Add if doesn't exist

      return {
        ...prev,
        snmpTemplateIds: newTemplateIds,
      }
    })
  }

  // Handle form submission for creating/updating polling templates
  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      if (editMode && selectedTemplate) {
        // Update existing polling template
        setPollingTemplates(prev =>
          prev.map(template =>
            template.id === selectedTemplate.id
              ? {
                  ...template,
                  name: formData.name,
                  description: formData.description,
                  version: formData.version,
                  frequency: formData.frequency,
                  timeout: formData.timeout,
                  retries: formData.retries,
                  downTrigger: formData.downTrigger,
                  snmpTemplateIds: formData.snmpTemplateIds,
                  updatedAt: Date.now(),
                }
              : template
          )
        )
      } else {
        // Create new polling template
        const newId = `polling-${Date.now()}`
        const newTemplate = {
          id: newId,
          companyId,
          name: formData.name,
          description: formData.description,
          version: formData.version,
          frequency: formData.frequency,
          timeout: formData.timeout,
          retries: formData.retries,
          downTrigger: formData.downTrigger,
          snmpTemplateIds: formData.snmpTemplateIds,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        setPollingTemplates(prev => [...prev, newTemplate])
      }

      // Reset form
      resetForm()
    } catch (err) {
      console.error('Error saving SNMP polling template:', err)
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
      frequency: template.frequency,
      timeout: template.timeout,
      retries: template.retries,
      downTrigger: template.downTrigger,
      snmpTemplateIds: template.snmpTemplateIds,
    })
  }

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      version: activeTab,
      frequency: 300,
      timeout: 5,
      retries: 3,
      downTrigger: 3,
      snmpTemplateIds: [],
    })
    setEditMode(false)
    setSelectedTemplate(null)
  }

  // Handle delete polling template
  const handleDeleteTemplate = templateId => {
    setPollingTemplates(prev =>
      prev.filter(template => template.id !== templateId)
    )

    if (selectedTemplate && selectedTemplate.id === templateId) {
      resetForm()
    }
  }

  // Filter polling templates based on search term and active tab
  const filteredPollingTemplates = pollingTemplates.filter(
    template =>
      (activeTab === 'all' || template.version === activeTab) &&
      (template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.description.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  // Filter SNMP templates based on the active tab/version
  const filteredSnmpTemplates = snmpTemplates.filter(
    template =>
      activeTab === 'all' ||
      template.version === activeTab ||
      template.version === formData.version
  )

  return {
    loading,
    error,
    pollingTemplates: filteredPollingTemplates,
    snmpTemplates: filteredSnmpTemplates,
    activeTab,
    setActiveTab,
    selectedTemplate,
    editMode,
    searchTerm,
    setSearchTerm,
    formData,
    handleInputChange,
    handleTemplateChange,
    handleSubmit,
    handleSelectTemplate,
    handleDeleteTemplate,
    resetForm,
    refreshData,
  }
}

/**
 * Format seconds into a human-readable duration
 */
function formatDuration(seconds) {
  if (seconds === undefined || seconds === null) return '0 seconds'

  if (seconds === 60) return '1 minute'
  if (seconds === 300) return '5 minutes'
  if (seconds === 900) return '15 minutes'
  if (seconds === 1800) return '30 minutes'
  if (seconds === 3600) return '1 hour'
  if (seconds === 7200) return '2 hours'
  if (seconds === 14400) return '4 hours'
  if (seconds === 28800) return '8 hours'
  if (seconds === 86400) return '1 day'

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
 * Main SNMP Polling Templates Management component
 */
const SNMPPollingTemplates = () => {
  // Use our custom hook to fetch and manage data
  const {
    loading,
    error,
    pollingTemplates,
    snmpTemplates,
    activeTab,
    setActiveTab,
    selectedTemplate,
    editMode,
    searchTerm,
    setSearchTerm,
    formData,
    handleInputChange,
    handleTemplateChange,
    handleSubmit,
    handleSelectTemplate,
    handleDeleteTemplate,
    resetForm,
    refreshData,
  } = useSNMPPollingTemplatesData()

  // Render loading state
  if (loading && !pollingTemplates.length) {
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
        h('p', { style: { margin: '0' } }, 'Loading SNMP polling templates...')
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
      'SNMP Polling Templates'
    ),
    h(
      'p',
      { style: { marginBottom: '24px', color: '#666' } },
      'Configure SNMP polling frequency, timeouts, and retries for network monitoring'
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
          placeholder: 'Search polling templates...',
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

    // Main content area - Polling templates table and form
    h(
      'div',
      {
        style: {
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '24px',
        },
      },
      // Left column - Polling templates table
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
                ? 'All SNMP Polling Templates'
                : `${activeTab === 'v2' ? 'SNMPv2' : 'SNMPv3'} Polling Templates`
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
                    'Frequency'
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
                pollingTemplates.length === 0
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
                          ? 'No polling templates match your search criteria'
                          : `No ${activeTab === 'all' ? '' : activeTab + ' '}SNMP polling templates available`
                      )
                    )
                  : pollingTemplates.map(template => {
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
                          formatDuration(template.frequency)
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
              'Polling Template Details'
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
                  h('strong', null, 'Frequency: '),
                  formatDuration(selectedTemplate.frequency)
                )
              ),
              h(
                'div',
                null,
                h(
                  'p',
                  { style: { margin: '0 0 8px 0' } },
                  h('strong', null, 'Timeout: '),
                  `${selectedTemplate.timeout} seconds`
                ),
                h(
                  'p',
                  { style: { margin: '0 0 8px 0' } },
                  h('strong', null, 'Retries: '),
                  selectedTemplate.retries
                ),
                h(
                  'p',
                  { style: { margin: '0 0 8px 0' } },
                  h('strong', null, 'Down Trigger: '),
                  `${selectedTemplate.downTrigger} failed attempts`
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
                h('strong', null, 'Associated SNMP Templates: ')
              ),
              selectedTemplate.snmpTemplateIds.length === 0
                ? h(
                    'p',
                    {
                      style: {
                        margin: '0',
                        fontStyle: 'italic',
                        color: '#666',
                        fontSize: '14px',
                      },
                    },
                    'No SNMP templates associated'
                  )
                : h(
                    'ul',
                    { style: { margin: '0', paddingLeft: '20px' } },
                    selectedTemplate.snmpTemplateIds.map(templateId => {
                      const snmpTemplate = snmpTemplates.find(
                        t => t.id === templateId
                      )
                      return h(
                        'li',
                        {
                          key: templateId,
                          style: {
                            margin: '0 0 4px 0',
                            fontSize: '14px',
                          },
                        },
                        snmpTemplate ? snmpTemplate.name : 'Unknown template'
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
              ? `Edit ${formData.version === 'v2' ? 'SNMPv2' : 'SNMPv3'} Polling Template`
              : `Add New ${formData.version === 'v2' ? 'SNMPv2' : 'SNMPv3'} Polling Template`
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
                rows: 2,
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
            // Frequency field
            h(
              'div',
              { style: { marginBottom: '16px' } },
              h(
                'label',
                {
                  htmlFor: 'frequency',
                  style: {
                    display: 'block',
                    marginBottom: '8px',
                    color: '#333',
                    fontWeight: 'bold',
                  },
                },
                'Polling Frequency *'
              ),
              h(
                'select',
                {
                  id: 'frequency',
                  name: 'frequency',
                  value: formData.frequency,
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
                h('option', { value: 60 }, '1 minute'),
                h('option', { value: 300 }, '5 minutes'),
                h('option', { value: 900 }, '15 minutes'),
                h('option', { value: 1800 }, '30 minutes'),
                h('option', { value: 3600 }, '1 hour'),
                h('option', { value: 7200 }, '2 hours'),
                h('option', { value: 14400 }, '4 hours'),
                h('option', { value: 28800 }, '8 hours'),
                h('option', { value: 86400 }, '1 day')
              )
            ),
            // Timeout field
            h(
              'div',
              { style: { marginBottom: '16px' } },
              h(
                'label',
                {
                  htmlFor: 'timeout',
                  style: {
                    display: 'block',
                    marginBottom: '8px',
                    color: '#333',
                    fontWeight: 'bold',
                  },
                },
                'Timeout (seconds) *'
              ),
              h(
                'select',
                {
                  id: 'timeout',
                  name: 'timeout',
                  value: formData.timeout,
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
                h('option', { value: 1 }, '1 second'),
                h('option', { value: 2 }, '2 seconds'),
                h('option', { value: 3 }, '3 seconds'),
                h('option', { value: 5 }, '5 seconds'),
                h('option', { value: 10 }, '10 seconds'),
                h('option', { value: 15 }, '15 seconds'),
                h('option', { value: 30 }, '30 seconds')
              )
            ),
            // Retries field
            h(
              'div',
              { style: { marginBottom: '16px' } },
              h(
                'label',
                {
                  htmlFor: 'retries',
                  style: {
                    display: 'block',
                    marginBottom: '8px',
                    color: '#333',
                    fontWeight: 'bold',
                  },
                },
                'Number of Retries *'
              ),
              h(
                'select',
                {
                  id: 'retries',
                  name: 'retries',
                  value: formData.retries,
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
                h('option', { value: 0 }, 'No retries'),
                h('option', { value: 1 }, '1 retry'),
                h('option', { value: 2 }, '2 retries'),
                h('option', { value: 3 }, '3 retries'),
                h('option', { value: 5 }, '5 retries')
              )
            ),
            // Down Trigger field
            h(
              'div',
              { style: { marginBottom: '16px' } },
              h(
                'label',
                {
                  htmlFor: 'downTrigger',
                  style: {
                    display: 'block',
                    marginBottom: '8px',
                    color: '#333',
                    fontWeight: 'bold',
                  },
                },
                'Down Trigger *'
              ),
              h(
                'select',
                {
                  id: 'downTrigger',
                  name: 'downTrigger',
                  value: formData.downTrigger,
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
                h('option', { value: 1 }, 'After 1 failed attempt'),
                h('option', { value: 2 }, 'After 2 failed attempts'),
                h('option', { value: 3 }, 'After 3 failed attempts'),
                h('option', { value: 5 }, 'After 5 failed attempts')
              ),
              h(
                'p',
                {
                  style: {
                    margin: '4px 0 0 0',
                    fontSize: '12px',
                    color: '#666',
                  },
                },
                'The number of consecutive failed polls before a device is marked as down.'
              )
            ),
            // SNMP Templates selection
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
                'Associated SNMP Templates'
              ),
              h(
                'div',
                {
                  style: {
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    maxHeight: '150px',
                    overflowY: 'auto',
                    padding: '8px',
                  },
                },
                snmpTemplates.length === 0
                  ? h(
                      'p',
                      {
                        style: {
                          margin: '8px',
                          color: '#666',
                          fontStyle: 'italic',
                        },
                      },
                      'No SNMP templates available'
                    )
                  : snmpTemplates.map(template =>
                      h(
                        'div',
                        {
                          key: template.id,
                          style: {
                            margin: '4px 0',
                            padding: '6px',
                            backgroundColor: formData.snmpTemplateIds.includes(
                              template.id
                            )
                              ? '#e3f2fd'
                              : 'transparent',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          },
                          onClick: () => handleTemplateChange(template.id),
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
                            checked: formData.snmpTemplateIds.includes(
                              template.id
                            ),
                            onChange: () => handleTemplateChange(template.id),
                            style: { marginRight: '8px' },
                          }),
                          h(
                            'span',
                            null,
                            template.name,
                            h(
                              'span',
                              {
                                style: {
                                  fontSize: '12px',
                                  marginLeft: '8px',
                                  padding: '2px 6px',
                                  backgroundColor:
                                    template.version === 'v2'
                                      ? '#1976d2'
                                      : '#7b1fa2',
                                  color: 'white',
                                  borderRadius: '10px',
                                },
                              },
                              template.version.toUpperCase()
                            )
                          )
                        )
                      )
                    )
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
  root.render(h(StrictMode, null, h(SNMPPollingTemplates)))
} else {
  console.error('Root element not found!')
}
