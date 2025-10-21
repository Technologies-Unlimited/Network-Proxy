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
	}

	// Serve static files and web UI
	router.Static("/static", "./web/static")
	router.LoadHTMLGlob("web/templates/*")

	// Web UI routes
	router.GET("/", dashboardPage)
	router.GET("/devices", devicesPage)
	router.GET("/alerts", alertsPage)
	router.GET("/agents", agentsPage)
}

// healthCheck is a simple health check endpoint
func healthCheck(c *gin.Context) {
	c.JSON(200, gin.H{
		"status": "ok",
		"service": "network-monitor-server",
	})
}
