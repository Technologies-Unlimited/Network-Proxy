package api

import (
	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
)

// RegisterRoutes registers all API routes
func RegisterRoutes(router *gin.Engine, srv *server.Server) {
	// Health check (no auth required)
	router.GET("/health", healthCheck)

	// Register auth routes (no auth middleware required)
	RegisterAuthRoutes(router, srv.DB)

	// API v1 routes
	v1 := router.Group("/api/v1")

	// Public settings: theme bootstrap + redacted connection status only.
	// Sensitive ThothOS configuration is gated below, under RequireAuth.
	RegisterPublicSettingsRoutes(v1, srv)

	// Apply auth middleware to all sensitive API routes
	v1.Use(middleware.RequireAuth())
	{
		// ThothOS settings — auth required so the API key cannot be read
		// or overwritten by anyone with network access.
		RegisterAuthedSettingsRoutes(v1, srv)

		// IPAM, Monitor, Templates, Updates were previously public; gate them
		// behind auth as well. They expose tenant-scoped data and trigger
		// outbound calls / writes that should not be unauthenticated.
		RegisterIPAMRoutes(v1, srv)
		RegisterMonitorRoutes(v1, srv)
		RegisterTemplateRoutes(v1, srv)
		RegisterUpdateRoutes(v1, srv)

		// Auth-gated Prometheus scrape endpoint. main.go calls
		// SetMetricsHandler unless METRICS_PUBLIC=true, in which case it
		// mounts the handler on the root router itself.
		if h := GetMetricsHandler(); h != nil {
			v1.GET("/metrics", gin.WrapH(h))
		}

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

		// Node routes (renamed from agents)
		nodes := v1.Group("/nodes")
		{
			nodes.GET("", listNodes(srv))
			nodes.GET("/json", listNodesJSON(srv))
			nodes.POST("", registerNode(srv))
			nodes.GET("/:id", getNode(srv))
			nodes.PUT("/:id", updateNode(srv))
			nodes.POST("/:id/heartbeat", nodeHeartbeat(srv))
			nodes.DELETE("/:id", deleteNode(srv))
			nodes.GET("/:id/peers", getNodePeers(srv))
		}

		// Node maintenance routes (separate to avoid route conflicts)
		nodesMaint := v1.Group("/nodes-maintenance")
		{
			nodesMaint.POST("/cleanup-duplicates", cleanupDuplicateNodes(srv))
		}

		// Node Peer routes
		nodePeers := v1.Group("/node-peers")
		{
			nodePeers.GET("", listNodePeers(srv))
			nodePeers.GET("/html", listNodePeersHTML(srv))
			nodePeers.POST("", createNodePeer(srv))
			nodePeers.DELETE("/:id", deleteNodePeer(srv))
			nodePeers.POST("/:id/refresh", refreshNodePeer(srv))
		}

		// Bandwidth Test routes
		bandwidthTests := v1.Group("/bandwidth-tests")
		{
			bandwidthTests.GET("", listBandwidthTests(srv))
			bandwidthTests.GET("/html", listBandwidthTestsHTML(srv))
			bandwidthTests.POST("/start", startBandwidthTest(srv))
			bandwidthTests.GET("/:id", getBandwidthTest(srv))
			bandwidthTests.POST("/:id/cancel", cancelBandwidthTest(srv))
		}

		// Scheduled Test routes
		scheduledTests := v1.Group("/scheduled-tests")
		{
			scheduledTests.GET("", listScheduledTests(srv))
			scheduledTests.GET("/html", listScheduledTestsHTML(srv))
			scheduledTests.POST("", createScheduledTest(srv))
			scheduledTests.PUT("/:id", updateScheduledTest(srv))
			scheduledTests.DELETE("/:id", deleteScheduledTest(srv))
			scheduledTests.POST("/:id/run-now", runScheduledTestNow(srv))
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
			toolsAPI.POST("/snmp-query", snmpQuery(srv))
			toolsAPI.POST("/mac-lookup", macLookup(srv))
			toolsAPI.POST("/connection-test", connectionTest(srv))
			toolsAPI.POST("/http-test", httpTest(srv))
			toolsAPI.POST("/ssl-check", sslCheck(srv))
			toolsAPI.GET("/arp-scan", arpScan(srv))
			toolsAPI.POST("/mtu-discovery", mtuDiscovery(srv))
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

	// Dashboard API endpoints (also require auth)
	dashboard := v1.Group("/dashboard")
	dashboard.Use(middleware.RequireAuth())
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
	router.GET("/nodes", nodesPage)
	router.GET("/visualize", visualizePage)
	router.GET("/tools", toolsPage)
	router.GET("/reports", reportsPage)
	router.GET("/settings", settingsPage)
	router.GET("/ipam", ipamPage)
	router.GET("/monitor", monitorPage)
}

// healthCheck is a simple health check endpoint
func healthCheck(c *gin.Context) {
	authCtx := middleware.GetGlobalAuthContext()
	thothosConnected := authCtx != nil

	companyID := ""
	proxyID := ""
	if authCtx != nil {
		companyID = authCtx.CompanyID
		proxyID = authCtx.ProxyID
	}

	c.JSON(200, gin.H{
		"status":           "ok",
		"service":          "network-monitor-server",
		"thothosConnected": thothosConnected,
		"companyId":        companyID,
		"proxyId":          proxyID,
	})
}
