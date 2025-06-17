/**
 * SNMP Management Dashboard for the Network-Proxy application
 * Central hub for all SNMP related functionality
 */

// Using React CDN imports - these will be loaded from the HTML file
const { createElement: h, StrictMode, useState, useEffect, Fragment } = React
const { createRoot } = ReactDOM

/**
 * Main SNMP Management Dashboard component
 */
const SNMPManagement = () => {
  const [loading, setLoading] = useState(true)

  // Simulate loading to allow for UI to render properly
  useEffect(() => {
    setTimeout(() => {
      setLoading(false)
    }, 500)
  }, [])

  // SNMP management modules
  const modules = [
    {
      id: 'device-polling',
      title: 'Device Polling',
      icon: '📊',
      color: '#1976d2',
      description: 'Monitor network devices with SNMP polling and view their status',
      href: '/network-administration/snmp/device-polling',
    },
    {
      id: 'settings',
      title: 'SNMP Settings',
      icon: '🔐',
      color: '#7b1fa2',
      description: 'Manage SNMPv2 and SNMPv3 authentication settings for your network devices',
      href: '/network-administration/snmp/settings',
    },
    {
      id: 'oid',
      title: 'OID Management',
      icon: '🔍',
      color: '#c2185b',
      description: 'Manage SNMP Object Identifiers (OIDs) for monitoring network devices',
      href: '/network-administration/snmp/oid',
    },
    {
      id: 'templates',
      title: 'SNMP Templates',
      icon: '📋',
      color: '#388e3c',
      description: 'Create and manage templates that combine SNMP settings and OIDs',
      href: '/network-administration/snmp/templates',
    },
    {
      id: 'polling-templates',
      title: 'Polling Templates',
      icon: '⏱️',
      color: '#f57c00',
      description: 'Configure SNMP polling frequency, timeouts, and retries for monitoring',
      href: '/network-administration/snmp/polling-templates',
    },
  ]

  // Render loading state
  if (loading) {
    return h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#f8f0dd',
          color: '#1f4e5f',
        }
      },
      h('div', {
        style: {
          fontSize: '60px',
          marginBottom: '20px',
          animation: 'spin 3s infinite linear',
        }
      }, '☥'),
      h('h2', {
        style: {
          fontFamily: 'Cinzel, serif',
          color: '#a41c1b',
          textAlign: 'center',
        }
      }, 'Loading SNMP Management...'),
      h('style', null, `
        @keyframes spin {
          from { transform: rotateY(0deg); }
          to { transform: rotateY(360deg); }
        }
      `)
    )
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
      'h1',
      { style: { marginBottom: '8px', color: '#333' } },
      'SNMP Management'
    ),
    h(
      'p',
      { style: { marginBottom: '24px', color: '#666' } },
      'Centralized management for SNMP monitoring and configuration'
    ),

    // Module grid
    h(
      'div',
      {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '24px',
          marginBottom: '32px',
        },
      },
      modules.map(module => h(
        'a',
        {
          key: module.id,
          href: module.href,
          style: {
            textDecoration: 'none',
            color: 'inherit',
          },
        },
        h(
          'div',
          {
            style: {
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              overflow: 'hidden',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              cursor: 'pointer',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            },
            onMouseOver: e => {
              e.currentTarget.style.transform = 'translateY(-4px)'
              e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.1)'
            },
            onMouseOut: e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'
            },
          },
          // Module icon
          h(
            'div',
            {
              style: {
                padding: '32px 16px',
                backgroundColor: module.color,
                color: 'white',
                textAlign: 'center',
              },
            },
            h(
              'div',
              {
                style: {
                  fontSize: '48px',
                  marginBottom: '8px',
                },
              },
              module.icon
            ),
            h(
              'h3',
              {
                style: {
                  margin: '0',
                  fontSize: '20px',
                  fontWeight: 'bold',
                },
              },
              module.title
            )
          ),
          // Module description
          h(
            'div',
            {
              style: {
                padding: '16px',
                flex: '1',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              },
            },
            h(
              'p',
              {
                style: {
                  margin: '0 0 16px 0',
                  color: '#666',
                  fontSize: '14px',
                  lineHeight: '1.5',
                },
              },
              module.description
            ),
            h(
              'div',
              {
                style: {
                  textAlign: 'right',
                },
              },
              h(
                'span',
                {
                  style: {
                    display: 'inline-block',
                    padding: '8px 16px',
                    backgroundColor: module.color,
                    color: 'white',
                    borderRadius: '4px',
                    fontSize: '14px',
                  },
                },
                'Open'
              )
            )
          )
        )
      ))
    ),

    // Information section
    h(
      'div',
      {
        style: {
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          padding: '24px',
          marginBottom: '32px',
        },
      },
      h(
        'h2',
        { style: { margin: '0 0 16px 0', color: '#333' } },
        'About SNMP Management'
      ),
      h(
        'p',
        { style: { margin: '0 0 12px 0', color: '#666', lineHeight: '1.6' } },
        'Simple Network Management Protocol (SNMP) is an Internet Standard protocol for collecting and organizing information about managed devices on IP networks and for modifying that information to change device behavior.'
      ),
      h(
        'p',
        { style: { margin: '0 0 12px 0', color: '#666', lineHeight: '1.6' } },
        'This SNMP Management module provides comprehensive tools for monitoring network devices, configuring SNMP settings, and managing OIDs and templates.'
      ),
      h(
        'div',
        { style: { marginTop: '20px' } },
        h(
          'h3',
          { style: { margin: '0 0 12px 0', color: '#333', fontSize: '16px' } },
          'SNMP Version Support'
        ),
        h(
          'ul',
          { style: { margin: '0 0 0 20px', padding: '0', color: '#666' } },
          h('li', { style: { marginBottom: '8px' } }, 'SNMPv2c - Community-based security model'),
          h('li', { style: { marginBottom: '8px' } }, 'SNMPv3 - User-based security model with authentication and encryption')
        )
      )
    ),

    // Quick links section
    h(
      'div',
      {
        style: {
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          padding: '24px',
        },
      },
      h(
        'h2',
        { style: { margin: '0 0 16px 0', color: '#333' } },
        'Quick Links'
      ),
      h(
        'div',
        {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '16px',
          },
        },
        [
          {
            title: 'Device Polling',
            href: '/network-administration/snmp/device-polling',
            color: '#1976d2',
          },
          {
            title: 'SNMP Settings',
            href: '/network-administration/snmp/settings',
            color: '#7b1fa2',
          },
          {
            title: 'OID Management',
            href: '/network-administration/snmp/oid',
            color: '#c2185b',
          },
          {
            title: 'SNMP Templates',
            href: '/network-administration/snmp/templates',
            color: '#388e3c',
          },
          {
            title: 'Polling Templates',
            href: '/network-administration/snmp/polling-templates',
            color: '#f57c00',
          },
        ].map(link => h(
          'a',
          {
            key: link.title,
            href: link.href,
            style: {
              textDecoration: 'none',
              padding: '12px',
              backgroundColor: link.color,
              color: 'white',
              borderRadius: '4px',
              textAlign: 'center',
              fontWeight: 'bold',
              transition: 'transform 0.2s ease, opacity 0.2s ease',
            },
            onMouseOver: e => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.opacity = '0.9'
            },
            onMouseOut: e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.opacity = '1'
            },
          },
          link.title
        ))
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
  root.render(h(StrictMode, null, h(SNMPManagement)))
} else {
  console.error('Root element not found!')
}