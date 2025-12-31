// Theme loader and manager for Network Monitor
// This script should be loaded in the <head> to prevent flash of unstyled content

(function() {
    // Apply theme to document
    function applyTheme(theme) {
        const root = document.documentElement;
        root.setAttribute('data-theme', theme);

        if (theme === 'dark') {
            root.style.setProperty('--bg-primary', '#1a1a1a');
            root.style.setProperty('--bg-secondary', '#2d2d2d');
            root.style.setProperty('--bg-card', '#252525');
            root.style.setProperty('--text-primary', '#ffffff');
            root.style.setProperty('--text-secondary', '#b0b0b0');
            root.style.setProperty('--accent', '#4a9eff');
            root.style.setProperty('--accent-text', '#ffffff');
            root.style.setProperty('--border', '#3a3a3a');
            root.style.setProperty('--success', '#4caf50');
            root.style.setProperty('--warning', '#ff9800');
            root.style.setProperty('--danger', '#f44336');
        } else if (theme === 'light') {
            root.style.setProperty('--bg-primary', '#f5f5f5');
            root.style.setProperty('--bg-secondary', '#e8e8e8');
            root.style.setProperty('--bg-card', '#ffffff');
            root.style.setProperty('--text-primary', '#1a1a1a');
            root.style.setProperty('--text-secondary', '#666666');
            root.style.setProperty('--accent', '#2196F3');
            root.style.setProperty('--accent-text', '#ffffff');
            root.style.setProperty('--border', '#dddddd');
            root.style.setProperty('--success', '#4caf50');
            root.style.setProperty('--warning', '#ff9800');
            root.style.setProperty('--danger', '#f44336');
        } else if (theme === 'sacred') {
            root.style.setProperty('--bg-primary', '#0a0a0a');
            root.style.setProperty('--bg-secondary', '#14141c');
            root.style.setProperty('--bg-card', '#0f0f14');
            root.style.setProperty('--text-primary', '#ffffff');
            root.style.setProperty('--text-secondary', 'rgba(255, 255, 255, 0.7)');
            root.style.setProperty('--accent', '#FFD700');
            root.style.setProperty('--accent-text', '#000000');
            root.style.setProperty('--border', 'rgba(255, 215, 0, 0.2)');
            root.style.setProperty('--success', '#4caf50');
            root.style.setProperty('--warning', '#FFA500');
            root.style.setProperty('--danger', '#f44336');
        }
    }

    // Apply cached theme immediately to prevent flash
    var cachedTheme = localStorage.getItem('network-monitor-theme');
    if (cachedTheme) {
        applyTheme(cachedTheme);
    }

    // Load theme from API and update cache
    async function loadTheme() {
        try {
            const response = await fetch('/api/v1/settings/theme');
            const data = await response.json();
            const theme = data.theme || 'dark';

            // Cache theme in localStorage for instant loading on next page
            localStorage.setItem('network-monitor-theme', theme);

            applyTheme(theme);
            return theme;
        } catch (e) {
            applyTheme(cachedTheme || 'dark');
            return cachedTheme || 'dark';
        }
    }

    // Highlight active nav link
    function highlightActiveNav() {
        const path = window.location.pathname;
        document.querySelectorAll('nav a').forEach(link => {
            const href = link.getAttribute('href');
            if (href === path || (href === '/' && path === '/')) {
                link.classList.add('active');
            }
        });
    }

    // Initialize - load theme from API to verify/sync with server
    loadTheme();

    // Wait for DOM to highlight nav
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', highlightActiveNav);
    } else {
        highlightActiveNav();
    }

    // Export functions for use in settings page
    window.NetworkMonitorTheme = {
        apply: function(theme) {
            localStorage.setItem('network-monitor-theme', theme);
            applyTheme(theme);
        },
        load: loadTheme
    };
})();
