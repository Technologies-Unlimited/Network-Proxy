// Debug logger for iperf client
;(function () {
  // Create a global debug function
  window.debugLog = function (message, type = 'log') {
    // Log to both console and our custom UI
    console[type](message)

    if (window.logToDebugConsole) {
      window.logToDebugConsole(message, type)
    }
  }

  const logContainer = document.createElement('div')
  logContainer.id = 'debugLog'
  logContainer.style.cssText = `
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: 200px;
        background: rgba(0, 0, 0, 0.8);
        color: lime;
        font-family: monospace;
        padding: 10px;
        overflow-y: auto;
        z-index: 9999;
        font-size: 12px;
        white-space: pre-wrap;
        display: block;
    `

  // Add toggle button
  const toggleButton = document.createElement('button')
  toggleButton.textContent = 'Toggle Debug Log'
  toggleButton.style.cssText = `
        position: fixed;
        bottom: 200px;
        right: 10px;
        z-index: 10000;
        background: #333;
        color: white;
        border: none;
        padding: 5px 10px;
        cursor: pointer;
    `
  toggleButton.addEventListener('click', function () {
    if (logContainer.style.display === 'none') {
      logContainer.style.display = 'block'
      toggleButton.style.bottom = '200px'
    } else {
      logContainer.style.display = 'none'
      toggleButton.style.bottom = '0'
    }
  })

  // Add clear button
  const clearButton = document.createElement('button')
  clearButton.textContent = 'Clear Log'
  clearButton.style.cssText = `
        position: fixed;
        bottom: 200px;
        right: 130px;
        z-index: 10000;
        background: #333;
        color: white;
        border: none;
        padding: 5px 10px;
        cursor: pointer;
    `
  clearButton.addEventListener('click', function () {
    logContainer.innerHTML = ''
  })

  // Add elements to the page when DOM is loaded
  document.addEventListener('DOMContentLoaded', function () {
    document.body.appendChild(logContainer)
    document.body.appendChild(toggleButton)
    document.body.appendChild(clearButton)

    // Log function
    window.logToDebugConsole = function (message, type = 'log') {
      const timestamp = new Date().toISOString().split('T')[1].split('.')[0]
      let messageStr

      if (typeof message === 'object') {
        try {
          messageStr = JSON.stringify(message, null, 2)
        } catch (e) {
          messageStr = String(message)
        }
      } else {
        messageStr = String(message)
      }

      let color
      switch (type) {
        case 'error':
          color = '#ff5555'
          break
        case 'warn':
          color = '#ffaa00'
          break
        case 'info':
          color = '#55aaff'
          break
        default:
          color = 'lime'
      }

      const logEntry = document.createElement('div')
      logEntry.style.color = color
      logEntry.textContent = `[${timestamp}] [${type.toUpperCase()}] ${messageStr}`
      logContainer.appendChild(logEntry)
      logContainer.scrollTop = logContainer.scrollHeight
    }

    // Log initialization
    window.debugLog('Debug logger initialized', 'info')

    // Monkey-patch the discoverServersBtn click handler to add extra logging
    setTimeout(function () {
      try {
        const discoverBtn = document.getElementById('discoverServers')
        if (discoverBtn) {
          // Save the original click handlers
          const originalClick = discoverBtn.onclick
          const originalListeners = []

          // Create our enhanced click handler
          function enhancedClickHandler(event) {
            debugLog('DISCOVER BUTTON CLICKED - Enhanced handler', 'info')
            debugLog(
              'Button state: ' +
                (discoverBtn.disabled ? 'disabled' : 'enabled'),
              'info'
            )

            // Create direct visual feedback even if WebSocket fails
            const serversStatus = document.getElementById('serversStatus')
            if (serversStatus) {
              serversStatus.className = 'alert alert-info'
              serversStatus.textContent =
                'Discovering iperf servers... (enhanced click handler)'
              debugLog('Updated serversStatus element', 'info')
            } else {
              debugLog('serversStatus element not found!', 'error')
            }

            // Disable the button during discovery
            discoverBtn.disabled = true
            discoverBtn.textContent = 'Discovering...'
            debugLog('Disabled discover button and updated text', 'info')

            // Call the original click handler if it exists
            if (originalClick) {
              debugLog('Calling original click handler', 'info')
              originalClick.call(this, event)
            }

            // Force re-enable the button after 5 seconds if it's still disabled
            setTimeout(function () {
              if (discoverBtn.disabled) {
                debugLog(
                  'Force re-enabling discover button after timeout',
                  'warn'
                )
                discoverBtn.disabled = false
                discoverBtn.textContent = 'Discover Servers'
              }
            }, 5000)
          }

          // Replace the click handler
          discoverBtn.onclick = enhancedClickHandler

          debugLog('Enhanced discover button click handler installed', 'info')
        } else {
          debugLog(
            'discoverServersBtn not found! Cannot enhance click handler',
            'error'
          )
        }
      } catch (error) {
        debugLog(
          'Error setting up enhanced click handler: ' + error.message,
          'error'
        )
      }
    }, 1000)
  })
})()
