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

// syncIPAMData forces a sync of IPAM data from ThothOS
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

		// Fetch complete IPAM config
		ipamConfig, err := client.GetIPAMConfig()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to sync IPAM data: " + err.Error(),
			})
			return
		}

		log.Info().
			Int("supernets", len(ipamConfig.Supernets)).
			Int("subnets", len(ipamConfig.Subnets)).
			Int("pools", len(ipamConfig.Pools)).
			Int("addresses", len(ipamConfig.IPAddresses)).
			Int("vlans", len(ipamConfig.VLANs)).
			Msg("IPAM data synced from ThothOS")

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "IPAM data synced successfully",
			"counts": gin.H{
				"supernets": len(ipamConfig.Supernets),
				"subnets":   len(ipamConfig.Subnets),
				"pools":     len(ipamConfig.Pools),
				"addresses": len(ipamConfig.IPAddresses),
				"vlans":     len(ipamConfig.VLANs),
			},
		})
	}
}

// ipamPage renders the IPAM page
func ipamPage(c *gin.Context) {
	c.HTML(http.StatusOK, "ipam.html", gin.H{
		"title": "IPAM - Network Monitor",
	})
}
