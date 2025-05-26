/**
 * WHOIS Lookup Tool for the Network-Proxy application
 */

// Using React CDN imports - these will be loaded from the HTML file
const { createElement: h, StrictMode, useState, useEffect } = React
const { createRoot } = ReactDOM

/**
 * Main WHOIS Lookup Tool component
 */
const WHOISLookupTool = () => {
  const [domain, setDomain] = useState('')
  const [isLooking, setIsLooking] = useState(false)
  const [whoisResults, setWhoisResults] = useState(null)

  const handleLookup = async () => {
    console.log('=== FRONTEND WHOIS LOOKUP START ===')

    if (!domain.trim()) {
      alert('Please enter a domain name or IP address')
      return
    }

    console.log('WHOIS lookup parameters:', { domain: domain.trim() })
    setIsLooking(true)
    setWhoisResults(null)

    try {
      const response = await fetch('/api/whois-lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: domain.trim(),
        }),
      })

      console.log('WHOIS lookup response status:', response.status)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'WHOIS lookup request failed')
      }

      const data = await response.json()
      console.log('Received WHOIS data:', data)
      setWhoisResults(data)
    } catch (error) {
      console.error('WHOIS lookup error:', error)
      alert(`WHOIS lookup failed: ${error.message}`)
    } finally {
      setIsLooking(false)
    }
  }

  const parseWhoisData = rawData => {
    if (!rawData) return {}

    const lines = rawData.split('\n')
    const parsed = {}

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('%') || trimmed.startsWith('#'))
        continue

      const colonIndex = trimmed.indexOf(':')
      if (colonIndex > 0) {
        const key = trimmed.substring(0, colonIndex).trim()
        const value = trimmed.substring(colonIndex + 1).trim()
        if (value) {
          if (parsed[key]) {
            if (Array.isArray(parsed[key])) {
              parsed[key].push(value)
            } else {
              parsed[key] = [parsed[key], value]
            }
          } else {
            parsed[key] = value
          }
        }
      }
    }

    return parsed
  }

  const formatValue = value => {
    if (Array.isArray(value)) {
      return value.join(', ')
    }
    return value
  }

  const importantFields = [
    'Domain Name',
    'Registry Domain ID',
    'Registrar',
    'Registrar WHOIS Server',
    'Registrar URL',
    'Updated Date',
    'Creation Date',
    'Registry Expiry Date',
    'Registrant Name',
    'Registrant Organization',
    'Registrant Country',
    'Admin Name',
    'Admin Organization',
    'Admin Email',
    'Tech Name',
    'Tech Organization',
    'Tech Email',
    'Name Server',
  ]

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
      h('span', { style: { color: '#333' } }, 'WHOIS Lookup')
    ),

    h(
      'h1',
      { style: { marginBottom: '8px', color: '#333' } },
      'Tools - WHOIS Lookup'
    ),
    h(
      'p',
      { style: { marginBottom: '24px', color: '#666' } },
      'Retrieve domain registration and ownership information'
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
        'Domain Name or IP Address'
      ),
      h('input', {
        type: 'text',
        value: domain,
        onChange: e => setDomain(e.target.value),
        placeholder: 'example.com or 8.8.8.8',
        style: {
          width: '100%',
          padding: '8px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          marginBottom: '16px',
        },
      }),
      h(
        'button',
        {
          onClick: handleLookup,
          disabled: isLooking || !domain.trim(),
          style: {
            padding: '8px 16px',
            backgroundColor: isLooking || !domain.trim() ? '#ccc' : '#4caf50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isLooking || !domain.trim() ? 'not-allowed' : 'pointer',
          },
        },
        isLooking ? '⏳ Looking up...' : '🔍 Lookup'
      )
    ),

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
        'WHOIS Results'
      ),
      !whoisResults
        ? h(
            'p',
            { style: { color: '#666', fontStyle: 'italic' } },
            isLooking
              ? 'Looking up WHOIS information...'
              : 'No WHOIS lookup performed yet'
          )
        : h(
            'div',
            null,
            h(
              'div',
              { style: { marginBottom: '16px' } },
              h(
                'p',
                { style: { margin: '0 0 8px 0', fontWeight: 'bold' } },
                `Query: ${whoisResults.query}`
              ),
              h(
                'p',
                { style: { margin: '0 0 8px 0' } },
                `Status: ${whoisResults.status}`
              ),
              whoisResults.server &&
                h(
                  'p',
                  { style: { margin: '0' } },
                  `WHOIS Server: ${whoisResults.server}`
                )
            ),
            whoisResults.error
              ? h(
                  'div',
                  {
                    style: {
                      backgroundColor: '#ffebee',
                      color: '#c62828',
                      padding: '16px',
                      borderRadius: '4px',
                    },
                  },
                  `Error: ${whoisResults.error}`
                )
              : whoisResults.data &&
                  h(
                    'div',
                    null,
                    // Parsed important fields
                    (() => {
                      const parsed = parseWhoisData(whoisResults.data)
                      const hasImportantFields = importantFields.some(
                        field => parsed[field]
                      )

                      return (
                        hasImportantFields &&
                        h(
                          'div',
                          { style: { marginBottom: '24px' } },
                          h(
                            'h3',
                            { style: { marginBottom: '16px', color: '#333' } },
                            'Key Information'
                          ),
                          h(
                            'div',
                            {
                              style: {
                                fontFamily: 'monospace',
                                backgroundColor: '#f5f5f5',
                                padding: '16px',
                                borderRadius: '4px',
                                maxHeight: '300px',
                                overflowY: 'auto',
                              },
                            },
                            h(
                              'div',
                              {
                                style: {
                                  display: 'grid',
                                  gridTemplateColumns: '200px 1fr',
                                  gap: '8px',
                                  marginBottom: '8px',
                                  fontWeight: 'bold',
                                  borderBottom: '1px solid #ddd',
                                  paddingBottom: '8px',
                                },
                              },
                              h('div', null, 'Field'),
                              h('div', null, 'Value')
                            ),
                            ...importantFields
                              .filter(field => parsed[field])
                              .map(field =>
                                h(
                                  'div',
                                  {
                                    key: field,
                                    style: {
                                      display: 'grid',
                                      gridTemplateColumns: '200px 1fr',
                                      gap: '8px',
                                      marginBottom: '4px',
                                      padding: '4px 0',
                                      borderBottom: '1px solid #eee',
                                    },
                                  },
                                  h(
                                    'div',
                                    {
                                      style: {
                                        fontWeight: 'bold',
                                        fontSize: '12px',
                                      },
                                    },
                                    field
                                  ),
                                  h(
                                    'div',
                                    { style: { wordBreak: 'break-all' } },
                                    formatValue(parsed[field])
                                  )
                                )
                              )
                          )
                        )
                      )
                    })(),

                    // Raw WHOIS data
                    h(
                      'div',
                      null,
                      h(
                        'h3',
                        { style: { marginBottom: '16px', color: '#333' } },
                        'Raw WHOIS Data'
                      ),
                      h(
                        'div',
                        {
                          style: {
                            fontFamily: 'monospace',
                            backgroundColor: '#f5f5f5',
                            padding: '16px',
                            borderRadius: '4px',
                            maxHeight: '400px',
                            overflowY: 'auto',
                            whiteSpace: 'pre-wrap',
                            fontSize: '12px',
                            lineHeight: '1.4',
                          },
                        },
                        whoisResults.data
                      )
                    )
                  )
          )
    )
  )
}

/**
 * Initialize the React application
 */
const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(h(StrictMode, null, h(WHOISLookupTool)))
} else {
  console.error('Root element not found!')
}
