/**
 * DNS Lookup Tool for the Network-Proxy application
 */

// Using React CDN imports - these will be loaded from the HTML file
const { createElement: h, StrictMode, useState, useEffect } = React
const { createRoot } = ReactDOM

/**
 * Main DNS Lookup Tool component
 */
const DNSLookupTool = () => {
  const [domain, setDomain] = useState('')
  const [recordType, setRecordType] = useState('A')
  const [isLooking, setIsLooking] = useState(false)
  const [dnsResults, setDnsResults] = useState(null)

  const recordTypes = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'PTR']

  const handleLookup = async () => {
    console.log('=== FRONTEND DNS LOOKUP START ===')

    if (!domain.trim()) {
      alert('Please enter a domain name')
      return
    }

    console.log('DNS lookup parameters:', { domain: domain.trim(), recordType })
    setIsLooking(true)
    setDnsResults(null)

    try {
      const response = await fetch('/api/dns-lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: domain.trim(),
          recordType: recordType,
        }),
      })

      console.log('DNS lookup response status:', response.status)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'DNS lookup request failed')
      }

      const data = await response.json()
      console.log('Received DNS data:', data)
      setDnsResults(data)
    } catch (error) {
      console.error('DNS lookup error:', error)
      alert(`DNS lookup failed: ${error.message}`)
    } finally {
      setIsLooking(false)
    }
  }

  const formatDNSRecord = record => {
    switch (record.type) {
      case 'A':
      case 'AAAA':
        return record.address
      case 'CNAME':
        return record.value
      case 'MX':
        return `${record.priority} ${record.exchange}`
      case 'NS':
        return record.value
      case 'TXT':
        return record.entries ? record.entries.join(', ') : record.value
      case 'SOA':
        return `${record.primary} ${record.admin} ${record.serial} ${record.refresh} ${record.retry} ${record.expiration} ${record.minimum}`
      case 'PTR':
        return record.value
      default:
        return JSON.stringify(record)
    }
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
      h('span', { style: { color: '#333' } }, 'DNS Lookup')
    ),

    h(
      'h1',
      { style: { marginBottom: '8px', color: '#333' } },
      'Tools - DNS Lookup'
    ),
    h(
      'p',
      { style: { marginBottom: '24px', color: '#666' } },
      'Perform DNS queries to resolve domain names and retrieve DNS records'
    ),

    h(
      'div',
      {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        },
      },
      h(
        'div',
        {
          style: {
            backgroundColor: 'white',
            padding: '16px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          },
        },
        h(
          'label',
          {
            style: {
              display: 'block',
              marginBottom: '8px',
              fontWeight: 'bold',
            },
          },
          'Domain Name'
        ),
        h('input', {
          type: 'text',
          value: domain,
          onChange: e => setDomain(e.target.value),
          placeholder: 'example.com',
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
        {
          style: {
            backgroundColor: 'white',
            padding: '16px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          },
        },
        h(
          'label',
          {
            style: {
              display: 'block',
              marginBottom: '8px',
              fontWeight: 'bold',
            },
          },
          'Record Type'
        ),
        h(
          'select',
          {
            value: recordType,
            onChange: e => setRecordType(e.target.value),
            style: {
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
            },
          },
          ...recordTypes.map(type =>
            h('option', { key: type, value: type }, type)
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
        'DNS Results'
      ),
      !dnsResults
        ? h(
            'p',
            { style: { color: '#666', fontStyle: 'italic' } },
            isLooking
              ? 'Looking up DNS records...'
              : 'No DNS lookup performed yet'
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
                `Query: ${dnsResults.query} (${dnsResults.type})`
              ),
              h(
                'p',
                { style: { margin: '0 0 8px 0' } },
                `Status: ${dnsResults.status}`
              ),
              h(
                'p',
                { style: { margin: '0' } },
                `Records found: ${dnsResults.records ? dnsResults.records.length : 0}`
              )
            ),
            dnsResults.records &&
              dnsResults.records.length > 0 &&
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
                  },
                },
                h(
                  'div',
                  {
                    style: {
                      display: 'grid',
                      gridTemplateColumns: '100px 80px 80px 1fr',
                      gap: '8px',
                      marginBottom: '8px',
                      fontWeight: 'bold',
                      borderBottom: '1px solid #ddd',
                      paddingBottom: '8px',
                    },
                  },
                  h('div', null, 'Name'),
                  h('div', null, 'Type'),
                  h('div', null, 'TTL'),
                  h('div', null, 'Value')
                ),
                ...dnsResults.records.map((record, index) =>
                  h(
                    'div',
                    {
                      key: index,
                      style: {
                        display: 'grid',
                        gridTemplateColumns: '100px 80px 80px 1fr',
                        gap: '8px',
                        marginBottom: '4px',
                        padding: '4px 0',
                        borderBottom: '1px solid #eee',
                      },
                    },
                    h(
                      'div',
                      { style: { fontSize: '12px', wordBreak: 'break-all' } },
                      record.name || dnsResults.query
                    ),
                    h('div', null, record.type),
                    h('div', null, record.ttl || 'N/A'),
                    h(
                      'div',
                      { style: { wordBreak: 'break-all' } },
                      formatDNSRecord(record)
                    )
                  )
                )
              ),
            dnsResults.error &&
              h(
                'div',
                {
                  style: {
                    backgroundColor: '#ffebee',
                    color: '#c62828',
                    padding: '16px',
                    borderRadius: '4px',
                    marginTop: '16px',
                  },
                },
                `Error: ${dnsResults.error}`
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
  root.render(h(StrictMode, null, h(DNSLookupTool)))
} else {
  console.error('Root element not found!')
}
