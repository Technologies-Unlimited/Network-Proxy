/**
 * Main client entry point for the Network-Proxy application
 * This file initializes the React application with proper navigation
 */

// Using React CDN imports - these will be loaded from the HTML file
const { createElement: h, StrictMode, useState } = React
const { createRoot } = ReactDOM

/**
 * App component that serves as the main layout for the application
 */
const App = () => {
  const [expandedSections, setExpandedSections] = useState({})

  const toggleSection = sectionKey => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }))
  }

  const navigationItems = [
    {
      title: 'Network Administration',
      key: 'network-admin',
      children: [
        {
          title: 'Inventory Management',
          key: 'inventory',
          href: '/network-administration/inventory',
          description:
            'Manage network inventory with devices, SKU, serial numbers, and MAC addresses',
        },
        {
          title: 'Network Tools',
          key: 'tools',
          href: '/network-administration/tools',
          description: 'Various network troubleshooting and management tools',
          children: [
            {
              title: 'Ping Tool',
              href: '/network-administration/tools/ping',
              description:
                'Test network connectivity with pool subnet, duration, IP address, and hostname',
            },
            {
              title: 'Traceroute Tool',
              href: '/network-administration/tools/traceroute',
              description:
                'Trace network paths with pool subnet, max hops, IP address, and hostname',
            },
            {
              title: 'Device Discovery',
              href: '/network-administration/tools/discover-devices',
              description:
                'Discover network devices and browse MIBs with subnet scanning',
            },
          ],
        },
        {
          title: 'SNMP Management',
          key: 'snmp',
          children: [
            {
              title: 'Device Polling',
              href: '/network-administration/snmp/device-polling',
              description:
                'View SNMP device polling status with uptime, downtime, and device status',
            },
          ],
        },
        {
          title: 'ICMP Management',
          key: 'icmp',
          children: [
            {
              title: 'Network Monitoring',
              href: '/network-administration/icmp/polling',
              description:
                'Real-time ICMP network monitoring dashboard with continuous polling and alerts',
            },
            {
              title: 'Device Status',
              href: '/network-administration/icmp/polling/device-status',
              description:
                'Real-time network device status monitoring via ICMP',
            },
            {
              title: 'Polling Templates',
              href: '/network-administration/icmp/polling/templates',
              description:
                'View and manage ICMP polling templates for network device monitoring',
            },
            {
              title: 'Monitoring Templates',
              href: '/network-administration/icmp/templates',
              description:
                'View and manage ICMP monitoring templates with thresholds',
            },
          ],
        },
      ],
    },
  ]

  const renderNavigationItem = (item, level = 0) => {
    const hasChildren = item.children && item.children.length > 0
    const isExpanded = expandedSections[item.key]
    const paddingLeft = level * 20

    return h(
      'div',
      { key: item.key || item.href, style: { marginBottom: '8px' } },
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            padding: '12px',
            paddingLeft: `${paddingLeft + 12}px`,
            backgroundColor: level === 0 ? '#f5f5f5' : 'white',
            border: '1px solid #e0e0e0',
            borderRadius: '4px',
            cursor: hasChildren ? 'pointer' : 'default',
            marginBottom: hasChildren && isExpanded ? '8px' : '0',
          },
          onClick: hasChildren ? () => toggleSection(item.key) : undefined,
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

        item.href
          ? h(
              'a',
              {
                href: item.href,
                style: {
                  textDecoration: 'none',
                  color: '#1976d2',
                  fontWeight: level === 0 ? 'bold' : 'normal',
                  flex: 1,
                },
              },
              item.title
            )
          : h(
              'span',
              {
                style: {
                  fontWeight: level === 0 ? 'bold' : 'normal',
                  flex: 1,
                  color: '#333',
                },
              },
              item.title
            )
      ),

      item.description &&
        h(
          'p',
          {
            style: {
              margin: '4px 0 0 0',
              paddingLeft: `${paddingLeft + 12}px`,
              fontSize: '12px',
              color: '#666',
              fontStyle: 'italic',
            },
          },
          item.description
        ),

      hasChildren &&
        isExpanded &&
        h(
          'div',
          {
            style: {
              marginLeft: '16px',
              borderLeft: '2px solid #e0e0e0',
              paddingLeft: '8px',
            },
          },
          item.children.map(child => renderNavigationItem(child, level + 1))
        )
    )
  }

  return h(
    'div',
    {
      style: {
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '24px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      },
    },
    h(
      'header',
      {
        style: {
          marginBottom: '32px',
          textAlign: 'center',
          borderBottom: '2px solid #1976d2',
          paddingBottom: '16px',
        },
      },
      h(
        'h1',
        {
          style: {
            margin: '0 0 8px 0',
            color: '#1976d2',
            fontSize: '2.5rem',
          },
        },
        'Network Proxy'
      ),
      h(
        'p',
        {
          style: {
            margin: '0',
            color: '#666',
            fontSize: '1.1rem',
          },
        },
        'Comprehensive network administration and monitoring platform'
      )
    ),

    h(
      'main',
      null,
      h(
        'section',
        { style: { marginBottom: '32px' } },
        h(
          'h2',
          {
            style: {
              marginBottom: '16px',
              color: '#333',
              fontSize: '1.5rem',
            },
          },
          'Quick Overview'
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
                padding: '16px',
                backgroundColor: '#e3f2fd',
                borderRadius: '8px',
                border: '1px solid #1976d2',
              },
            },
            h(
              'h3',
              { style: { marginTop: '0', color: '#1976d2' } },
              '🔧 Network Tools'
            ),
            h(
              'p',
              { style: { margin: '0', fontSize: '14px' } },
              'Ping, Traceroute, and Device Discovery tools for network troubleshooting'
            )
          ),
          h(
            'div',
            {
              style: {
                padding: '16px',
                backgroundColor: '#f3e5f5',
                borderRadius: '8px',
                border: '1px solid #9c27b0',
              },
            },
            h(
              'h3',
              { style: { marginTop: '0', color: '#9c27b0' } },
              '📊 SNMP Management'
            ),
            h(
              'p',
              { style: { margin: '0', fontSize: '14px' } },
              'Device polling and monitoring with comprehensive SNMP support'
            )
          ),
          h(
            'div',
            {
              style: {
                padding: '16px',
                backgroundColor: '#e8f5e8',
                borderRadius: '8px',
                border: '1px solid #4caf50',
              },
            },
            h(
              'h3',
              { style: { marginTop: '0', color: '#4caf50' } },
              '🌐 ICMP Monitoring'
            ),
            h(
              'p',
              { style: { margin: '0', fontSize: '14px' } },
              'Real-time device status monitoring and template management'
            )
          ),
          h(
            'div',
            {
              style: {
                padding: '16px',
                backgroundColor: '#fff3e0',
                borderRadius: '8px',
                border: '1px solid #ff9800',
              },
            },
            h(
              'h3',
              { style: { marginTop: '0', color: '#ff9800' } },
              '📦 Inventory'
            ),
            h(
              'p',
              { style: { margin: '0', fontSize: '14px' } },
              'Complete network inventory management with device tracking'
            )
          )
        )
      ),

      h(
        'section',
        null,
        h(
          'h2',
          {
            style: {
              marginBottom: '16px',
              color: '#333',
              fontSize: '1.5rem',
            },
          },
          'Navigation'
        ),
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
          navigationItems.map(item => renderNavigationItem(item))
        )
      )
    ),

    h(
      'footer',
      {
        style: {
          marginTop: '48px',
          padding: '16px',
          textAlign: 'center',
          borderTop: '1px solid #e0e0e0',
          color: '#666',
          fontSize: '14px',
        },
      },
      h(
        'p',
        { style: { margin: '0' } },
        'Network Proxy - Built with React and modern web technologies'
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
  root.render(h(StrictMode, null, h(App)))
} else {
  console.error('Root element not found!')
}
