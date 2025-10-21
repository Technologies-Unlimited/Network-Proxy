package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// dashboardPage renders the main dashboard
func dashboardPage(c *gin.Context) {
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

// agentsPage renders the agents page
func agentsPage(c *gin.Context) {
	c.HTML(http.StatusOK, "agents.html", gin.H{
		"title": "Agents - Network Monitor",
	})
}
