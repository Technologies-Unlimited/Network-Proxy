package api

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/thothos"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// RegisterSettingsRoutes registers the settings API routes
func RegisterSettingsRoutes(router *gin.RouterGroup, srv *server.Server) {
	settings := router.Group("/settings")
	{
		settings.GET("", getSettings(srv))
		settings.GET("/theme", getTheme(srv))
		settings.PUT("/theme", setTheme(srv))

		// ThothOS configuration endpoints
		settings.GET("/thothos", getThothOSConfig(srv))
		settings.PUT("/thothos", setThothOSConfig(srv))
		settings.POST("/thothos/test", testThothOSConnection(srv))
		settings.POST("/thothos/connect", connectToThothOS(srv))
		settings.POST("/thothos/disconnect", disconnectFromThothOS(srv))
	}
}

// getSettings returns all settings
func getSettings(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		theme := models.GetTheme(srv.DB)

		// Get ThothOS config
		thothosConfig, _ := models.GetThothOSConfig(srv.DB)

		// Get connection status
		authCtx := middleware.GetGlobalAuthContext()
		isConnected := authCtx != nil
		isStandalone := middleware.IsStandaloneMode()

		c.JSON(http.StatusOK, gin.H{
			"theme": theme,
			"thothos": gin.H{
				"url":         thothosConfig.URL,
				"hasApiKey":   thothosConfig.APIKey != "",
				"proxyName":   thothosConfig.ProxyName,
				"isConnected": isConnected,
				"isStandalone": isStandalone,
				"companyId":   getCompanyID(authCtx),
				"proxyId":     getProxyID(authCtx),
			},
		})
	}
}

// getTheme returns the current theme
func getTheme(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		theme := models.GetTheme(srv.DB)
		c.JSON(http.StatusOK, gin.H{"theme": theme})
	}
}

// setTheme updates the theme setting
func setTheme(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Theme string `json:"theme" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Theme is required"})
			return
		}

		// Validate theme
		theme := models.ThemeType(req.Theme)
		switch theme {
		case models.ThemeDark, models.ThemeLight, models.ThemeSacred:
			// Valid theme
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid theme. Must be 'dark', 'light', or 'sacred'"})
			return
		}

		if err := models.SetTheme(srv.DB, theme); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save theme"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"theme":   theme,
			"message": "Theme updated successfully",
		})
	}
}

// getThothOSConfig returns the ThothOS configuration
func getThothOSConfig(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		config, err := models.GetThothOSConfig(srv.DB)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get ThothOS configuration"})
			return
		}

		// Get connection status
		authCtx := middleware.GetGlobalAuthContext()
		isConnected := authCtx != nil
		isStandalone := middleware.IsStandaloneMode()

		c.JSON(http.StatusOK, gin.H{
			"url":          config.URL,
			"hasApiKey":    config.APIKey != "",
			"proxyName":    config.ProxyName,
			"isConnected":  isConnected,
			"isStandalone": isStandalone,
			"companyId":    getCompanyID(authCtx),
			"proxyId":      getProxyID(authCtx),
		})
	}
}

// setThothOSConfig updates the ThothOS configuration
func setThothOSConfig(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			URL       string `json:"url"`
			APIKey    string `json:"apiKey"`
			ProxyName string `json:"proxyName"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
			return
		}

		config := &models.ThothOSConfig{
			URL:       req.URL,
			APIKey:    req.APIKey,
			ProxyName: req.ProxyName,
		}

		if err := models.SetThothOSConfig(srv.DB, config); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save configuration"})
			return
		}

		log.Info().
			Str("url", config.URL).
			Bool("hasApiKey", config.APIKey != "").
			Str("proxyName", config.ProxyName).
			Msg("ThothOS configuration saved")

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Configuration saved successfully",
		})
	}
}

// testThothOSConnection tests the ThothOS connection without saving
func testThothOSConnection(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			URL    string `json:"url" binding:"required"`
			APIKey string `json:"apiKey" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "URL and API Key are required",
			})
			return
		}

		// Create a client and validate the API key
		client := thothos.NewClient(req.URL, req.APIKey)
		authResult, err := client.ValidateAPIKey()

		if err != nil {
			log.Warn().Err(err).Str("url", req.URL).Msg("ThothOS connection test failed")
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"error":   err.Error(),
			})
			return
		}

		log.Info().
			Str("companyId", authResult.CompanyID).
			Str("apiKeyId", authResult.ApiKeyID).
			Msg("ThothOS connection test successful")

		c.JSON(http.StatusOK, gin.H{
			"success":     true,
			"message":     "Connection successful",
			"companyId":   authResult.CompanyID,
			"apiKeyId":    authResult.ApiKeyID,
			"permissions": authResult.Permissions,
		})
	}
}

// connectToThothOS saves config and connects to ThothOS
func connectToThothOS(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			URL       string `json:"url" binding:"required"`
			APIKey    string `json:"apiKey" binding:"required"`
			ProxyName string `json:"proxyName"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "URL and API Key are required",
			})
			return
		}

		// Set proxy name to hostname if not provided
		if req.ProxyName == "" {
			hostname, _ := os.Hostname()
			req.ProxyName = fmt.Sprintf("Network-Monitor-%s", hostname)
		}

		// First, test the connection
		client := thothos.NewClient(req.URL, req.APIKey)
		authResult, err := client.ValidateAPIKey()

		if err != nil {
			log.Error().Err(err).Msg("Failed to validate ThothOS API key")
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Failed to validate API key: " + err.Error(),
			})
			return
		}

		// Save the configuration
		config := &models.ThothOSConfig{
			URL:       req.URL,
			APIKey:    req.APIKey,
			ProxyName: req.ProxyName,
		}

		if err := models.SetThothOSConfig(srv.DB, config); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Failed to save configuration",
			})
			return
		}

		// Set global auth context
		middleware.SetGlobalAuthContext(&middleware.AuthContext{
			CompanyID:   authResult.CompanyID,
			APIKeyID:    authResult.ApiKeyID,
			ProxyID:     authResult.ProxyID,
			Permissions: authResult.Permissions,
		})

		// Disable standalone mode
		middleware.SetStandaloneMode(false)

		// Register proxy with ThothOS in background
		go registerProxyWithThothOS(client, config, srv)

		log.Info().
			Str("companyId", authResult.CompanyID).
			Str("proxyName", req.ProxyName).
			Msg("Connected to ThothOS")

		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"message":   "Connected to ThothOS successfully",
			"companyId": authResult.CompanyID,
		})
	}
}

// disconnectFromThothOS clears the connection to ThothOS
func disconnectFromThothOS(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Clear ThothOS configuration
		if err := models.ClearThothOSConfig(srv.DB); err != nil {
			log.Error().Err(err).Msg("Failed to clear ThothOS configuration")
		}

		// Clear global auth context
		middleware.SetGlobalAuthContext(nil)

		// Enable standalone mode
		middleware.SetStandaloneMode(true)

		log.Info().Msg("Disconnected from ThothOS")

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Disconnected from ThothOS. Running in standalone mode.",
		})
	}
}

// registerProxyWithThothOS registers the proxy with ThothOS
func registerProxyWithThothOS(client *thothos.Client, config *models.ThothOSConfig, srv *server.Server) {
	log.Info().Msg("Registering proxy with ThothOS...")

	// Get port from environment
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	portNum, err := strconv.Atoi(port)
	if err != nil {
		portNum = 8080
	}

	// Get callback URL
	callbackURL := os.Getenv("PROXY_CALLBACK_URL")
	if callbackURL == "" {
		localIP := getSettingsOutboundIP()
		callbackURL = fmt.Sprintf("http://%s:%s", localIP, port)
	}

	// Register the proxy
	proxyConfig, err := client.RegisterProxy(thothos.ProxyRegistrationInput{
		ProxyName:   config.ProxyName,
		Description: "Network Monitor Proxy",
		SupernetID:  "default",
		SubnetID:    "default",
		IPAddress:   getSettingsOutboundIP(),
		Port:        portNum,
		CallbackURL: fmt.Sprintf("%s/api/v1/webhooks/config-update", callbackURL),
		Version:     "1.0.0",
	})

	if err != nil {
		log.Error().Err(err).Msg("Failed to register proxy with ThothOS")
		return
	}

	log.Info().
		Str("proxyId", proxyConfig.ID).
		Str("proxyName", proxyConfig.ProxyName).
		Msg("Proxy registered with ThothOS")

	// Update the proxy ID in auth context
	middleware.UpdateProxyID(proxyConfig.ID)

	// Register webhook for config updates
	webhookResult, err := client.RegisterWebhook(thothos.WebhookRegistrationInput{
		Name:        fmt.Sprintf("config-sync-%s", proxyConfig.ID),
		CallbackURL: fmt.Sprintf("%s/api/v1/webhooks/config-update", callbackURL),
		Events:      []string{"config.sync", "snmp.template.updated", "icmp.template.updated"},
		ProxyID:     proxyConfig.ID,
	})

	if err != nil {
		log.Error().Err(err).Msg("Failed to register webhook with ThothOS")
	} else {
		log.Info().
			Str("webhookId", webhookResult.ID).
			Msg("Webhook registered with ThothOS")
		SetWebhookSecret(webhookResult.Secret)
	}

	// Pull initial configuration
	if err := pullInitialConfigFromClient(client); err != nil {
		log.Error().Err(err).Msg("Failed to pull initial config from ThothOS")
	}

	log.Info().Msg("ThothOS registration complete")
}

// getSettingsOutboundIP gets the preferred outbound IP
func getSettingsOutboundIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "127.0.0.1"
	}
	defer conn.Close()

	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String()
}

// Helper functions
func getCompanyID(ctx *middleware.AuthContext) string {
	if ctx != nil {
		return ctx.CompanyID
	}
	return ""
}

func getProxyID(ctx *middleware.AuthContext) string {
	if ctx != nil {
		return ctx.ProxyID
	}
	return ""
}

// settingsPage renders the settings page
func settingsPage(c *gin.Context) {
	c.HTML(http.StatusOK, "settings.html", gin.H{
		"title": "Settings - Network Monitor",
	})
}
