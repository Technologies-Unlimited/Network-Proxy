package api

import (
	"net/http"
	"path/filepath"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/templates"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/thothos"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// MonitoringConfig holds all monitoring configuration from ThothOS
type MonitoringConfig struct {
	ICMPMonitoringTemplates []thothos.ICMPMonitoringTemplate `json:"icmpMonitoringTemplates"`
	ICMPPollingTemplates    []thothos.ICMPPollingTemplate    `json:"icmpPollingTemplates"`
	OIDs                    []thothos.OID                    `json:"oids"`
	ZabbixTemplateOIDs      []templates.ParsedOID            `json:"zabbixTemplateOids"`
	ZabbixTemplates         []templates.TemplateInfo         `json:"zabbixTemplates"`
	SNMPv2Communities       []thothos.SNMPv2Community        `json:"snmpv2Communities"`
	SNMPv3Communities       []thothos.SNMPv3Community        `json:"snmpv3Communities"`
	SNMPv2Templates         []thothos.SNMPv2Template         `json:"snmpv2Templates"`
	SNMPv3Templates         []thothos.SNMPv3Template         `json:"snmpv3Templates"`
	SNMPv2PollingTemplates  []thothos.SNMPv2PollingTemplate  `json:"snmpv2PollingTemplates"`
	SNMPv3PollingTemplates  []thothos.SNMPv3PollingTemplate  `json:"snmpv3PollingTemplates"`
}

// RegisterMonitorRoutes registers monitoring API routes
func RegisterMonitorRoutes(router *gin.RouterGroup, srv *server.Server) {
	monitor := router.Group("/monitor")
	{
		monitor.GET("", getMonitoringData(srv))
		monitor.GET("/icmp/monitoring", getICMPMonitoringTemplates(srv))
		monitor.GET("/icmp/polling", getICMPPollingTemplates(srv))
		monitor.GET("/snmp/oids", getOIDs(srv))
		monitor.GET("/snmp/v2/communities", getSNMPv2Communities(srv))
		monitor.GET("/snmp/v3/communities", getSNMPv3Communities(srv))
		monitor.GET("/snmp/v2/templates", getSNMPv2Templates(srv))
		monitor.GET("/snmp/v3/templates", getSNMPv3Templates(srv))
		monitor.GET("/snmp/v2/polling", getSNMPv2PollingTemplates(srv))
		monitor.GET("/snmp/v3/polling", getSNMPv3PollingTemplates(srv))
		monitor.POST("/sync", syncMonitoringData(srv))
	}
}

// getMonitoringData returns all monitoring configuration from ThothOS
func getMonitoringData(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Check if connected to ThothOS
		authCtx := middleware.GetGlobalAuthContext()
		if authCtx == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error":       "Not connected to ThothOS",
				"isConnected": false,
			})
			return
		}

		// Get ThothOS client
		client, err := getThothOSClient(srv)
		if err != nil {
			log.Error().Err(err).Msg("Failed to create ThothOS client")
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to connect to ThothOS: " + err.Error(),
			})
			return
		}

		// Fetch all monitoring templates
		config := MonitoringConfig{}
		var fetchErrors []string

		// Load Zabbix template OIDs from local templates directory
		templatesDir := filepath.Join(".", "templates", "snmp")
		templateList, err := templates.ScanTemplatesDirectory(templatesDir)
		if err != nil {
			log.Warn().Err(err).Msg("Failed to scan Zabbix templates directory")
			fetchErrors = append(fetchErrors, "Zabbix templates: "+err.Error())
		} else {
			config.ZabbixTemplates = templateList
			// Collect all OIDs from templates and deduplicate
			var allOIDs []templates.ParsedOID
			for _, t := range templateList {
				allOIDs = append(allOIDs, t.OIDs...)
			}
			config.ZabbixTemplateOIDs = templates.DeduplicateOIDs(allOIDs)
		}

		// Fetch ICMP Monitoring Templates
		icmpMonitoring, err := client.GetICMPMonitoringTemplates()
		if err != nil {
			log.Warn().Err(err).Msg("Failed to fetch ICMP monitoring templates")
			fetchErrors = append(fetchErrors, "ICMP monitoring: "+err.Error())
		} else {
			config.ICMPMonitoringTemplates = icmpMonitoring
		}

		// Fetch ICMP Polling Templates
		icmpPolling, err := client.GetICMPPollingTemplates()
		if err != nil {
			log.Warn().Err(err).Msg("Failed to fetch ICMP polling templates")
			fetchErrors = append(fetchErrors, "ICMP polling: "+err.Error())
		} else {
			config.ICMPPollingTemplates = icmpPolling
		}

		// Fetch OIDs
		oids, err := client.GetOIDs()
		if err != nil {
			log.Warn().Err(err).Msg("Failed to fetch OIDs")
			fetchErrors = append(fetchErrors, "OIDs: "+err.Error())
		} else {
			config.OIDs = oids
		}

		// Fetch SNMPv2 Communities
		snmpv2Communities, err := client.GetSNMPv2Communities()
		if err != nil {
			log.Warn().Err(err).Msg("Failed to fetch SNMPv2 communities")
			fetchErrors = append(fetchErrors, "SNMPv2 Communities: "+err.Error())
		} else {
			config.SNMPv2Communities = snmpv2Communities
		}

		// Fetch SNMPv3 Communities
		snmpv3Communities, err := client.GetSNMPv3Communities()
		if err != nil {
			log.Warn().Err(err).Msg("Failed to fetch SNMPv3 communities")
			fetchErrors = append(fetchErrors, "SNMPv3 Communities: "+err.Error())
		} else {
			config.SNMPv3Communities = snmpv3Communities
		}

		// Fetch SNMPv2 Templates
		snmpv2, err := client.GetSNMPv2Templates()
		if err != nil {
			log.Warn().Err(err).Msg("Failed to fetch SNMPv2 templates")
			fetchErrors = append(fetchErrors, "SNMPv2: "+err.Error())
		} else {
			config.SNMPv2Templates = snmpv2
		}

		// Fetch SNMPv3 Templates
		snmpv3, err := client.GetSNMPv3Templates()
		if err != nil {
			log.Warn().Err(err).Msg("Failed to fetch SNMPv3 templates")
			fetchErrors = append(fetchErrors, "SNMPv3: "+err.Error())
		} else {
			config.SNMPv3Templates = snmpv3
		}

		// Fetch SNMPv2 Polling Templates
		snmpv2Polling, err := client.GetSNMPv2PollingTemplates()
		if err != nil {
			log.Warn().Err(err).Msg("Failed to fetch SNMPv2 polling templates")
			fetchErrors = append(fetchErrors, "SNMPv2 Polling: "+err.Error())
		} else {
			config.SNMPv2PollingTemplates = snmpv2Polling
		}

		// Fetch SNMPv3 Polling Templates
		snmpv3Polling, err := client.GetSNMPv3PollingTemplates()
		if err != nil {
			log.Warn().Err(err).Msg("Failed to fetch SNMPv3 polling templates")
			fetchErrors = append(fetchErrors, "SNMPv3 Polling: "+err.Error())
		} else {
			config.SNMPv3PollingTemplates = snmpv3Polling
		}

		response := gin.H{
			"isConnected": true,
			"companyId":   authCtx.CompanyID,
			"data":        config,
		}

		if len(fetchErrors) > 0 {
			response["warnings"] = fetchErrors
		}

		c.JSON(http.StatusOK, response)
	}
}

// getICMPMonitoringTemplates returns ICMP monitoring templates from ThothOS
func getICMPMonitoringTemplates(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx := middleware.GetGlobalAuthContext()
		if authCtx == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "Not connected to ThothOS",
			})
			return
		}

		client, err := getThothOSClient(srv)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to connect to ThothOS",
			})
			return
		}

		templates, err := client.GetICMPMonitoringTemplates()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch ICMP monitoring templates: " + err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"templates": templates,
		})
	}
}

// getICMPPollingTemplates returns ICMP polling templates from ThothOS
func getICMPPollingTemplates(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx := middleware.GetGlobalAuthContext()
		if authCtx == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "Not connected to ThothOS",
			})
			return
		}

		client, err := getThothOSClient(srv)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to connect to ThothOS",
			})
			return
		}

		templates, err := client.GetICMPPollingTemplates()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch ICMP polling templates: " + err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"templates": templates,
		})
	}
}

// getSNMPv2Templates returns SNMPv2 templates from ThothOS
func getSNMPv2Templates(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx := middleware.GetGlobalAuthContext()
		if authCtx == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "Not connected to ThothOS",
			})
			return
		}

		client, err := getThothOSClient(srv)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to connect to ThothOS",
			})
			return
		}

		templates, err := client.GetSNMPv2Templates()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch SNMPv2 templates: " + err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"templates": templates,
		})
	}
}

// getSNMPv3Templates returns SNMPv3 templates from ThothOS
func getSNMPv3Templates(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx := middleware.GetGlobalAuthContext()
		if authCtx == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "Not connected to ThothOS",
			})
			return
		}

		client, err := getThothOSClient(srv)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to connect to ThothOS",
			})
			return
		}

		templates, err := client.GetSNMPv3Templates()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch SNMPv3 templates: " + err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"templates": templates,
		})
	}
}

// getOIDs returns OIDs from ThothOS
func getOIDs(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx := middleware.GetGlobalAuthContext()
		if authCtx == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "Not connected to ThothOS",
			})
			return
		}

		client, err := getThothOSClient(srv)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to connect to ThothOS",
			})
			return
		}

		oids, err := client.GetOIDs()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch OIDs: " + err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"oids": oids,
		})
	}
}

// getSNMPv2Communities returns SNMPv2 communities from ThothOS
func getSNMPv2Communities(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx := middleware.GetGlobalAuthContext()
		if authCtx == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "Not connected to ThothOS",
			})
			return
		}

		client, err := getThothOSClient(srv)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to connect to ThothOS",
			})
			return
		}

		communities, err := client.GetSNMPv2Communities()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch SNMPv2 communities: " + err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"communities": communities,
		})
	}
}

// getSNMPv3Communities returns SNMPv3 communities from ThothOS
func getSNMPv3Communities(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx := middleware.GetGlobalAuthContext()
		if authCtx == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "Not connected to ThothOS",
			})
			return
		}

		client, err := getThothOSClient(srv)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to connect to ThothOS",
			})
			return
		}

		communities, err := client.GetSNMPv3Communities()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch SNMPv3 communities: " + err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"communities": communities,
		})
	}
}

// getSNMPv2PollingTemplates returns SNMPv2 polling templates from ThothOS
func getSNMPv2PollingTemplates(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx := middleware.GetGlobalAuthContext()
		if authCtx == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "Not connected to ThothOS",
			})
			return
		}

		client, err := getThothOSClient(srv)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to connect to ThothOS",
			})
			return
		}

		templates, err := client.GetSNMPv2PollingTemplates()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch SNMPv2 polling templates: " + err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"templates": templates,
		})
	}
}

// getSNMPv3PollingTemplates returns SNMPv3 polling templates from ThothOS
func getSNMPv3PollingTemplates(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx := middleware.GetGlobalAuthContext()
		if authCtx == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "Not connected to ThothOS",
			})
			return
		}

		client, err := getThothOSClient(srv)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to connect to ThothOS",
			})
			return
		}

		templates, err := client.GetSNMPv3PollingTemplates()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch SNMPv3 polling templates: " + err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"templates": templates,
		})
	}
}

// syncMonitoringData forces a sync of monitoring data from ThothOS
func syncMonitoringData(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx := middleware.GetGlobalAuthContext()
		if authCtx == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "Not connected to ThothOS",
			})
			return
		}

		client, err := getThothOSClient(srv)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to connect to ThothOS",
			})
			return
		}

		// Fetch all monitoring configuration
		config := MonitoringConfig{}
		var fetchErrors []string

		// Load Zabbix template OIDs from local templates directory
		templatesDir := filepath.Join(".", "templates", "snmp")
		templateList, err := templates.ScanTemplatesDirectory(templatesDir)
		if err != nil {
			log.Warn().Err(err).Msg("Failed to scan Zabbix templates directory")
			fetchErrors = append(fetchErrors, "Zabbix templates: "+err.Error())
		} else {
			config.ZabbixTemplates = templateList
			var allOIDs []templates.ParsedOID
			for _, t := range templateList {
				allOIDs = append(allOIDs, t.OIDs...)
			}
			config.ZabbixTemplateOIDs = templates.DeduplicateOIDs(allOIDs)
		}

		icmpMonitoring, err := client.GetICMPMonitoringTemplates()
		if err != nil {
			fetchErrors = append(fetchErrors, "ICMP monitoring: "+err.Error())
		} else {
			config.ICMPMonitoringTemplates = icmpMonitoring
		}

		icmpPolling, err := client.GetICMPPollingTemplates()
		if err != nil {
			fetchErrors = append(fetchErrors, "ICMP polling: "+err.Error())
		} else {
			config.ICMPPollingTemplates = icmpPolling
		}

		oids, err := client.GetOIDs()
		if err != nil {
			fetchErrors = append(fetchErrors, "OIDs: "+err.Error())
		} else {
			config.OIDs = oids
		}

		snmpv2Communities, err := client.GetSNMPv2Communities()
		if err != nil {
			fetchErrors = append(fetchErrors, "SNMPv2 Communities: "+err.Error())
		} else {
			config.SNMPv2Communities = snmpv2Communities
		}

		snmpv3Communities, err := client.GetSNMPv3Communities()
		if err != nil {
			fetchErrors = append(fetchErrors, "SNMPv3 Communities: "+err.Error())
		} else {
			config.SNMPv3Communities = snmpv3Communities
		}

		snmpv2, err := client.GetSNMPv2Templates()
		if err != nil {
			fetchErrors = append(fetchErrors, "SNMPv2: "+err.Error())
		} else {
			config.SNMPv2Templates = snmpv2
		}

		snmpv3, err := client.GetSNMPv3Templates()
		if err != nil {
			fetchErrors = append(fetchErrors, "SNMPv3: "+err.Error())
		} else {
			config.SNMPv3Templates = snmpv3
		}

		snmpv2Polling, err := client.GetSNMPv2PollingTemplates()
		if err != nil {
			fetchErrors = append(fetchErrors, "SNMPv2 Polling: "+err.Error())
		} else {
			config.SNMPv2PollingTemplates = snmpv2Polling
		}

		snmpv3Polling, err := client.GetSNMPv3PollingTemplates()
		if err != nil {
			fetchErrors = append(fetchErrors, "SNMPv3 Polling: "+err.Error())
		} else {
			config.SNMPv3PollingTemplates = snmpv3Polling
		}

		log.Info().
			Int("icmpMonitoring", len(config.ICMPMonitoringTemplates)).
			Int("icmpPolling", len(config.ICMPPollingTemplates)).
			Int("oids", len(config.OIDs)).
			Int("zabbixTemplates", len(config.ZabbixTemplates)).
			Int("zabbixOids", len(config.ZabbixTemplateOIDs)).
			Int("snmpv2Communities", len(config.SNMPv2Communities)).
			Int("snmpv3Communities", len(config.SNMPv3Communities)).
			Int("snmpv2Templates", len(config.SNMPv2Templates)).
			Int("snmpv3Templates", len(config.SNMPv3Templates)).
			Int("snmpv2Polling", len(config.SNMPv2PollingTemplates)).
			Int("snmpv3Polling", len(config.SNMPv3PollingTemplates)).
			Msg("Monitoring data synced from ThothOS")

		response := gin.H{
			"success": true,
			"message": "Monitoring data synced successfully",
			"counts": gin.H{
				"icmpMonitoring":    len(config.ICMPMonitoringTemplates),
				"icmpPolling":       len(config.ICMPPollingTemplates),
				"oids":              len(config.OIDs),
				"zabbixTemplates":   len(config.ZabbixTemplates),
				"zabbixTemplateOids": len(config.ZabbixTemplateOIDs),
				"snmpv2Communities": len(config.SNMPv2Communities),
				"snmpv3Communities": len(config.SNMPv3Communities),
				"snmpv2Templates":  len(config.SNMPv2Templates),
				"snmpv3Templates":  len(config.SNMPv3Templates),
				"snmpv2Polling":    len(config.SNMPv2PollingTemplates),
				"snmpv3Polling":    len(config.SNMPv3PollingTemplates),
			},
		}

		if len(fetchErrors) > 0 {
			response["warnings"] = fetchErrors
		}

		c.JSON(http.StatusOK, response)
	}
}

// monitorPage renders the Monitor page
func monitorPage(c *gin.Context) {
	c.HTML(http.StatusOK, "monitor.html", gin.H{
		"title": "Monitor - Network Monitor",
	})
}
