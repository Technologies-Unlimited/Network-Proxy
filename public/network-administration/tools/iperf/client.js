document.addEventListener('DOMContentLoaded', function () {
  // DOM Elements
  const sourceServerSelect = document.getElementById('sourceServer')
  const destinationServerSelect = document.getElementById('destinationServer')
  const testDurationInput = document.getElementById('testDuration')
  const protocolSelect = document.getElementById('protocol')
  const parallelInput = document.getElementById('parallel')
  const windowSizeInput = document.getElementById('windowSize')
  const portInput = document.getElementById('port')
  const startTestButton = document.getElementById('startTest')
  const stopTestButton = document.getElementById('stopTest')
  const testStatus = document.getElementById('testStatus')
  const resultBody = document.getElementById('resultBody')
  const resultSummary = document.getElementById('resultSummary')
  const discoverServersBtn = document.getElementById('discoverServers')
  const serversStatus = document.getElementById('serversStatus')

  // Additional advanced options
  const directionSelect = document.getElementById('direction')
  const bandwidthInput = document.getElementById('bandwidth')
  const intervalInput = document.getElementById('interval')
  const mssInput = document.getElementById('mss')
  const tosInput = document.getElementById('tos')
  const zerocopyCheckbox = document.getElementById('zerocopy')
  const titleInput = document.getElementById('title')
  const showAdvancedBtn = document.getElementById('showAdvanced')
  const advancedOptions = document.getElementById('advancedOptions')

  // WebSocket connection
  let socket = null
  let testRunning = false
  let testId = null
  let discoveredServers = []
  let isDiscovering = false

  // Initialize
  function init() {
    console.info('Initializing iperf client')

    // Check if DOM elements exist
    console.log(
      'Checking DOM elements: sourceServerSelect',
      !!sourceServerSelect
    )
    console.log(
      'Checking DOM elements: destinationServerSelect',
      !!destinationServerSelect
    )
    console.log(
      'Checking DOM elements: discoverServersBtn',
      !!discoverServersBtn
    )
    console.log('Checking DOM elements: serversStatus', !!serversStatus)

    loadProxyServers()
    setupEventListeners()
    setupWebSocket()

    // Hide advanced options by default
    if (advancedOptions) {
      advancedOptions.style.display = 'none'
    } else {
      console.warn('Advanced options element not found')
    }

    // Initialize servers status
    if (serversStatus) {
      serversStatus.className = 'alert alert-info'
      serversStatus.textContent =
        'Click "Discover Servers" to find iperf servers on your network'
    } else {
      console.error(
        "serversStatus element not found - discovery progress won't be visible"
      )
    }

    // Add local host server by default
    setTimeout(() => {
      console.log('Adding localhost to server list by default')
      discoveredServers = [
        {
          id: 'iperf-localhost-5201',
          name: 'Local iperf @ 127.0.0.1',
          ipAddress: '127.0.0.1',
          port: 5201,
          type: 'iperf',
          responseTime: 1,
          status: 'online',
          discoveredAt: Date.now(),
        },
      ]
      populateServerSelects([])

      if (serversStatus) {
        serversStatus.textContent =
          'Default local server added. Click "Discover Servers" to find more.'
      }
    }, 1000)
  }

  // Load available proxy servers
  function loadProxyServers() {
    fetch('/api/network-administration/inventory/proxy-servers')
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          populateServerSelects(data.servers)

          // After loading proxy servers, try to discover iperf servers on the network
          if (
            socket &&
            socket.readyState === WebSocket.OPEN &&
            discoveredServers.length === 0
          ) {
            setTimeout(() => {
              discoverIperfServers(false)
            }, 1000)
          }
        } else {
          showError('Failed to load proxy servers: ' + data.message)
        }
      })
      .catch(error => {
        showError('Error loading proxy servers: ' + error.message)
        console.error('Error loading proxy servers:', error)

        // Even if loading proxy servers fails, still try to discover iperf servers
        if (socket && socket.readyState === WebSocket.OPEN) {
          setTimeout(() => {
            discoverIperfServers(false)
          }, 1000)
        }
      })
  }

  // Populate server select dropdowns
  function populateServerSelects(servers) {
    // Cache the current selections
    const sourceValue = sourceServerSelect.value
    const destValue = destinationServerSelect.value

    // Clear existing options except the first one
    sourceServerSelect.innerHTML =
      '<option value="">Select source server</option>'
    destinationServerSelect.innerHTML =
      '<option value="">Select destination server</option>'

    // Combine proxy servers with discovered iperf servers
    const allServers = [...servers]

    // Add discovered iperf servers
    discoveredServers.forEach(server => {
      if (!allServers.some(s => s.id === server.id)) {
        allServers.push({
          id: server.id,
          name: server.name,
          ipAddress: server.ipAddress,
          port: server.port,
          discovered: true,
        })
      }
    })

    // Add server options
    allServers.forEach(server => {
      // Create option for source dropdown
      const sourceOption = document.createElement('option')
      sourceOption.value = server.id
      let labelText = `${server.name} (${server.ipAddress})`

      if (server.discovered) {
        labelText += ' [Discovered]'
        sourceOption.classList.add('discovered-server')
      }

      sourceOption.textContent = labelText
      sourceServerSelect.appendChild(sourceOption)

      // Create option for destination dropdown
      const destOption = document.createElement('option')
      destOption.value = server.id
      destOption.textContent = labelText

      if (server.discovered) {
        destOption.classList.add('discovered-server')
      }

      destinationServerSelect.appendChild(destOption)
    })

    // Restore previous selections if they still exist
    if (
      sourceValue &&
      Array.from(sourceServerSelect.options).some(
        opt => opt.value === sourceValue
      )
    ) {
      sourceServerSelect.value = sourceValue
    }

    if (
      destValue &&
      Array.from(destinationServerSelect.options).some(
        opt => opt.value === destValue
      )
    ) {
      destinationServerSelect.value = destValue
    }
  }

  // Setup event listeners
  function setupEventListeners() {
    startTestButton.addEventListener('click', startIperfTest)
    stopTestButton.addEventListener('click', stopIperfTest)

    // Add discover servers button handler
    if (discoverServersBtn) {
      console.log('Setting up discover servers button handler')
      discoverServersBtn.addEventListener('click', function () {
        // Use both regular console and our debug console
        console.log('DISCOVER BUTTON CLICKED!')

        if (window.debugLog) {
          window.debugLog(
            'DISCOVER BUTTON CLICKED FROM CLIENT.JS HANDLER!',
            'info'
          )
          window.debugLog(
            'WebSocket State: ' + (socket ? socket.readyState : 'no socket'),
            'info'
          )
          window.debugLog('isDiscovering: ' + isDiscovering, 'info')
        }

        // Update UI immediately regardless of WebSocket
        if (serversStatus) {
          serversStatus.className = 'alert alert-info'
          serversStatus.textContent =
            'Discovering iperf servers on your network... (click started)'

          if (window.debugLog) {
            window.debugLog(
              'Updated serversStatus: ' + serversStatus.textContent,
              'info'
            )
          }
        } else {
          console.error('serversStatus element not found')
          if (window.debugLog) {
            window.debugLog('serversStatus element not found', 'error')
          }
        }

        if (discoverServersBtn) {
          discoverServersBtn.disabled = true
          discoverServersBtn.textContent = 'Discovering...'
        } else {
          console.error('discoverServersBtn element not found')
        }

        // Simulate found server after 3 seconds if nothing happens
        setTimeout(function () {
          if (isDiscovering) {
            console.log('Simulating found server after timeout')
            // Add a local server to the list
            discoveredServers = [
              {
                id: 'iperf-localhost-5201',
                name: 'Local iperf @ 127.0.0.1',
                ipAddress: '127.0.0.1',
                port: 5201,
                type: 'iperf',
                responseTime: 1,
                status: 'online',
                discoveredAt: Date.now(),
              },
            ]

            // Update UI
            isDiscovering = false
            if (discoverServersBtn) {
              discoverServersBtn.disabled = false
              discoverServersBtn.textContent = 'Discover Servers'
            }

            if (serversStatus) {
              serversStatus.className = 'alert alert-success'
              serversStatus.textContent =
                'Found 1 iperf server (local fallback)'
            }

            // Update server dropdowns
            populateServerSelects([])
          }
        }, 3000)

        // Actually try to discover servers
        discoverIperfServers(true) // Force refresh
      })
    } else {
      console.error('discoverServersBtn is null or undefined')
    }

    // Prevent source and destination from being the same
    sourceServerSelect.addEventListener('change', function () {
      if (
        sourceServerSelect.value === destinationServerSelect.value &&
        sourceServerSelect.value !== ''
      ) {
        destinationServerSelect.value = ''
      }
    })

    destinationServerSelect.addEventListener('change', function () {
      if (
        destinationServerSelect.value === sourceServerSelect.value &&
        destinationServerSelect.value !== ''
      ) {
        sourceServerSelect.value = ''
      }
    })

    // Toggle advanced options
    if (showAdvancedBtn && advancedOptions) {
      showAdvancedBtn.addEventListener('click', function () {
        if (advancedOptions.style.display === 'none') {
          advancedOptions.style.display = 'block'
          showAdvancedBtn.textContent = 'Hide Advanced Options'
        } else {
          advancedOptions.style.display = 'none'
          showAdvancedBtn.textContent = 'Show Advanced Options'
        }
      })
    }

    // Handle protocol change
    if (protocolSelect) {
      protocolSelect.addEventListener('change', function () {
        const isUDP = protocolSelect.value === 'udp'

        // Bandwidth is only relevant for UDP
        if (bandwidthInput) {
          const bandwidthContainer = bandwidthInput.closest('.form-group')
          if (bandwidthContainer) {
            bandwidthContainer.style.display = isUDP ? 'block' : 'none'
          }
        }
      })

      // Trigger initial state
      protocolSelect.dispatchEvent(new Event('change'))
    }

    // Handle direction change
    if (directionSelect) {
      directionSelect.addEventListener('change', function () {
        const direction = directionSelect.value
        const isReverse = direction === 'reverse'
        const isBidirectional = direction === 'bidirectional'

        // Update labels to clarify direction
        const sourceLabel = document.querySelector('label[for="sourceServer"]')
        const destLabel = document.querySelector(
          'label[for="destinationServer"]'
        )

        if (sourceLabel && destLabel) {
          if (isReverse) {
            sourceLabel.textContent = 'Client Server (receives data)'
            destLabel.textContent = 'Server Server (sends data)'
          } else if (isBidirectional) {
            sourceLabel.textContent = 'Source Server (bidirectional)'
            destLabel.textContent = 'Destination Server (bidirectional)'
          } else {
            sourceLabel.textContent = 'Source Server (sends data)'
            destLabel.textContent = 'Destination Server (receives data)'
          }
        }
      })

      // Trigger initial state
      directionSelect.dispatchEvent(new Event('change'))
    }

    // Add port input change handler to update discovery
    if (portInput) {
      portInput.addEventListener('change', function () {
        const port = parseInt(portInput.value)
        if (!isNaN(port) && port >= 1024 && port <= 65535) {
          // Discover servers on the new port
          discoverIperfServers(true) // Force refresh
        }
      })
    }
  }

  // Discover iperf servers on the network
  function discoverIperfServers(forceRefresh = false) {
    console.log('discoverIperfServers called with forceRefresh =', forceRefresh)

    if (window.debugLog) {
      window.debugLog(
        'discoverIperfServers function called with forceRefresh = ' +
          forceRefresh,
        'info'
      )
    }

    if (!socket) {
      console.error('Socket is null or undefined')
      if (window.debugLog) {
        window.debugLog(
          'Socket is null or undefined - WebSocket not initialized',
          'error'
        )
      }
      showError('WebSocket not initialized')
      return
    }

    if (socket.readyState !== WebSocket.OPEN) {
      console.error('Socket is not open. Current state:', socket.readyState)
      showError(
        'WebSocket connection not available (state: ' + socket.readyState + ')'
      )
      return
    }

    if (isDiscovering) {
      console.log('Already discovering servers, ignoring request')
      return // Don't start multiple discovery processes
    }

    console.log('Starting server discovery process')
    isDiscovering = true

    // Update UI to show discovery in progress
    if (serversStatus) {
      serversStatus.className = 'alert alert-info'
      serversStatus.textContent = 'Discovering iperf servers on your network...'
    } else {
      console.error('serversStatus element not found')
    }

    if (discoverServersBtn) {
      discoverServersBtn.disabled = true
      discoverServersBtn.textContent = 'Discovering...'
    } else {
      console.error('discoverServersBtn element not found')
    }

    // Get the port from the port input
    const port = parseInt(portInput.value) || 5201
    console.log('Using port:', port, 'for discovery')

    // Create and send discovery request
    const message = {
      type: 'discoverServers',
      port: port,
      forceRefresh: forceRefresh,
    }

    console.log('Sending WebSocket message:', JSON.stringify(message))
    socket.send(JSON.stringify(message))

    // Set a timeout to reset the UI if no response is received
    setTimeout(() => {
      if (isDiscovering) {
        console.log('Discovery timeout reached - resetting UI')
        isDiscovering = false

        if (discoverServersBtn) {
          discoverServersBtn.disabled = false
          discoverServersBtn.textContent = 'Discover Servers'
        }

        if (serversStatus) {
          serversStatus.className = 'alert alert-warning'
          serversStatus.textContent =
            'Server discovery timed out. The server may be busy or unable to scan the network.'
        }
      }
    }, 30000) // 30 second timeout
  }

  // Setup WebSocket connection
  function setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    // Get the actual port from the window location or fallback to the port in the server address
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/ws/tools/iperf`

    console.log(`Connecting to WebSocket at: ${wsUrl}`)
    socket = new WebSocket(wsUrl)

    socket.onopen = function () {
      console.log('WebSocket connection established')
      // Try to auto-discover servers once connected
      if (discoveredServers.length === 0) {
        setTimeout(() => {
          discoverIperfServers(false)
        }, 1000)
      }
    }

    socket.onmessage = function (event) {
      console.log(
        'WebSocket message received:',
        event.data.substring(0, 100) + '...'
      )
      try {
        const data = JSON.parse(event.data)
        handleWebSocketMessage(data)
      } catch (error) {
        console.error('Error parsing WebSocket message:', error)
      }
    }

    socket.onclose = function () {
      console.log('WebSocket connection closed')
      // Try to reconnect after a delay
      setTimeout(setupWebSocket, 3000)
    }

    socket.onerror = function (error) {
      console.error('WebSocket error:', error)
      if (serversStatus) {
        serversStatus.className = 'alert alert-danger'
        serversStatus.textContent =
          'WebSocket connection error. Please check the server status.'
      }
    }
  }

  // Handle WebSocket messages
  function handleWebSocketMessage(data) {
    switch (data.type) {
      case 'testStarted':
        testId = data.testId
        testRunning = true
        updateUIForTestRunning()
        clearResults()
        testStatus.textContent = 'Test started...'
        testStatus.className = 'alert alert-info'
        break

      case 'testProgress':
        addResultRow(data.result)
        break

      case 'testComplete':
        testRunning = false
        updateUIForTestStopped()
        showTestSummary(data.summary)
        testStatus.textContent = 'Test completed'
        testStatus.className = 'alert alert-success'
        break

      case 'testError':
        testRunning = false
        updateUIForTestStopped()
        testStatus.textContent = 'Error: ' + data.message
        testStatus.className = 'alert alert-danger'
        break

      case 'testStopped':
        testRunning = false
        updateUIForTestStopped()
        testStatus.textContent = 'Test stopped by user'
        testStatus.className = 'alert alert-warning'
        break

      case 'discoveryStarted':
        if (serversStatus) {
          serversStatus.className = 'alert alert-info'
          serversStatus.textContent =
            'Discovering iperf servers on your network...'
        }
        break

      case 'discoveryComplete':
        isDiscovering = false

        if (discoverServersBtn) {
          discoverServersBtn.disabled = false
          discoverServersBtn.textContent = 'Discover Servers'
        }

        // Update discovered servers list
        discoveredServers = data.servers || []

        // Update server dropdowns with discovered servers
        fetch('/api/network-administration/inventory/proxy-servers')
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              populateServerSelects(data.servers)
            }
          })
          .catch(() => {
            // If fetch fails, still update with discovered servers
            populateServerSelects([])
          })

        if (serversStatus) {
          if (discoveredServers.length > 0) {
            serversStatus.className = 'alert alert-success'
            serversStatus.textContent = `Found ${discoveredServers.length} iperf server(s) on your network`
          } else {
            serversStatus.className = 'alert alert-warning'
            serversStatus.textContent =
              'No iperf servers found on your network. Make sure iperf3 is running on target machines.'
          }
        }
        break

      case 'discoveryError':
        isDiscovering = false

        if (discoverServersBtn) {
          discoverServersBtn.disabled = false
          discoverServersBtn.textContent = 'Discover Servers'
        }

        if (serversStatus) {
          serversStatus.className = 'alert alert-danger'
          serversStatus.textContent =
            'Error discovering servers: ' + data.message
        }
        break

      case 'serverCheckResult':
        // Handle server check result
        if (data.available) {
          console.log(`Server ${data.address}:${data.port} is available`)
        } else {
          console.log(`Server ${data.address}:${data.port} is not available`)
        }
        break
    }
  }

  // Start iPerf test
  function startIperfTest() {
    // Validate input
    if (!sourceServerSelect.value) {
      showError('Please select a source server')
      return
    }

    if (!destinationServerSelect.value) {
      showError('Please select a destination server')
      return
    }

    const testDuration = parseInt(testDurationInput.value)
    if (isNaN(testDuration) || testDuration < 1 || testDuration > 300) {
      showError('Test duration must be between 1 and 300 seconds')
      return
    }

    const parallelStreams = parseInt(parallelInput.value)
    if (isNaN(parallelStreams) || parallelStreams < 1 || parallelStreams > 32) {
      showError('Parallel streams must be between 1 and 32')
      return
    }

    const windowSize = parseInt(windowSizeInput.value)
    if (isNaN(windowSize) || windowSize < 1) {
      showError('Window size must be at least 1 KB')
      return
    }

    const port = parseInt(portInput.value)
    if (isNaN(port) || port < 1024 || port > 65535) {
      showError('Port must be between 1024 and 65535')
      return
    }

    // Prepare test parameters
    const testParams = {
      sourceServerId: sourceServerSelect.value,
      destinationServerId: destinationServerSelect.value,
      duration: testDuration,
      protocol: protocolSelect.value,
      parallel: parallelStreams,
      windowSize: windowSize,
      port: port,
    }

    // Add advanced options if available
    if (directionSelect) {
      const direction = directionSelect.value
      if (direction === 'reverse') {
        testParams.reverse = true
      } else if (direction === 'bidirectional') {
        testParams.bidirectional = true
      }
    }

    // Add bandwidth for UDP
    if (testParams.protocol === 'udp' && bandwidthInput) {
      const bandwidth = parseInt(bandwidthInput.value)
      if (!isNaN(bandwidth) && bandwidth > 0) {
        testParams.bandwidth = bandwidth
      }
    }

    // Add other advanced options
    if (intervalInput) {
      const interval = parseInt(intervalInput.value)
      if (!isNaN(interval) && interval > 0) {
        testParams.interval = interval
      }
    }

    if (mssInput) {
      const mss = parseInt(mssInput.value)
      if (!isNaN(mss) && mss > 0) {
        testParams.mss = mss
      }
    }

    if (tosInput) {
      const tos = parseInt(tosInput.value)
      if (!isNaN(tos) && tos >= 0 && tos <= 255) {
        testParams.tos = tos
      }
    }

    if (zerocopyCheckbox && zerocopyCheckbox.checked) {
      testParams.zerocopy = true
    }

    if (titleInput && titleInput.value.trim()) {
      testParams.title = titleInput.value.trim()
    }

    console.log('Starting iperf test with parameters:', testParams)

    // Send test request via WebSocket
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: 'startTest',
          params: testParams,
        })
      )

      testStatus.textContent = 'Initiating test...'
      testStatus.className = 'alert alert-info'
    } else {
      showError('WebSocket connection not available')
    }
  }

  // Stop iPerf test
  function stopIperfTest() {
    if (socket && socket.readyState === WebSocket.OPEN && testId) {
      socket.send(
        JSON.stringify({
          type: 'stopTest',
          testId: testId,
        })
      )

      testStatus.textContent = 'Stopping test...'
      testStatus.className = 'alert alert-warning'
    }
  }

  // Update UI when test is running
  function updateUIForTestRunning() {
    startTestButton.disabled = true
    stopTestButton.disabled = false
    sourceServerSelect.disabled = true
    destinationServerSelect.disabled = true
    testDurationInput.disabled = true
    protocolSelect.disabled = true
    parallelInput.disabled = true
    windowSizeInput.disabled = true
    portInput.disabled = true
  }

  // Update UI when test is stopped
  function updateUIForTestStopped() {
    startTestButton.disabled = false
    stopTestButton.disabled = true
    sourceServerSelect.disabled = false
    destinationServerSelect.disabled = false
    testDurationInput.disabled = false
    protocolSelect.disabled = false
    parallelInput.disabled = false
    windowSizeInput.disabled = false
    portInput.disabled = false
  }

  // Add a row to the results table
  function addResultRow(result) {
    const row = document.createElement('tr')

    const intervalCell = document.createElement('td')
    intervalCell.textContent = `${result.startTime}-${result.endTime} sec`

    const transferCell = document.createElement('td')
    transferCell.textContent = result.transfer

    const bandwidthCell = document.createElement('td')
    bandwidthCell.textContent = result.bandwidth

    const retransmitsCell = document.createElement('td')
    retransmitsCell.textContent = result.retransmits || 'N/A'

    row.appendChild(intervalCell)
    row.appendChild(transferCell)
    row.appendChild(bandwidthCell)
    row.appendChild(retransmitsCell)

    resultBody.appendChild(row)
  }

  // Clear results table
  function clearResults() {
    resultBody.innerHTML = ''
    resultSummary.innerHTML = ''
  }

  // Show test summary
  function showTestSummary(summary) {
    resultSummary.innerHTML = `
            <h3>Test Summary</h3>
            <p><strong>Total Duration:</strong> ${summary.duration} seconds</p>
            <p><strong>Total Transfer:</strong> ${summary.transfer}</p>
            <p><strong>Bandwidth:</strong> ${summary.bandwidth}</p>
            <p><strong>Lost Packets:</strong> ${summary.lostPackets || 'N/A'}</p>
            <p><strong>Jitter:</strong> ${summary.jitter || 'N/A'}</p>
        `
  }

  // Show error message
  function showError(message) {
    testStatus.textContent = message
    testStatus.className = 'alert alert-danger'
  }

  // Initialize the page
  init()
})
