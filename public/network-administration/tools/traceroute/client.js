/**
 * Traceroute Tool for the Network-Proxy application
 */

// Using React CDN imports - these will be loaded from the HTML file
const { createElement: h, StrictMode, useState, useEffect } = React
const { createRoot } = ReactDOM

/**
 * Main Traceroute Tool component
 */
const TracerouteTool = () => {
  const [target, setTarget] = useState('')
  const [maxHops, setMaxHops] = useState('20')
  const [isTracing, setIsTracing] = useState(false)
  const [tracerouteResults, setTracerouteResults] = useState([])
  const [shouldStop, setShouldStop] = useState(false)

  const handleStartTraceroute = async () => {
    console.log('=== FRONTEND TRACEROUTE START ===')

    if (!target.trim()) {
      alert('Please enter an IP address or hostname')
      return
    }

    const maxHopsNum = parseInt(maxHops, 10)
    if (isNaN(maxHopsNum) || maxHopsNum <= 0 || maxHopsNum > 30) {
      alert('Please enter a valid max hops value (1-30)')
      return
    }

    console.log('Traceroute parameters:', {
      target: target.trim(),
      maxHops: maxHopsNum,
    })
    setIsTracing(true)
    setShouldStop(false)
    setTracerouteResults([])

    try {
      console.log('Using streaming endpoint for real-time traceroute')
      // Always use streaming endpoint for real-time traceroute
      const response = await fetch('/api/traceroute-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target: target.trim(),
          maxHops: maxHopsNum,
        }),
      })

      console.log('Traceroute stream response status:', response.status)
      if (!response.ok) {
        throw new Error('Traceroute stream request failed')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          console.log('Traceroute stream read:', {
            done,
            valueLength: value?.length,
          })

          if (done) {
            console.log('Traceroute stream completed')
            break
          }

          if (shouldStop) {
            console.log('Traceroute stopped by user')
            break
          }

          const chunk = decoder.decode(value, { stream: true })
          console.log('Received traceroute chunk:', chunk)
          buffer += chunk

          // Process complete lines
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep incomplete line in buffer

          for (const line of lines) {
            console.log('Processing traceroute line:', line)
            if (line.startsWith('data: ')) {
              try {
                const jsonData = line.slice(6).trim()
                if (jsonData) {
                  const result = JSON.parse(jsonData)
                  console.log('Parsed traceroute hop result:', result)
                  setTracerouteResults(prev => {
                    const newResults = [...prev, result]
                    console.log(
                      'Updated traceroute results count:',
                      newResults.length
                    )
                    return newResults
                  })
                }
              } catch (e) {
                console.error(
                  'Error parsing traceroute result:',
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
      console.error('Traceroute error:', error)
      alert(`Traceroute failed: ${error.message}`)
    } finally {
      console.log('Traceroute operation completed')
      setIsTracing(false)
      setShouldStop(false)
    }
  }

  const handleStopTraceroute = () => {
    console.log('Stop traceroute requested')
    setShouldStop(true)
    setIsTracing(false)
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
      h('span', { style: { color: '#333' } }, 'Traceroute')
    ),

    h(
      'h1',
      { style: { marginBottom: '8px', color: '#333' } },
      'Tools - Traceroute'
    ),
    h(
      'p',
      { style: { marginBottom: '24px', color: '#666' } },
      'Perform real traceroute tests with target (IP address or hostname) and max hops'
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
          'Target (IP Address or Hostname)'
        ),
        h('input', {
          type: 'text',
          value: target,
          onChange: e => setTarget(e.target.value),
          placeholder: '192.168.1.1 or google.com',
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
          'Max Hops'
        ),
        h('input', {
          type: 'number',
          value: maxHops,
          onChange: e => setMaxHops(e.target.value),
          min: '1',
          max: '30',
          placeholder: '20',
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
          onClick: handleStartTraceroute,
          disabled: isTracing || !target.trim(),
          style: {
            padding: '8px 16px',
            backgroundColor: isTracing || !target.trim() ? '#ccc' : '#4caf50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isTracing || !target.trim() ? 'not-allowed' : 'pointer',
          },
        },
        isTracing ? '⏳ Tracing...' : '▶ Start Traceroute'
      ),

      h(
        'button',
        {
          onClick: handleStopTraceroute,
          disabled: !isTracing,
          style: {
            padding: '8px 16px',
            backgroundColor: !isTracing ? '#ccc' : '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: !isTracing ? 'not-allowed' : 'pointer',
          },
        },
        '⏹ Stop Traceroute'
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
        'Traceroute Results'
      ),
      tracerouteResults.length === 0
        ? h(
            'p',
            { style: { color: '#666', fontStyle: 'italic' } },
            isTracing ? 'Tracing route...' : 'No traceroute results yet'
          )
        : h(
            'div',
            null,
            h(
              'p',
              { style: { marginBottom: '16px', fontFamily: 'monospace' } },
              `Tracing route to ${target} over a maximum of ${maxHops} hops:`
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
                },
              },
              h(
                'div',
                {
                  style: {
                    display: 'grid',
                    gridTemplateColumns: '50px 150px 200px 80px 80px 80px',
                    gap: '8px',
                    marginBottom: '8px',
                    fontWeight: 'bold',
                    borderBottom: '1px solid #ddd',
                    paddingBottom: '8px',
                  },
                },
                h('div', null, 'Hop'),
                h('div', null, 'IP Address'),
                h('div', null, 'Hostname'),
                h('div', null, 'Time 1'),
                h('div', null, 'Time 2'),
                h('div', null, 'Time 3')
              ),
              ...tracerouteResults.map(result =>
                h(
                  'div',
                  {
                    key: result.id,
                    style: {
                      display: 'grid',
                      gridTemplateColumns: '50px 150px 200px 80px 80px 80px',
                      gap: '8px',
                      marginBottom: '4px',
                      padding: '4px 0',
                      color: result.success ? '#333' : '#f44336',
                    },
                  },
                  h('div', null, result.hop),
                  h('div', null, result.ip),
                  h(
                    'div',
                    { style: { fontSize: '12px', color: '#666' } },
                    result.hostname || '-'
                  ),
                  h('div', null, result.time1 ? `${result.time1}ms` : '*'),
                  h('div', null, result.time2 ? `${result.time2}ms` : '*'),
                  h('div', null, result.time3 ? `${result.time3}ms` : '*')
                )
              ),
              isTracing &&
                h(
                  'div',
                  {
                    style: {
                      marginTop: '8px',
                      color: '#666',
                      fontStyle: 'italic',
                    },
                  },
                  'Tracing in progress...'
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
  root.render(h(StrictMode, null, h(TracerouteTool)))
} else {
  console.error('Root element not found!')
}
