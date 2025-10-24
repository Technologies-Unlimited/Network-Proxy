package api

import (
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
)

// RegisterRoutes registers all API routes
func RegisterRoutes(router *gin.Engine, srv *server.Server) {
	// Health check
	router.GET("/health", healthCheck)

	// API v1 routes
	v1 := router.Group("/api/v1")
	{
		// Device routes
		devices := v1.Group("/devices")
		{
			devices.GET("", listDevices(srv))
			devices.POST("", createDevice(srv))
			devices.GET("/:id", getDevice(srv))
			devices.PUT("/:id", updateDevice(srv))
			devices.DELETE("/:id", deleteDevice(srv))
		}

		// SNMP Template routes
		templates := v1.Group("/snmp/templates")
		{
			templates.GET("", listSNMPTemplates(srv))
			templates.POST("", createSNMPTemplate(srv))
			templates.GET("/:id", getSNMPTemplate(srv))
			templates.PUT("/:id", updateSNMPTemplate(srv))
			templates.DELETE("/:id", deleteSNMPTemplate(srv))
		}

		// OID routes
		oids := v1.Group("/snmp/oids")
		{
			oids.GET("", listOIDs(srv))
			oids.POST("", createOID(srv))
			oids.GET("/:id", getOID(srv))
			oids.PUT("/:id", updateOID(srv))
			oids.DELETE("/:id", deleteOID(srv))
		}

		// Alert routes
		alerts := v1.Group("/alerts")
		{
			alerts.GET("", listAlerts(srv))
			alerts.GET("/:id", getAlert(srv))
			alerts.POST("/:id/acknowledge", acknowledgeAlert(srv))
			alerts.POST("/:id/resolve", resolveAlert(srv))
		}

		// Alert Rule routes
		alertRules := v1.Group("/alert-rules")
		{
			alertRules.GET("", listAlertRules(srv))
			alertRules.POST("", createAlertRule(srv))
			alertRules.GET("/:id", getAlertRule(srv))
			alertRules.PUT("/:id", updateAlertRule(srv))
			alertRules.DELETE("/:id", deleteAlertRule(srv))
		}

		// Agent routes
		agents := v1.Group("/agents")
		{
			agents.GET("", listAgents(srv))
			agents.POST("", registerAgent(srv))
			agents.GET("/:id", getAgent(srv))
			agents.POST("/:id/heartbeat", agentHeartbeat(srv))
			agents.DELETE("/:id", deleteAgent(srv))
		}

		// Metrics proxy to Prometheus
		v1.GET("/metrics/query", queryMetrics(srv))

		// Discovery routes
		discovery := v1.Group("/discovery")
		{
			discovery.POST("/scan", scanNetwork(srv))
			discovery.GET("/status", getScanStatus(srv))
			discovery.GET("/devices", getDiscoveredDevices(srv))
			discovery.DELETE("/cache", clearScanCache(srv))
		}

		// Visualization metrics routes
		metrics := v1.Group("/metrics")
		{
			metrics.GET("/device-status", getDeviceStatusMetrics(srv))
			metrics.GET("/ping-history", getPingHistoryMetrics(srv))
			metrics.GET("/alert-stats", getAlertStatsMetrics(srv))
			metrics.GET("/uptime", getUptimeMetrics(srv))
			metrics.GET("/outage-history", getOutageHistory(srv))
		}

		// JSON devices endpoint for visualization
		v1.GET("/devices-json", getDevicesJSON(srv))

		// Network Tools routes
		toolsAPI := v1.Group("/tools")
		{
			toolsAPI.POST("/traceroute", traceroute(srv))
			toolsAPI.POST("/dns-lookup", dnsLookup(srv))
			toolsAPI.POST("/port-scan", portScan(srv))
			toolsAPI.POST("/whois", whoisLookup(srv))
			toolsAPI.POST("/bandwidth-test", bandwidthTest(srv))
			toolsAPI.POST("/ping", ping(srv))
			toolsAPI.GET("/common-ports", commonPorts(srv))
		}

		// Report routes
		reports := v1.Group("/reports")
		{
			reports.GET("/devices", generateDeviceReport(srv))
			reports.GET("/uptime", generateUptimeReport(srv))
			reports.GET("/alerts", generateAlertReport(srv))
			reports.GET("/performance", generatePerformanceReport(srv))
		}

		// Export routes
		exports := v1.Group("/export")
		{
			exports.GET("/devices", exportDevices(srv))
			exports.GET("/metrics", exportMetrics(srv))
		}
	}

	// Dashboard API endpoints
	dashboard := v1.Group("/dashboard")
	{
		dashboard.GET("/device-count", getDashboardDeviceCount(srv))
		dashboard.GET("/devices-up", getDashboardDevicesUp(srv))
		dashboard.GET("/devices-down", getDashboardDevicesDown(srv))
		dashboard.GET("/active-alerts-count", getDashboardActiveAlerts(srv))
		dashboard.GET("/recent-alerts", getDashboardRecentAlerts(srv))
	}

	// Web UI routes (templates and static files loaded in main.go)
	router.GET("/", dashboardPage)
	router.GET("/devices", devicesPage)
	router.GET("/alerts", alertsPage)
	router.GET("/agents", agentsPage)
	router.GET("/visualize", visualizePage)
	router.GET("/tools", toolsPage)
	router.GET("/reports", reportsPage)
}

// healthCheck is a simple health check endpoint
func healthCheck(c *gin.Context) {
	c.JSON(200, gin.H{
		"status": "ok",
		"service": "network-monitor-server",
	})
}
