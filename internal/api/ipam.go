package api

import (
	"net/http"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/thothos"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// RegisterIPAMRoutes registers IPAM API routes
func RegisterIPAMRoutes(router *gin.RouterGroup, srv *server.Server) {
	ipam := router.Group("/ipam")
	{
		ipam.GET("", getIPAMData(srv))
		ipam.GET("/supernets", getSupernets(srv))
		ipam.GET("/subnets", getSubnets(srv))
		ipam.GET("/pools", getPools(srv))
		ipam.GET("/addresses", getIPAddresses(srv))
		ipam.GET("/vlans", getVLANs(srv))
		ipam.POST("/sync", syncIPAMData(srv))
	}
}

// getThothOSClient creates a ThothOS client from saved config
func getThothOSClient(srv *server.Server) (*thothos.Client, error) {
	// First try to get from settings
	config, _ := models.GetThothOSConfig(srv.DB)
	if config.URL != "" && config.APIKey != "" {
		client := thothos.NewClient(config.URL, config.APIKey)
		_, err := client.ValidateAPIKey()
		if err != nil {
			return nil, err
		}
		return client, nil
	}

	// Fall back to legacy ProxyConfig
	savedConfig, err := LoadConfigOnStartup(srv.DB)
	if err != nil || savedConfig == nil {
		return nil, err
	}

	client := thothos.NewClient(savedConfig.ThothOSURL, savedConfig.APIKey)
	_, err = client.ValidateAPIKey()
	if err != nil {
		return nil, err
	}
	return client, nil
}

// getIPAMData returns all IPAM data from ThothOS
func getIPAMData(srv *server.Server) gin.HandlerFunc {
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

		// Fetch complete IPAM config
		ipamConfig, err := client.GetIPAMConfig()
		if err != nil {
			log.Error().Err(err).Msg("Failed to fetch IPAM config")
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch IPAM data: " + err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"isConnected": true,
			"companyId":   authCtx.CompanyID,
			"data":        ipamConfig,
		})
	}
}

// getSupernets returns supernets from ThothOS
func getSupernets(srv *server.Server) gin.HandlerFunc {
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

		supernets, err := client.GetSupernets()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch supernets: " + err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"supernets": supernets,
		})
	}
}

// getSubnets returns subnets from ThothOS
func getSubnets(srv *server.Server) gin.HandlerFunc {
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

		subnets, err := client.GetSubnets()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch subnets: " + err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"subnets": subnets,
		})
	}
}

// getPools returns pools from ThothOS
func getPools(srv *server.Server) gin.HandlerFunc {
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

		pools, err := client.GetPools()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch pools: " + err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"pools": pools,
		})
	}
}

// getIPAddresses returns IP addresses from ThothOS
func getIPAddresses(srv *server.Server) gin.HandlerFunc {
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

		addresses, err := client.GetIPAddresses()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch IP addresses: " + err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"addresses": addresses,
		})
	}
}

// getVLANs returns VLANs from ThothOS
func getVLANs(srv *server.Server) gin.HandlerFunc {
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

		vlans, err := client.GetVLANs()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch VLANs: " + err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"vlans": vlans,
		})
	}
}

// syncIPAMData runs the same pull+apply step as /monitor/sync and reports
// honest counts. IPAM itself is fetched from ThothOS but served live (there is
// no local IPAM model in this stage), so its counts are reported as "fetched",
// NOT "synced successfully" — the previous handler fetched and discarded the
// data yet claimed success.
func syncIPAMData(srv *server.Server) gin.HandlerFunc {
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

		result := applyConfigFromClient(srv.DB, client)
		logApplyResult("ipam-sync", result)

		response := gin.H{
			"success": true,
			"message": "IPAM fetched (served live, not persisted locally); monitoring config applied",
			// Honest: IPAM is fetched from ThothOS and served live per-request.
			"ipamFetched": result.IPAMFetched,
			// The shared apply step also persisted these and retuned collectors.
			"applied": gin.H{
				"oidsAdopted":            result.OIDsAdopted,
				"oidsCreated":            result.OIDsCreated,
				"oidsUpdated":            result.OIDsUpdated,
				"snmpTemplatesPersisted": result.SNMPTemplatesPersisted,
				"icmpIntervalSeconds":    result.ICMPIntervalSeconds,
				"snmpIntervalSeconds":    result.SNMPIntervalSeconds,
			},
		}
		if len(result.Warnings) > 0 {
			response["warnings"] = result.Warnings
		}

		c.JSON(http.StatusOK, response)
	}
}

// ipamPage renders the IPAM page
func ipamPage(c *gin.Context) {
	c.HTML(http.StatusOK, "ipam.html", gin.H{
		"title": "IPAM - Network Monitor",
	})
}
