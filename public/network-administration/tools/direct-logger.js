// Direct console logger that works immediately on page load
(function() {
    // Immediately create a floating console
    const floatingConsole = document.createElement('div');
    floatingConsole.style.cssText = `
        position: fixed;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 200px;
        background-color: rgba(0, 0, 0, 0.9);
        color: white;
        font-family: monospace;
        font-size: 12px;
        padding: 10px;
        z-index: 99999;
        overflow-y: auto;
        display: block;
    `;
    document.body.appendChild(floatingConsole);
    
    // Add a log entry
    function addLogEntry(message, type = 'log') {
        const entry = document.createElement('div');
        const now = new Date();
        const timestamp = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}.${now.getMilliseconds()}`;
        
        let color = 'white';
        switch(type) {
            case 'error': color = 'red'; break;
            case 'warn': color = 'orange'; break;
            case 'info': color = 'lightblue'; break;
        }
        
        entry.style.color = color;
        entry.textContent = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
        floatingConsole.appendChild(entry);
        floatingConsole.scrollTop = floatingConsole.scrollHeight;
    }
    
    // Log page load
    addLogEntry('DIRECT LOGGER INITIALIZED', 'info');
    
    // Override console methods to show in our console too
    const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info
    };
    
    console.log = function() {
        const args = Array.from(arguments).map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
        addLogEntry(args, 'log');
        originalConsole.log.apply(console, arguments);
    };
    
    console.warn = function() {
        const args = Array.from(arguments).map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
        addLogEntry(args, 'warn');
        originalConsole.warn.apply(console, arguments);
    };
    
    console.error = function() {
        const args = Array.from(arguments).map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
        addLogEntry(args, 'error');
        originalConsole.error.apply(console, arguments);
    };
    
    console.info = function() {
        const args = Array.from(arguments).map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
        addLogEntry(args, 'info');
        originalConsole.info.apply(console, arguments);
    };
    
    // Direct logger object
    window.directLogger = {
        log: function(message) { addLogEntry(message, 'log'); },
        warn: function(message) { addLogEntry(message, 'warn'); },
        error: function(message) { addLogEntry(message, 'error'); },
        info: function(message) { addLogEntry(message, 'info'); },
    };
    
    // Add event listeners after a short delay
    setTimeout(function() {
        const discoverBtn = document.getElementById('discoverServers');
        if (discoverBtn) {
            addLogEntry('Adding direct event listener to Discover button', 'info');
            
            discoverBtn.addEventListener('click', function() {
                addLogEntry('DISCOVER BUTTON CLICKED!', 'info');
                
                // Update UI directly
                const statusElem = document.getElementById('serversStatus');
                if (statusElem) {
                    statusElem.textContent = 'Direct logger detected button click. Starting discovery...';
                    statusElem.className = 'alert alert-info';
                }
                
                // Keep button enabled for testing
                if (discoverBtn.disabled) {
                    setTimeout(function() {
                        discoverBtn.disabled = false;
                        discoverBtn.textContent = 'Discover Servers';
                    }, 3000);
                }
            });
        } else {
            addLogEntry('Discover button not found!', 'error');
        }
    }, 1000);
})();