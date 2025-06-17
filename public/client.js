/**
 * Main client entry point for the Network-Proxy application
 * Thoth/Egyptian-themed UI with improved UX
 */

// Using React CDN imports - these will be loaded from the HTML file
const { createElement: h, StrictMode, useState, useEffect, Fragment } = React
const { createRoot } = ReactDOM

/**
 * App component that serves as the main layout for the application
 */
const App = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [wisdom, setWisdom] = useState('')
  const [activeSection, setActiveSection] = useState(null)
  const [hoveredTile, setHoveredTile] = useState(null)

  useEffect(() => {
    // Simulate data loading for better UX
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1000)

    // Array of Thoth/Egyptian wisdom quotes
    const wisdomQuotes = [
      "True wisdom comes to those who seek knowledge beyond the visible realm.",
      "As above, so below; as within, so without.",
      "Balance in all things is the secret to eternal harmony.",
      "Words are sacred; they hold the power of creation and destruction.",
      "The path to enlightenment begins with measurement and calculation.",
      "The universe reveals its secrets to those who learn its language.",
      "Knowledge becomes wisdom when applied with understanding.",
      "The scribe who masters the hieroglyphs masters the world of forms.",
    ]
    
    // Select random wisdom quote
    setWisdom(wisdomQuotes[Math.floor(Math.random() * wisdomQuotes.length)])
    
    return () => clearTimeout(timer)
  }, [])

  // Navigation data
  const navigationSections = [
    {
      id: 'inventory',
      title: 'Inventory Management',
      icon: '𓊽',
      color: '#d4af37',
      gradient: 'linear-gradient(135deg, #d4af37 0%, #b0903b 100%)',
      shadowColor: 'rgba(212, 175, 55, 0.5)',
      description: 'Complete network inventory management with device tracking',
      href: '/network-administration/inventory',
      details: 'Manage network inventory with devices, SKU, serial numbers, and MAC addresses',
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
          icon: '𓃀',
          description: 'Test network connectivity with IP address and hostname'
        },
        {
          title: 'Traceroute Tool',
          href: '/network-administration/tools/traceroute',
          icon: '𓇋',
          description: 'Trace network paths with max hops, IP address, and hostname'
        },
        {
          title: 'Device Discovery',
          href: '/network-administration/tools/discover-devices',
          icon: '𓊝',
          description: 'Discover network devices and browse MIBs with subnet scanning'
        },
        {
          title: 'DNS Lookup',
          href: '/network-administration/tools/dns-lookup',
          icon: '𓅱',
          description: 'Perform DNS lookups and domain analysis'
        },
        {
          title: 'Port Scan',
          href: '/network-administration/tools/port-scan',
          icon: '𓇍',
          description: 'Scan network ports to check services and security'
        },
        {
          title: 'Whois Lookup',
          href: '/network-administration/tools/whois-lookup',
          icon: '𓎛',
          description: 'Look up domain registration information'
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
          icon: '𓅓',
          description: 'Centralized management for SNMP monitoring and configuration'
        },
        {
          title: 'Device Polling',
          href: '/network-administration/snmp/device-polling',
          icon: '𓅓',
          description: 'View SNMP device polling status with uptime, downtime, and device status'
        },
        {
          title: 'SNMP Settings',
          href: '/network-administration/snmp/settings',
          icon: '𓃀',
          description: 'Manage SNMPv2 and SNMPv3 authentication settings'
        },
        {
          title: 'OID Management',
          href: '/network-administration/snmp/oid',
          icon: '𓇋',
          description: 'Manage SNMP Object Identifiers (OIDs) for monitoring'
        },
        {
          title: 'SNMP Templates',
          href: '/network-administration/snmp/templates',
          icon: '𓊝',
          description: 'Create and manage templates that combine SNMP settings and OIDs'
        },
        {
          title: 'Polling Templates',
          href: '/network-administration/snmp/polling-templates',
          icon: '𓊖',
          description: 'Configure SNMP polling frequency, timeouts, and retries'
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
          icon: '𓇯',
          description: 'Real-time ICMP network monitoring dashboard with continuous polling and alerts'
        },
        {
          title: 'Device Status',
          href: '/network-administration/icmp/polling/device-status',
          icon: '𓈗',
          description: 'Real-time network device status monitoring via ICMP'
        },
        {
          title: 'Polling Templates',
          href: '/network-administration/icmp/polling/templates',
          icon: '𓊖',
          description: 'View and manage ICMP polling templates for network device monitoring'
        },
        {
          title: 'Monitoring Templates',
          href: '/network-administration/icmp/templates',
          icon: '𓊗',
          description: 'View and manage ICMP monitoring templates with thresholds'
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
      }, 'Loading the Scrolls of Knowledge...'),
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
            fontSize: '3rem',
            fontFamily: 'Cinzel, serif',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            textShadow: '0 2px 4px rgba(0,0,0,0.1)',
            position: 'relative',
            display: 'inline-block',
          },
        },
        'Thoth Network Proxy',
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
        'Comprehensive network administration and monitoring platform guided by ancient wisdom'
      ),
      // Always visible wisdom quote
      h(
        'div',
        {
          style: {
            margin: '0 auto',
            padding: '16px',
            maxWidth: '700px',
            backgroundColor: 'rgba(31, 78, 95, 0.05)',
            border: '1px solid #d4af37',
            borderRadius: '4px',
            position: 'relative',
            boxShadow: '0 3px 6px rgba(0,0,0,0.05)',
          }
        },
        h('span', {
          style: {
            position: 'absolute',
            top: '-10px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#f8f0dd',
            padding: '0 10px',
            color: '#a41c1b',
            fontSize: '16px',
            fontFamily: 'serif',
          }
        }, '𓏞'),
        h('p', {
          style: {
            fontStyle: 'italic',
            color: '#2c1608',
            textAlign: 'center',
            margin: 0,
            fontFamily: 'Cinzel, serif',
            fontSize: '16px',
            lineHeight: 1.6,
          }
        }, `"${wisdom}"`)
      )
    ),

    // Main content
    h(
      'main',
      null,
      // Main navigation tiles 
      h(
        'div',
        {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '25px',
            marginBottom: '40px',
          }
        },
        // Create main navigation tiles
        navigationSections.map(section => 
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
                transform: hoveredTile === section.id ? 'translateY(-15px) scale(1.03)' : 
                  activeSection === section.id ? 'translateY(-5px)' : 'translateY(0)',
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
            }, section.description)),
            // Active indicator
            activeSection === section.id && h('div', {
              style: {
                position: 'absolute',
                bottom: '0',
                left: '0',
                right: '0',
                height: '5px',
                backgroundColor: section.color,
                animation: 'pulse 2s infinite',
              }
            }),
            // Corner ribbons for active section
            activeSection === section.id && h('div', {
              style: {
                position: 'absolute',
                top: '0',
                right: '0',
                width: '30px',
                height: '30px',
                background: section.color,
                clipPath: 'polygon(0 0, 100% 100%, 100% 0)',
                zIndex: 3,
              }
            })
          )
        )
      ),

      // Active section detail view
      activeSection && h(
        'div',
        {
          style: {
            marginBottom: '40px',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            borderRadius: '12px',
            border: `2px solid ${navigationSections.find(s => s.id === activeSection)?.color || '#d4af37'}`,
            overflow: 'hidden',
            animation: 'slideUp 0.4s ease-out',
            boxShadow: `0 15px 30px ${navigationSections.find(s => s.id === activeSection)?.shadowColor || 'rgba(0,0,0,0.1)'}, 0 10px 10px ${navigationSections.find(s => s.id === activeSection)?.shadowColor || 'rgba(0,0,0,0.05)'}`,
          }
        },
        // Section header
        h('div', {
          style: {
            background: navigationSections.find(s => s.id === activeSection)?.gradient || 
              navigationSections.find(s => s.id === activeSection)?.color || '#d4af37',
            padding: '20px 25px',
            display: 'flex',
            alignItems: 'center',
            color: '#f8f0dd',
            position: 'relative',
            overflow: 'hidden',
          }
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
            backgroundImage: `url('data:image/svg+xml;base64,${btoa(navigationSections.find(s => s.id === activeSection)?.patternSvg || '')}}')`,
            backgroundSize: '100px 100px',
          }
        }),
        h('span', {
          style: {
            fontSize: '32px',
            marginRight: '15px',
            fontFamily: 'serif',
            filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))',
            zIndex: 1,
          }
        }, navigationSections.find(s => s.id === activeSection)?.icon),
        h('h2', {
          style: {
            margin: '0',
            fontFamily: 'Cinzel, serif',
            fontSize: '24px',
            flex: 1,
            textShadow: '0 2px 4px rgba(0,0,0,0.2)',
            zIndex: 1,
          }
        }, navigationSections.find(s => s.id === activeSection)?.title),
        h('a', {
          href: (() => {
            const section = navigationSections.find(s => s.id === activeSection);
            // For SNMP section, always go to the SNMP home page
            if (section?.id === 'snmp') {
              return section.href;
            }
            // For other sections: if they have only one item, link directly to that item
            else if (section?.items && section.items.length === 1) {
              return section.items[0].href;
            }
            // Otherwise link to the section's main page
            return section?.href;
          })(),
          style: {
            color: '#f8f0dd',
            textDecoration: 'none',
            fontSize: '14px',
            padding: '8px 15px',
            border: '1px solid rgba(248, 240, 221, 0.5)',
            borderRadius: '30px',
            transition: 'all 0.2s ease',
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(5px)',
            zIndex: 1,
          },
          onMouseEnter: (e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 5px 10px rgba(0,0,0,0.1)';
          },
          onMouseLeave: (e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }
        }, (() => {
          const section = navigationSections.find(s => s.id === activeSection);
          return (section?.items && section.items.length === 1) ? 'Go to Tool' : 'View All';
        })())),
        // Section content
        h('div', {
          style: {
            padding: '25px',
            position: 'relative',
          }
        },
        // Egyptian-style divider
        h('div', {
          style: {
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '150px',
            height: '2px',
            background: `linear-gradient(90deg, transparent, ${navigationSections.find(s => s.id === activeSection)?.color || '#d4af37'}, transparent)`,
          }
        }),
        // Show section details if it exists
        navigationSections.find(s => s.id === activeSection)?.details && 
        h('p', {
          style: {
            margin: '0 0 25px 0',
            fontSize: '16px',
            fontStyle: 'italic',
            color: '#2c1608',
            textAlign: 'center',
            maxWidth: '700px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }
        }, navigationSections.find(s => s.id === activeSection)?.details),
        // Show section items if they exist
        navigationSections.find(s => s.id === activeSection)?.items && 
        h('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
            gap: '20px',
          }
        },
        navigationSections.find(s => s.id === activeSection)?.items.map((item, index) => 
          h('a', {
            key: item.href,
            href: item.href,
            style: {
              display: 'flex',
              alignItems: 'center',
              padding: '16px',
              textDecoration: 'none',
              color: '#1f4e5f',
              backgroundColor: 'rgba(255, 255, 255, 0.7)',
              borderRadius: '8px',
              border: `1px solid ${navigationSections.find(s => s.id === activeSection)?.color || '#d4af37'}`,
              transition: 'all 0.3s ease',
              animation: `fadeIn 0.5s ease forwards ${0.1 + (index * 0.05)}s`,
              opacity: 0,
              transform: 'translateY(10px)',
              position: 'relative',
              overflow: 'hidden',
            },
            onMouseEnter: (e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
              e.currentTarget.style.transform = 'translateY(-5px)';
              e.currentTarget.style.boxShadow = `0 10px 15px -3px ${navigationSections.find(s => s.id === activeSection)?.shadowColor || 'rgba(0,0,0,0.1)'}, 0 4px 6px -2px ${navigationSections.find(s => s.id === activeSection)?.shadowColor || 'rgba(0,0,0,0.05)'}`;
            },
            onMouseLeave: (e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }
          },
          // Item icon with circle background
          h('div', {
            style: {
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              backgroundColor: navigationSections.find(s => s.id === activeSection)?.color || '#d4af37',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: '15px',
              flexShrink: 0,
              position: 'relative',
              overflow: 'hidden',
            }
          },
          // Icon background glow
          h('div', {
            style: {
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 70%)',
            }
          }),
          h('span', {
            style: {
              fontSize: '24px',
              color: '#f8f0dd',
              fontFamily: 'serif',
              textShadow: '0 1px 2px rgba(0,0,0,0.2)',
              position: 'relative',
              zIndex: 1,
            }
          }, item.icon)),
          // Item content
          h('div', {
            style: {
              flex: 1,
            }
          },
          h('div', {
            style: {
              fontWeight: 'bold',
              marginBottom: '5px',
              fontSize: '16px',
              color: '#1f4e5f',
            }
          }, item.title),
          h('div', {
            style: {
              fontSize: '13px',
              color: '#555',
              lineHeight: 1.4,
            }
          }, item.description)),
          // Arrow indicator
          h('div', {
            style: {
              fontSize: '16px',
              color: navigationSections.find(s => s.id === activeSection)?.color || '#d4af37',
              marginLeft: '10px',
              opacity: 0,
              transform: 'translateX(-10px)',
              transition: 'all 0.3s ease',
            },
            className: 'item-arrow',
          }, '→')
          ))
        ))
      ),

      // Decorative divider
      h('div', { 
        className: 'divider',
        style: {
          height: '3px',
          background: 'linear-gradient(90deg, transparent, #d4af37, transparent)',
          margin: '40px 0',
          position: 'relative',
        }
      },
      // Center ankh symbol
      h('span', {
        style: {
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: '#f8f0dd',
          padding: '0 15px',
          color: '#d4af37',
          fontSize: '20px',
        }
      }, '☥')),

      // Feature showcase with cards for options not selected
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '30px',
          }
        },
        // Title
        h('h2', {
          style: {
            fontFamily: 'Cinzel, serif',
            color: '#1f4e5f',
            fontSize: '26px',
            textAlign: 'center',
            margin: '0 0 10px 0',
            position: 'relative',
            paddingBottom: '15px',
          }
        }, 'Discover More Network Tools',
        // Animated underline
        h('div', {
          style: {
            position: 'absolute',
            bottom: '0',
            left: '50%',
            width: '100px',
            height: '2px',
            background: '#d4af37',
            transform: 'translateX(-50%)',
          }
        })),
        
        // Showcase cards - show other options not currently selected
        h('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '25px',
          }
        },
        navigationSections
          .filter(section => section.id !== activeSection)
          .map((section, index) => 
            h('a', {
              key: section.id,
              href: section.id === 'snmp' ? section.href : (section.items && section.items.length === 1 ? section.items[0].href : section.href),
              style: {
                display: 'flex',
                flexDirection: 'column',
                textDecoration: 'none',
                color: 'inherit',
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                borderRadius: '10px',
                overflow: 'hidden',
                border: `1px solid ${section.color}`,
                transition: 'all 0.3s ease',
                animation: `fadeIn 0.5s ease forwards ${0.2 + (index * 0.1)}s`,
                opacity: 0,
                transform: 'translateY(20px)',
                position: 'relative',
              },
              onMouseEnter: (e) => {
                e.currentTarget.style.transform = 'translateY(-8px)';
                e.currentTarget.style.boxShadow = `0 15px 30px -10px ${section.shadowColor}`;
              },
              onMouseLeave: (e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }
            },
            // Card pattern background
            h('div', {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                opacity: 0.05,
                backgroundImage: `url('data:image/svg+xml;base64,${btoa(section.patternSvg || '')}}')`,
                backgroundSize: '100px 100px',
                zIndex: 0,
              }
            }),
            // Card header
            h('div', {
              style: {
                background: section.gradient || section.color,
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                color: '#f8f0dd',
                position: 'relative',
                zIndex: 1,
              }
            },
            h('span', {
              style: {
                fontSize: '28px',
                marginRight: '12px',
                fontFamily: 'serif',
                textShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }
            }, section.icon),
            h('h3', {
              style: {
                margin: '0',
                fontFamily: 'Cinzel, serif',
                fontSize: '20px',
                textShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }
            }, section.title)),
            // Card content
            h('div', {
              style: {
                padding: '20px',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                zIndex: 1,
              }
            },
            h('p', {
              style: {
                margin: '0 0 auto 0',
                fontSize: '15px',
                color: '#2c1608',
                lineHeight: 1.5,
              }
            }, section.description),
            h('div', {
              style: {
                marginTop: '20px',
                alignSelf: 'flex-end',
                fontSize: '14px',
                color: section.color,
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                padding: '8px 0',
                position: 'relative',
              }
            }, 'Explore ',
            h('span', { 
              style: { 
                marginLeft: '4px',
                transition: 'transform 0.2s ease',
                display: 'inline-block',
              },
              className: 'arrow-icon'
            }, '→'),
            // Animated underline
            h('div', {
              style: {
                position: 'absolute',
                bottom: '0',
                left: '0',
                width: '0',
                height: '2px',
                background: section.color,
                transition: 'width 0.3s ease',
              },
              className: 'explore-underline'
            })))
          ))
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
        { style: { margin: '0 0 15px 0', fontSize: '18px' } },
        'Thoth Network Proxy - Wisdom in Network Management'
      ),
      // Hieroglyphic text decoration
      h(
        'div',
        { 
          style: { 
            fontSize: '16px',
            opacity: 0.7,
            letterSpacing: '3px',
            marginTop: '10px',
          } 
        },
        '𓏞 𓂋𓏛 𓏏𓅱𓄿 𓊃𓏏 𓌸𓂋𓏏𓈉'
      )
    ),

    // Add animation keyframes
    h('style', null, `
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(30px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes pulse {
        0% { opacity: 0.6; }
        50% { opacity: 1; }
        100% { opacity: 0.6; }
      }
      
      a:hover .item-arrow {
        opacity: 1;
        transform: translateX(0);
      }
      
      a:hover .arrow-icon {
        transform: translateX(5px);
      }
      
      a:hover .explore-underline {
        width: 100%;
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
  root.render(h(StrictMode, null, h(App)))
} else {
  console.error('Root element not found!')
}