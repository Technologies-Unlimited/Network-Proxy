package api

import (
	"net/http"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/gin-gonic/gin"
)

// requireAuthOrStandalone checks if user is authenticated or in standalone mode
// If not, redirects to login page
func requireAuthOrStandalone(c *gin.Context) bool {
	if middleware.IsStandaloneMode() {
		return true
	}
	if middleware.GetGlobalAuthContext() != nil {
		return true
	}
	c.Redirect(http.StatusFound, "/login")
	return false
}

// dashboardPage renders the main dashboard
func dashboardPage(c *gin.Context) {
	if !requireAuthOrStandalone(c) {
		return
	}
	c.HTML(http.StatusOK, "dashboard.html", gin.H{
		"title": "Dashboard - Network Monitor",
	})
}

// devicesPage renders the devices management page
func devicesPage(c *gin.Context) {
	c.HTML(http.StatusOK, "devices.html", gin.H{
		"title": "Devices - Network Monitor",
	})
}

// alertsPage renders the alerts page
func alertsPage(c *gin.Context) {
	c.HTML(http.StatusOK, "alerts.html", gin.H{
		"title": "Alerts - Network Monitor",
	})
}

// nodesPage renders the nodes page
func nodesPage(c *gin.Context) {
	c.HTML(http.StatusOK, "nodes.html", gin.H{
		"title": "Nodes - Network Monitor",
	})
}
