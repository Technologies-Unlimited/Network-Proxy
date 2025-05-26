/**
 * Ping Tool for the Network-Proxy application
 */

// Using React CDN imports - these will be loaded from the HTML file
const { createElement: h, StrictMode, useState, useEffect } = React
const { createRoot } = ReactDOM

/**
 * Main Ping Tool component
 */
const PingTool = () => {
  const [target, setTarget] = useState('')
  const [duration, setDuration] = useState('5')
  const [continuous, setContinuous] = useState(false)
  const [isPinging, setIsPinging] = useState(false)
  const [pingResults, setPingResults] = useState([])
  const [shouldStop, setShouldStop] = useState(false)

  const handleStartPing = async () => {
    console.log('=== FRONTEND PING START ===')

    if (!target.trim()) {
      alert('Please enter an IP address or hostname')
      return
    }

    if (!continuous) {
      const durationNum = parseInt(duration, 10)
      if (isNaN(durationNum) || durationNum <= 0) {
        alert('Please enter a valid ping count')
        return
      }
    }

    console.log('Ping parameters:', {
      target: target.trim(),
      duration,
      continuous,
    })
    setIsPinging(true)
    setShouldStop(false)
    setPingResults([])

    try {
      if (continuous) {
        console.log('Using streaming endpoint for continuous ping')
        // Use streaming endpoint for continuous pings
        const response = await fetch('/api/ping-stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            target: target.trim(),
            continuous: true,
          }),
        })

        console.log('Stream response status:', response.status)
        if (!response.ok) {
          throw new Error('Ping stream request failed')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            console.log('Stream read:', { done, valueLength: value?.length })

            if (done) {
              console.log('Stream completed')
              break
            }

            if (shouldStop) {
              console.log('Ping stopped by user')
              break
            }

            const chunk = decoder.decode(value, { stream: true })
            console.log('Received chunk:', chunk)
            buffer += chunk

            // Process complete lines
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // Keep incomplete line in buffer

            for (const line of lines) {
              console.log('Processing line:', line)
              if (line.startsWith('data: ')) {
                try {
                  const jsonData = line.slice(6).trim()
                  if (jsonData) {
                    const result = JSON.parse(jsonData)
                    console.log('Parsed ping result:', result)
                    setPingResults(prev => {
                      const newResults = [...prev, result]
                      console.log('Updated results count:', newResults.length)
                      return newResults
                    })
                  }
                } catch (e) {
                  console.error('Error parsing ping result:', e, 'Line:', line)
                }
              }
            }
          }
        } finally {
          reader.releaseLock()
        }
      } else {
        console.log('Using regular endpoint for finite ping')
        // Use regular endpoint for finite pings
        const requestBody = {
          target: target.trim(),
          count: parseInt(duration, 10),
          continuous: false,
        }
        console.log('Request body:', requestBody)

        const response = await fetch('/api/ping', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        })

        console.log('Response status:', response.status)
        console.log(
          'Response headers:',
          Object.fromEntries(response.headers.entries())
        )

        if (!response.ok) {
          const errorData = await response.json()
          console.error('Error response:', errorData)
          throw new Error(errorData.error || 'Ping request failed')
        }

        const data = await response.json()
        console.log('Received ping data:', data)
        console.log('Results count:', data.results?.length)

        // Display results one by one with realistic timing
        for (let i = 0; i < data.results.length; i++) {
          if (shouldStop) {
            console.log('Ping stopped by user')
            break
          }

          console.log(
            `Displaying result ${i + 1}/${data.results.length}:`,
            data.results[i]
          )
          setPingResults(prev => {
            const newResults = [...prev, data.results[i]]
            console.log('Updated results count:', newResults.length)
            return newResults
          })

          // Add delay between displaying results to simulate real ping timing
          if (i < data.results.length - 1) {
            console.log('Adding 0.5 second delay before next result...')
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        }
      }
    } catch (error) {
      console.error('Ping error:', error)
      alert(`Ping failed: ${error.message}`)
    } finally {
      console.log('Ping operation completed')
      setIsPinging(false)
      setShouldStop(false)
    }
  }

  const handleStopPing = () => {
    console.log('Stop ping requested')
    setShouldStop(true)
    setIsPinging(false)
  }

  const formatPingResult = result => {
    if (!result.success) {
      return result.message || 'Request timed out.'
    }
    return `Reply from ${result.target}: bytes=${result.bytes} time=${result.time}ms TTL=${result.ttl}`
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
      h('span', { style: { color: '#333' } }, 'Ping Tool')
    ),

    h('h1', { style: { marginBottom: '8px', color: '#333' } }, 'Tools - Ping'),
    h(
      'p',
      { style: { marginBottom: '24px', color: '#666' } },
      'Perform real ping tests with target (IP address or hostname)'
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
          'Ping Options'
        ),
        h(
          'div',
          { style: { marginBottom: '8px' } },
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
              checked: continuous,
              onChange: e => setContinuous(e.target.checked),
              style: { marginRight: '8px' },
            }),
            'Continuous ping (like ping -t)'
          )
        ),
        !continuous &&
          h('input', {
            type: 'number',
            value: duration,
            onChange: e => setDuration(e.target.value),
            min: '1',
            max: '50',
            placeholder: '5',
            style: {
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
            },
          }),
        continuous &&
          h(
            'p',
            {
              style: {
                margin: '0',
                fontSize: '14px',
                color: '#666',
                fontStyle: 'italic',
              },
            },
            'Continuous mode will ping up to 50 times with real-time results'
          )
      )
    ),

    h(
      'div',
      { style: { display: 'flex', gap: '8px', marginBottom: '24px' } },
      h(
        'button',
        {
          onClick: handleStartPing,
          disabled: isPinging || !target.trim(),
          style: {
            padding: '8px 16px',
            backgroundColor: isPinging || !target.trim() ? '#ccc' : '#4caf50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isPinging || !target.trim() ? 'not-allowed' : 'pointer',
          },
        },
        isPinging ? '⏳ Pinging...' : '▶ Start Ping'
      ),

      h(
        'button',
        {
          onClick: handleStopPing,
          disabled: !isPinging,
          style: {
            padding: '8px 16px',
            backgroundColor: !isPinging ? '#ccc' : '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: !isPinging ? 'not-allowed' : 'pointer',
          },
        },
        '⏹ Stop Ping'
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
        'Ping Results'
      ),
      pingResults.length === 0
        ? h(
            'p',
            { style: { color: '#666', fontStyle: 'italic' } },
            isPinging ? 'Pinging...' : 'No ping results yet'
          )
        : h(
            'div',
            null,
            h(
              'p',
              { style: { marginBottom: '16px', fontFamily: 'monospace' } },
              `Pinging ${pingResults[0].originalTarget || pingResults[0].target} with ${pingResults[0].bytes} bytes of data:`
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
              ...pingResults.map((result, index) =>
                h(
                  'div',
                  {
                    key: result.id || index,
                    style: {
                      marginBottom: '4px',
                      color: result.success ? '#333' : '#f44336',
                    },
                  },
                  formatPingResult(result)
                )
              ),
              isPinging &&
                h(
                  'div',
                  {
                    style: {
                      marginTop: '8px',
                      color: '#666',
                      fontStyle: 'italic',
                    },
                  },
                  'Pinging...'
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
  root.render(h(StrictMode, null, h(PingTool)))
} else {
  console.error('Root element not found!')
}
