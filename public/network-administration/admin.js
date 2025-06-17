/**
 * Network Administration landing page
 * Provides navigation to all network administration tools
 */

// Using React CDN imports - these will be loaded from the HTML file
const { createElement: h, StrictMode, useState, useEffect, Fragment } = React
const { createRoot } = ReactDOM

/**
 * NetworkAdmin component that serves as the landing page for network administration
 */
const NetworkAdmin = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [hoveredTile, setHoveredTile] = useState(null)

  useEffect(() => {
    // Simulate data loading for better UX
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 500)
    
    return () => clearTimeout(timer)
  }, [])

  // Navigation data
  const adminSections = [
    {
      id: 'inventory',
      title: 'Inventory Management',
      icon: '𓊽',
      color: '#d4af37',
      gradient: 'linear-gradient(135deg, #d4af37 0%, #b0903b 100%)',
      shadowColor: 'rgba(212, 175, 55, 0.5)',
      description: 'Complete network inventory management with device tracking',
      href: '/network-administration/inventory',
      patternSvg: `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <path d="M20,20 L80,20 L80,80 L20,80 Z" fill="none" stroke="rgba(255,255,255,0.1)" />
        <path d="M30,30 L70,30 L70,70 L30,70 Z" fill="none" stroke="rgba(255,255,255,0.1)" />
        <path d="M40,40 L60,40 L60,60 L40,60 Z" fill="none" stroke="rgba(255,255,255,0.1)" />
      </svg>`
    },
    {
      id: 'tools',
      title: 'Network Tools',
      icon: '𓏛',
      color: '#1f4e5f',
      gradient: 'linear-gradient(135deg, #1f4e5f 0%, #1a3f4d 100%)',
      shadowColor: 'rgba(31, 78, 95, 0.5)',
      description: 'Ping, Traceroute, and Device Discovery tools for network troubleshooting',
      href: '/network-administration/tools',
      patternSvg: `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <path d="M10,10 L90,90 M20,10 L90,80 M10,20 L80,90" stroke="rgba(255,255,255,0.1)" stroke-width="1" />
        <path d="M90,10 L10,90 M80,10 L10,80 M90,20 L20,90" stroke="rgba(255,255,255,0.1)" stroke-width="1" />
      </svg>`,
      items: [
        {
          title: 'Ping Tool',
          href: '/network-administration/tools/ping',
        },
        {
          title: 'Traceroute Tool',
          href: '/network-administration/tools/traceroute',
        },
        {
          title: 'Device Discovery',
          href: '/network-administration/tools/discover-devices',
        },
        {
          title: 'DNS Lookup',
          href: '/network-administration/tools/dns-lookup',
        },
        {
          title: 'Port Scan',
          href: '/network-administration/tools/port-scan',
        },
        {
          title: 'Whois Lookup',
          href: '/network-administration/tools/whois-lookup',
        }
      ]
    },
    {
      id: 'snmp',
      title: 'SNMP Management',
      icon: '𓃉',
      color: '#a41c1b',
      gradient: 'linear-gradient(135deg, #a41c1b 0%, #8c1918 100%)',
      shadowColor: 'rgba(164, 28, 27, 0.5)',
      description: 'Device polling and monitoring with comprehensive SNMP support',
      href: '/network-administration/snmp',
      patternSvg: `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="20" r="5" fill="rgba(255,255,255,0.1)" />
        <circle cx="50" cy="50" r="5" fill="rgba(255,255,255,0.1)" />
        <circle cx="80" cy="80" r="5" fill="rgba(255,255,255,0.1)" />
        <circle cx="20" cy="80" r="5" fill="rgba(255,255,255,0.1)" />
        <circle cx="80" cy="20" r="5" fill="rgba(255,255,255,0.1)" />
      </svg>`,
      items: [
        {
          title: 'SNMP Dashboard',
          href: '/network-administration/snmp',
        },
        {
          title: 'Device Polling',
          href: '/network-administration/snmp/device-polling',
        },
        {
          title: 'SNMP Settings',
          href: '/network-administration/snmp/settings',
        },
        {
          title: 'OID Management',
          href: '/network-administration/snmp/oid',
        },
        {
          title: 'SNMP Templates',
          href: '/network-administration/snmp/templates',
        },
        {
          title: 'Polling Templates',
          href: '/network-administration/snmp/polling-templates',
        }
      ]
    },
    {
      id: 'icmp',
      title: 'ICMP Management',
      icon: '𓆓',
      color: '#346751',
      gradient: 'linear-gradient(135deg, #346751 0%, #2a5441 100%)',
      shadowColor: 'rgba(52, 103, 81, 0.5)',
      description: 'Real-time device status monitoring and template management',
      href: '/network-administration/icmp/polling',
      patternSvg: `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <path d="M10,10 L90,10 L90,90 L10,90 Z" stroke="rgba(255,255,255,0.1)" fill="none" />
        <path d="M10,30 L90,30 M10,50 L90,50 M10,70 L90,70" stroke="rgba(255,255,255,0.1)" />
        <path d="M30,10 L30,90 M50,10 L50,90 M70,10 L70,90" stroke="rgba(255,255,255,0.1)" />
      </svg>`,
      items: [
        {
          title: 'Network Monitoring',
          href: '/network-administration/icmp/polling',
        },
        {
          title: 'Device Status',
          href: '/network-administration/icmp/polling/device-status',
        },
        {
          title: 'Polling Templates',
          href: '/network-administration/icmp/polling/templates',
        },
        {
          title: 'Monitoring Templates',
          href: '/network-administration/icmp/templates',
        }
      ]
    }
  ]
  
  // Loading screen with Egyptian theme
  if (isLoading) {
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
      }, 'Loading Network Administration...'),
      h('style', null, `
        @keyframes spin {
          from { transform: rotateY(0deg); }
          to { transform: rotateY(360deg); }
        }
      `)
    )
  }

  // Main application UI
  return h(
    'div',
    {
      style: {
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '24px',
        fontFamily: 'Roboto, system-ui, -apple-system, sans-serif',
        backgroundColor: '#f8f0dd',
        minHeight: '100vh',
      },
    },
    // Header with Egyptian/Thoth styling
    h(
      'header',
      {
        style: {
          marginBottom: '32px',
          textAlign: 'center',
          borderBottom: '2px solid #d4af37',
          paddingBottom: '24px',
          position: 'relative',
        },
      },
      // Thoth-themed eye of Horus decorations
      h('div', {
        style: {
          position: 'absolute',
          top: '10px',
          left: '20px',
          fontSize: '32px',
          color: '#a41c1b',
          fontFamily: 'serif',
          filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.2))',
        }
      }, '𓂀'),
      h('div', {
        style: {
          position: 'absolute',
          top: '10px',
          right: '20px',
          fontSize: '32px',
          color: '#a41c1b',
          fontFamily: 'serif',
          transform: 'scaleX(-1)',
          filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.2))',
        }
      }, '𓂀'),
      
      h(
        'h1',
        {
          style: {
            margin: '0 0 16px 0',
            color: '#a41c1b',
            fontSize: '2.5rem',
            fontFamily: 'Cinzel, serif',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            textShadow: '0 2px 4px rgba(0,0,0,0.1)',
            position: 'relative',
            display: 'inline-block',
          },
        },
        'Network Administration',
        // Decorative underline
        h('div', {
          style: {
            position: 'absolute',
            bottom: '-5px',
            left: '0',
            right: '0',
            height: '3px',
            background: 'linear-gradient(90deg, transparent, #d4af37, transparent)',
          }
        })
      ),
      h(
        'p',
        {
          style: {
            margin: '0 0 20px 0',
            color: '#2c1608',
            fontSize: '1.1rem',
            fontFamily: 'Roboto, sans-serif',
          },
        },
        'Select a category to manage your network'
      ),
      // Navigation buttons
      h(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'center',
            gap: '15px',
            marginTop: '20px',
          }
        },
        h('a', {
          href: '/',
          style: {
            textDecoration: 'none',
            color: '#1f4e5f',
            fontSize: '14px',
            padding: '8px 15px',
            borderRadius: '4px',
            background: 'rgba(31, 78, 95, 0.1)',
            display: 'flex',
            alignItems: 'center',
            transition: 'all 0.2s ease',
            border: '1px solid #1f4e5f',
          },
          onMouseEnter: (e) => {
            e.currentTarget.style.background = 'rgba(31, 78, 95, 0.2)';
          },
          onMouseLeave: (e) => {
            e.currentTarget.style.background = 'rgba(31, 78, 95, 0.1)';
          }
        }, '← Back to Home')
      )
    ),

    // Main content - Grid of admin sections
    h(
      'main',
      null,
      // Section tiles 
      h(
        'div',
        {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '25px',
            marginBottom: '40px',
          }
        },
        // Create admin section tiles
        adminSections.map(section => 
          h(
            'div',
            {
              key: section.id,
              style: {
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: hoveredTile === section.id ? 
                  `0 20px 25px -5px ${section.shadowColor}, 0 10px 10px -5px ${section.shadowColor}` : 
                  '0 5px 15px rgba(0,0,0,0.1)',
                transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                transform: hoveredTile === section.id ? 'translateY(-8px) scale(1.02)' : 'translateY(0)',
                cursor: 'pointer',
                position: 'relative',
                height: '280px',
                display: 'flex',
                flexDirection: 'column',
              },
              onClick: () => {
                // For SNMP section, always go to the SNMP home page
                if (section.id === 'snmp') {
                  window.location.href = section.href;
                }
                // For other sections: if they have only one item, go directly to that item
                else if (section.items && section.items.length === 1) {
                  window.location.href = section.items[0].href;
                } else {
                  // Otherwise go to the section's page to show multiple options
                  window.location.href = section.href;
                }
              },
              onMouseEnter: () => setHoveredTile(section.id),
              onMouseLeave: () => setHoveredTile(null),
            },
            // Background pattern
            h('div', {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                opacity: 0.2,
                backgroundImage: `url('data:image/svg+xml;base64,${btoa(section.patternSvg)}')`,
                backgroundSize: '100px 100px',
              }
            }),
            // Icon area
            h('div', {
              style: {
                background: section.gradient || section.color,
                padding: '30px 20px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                position: 'relative',
                overflow: 'hidden',
                flex: 1,
              }
            },
            // Main icon
            h('span', {
              style: {
                fontSize: '80px',
                color: '#f8f0dd',
                fontFamily: 'serif',
                textShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
                position: 'relative',
                zIndex: 2,
                transition: 'transform 0.3s ease',
                transform: hoveredTile === section.id ? 'scale(1.1)' : 'scale(1)',
              }
            }, section.icon),
            // Animated circle background
            h('div', {
              style: {
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: hoveredTile === section.id ? '200%' : '100%',
                height: hoveredTile === section.id ? '200%' : '100%',
                background: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 70%)',
                transform: 'translate(-50%, -50%)',
                transition: 'all 0.5s ease',
              }
            })),
            // Content area
            h('div', {
              style: {
                padding: '20px',
                textAlign: 'center',
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderTop: `4px solid ${section.color}`,
                position: 'relative',
                zIndex: 2,
              }
            },
            h('h3', {
              style: {
                margin: '0 0 8px 0',
                fontFamily: 'Cinzel, serif',
                color: '#1f4e5f',
                fontSize: '22px',
                position: 'relative',
                display: 'inline-block',
              }
            }, 
            section.title,
            // Animated underline on hover
            h('div', {
              style: {
                position: 'absolute',
                bottom: '-4px',
                left: '50%',
                width: hoveredTile === section.id ? '100%' : '0%',
                height: '2px',
                background: section.color,
                transition: 'all 0.3s ease',
                transform: 'translateX(-50%)',
              }
            })),
            h('p', {
              style: {
                margin: '0',
                fontSize: '14px',
                color: '#2c1608',
                maxWidth: '90%',
                marginLeft: 'auto',
                marginRight: 'auto',
              }
            }, section.description),
            // For sections with more than 1 item, show item count
            section.items && section.items.length > 1 && h('div', {
              style: {
                marginTop: '10px',
                padding: '5px 10px',
                borderRadius: '10px',
                backgroundColor: 'rgba(0,0,0,0.05)',
                display: 'inline-block',
                fontSize: '12px',
                color: section.color,
              }
            }, `${section.items.length} tools available`)),
            // Corner indicators
            hoveredTile === section.id && h('div', {
              style: {
                position: 'absolute',
                bottom: '10px',
                right: '10px',
                fontSize: '16px',
                color: section.color,
                zIndex: 3,
              }
            }, section.items && section.items.length === 1 ? 'Open Tool →' : 'View All →')
          )
        )
      )
    ),

    // Footer with Egyptian/Thoth theme
    h(
      'footer',
      {
        style: {
          marginTop: '60px',
          padding: '30px 16px',
          textAlign: 'center',
          borderTop: '1px solid #d4af37',
          color: '#1f4e5f',
          position: 'relative',
          fontFamily: 'Cinzel, serif',
        },
      },
      // Ankh symbol
      h('div', {
        style: {
          position: 'absolute',
          top: '-15px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#f8f0dd',
          padding: '0 15px',
          color: '#d4af37',
          fontSize: '24px',
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))',
        }
      }, '☥'),
      h(
        'p',
        { style: { margin: '0 0 15px 0', fontSize: '16px' } },
        'Thoth Network Proxy - Network Administration'
      )
    ),

    // Add animation keyframes
    h('style', null, `
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes pulse {
        0% { opacity: 0.6; }
        50% { opacity: 1; }
        100% { opacity: 0.6; }
      }
    `)
  )
}

/**
 * Initialize the React application
 */
const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(h(StrictMode, null, h(NetworkAdmin)))
} else {
  console.error('Root element not found!')
}