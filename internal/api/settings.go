package api

import (
	"fmt"
	"net/http"
	"os"
	"strconv"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/netutil"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/thothos"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// RegisterPublicSettingsRoutes registers the small set of settings endpoints
// that the unauthenticated UI shell legitimately needs (theme bootstrap and
// a redacted connection-status view). All sensitive operations are gated by
// RegisterAuthedSettingsRoutes.
//
// Splitting these is the fix for the previous behaviour where every /settings
// endpoint — including ThothOS API-key read/write — was reachable without
// authentication.
func RegisterPublicSettingsRoutes(router *gin.RouterGroup, srv *server.Server) {
	settings := router.Group("/settings")
	{
		// Theme is needed to render the login page itself; safe to expose.
		settings.GET("/theme", getTheme(srv))

		// Returns *only* connection status booleans + non-secret IDs. Used by
		// the UI to decide whether to show the login page or the dashboard.
		settings.GET("/status", getSettingsStatus(srv))
	}
}

// RegisterAuthedSettingsRoutes registers the settings endpoints that may
// expose secrets or change configuration. These run inside the RequireAuth
// middleware in routes.go.
func RegisterAuthedSettingsRoutes(router *gin.RouterGroup, srv *server.Server) {
	settings := router.Group("/settings")
	{
		settings.GET("", getSettings(srv))
		settings.PUT("/theme", setTheme(srv))

		// ThothOS configuration endpoints — must require auth so an attacker
		// on the LAN can't overwrite the API key or read the saved URL.
		settings.GET("/thothos", getThothOSConfig(srv))
		settings.PUT("/thothos", setThothOSConfig(srv))
		settings.POST("/thothos/test", testThothOSConnection(srv))
		settings.POST("/thothos/connect", connectToThothOS(srv))
		settings.POST("/thothos/disconnect", disconnectFromThothOS(srv))
	}
}

// getSettingsStatus returns only non-sensitive connection state.
func getSettingsStatus(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx := middleware.GetGlobalAuthContext()
		c.JSON(http.StatusOK, gin.H{
			"isConnected":  authCtx != nil,
			"isStandalone": middleware.IsStandaloneMode(),
		})
	}
}

// getSettings returns all settings (auth required).
func getSettings(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		theme := models.GetTheme(srv.DB)

		thothosConfig, _ := models.GetThothOSConfig(srv.DB)

		authCtx := middleware.GetGlobalAuthContext()
		isConnected := authCtx != nil
		isStandalone := middleware.IsStandaloneMode()

		c.JSON(http.StatusOK, gin.H{
			"theme": theme,
			"thothos": gin.H{
				"url":          thothosConfig.URL,
				"hasApiKey":    thothosConfig.APIKey != "",
				"proxyName":    thothosConfig.ProxyName,
				"isConnected":  isConnected,
				"isStandalone": isStandalone,
				"companyId":    getCompanyID(authCtx),
				"proxyId":      getProxyID(authCtx),
			},
		})
	}
}

func getTheme(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		theme := models.GetTheme(srv.DB)
		c.JSON(http.StatusOK, gin.H{"theme": theme})
	}
}

func setTheme(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Theme string `json:"theme" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Theme is required"})
			return
		}
		theme := models.ThemeType(req.Theme)
		switch theme {
		case models.ThemeDark, models.ThemeLight, models.ThemeSacred:
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

func getThothOSConfig(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		config, err := models.GetThothOSConfig(srv.DB)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get ThothOS configuration"})
			return
		}
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
		config := &models.ThothOSConfig{URL: req.URL, APIKey: req.APIKey, ProxyName: req.ProxyName}
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

func testThothOSConnection(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			URL    string `json:"url" binding:"required"`
			APIKey string `json:"apiKey" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "URL and API Key are required"})
			return
		}
		// SSRF guard: pin to the configured ThothOS origin (or require
		// loopback if none configured yet). See thothos_url.go.
		if err := validateThothOSURL(c, srv.DB, req.URL); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		client := thothos.NewClient(req.URL, req.APIKey)
		authResult, err := client.ValidateAPIKey()
		if err != nil {
			log.Warn().Err(err).Str("url", req.URL).Msg("ThothOS connection test failed")
			c.JSON(http.StatusOK, gin.H{"success": false, "error": err.Error()})
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

func connectToThothOS(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			URL       string `json:"url" binding:"required"`
			APIKey    string `json:"apiKey" binding:"required"`
			ProxyName string `json:"proxyName"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "URL and API Key are required"})
			return
		}
		if req.ProxyName == "" {
			hostname, _ := os.Hostname()
			req.ProxyName = fmt.Sprintf("Network-Monitor-%s", hostname)
		}
		// SSRF guard — same policy as testThothOSConnection.
		if err := validateThothOSURL(c, srv.DB, req.URL); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		client := thothos.NewClient(req.URL, req.APIKey)
		authResult, err := client.ValidateAPIKey()
		if err != nil {
			log.Error().Err(err).Msg("Failed to validate ThothOS API key")
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Failed to validate API key: " + err.Error()})
			return
		}
		config := &models.ThothOSConfig{URL: req.URL, APIKey: req.APIKey, ProxyName: req.ProxyName}
		if err := models.SetThothOSConfig(srv.DB, config); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to save configuration"})
			return
		}
		middleware.SetGlobalAuthContext(&middleware.AuthContext{
			CompanyID:   authResult.CompanyID,
			APIKeyID:    authResult.ApiKeyID,
			ProxyID:     authResult.ProxyID,
			Permissions: authResult.Permissions,
		})
		middleware.SetStandaloneMode(false)
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

func disconnectFromThothOS(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		// SECURITY: disconnect runs teardownThothOSSession — it deletes BOTH
		// persisted ThothOS fallbacks and flips the whole API into standalone
		// (auth-bypassed) mode, exactly like handleLogout. It is registered
		// behind RequireAuth, but RequireAuth in INTEGRATED mode only checks the
		// process-global "is this proxy connected" flag; it verifies NO
		// per-request credential (the local API has no cookie/bearer/API-key
		// check), so every remote caller passes it and reaches this handler.
		// That makes disconnect the SAME remote-unauthenticated destructive
		// surface logout was, so gate it identically via the shared
		// requireLocalOrBootstrap: loopback-only, plus the bootstrap token once
		// a ProxyConfig exists. Without this, any host that can reach the server
		// could brick/bypass an integrated proxy with one unauthenticated POST.
		result, configExists := requireLocalOrBootstrap(c, srv.DB)
		switch result {
		case localGateNotLoopback:
			log.Warn().
				Str("ip", c.ClientIP()).
				Msg("Refused remote /settings/thothos/disconnect request")
			c.JSON(http.StatusForbidden, gin.H{
				"success": false,
				"error":   "disconnect can only be performed from a local loopback connection",
			})
			return
		case localGateBadToken:
			log.Warn().Msg("Refused /settings/thothos/disconnect: config exists but bootstrap token missing/mismatched")
			c.JSON(http.StatusForbidden, gin.H{
				"success": false,
				"error":   "ProxyConfig exists; disconnect requires NETWORK_MONITOR_BOOTSTRAP_TOKEN",
			})
			return
		}

		// Real disconnect: cancel the live heartbeat/config-pull loop, delete
		// BOTH persisted fallbacks (Settings config + ProxyConfig row) so a
		// restart cannot silently reconnect, and flip to standalone. Previously
		// this only cleared the Settings config, leaving the heartbeat loop
		// running and any ProxyConfig row intact — a cosmetic disconnect.
		if err := teardownThothOSSession(srv.DB); err != nil {
			// The live session is stopped and the process is standalone, but a
			// persisted credential could not be deleted — it may survive and
			// auto-reconnect on reboot. Do NOT claim a clean disconnect.
			log.Error().
				Err(err).
				Bool("configExisted", configExists).
				Msg("Disconnect could not fully clear persisted ThothOS config")
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Disconnected the live session, but failed to remove saved ThothOS credentials; they may reconnect on restart. Check server logs and retry.",
			})
			return
		}
		log.Info().
			Bool("configExisted", configExists).
			Msg("Disconnected from ThothOS")
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Disconnected from ThothOS. Running in standalone mode."})
	}
}

func registerProxyWithThothOS(client *thothos.Client, config *models.ThothOSConfig, srv *server.Server) {
	log.Info().Msg("Registering proxy with ThothOS...")
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	portNum, err := strconv.Atoi(port)
	if err != nil {
		portNum = 8080
	}

	// Register the proxy AND start the heartbeat + config-pull/apply session.
	// Before this shared routine existed, the settings-connect flow registered
	// but never started the heartbeat, so the wizard's happy path showed the
	// proxy "online" with frozen counts until a process restart. Config reaches
	// the proxy via the session's pull-apply loop, not a webhook push (removed).
	proxyConfig, err := StartThothOSSession(ThothOSSessionConfig{
		Client:      client,
		DB:          srv.DB,
		ProxyName:   config.ProxyName,
		Description: "Network Monitor Proxy",
		IPAddress:   getSettingsOutboundIP(),
		Port:        portNum,
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
	log.Info().Msg("ThothOS registration complete")
}

func getSettingsOutboundIP() string {
	return netutil.OutboundIP()
}

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

func settingsPage(c *gin.Context) {
	c.HTML(http.StatusOK, "settings.html", gin.H{
		"title": "Settings - Network Monitor",
	})
}
