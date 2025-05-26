/**
 * Network Tools page for the Network-Proxy application
 */

// Using React CDN imports - these will be loaded from the HTML file
const { createElement: h, StrictMode, useState } = React
const { createRoot } = ReactDOM

/**
 * Main Network Tools component
 */
const NetworkTools = () => {
  const [selectedTool, setSelectedTool] = useState(null)

  const tools = [
    {
      id: 'ping',
      name: 'Ping',
      description: 'Test network connectivity to a host',
      icon: '📡',
      category: 'Connectivity',
    },
    {
      id: 'traceroute',
      name: 'Traceroute',
      description: 'Trace the path packets take to a destination',
      icon: '🛤️',
      category: 'Connectivity',
    },
    {
      id: 'discover',
      name: 'Device Discovery',
      description: 'Discover devices on the network',
      icon: '🔍',
      category: 'Discovery',
    },
    {
      id: 'port-scan',
      name: 'Port Scanner',
      description: 'Scan for open ports on a host',
      icon: '🔓',
      category: 'Security',
    },
    {
      id: 'dns-lookup',
      name: 'DNS Lookup',
      description: 'Resolve domain names to IP addresses',
      icon: '🌐',
      category: 'DNS',
    },
    {
      id: 'whois',
      name: 'WHOIS Lookup',
      description: 'Get domain registration information',
      icon: '📋',
      category: 'DNS',
    },
  ]

  const categories = [...new Set(tools.map(tool => tool.category))]

  const handleToolClick = tool => {
    // Navigate to individual tool pages
    switch (tool.id) {
      case 'ping':
        window.location.href = '/network-administration/tools/ping'
        break
      case 'traceroute':
        window.location.href = '/network-administration/tools/traceroute'
        break
      case 'discover':
        window.location.href = '/network-administration/tools/discover-devices'
        break
      case 'port-scan':
        window.location.href = '/network-administration/tools/port-scan'
        break
      case 'dns-lookup':
        window.location.href = '/network-administration/tools/dns-lookup'
        break
      case 'whois':
        window.location.href = '/network-administration/tools/whois-lookup'
        break
      default:
        setSelectedTool(tool)
    }
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
      h('span', { style: { color: '#333' } }, 'Network Tools')
    ),

    h('h1', { style: { marginBottom: '8px', color: '#333' } }, 'Network Tools'),
    h(
      'p',
      { style: { marginBottom: '24px', color: '#666' } },
      'Various network troubleshooting and management tools'
    ),

    // Tools grid
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
      ...categories.map(category =>
        h(
          'div',
          {
            key: category,
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
                backgroundColor: '#f5f5f5',
                borderBottom: '1px solid #e0e0e0',
              },
            },
            h('h3', { style: { margin: '0', color: '#333' } }, category)
          ),
          h(
            'div',
            { style: { padding: '16px' } },
            ...tools
              .filter(tool => tool.category === category)
              .map(tool =>
                h(
                  'div',
                  {
                    key: tool.id,
                    onClick: () => handleToolClick(tool),
                    style: {
                      padding: '12px',
                      marginBottom: '8px',
                      border: '1px solid #e0e0e0',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      backgroundColor:
                        selectedTool?.id === tool.id
                          ? '#e3f2fd'
                          : 'transparent',
                    },
                    onMouseOver: e => {
                      if (selectedTool?.id !== tool.id) {
                        e.target.style.backgroundColor = '#f5f5f5'
                      }
                    },
                    onMouseOut: e => {
                      if (selectedTool?.id !== tool.id) {
                        e.target.style.backgroundColor = 'transparent'
                      }
                    },
                  },
                  h(
                    'div',
                    {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        marginBottom: '8px',
                      },
                    },
                    h(
                      'span',
                      { style: { fontSize: '24px', marginRight: '12px' } },
                      tool.icon
                    ),
                    h(
                      'h4',
                      { style: { margin: '0', color: '#333' } },
                      tool.name
                    )
                  ),
                  h(
                    'p',
                    { style: { margin: '0', fontSize: '14px', color: '#666' } },
                    tool.description
                  )
                )
              )
          )
        )
      )
    ),

    // Tool details panel
    selectedTool &&
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
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              marginBottom: '16px',
            },
          },
          h(
            'span',
            { style: { fontSize: '32px', marginRight: '16px' } },
            selectedTool.icon
          ),
          h(
            'div',
            null,
            h(
              'h2',
              { style: { margin: '0 0 4px 0', color: '#333' } },
              selectedTool.name
            ),
            h(
              'p',
              { style: { margin: '0', color: '#666' } },
              selectedTool.description
            )
          )
        ),

        h(
          'div',
          {
            style: {
              padding: '16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
            },
          },
          h(
            'p',
            { style: { margin: '0', fontStyle: 'italic' } },
            `${selectedTool.name} tool functionality will be implemented here. This would include forms for input parameters and results display.`
          )
        ),

        h(
          'div',
          { style: { marginTop: '16px', display: 'flex', gap: '8px' } },
          h(
            'button',
            {
              style: {
                padding: '8px 16px',
                backgroundColor: '#1976d2',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              },
            },
            'Run Tool'
          ),
          h(
            'button',
            {
              onClick: () => setSelectedTool(null),
              style: {
                padding: '8px 16px',
                backgroundColor: '#666',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              },
            },
            'Close'
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
  root.render(h(StrictMode, null, h(NetworkTools)))
} else {
  console.error('Root element not found!')
}
