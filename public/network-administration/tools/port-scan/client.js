/**
 * Port Scanner Tool for the Network-Proxy application
 */

// Using React CDN imports - these will be loaded from the HTML file
const { createElement: h, StrictMode, useState, useEffect } = React
const { createRoot } = ReactDOM

/**
 * Main Port Scanner Tool component
 */
const PortScannerTool = () => {
  const [target, setTarget] = useState('')
  const [startPort, setStartPort] = useState('1')
  const [endPort, setEndPort] = useState('1000')
  const [isScanning, setIsScanning] = useState(false)
  const [scanResults, setScanResults] = useState([])
  const [shouldStop, setShouldStop] = useState(false)

  const handleStartScan = async () => {
    console.log('=== FRONTEND PORT SCAN START ===')

    if (!target.trim()) {
      alert('Please enter an IP address or hostname')
      return
    }

    const startPortNum = parseInt(startPort, 10)
    const endPortNum = parseInt(endPort, 10)

    if (
      isNaN(startPortNum) ||
      isNaN(endPortNum) ||
      startPortNum <= 0 ||
      endPortNum <= 0
    ) {
      alert('Please enter valid port numbers')
      return
    }

    if (startPortNum > endPortNum) {
      alert('Start port must be less than or equal to end port')
      return
    }

    if (endPortNum - startPortNum > 10000) {
      alert('Port range too large. Maximum 10,000 ports allowed.')
      return
    }

    console.log('Port scan parameters:', {
      target: target.trim(),
      startPort: startPortNum,
      endPort: endPortNum,
    })
    setIsScanning(true)
    setShouldStop(false)
    setScanResults([])

    try {
      console.log('Using streaming endpoint for real-time port scanning')
      const response = await fetch('/api/port-scan-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target: target.trim(),
          startPort: startPortNum,
          endPort: endPortNum,
        }),
      })

      console.log('Port scan stream response status:', response.status)
      if (!response.ok) {
        throw new Error('Port scan stream request failed')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          console.log('Port scan stream read:', {
            done,
            valueLength: value?.length,
          })

          if (done) {
            console.log('Port scan stream completed')
            break
          }

          if (shouldStop) {
            console.log('Port scan stopped by user')
            break
          }

          const chunk = decoder.decode(value, { stream: true })
          console.log('Received port scan chunk:', chunk)
          buffer += chunk

          // Process complete lines
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep incomplete line in buffer

          for (const line of lines) {
            console.log('Processing port scan line:', line)
            if (line.startsWith('data: ')) {
              try {
                const jsonData = line.slice(6).trim()
                if (jsonData) {
                  const result = JSON.parse(jsonData)
                  console.log('Parsed port scan result:', result)
                  setScanResults(prev => {
                    const newResults = [...prev, result]
                    console.log(
                      'Updated port scan results count:',
                      newResults.length
                    )
                    return newResults
                  })
                }
              } catch (e) {
                console.error(
                  'Error parsing port scan result:',
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
      console.error('Port scan error:', error)
      alert(`Port scan failed: ${error.message}`)
    } finally {
      console.log('Port scan operation completed')
      setIsScanning(false)
      setShouldStop(false)
    }
  }

  const handleStopScan = () => {
    console.log('Stop port scan requested')
    setShouldStop(true)
    setIsScanning(false)
  }

  const openPorts = scanResults.filter(result => result.open)
  const closedPorts = scanResults.filter(result => !result.open)

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
      h('span', { style: { color: '#333' } }, 'Port Scanner')
    ),

    h(
      'h1',
      { style: { marginBottom: '8px', color: '#333' } },
      'Tools - Port Scanner'
    ),
    h(
      'p',
      { style: { marginBottom: '24px', color: '#666' } },
      'Scan TCP ports on a target host to discover open services'
    ),

    h(
      'div',
      {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
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
          'Target (IP Address or Hostname)'
        ),
        h('input', {
          type: 'text',
          value: target,
          onChange: e => setTarget(e.target.value),
          placeholder: '192.168.1.1 or example.com',
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
          'Start Port'
        ),
        h('input', {
          type: 'number',
          value: startPort,
          onChange: e => setStartPort(e.target.value),
          min: '1',
          max: '65535',
          placeholder: '1',
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
          'End Port'
        ),
        h('input', {
          type: 'number',
          value: endPort,
          onChange: e => setEndPort(e.target.value),
          min: '1',
          max: '65535',
          placeholder: '1000',
          style: {
            width: '100%',
            padding: '8px',
            border: '1px solid #ddd',
            borderRadius: '4px',
          },
        })
      )
    ),

    h(
      'div',
      { style: { display: 'flex', gap: '8px', marginBottom: '24px' } },
      h(
        'button',
        {
          onClick: handleStartScan,
          disabled: isScanning || !target.trim(),
          style: {
            padding: '8px 16px',
            backgroundColor: isScanning || !target.trim() ? '#ccc' : '#4caf50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isScanning || !target.trim() ? 'not-allowed' : 'pointer',
          },
        },
        isScanning ? '⏳ Scanning...' : '▶ Start Scan'
      ),

      h(
        'button',
        {
          onClick: handleStopScan,
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
        '⏹ Stop Scan'
      )
    ),

    h(
      'div',
      {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: '16px',
        },
      },
      // Open Ports
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
          { style: { marginTop: '0', marginBottom: '16px', color: '#4caf50' } },
          `Open Ports (${openPorts.length})`
        ),
        openPorts.length === 0
          ? h(
              'p',
              { style: { color: '#666', fontStyle: 'italic' } },
              isScanning ? 'Scanning for open ports...' : 'No open ports found'
            )
          : h(
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
                    gridTemplateColumns: '80px 1fr 100px',
                    gap: '8px',
                    marginBottom: '8px',
                    fontWeight: 'bold',
                    borderBottom: '1px solid #ddd',
                    paddingBottom: '8px',
                  },
                },
                h('div', null, 'Port'),
                h('div', null, 'Service'),
                h('div', null, 'Status')
              ),
              ...openPorts.map(result =>
                h(
                  'div',
                  {
                    key: `${result.port}-open`,
                    style: {
                      display: 'grid',
                      gridTemplateColumns: '80px 1fr 100px',
                      gap: '8px',
                      marginBottom: '4px',
                      padding: '4px 0',
                      color: '#4caf50',
                    },
                  },
                  h('div', null, result.port),
                  h('div', null, result.service || 'Unknown'),
                  h('div', null, 'OPEN')
                )
              )
            )
      ),

      // Scan Progress
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
          'Scan Progress'
        ),
        h(
          'div',
          { style: { marginBottom: '16px' } },
          h(
            'p',
            { style: { margin: '0 0 8px 0' } },
            `Scanned: ${scanResults.length} ports`
          ),
          h(
            'p',
            { style: { margin: '0 0 8px 0' } },
            `Open: ${openPorts.length} ports`
          ),
          h(
            'p',
            { style: { margin: '0' } },
            `Closed: ${closedPorts.length} ports`
          )
        ),
        scanResults.length > 0 &&
          h(
            'div',
            {
              style: {
                fontFamily: 'monospace',
                backgroundColor: '#f5f5f5',
                padding: '16px',
                borderRadius: '4px',
                maxHeight: '200px',
                overflowY: 'auto',
              },
            },
            h(
              'div',
              { style: { fontSize: '12px', color: '#666' } },
              'Recent scan activity:'
            ),
            ...scanResults
              .slice(-10)
              .reverse()
              .map((result, index) =>
                h(
                  'div',
                  {
                    key: `recent-${result.port}-${index}`,
                    style: {
                      fontSize: '12px',
                      color: result.open ? '#4caf50' : '#999',
                      marginBottom: '2px',
                    },
                  },
                  `Port ${result.port}: ${result.open ? 'OPEN' : 'closed'}`
                )
              )
          ),
        isScanning &&
          h(
            'div',
            {
              style: {
                marginTop: '16px',
                color: '#666',
                fontStyle: 'italic',
              },
            },
            'Scanning in progress...'
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
  root.render(h(StrictMode, null, h(PortScannerTool)))
} else {
  console.error('Root element not found!')
}
