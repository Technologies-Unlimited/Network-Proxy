// Direct debug console implementation
document.addEventListener('DOMContentLoaded', function () {
  // Create debug console elements
  const debugConsole = document.createElement('div')
  debugConsole.id = 'debugConsole'

  const debugControls = document.createElement('div')
  debugControls.id = 'debugControls'

  const toggleButton = document.createElement('button')
  toggleButton.textContent = 'Toggle Debug'
  toggleButton.onclick = function () {
    if (debugConsole.style.display === 'none') {
      debugConsole.style.display = 'block'
    } else {
      debugConsole.style.display = 'none'
    }
  }

  const clearButton = document.createElement('button')
  clearButton.textContent = 'Clear Debug'
  clearButton.onclick = function () {
    debugConsole.innerHTML = ''
  }

  // Add test message button
  const testButton = document.createElement('button')
  testButton.textContent = 'Test Debug'
  testButton.onclick = function () {
    debugLog('Test debug message', 'info')
    debugLog('Error test message', 'error')
    debugLog('Warning test message', 'warn')
    debugLog('Regular log message')
  }

  // Append controls
  debugControls.appendChild(toggleButton)
  debugControls.appendChild(clearButton)
  debugControls.appendChild(testButton)

  // Append to document
  document.body.appendChild(debugConsole)
  document.body.appendChild(debugControls)

  // Create global debug log function
  window.debugLog = function (message, type = 'log') {
    // Get timestamp
    const now = new Date()
    const timestamp = [
      now.getHours().toString().padStart(2, '0'),
      now.getMinutes().toString().padStart(2, '0'),
      now.getSeconds().toString().padStart(2, '0'),
    ].join(':')

    // Format message
    let msgText
    if (typeof message === 'object') {
      try {
        msgText = JSON.stringify(message, null, 2)
      } catch (e) {
        msgText = String(message)
      }
    } else {
      msgText = String(message)
    }

    // Create entry
    const entry = document.createElement('div')
    entry.className = 'debugEntry debug-' + type
    entry.textContent = `[${timestamp}] [${type.toUpperCase()}] ${msgText}`

    // Add to console
    debugConsole.appendChild(entry)
    debugConsole.scrollTop = debugConsole.scrollHeight

    // Also log to browser console
    console[type](message)
  }

  // Add initial log
  debugLog('Debug console initialized', 'info')

  // Intercept discoverServersBtn click
  setTimeout(function () {
    const discoverBtn = document.getElementById('discoverServers')
    if (discoverBtn) {
      debugLog('Found discover button, adding direct handler', 'info')

      // Add direct click handler
      discoverBtn.addEventListener(
        'click',
        function () {
          debugLog('DISCOVER BUTTON CLICKED (direct handler)', 'info')

          // Create direct feedback
          const statusElem = document.getElementById('serversStatus')
          if (statusElem) {
            statusElem.className = 'alert alert-info'
            statusElem.textContent =
              'Discovering servers... (debug console direct handler)'
            debugLog('Updated status element directly', 'info')
          }

          // Re-enable the button after 5 seconds if it's still disabled
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
        },
        true
      ) // Use capture to ensure this runs first
    } else {
      debugLog('Discover button not found!', 'error')
    }
  }, 500)
})
