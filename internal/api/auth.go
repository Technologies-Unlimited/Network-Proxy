package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/thothos"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// AuthService handles authentication with ThothOS
type AuthService struct {
	db *gorm.DB
}

// NewAuthService creates a new auth service
func NewAuthService(db *gorm.DB) *AuthService {
	return &AuthService{db: db}
}

// Global auth service instance
var authService *AuthService

// SetAuthService sets the global auth service
func SetAuthService(svc *AuthService) {
	authService = svc
}

// GetAuthService returns the global auth service
func GetAuthService() *AuthService {
	return authService
}

// LoginRequest represents the initial login request
type LoginRequest struct {
	ThothOSURL  string `json:"thothosUrl" binding:"required"`
	Email       string `json:"email" binding:"required,email"`
	PhoneNumber string `json:"phoneNumber" binding:"required"`
}

// LoginResponse represents the response from initial login
type LoginResponse struct {
	Success                 bool   `json:"success"`
	UserID                  string `json:"userId,omitempty"`
	UserType                string `json:"userType,omitempty"`
	CompanyID               string `json:"companyId,omitempty"`
	AdministrationCompanyID string `json:"administrationCompanyId,omitempty"`
	NextStep                string `json:"nextStep,omitempty"`
	Message                 string `json:"message,omitempty"`
	Error                   string `json:"error,omitempty"`
}

// VerifyMFARequest represents the MFA verification request
type VerifyMFARequest struct {
	ThothOSURL              string `json:"thothosUrl" binding:"required"`
	UserID                  string `json:"userId" binding:"required"`
	UserType                string `json:"userType" binding:"required"`
	Code                    string `json:"code" binding:"required,len=6"`
	CompanyID               string `json:"companyId"`
	AdministrationCompanyID string `json:"administrationCompanyId"`
}

// VerifyMFAResponse represents the response from MFA verification
type VerifyMFAResponse struct {
	Success   bool   `json:"success"`
	APIKey    string `json:"apiKey,omitempty"`
	APIKeyID  string `json:"apiKeyId,omitempty"`
	CompanyID string `json:"companyId,omitempty"`
	UserID    string `json:"userId,omitempty"`
	UserType  string `json:"userType,omitempty"`
	UserName  string `json:"userName,omitempty"`
	Message   string `json:"message,omitempty"`
	Error     string `json:"error,omitempty"`
}

// RegisterAuthRoutes registers authentication routes
func RegisterAuthRoutes(router *gin.Engine, db *gorm.DB) {
	svc := NewAuthService(db)
	SetAuthService(svc)

	// Auth routes (no auth middleware required)
	auth := router.Group("/api/v1/auth")
	{
		auth.POST("/login", svc.handleLogin)
		auth.POST("/verify-mfa", svc.handleVerifyMFA)
		auth.GET("/status", svc.handleAuthStatus)
		auth.POST("/logout", svc.handleLogout)
		auth.POST("/standalone", handleEnableStandalone)
	}

	// Login page route
	router.GET("/login", loginPage)
}

// handleLogin handles the initial login request
func (s *AuthService) handleLogin(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, LoginResponse{
			Success: false,
			Error:   "Invalid request: " + err.Error(),
		})
		return
	}

	log.Info().
		Str("email", req.Email).
		Str("thothosUrl", req.ThothOSURL).
		Msg("Processing login request")

	// Call ThothOS proxy login endpoint
	payload := map[string]string{
		"email":       req.Email,
		"phoneNumber": req.PhoneNumber,
	}

	payloadBytes, _ := json.Marshal(payload)
	resp, err := http.Post(
		fmt.Sprintf("%s/api/auth/proxy/login", req.ThothOSURL),
		"application/json",
		bytes.NewReader(payloadBytes),
	)

	if err != nil {
		log.Error().Err(err).Msg("Failed to connect to ThothOS")
		c.JSON(http.StatusServiceUnavailable, LoginResponse{
			Success: false,
			Error:   "Failed to connect to ThothOS: " + err.Error(),
		})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var thothosResp LoginResponse
	if err := json.Unmarshal(body, &thothosResp); err != nil {
		log.Error().Err(err).Str("body", string(body)).Msg("Failed to parse ThothOS response")
		c.JSON(http.StatusInternalServerError, LoginResponse{
			Success: false,
			Error:   "Invalid response from ThothOS",
		})
		return
	}

	if !thothosResp.Success {
		c.JSON(resp.StatusCode, thothosResp)
		return
	}

	log.Info().
		Str("userId", thothosResp.UserID).
		Str("nextStep", thothosResp.NextStep).
		Msg("Login step 1 successful")

	c.JSON(http.StatusOK, thothosResp)
}

// handleVerifyMFA handles MFA verification and completes the login
func (s *AuthService) handleVerifyMFA(c *gin.Context) {
	var req VerifyMFARequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, VerifyMFAResponse{
			Success: false,
			Error:   "Invalid request: " + err.Error(),
		})
		return
	}

	log.Info().
		Str("userId", req.UserID).
		Msg("Processing MFA verification")

	// Get hostname for API key naming
	hostname, _ := os.Hostname()

	// Call ThothOS proxy verify-mfa endpoint
	payload := map[string]string{
		"userId":                  req.UserID,
		"userType":                req.UserType,
		"code":                    req.Code,
		"companyId":               req.CompanyID,
		"administrationCompanyId": req.AdministrationCompanyID,
	}

	payloadBytes, _ := json.Marshal(payload)
	httpReq, _ := http.NewRequest(
		"POST",
		fmt.Sprintf("%s/api/auth/proxy/verify-mfa", req.ThothOSURL),
		bytes.NewReader(payloadBytes),
	)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Proxy-Hostname", hostname)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)

	if err != nil {
		log.Error().Err(err).Msg("Failed to verify MFA with ThothOS")
		c.JSON(http.StatusServiceUnavailable, VerifyMFAResponse{
			Success: false,
			Error:   "Failed to verify MFA: " + err.Error(),
		})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var thothosResp VerifyMFAResponse
	if err := json.Unmarshal(body, &thothosResp); err != nil {
		log.Error().Err(err).Str("body", string(body)).Msg("Failed to parse ThothOS response")
		c.JSON(http.StatusInternalServerError, VerifyMFAResponse{
			Success: false,
			Error:   "Invalid response from ThothOS",
		})
		return
	}

	if !thothosResp.Success {
		c.JSON(resp.StatusCode, thothosResp)
		return
	}

	log.Info().
		Str("userId", thothosResp.UserID).
		Str("companyId", thothosResp.CompanyID).
		Msg("MFA verification successful, saving configuration")

	// Get proxy name from environment or hostname
	proxyName := os.Getenv("PROXY_NAME")
	if proxyName == "" {
		proxyName = fmt.Sprintf("Network-Monitor-%s", hostname)
	}

	// Save the configuration to database
	config := models.ProxyConfig{
		ThothOSURL:              req.ThothOSURL,
		APIKey:                  thothosResp.APIKey,
		APIKeyID:                thothosResp.APIKeyID,
		CompanyID:               thothosResp.CompanyID,
		AdministrationCompanyID: req.AdministrationCompanyID,
		UserID:                  thothosResp.UserID,
		UserType:                thothosResp.UserType,
		UserName:                thothosResp.UserName,
		ProxyName:               proxyName,
		IsActive:                true,
	}

	// Delete any existing config and insert new one
	s.db.Where("1 = 1").Delete(&models.ProxyConfig{})
	if err := s.db.Create(&config).Error; err != nil {
		log.Error().Err(err).Msg("Failed to save proxy configuration")
		c.JSON(http.StatusInternalServerError, VerifyMFAResponse{
			Success: false,
			Error:   "Failed to save configuration: " + err.Error(),
		})
		return
	}

	// Update the global auth context with user info
	middleware.SetGlobalAuthContext(&middleware.AuthContext{
		CompanyID: thothosResp.CompanyID,
		APIKeyID:  thothosResp.APIKeyID,
		UserID:    thothosResp.UserID,
		UserType:  thothosResp.UserType,
		UserName:  thothosResp.UserName,
	})

	// Trigger ThothOS registration in background
	go s.registerWithThothOS(&config)

	log.Info().Msg("Authentication complete, configuration saved")

	c.JSON(http.StatusOK, VerifyMFAResponse{
		Success:   true,
		CompanyID: thothosResp.CompanyID,
		UserID:    thothosResp.UserID,
		UserType:  thothosResp.UserType,
		UserName:  thothosResp.UserName,
		Message:   "Authentication successful. Proxy is now connected to ThothOS.",
	})
}

// handleAuthStatus returns the current authentication status
func (s *AuthService) handleAuthStatus(c *gin.Context) {
	var config models.ProxyConfig
	result := s.db.First(&config)

	if result.Error != nil {
		c.JSON(http.StatusOK, gin.H{
			"authenticated": false,
			"message":       "No authentication configured",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"authenticated": config.IsActive,
		"thothosUrl":    config.ThothOSURL,
		"companyId":     config.CompanyID,
		"userId":        config.UserID,
		"userType":      config.UserType,
		"userName":      config.UserName,
		"proxyId":       config.ProxyID,
		"proxyName":     config.ProxyName,
		"lastValidated": config.LastValidated,
		"lastHeartbeat": config.LastHeartbeat,
	})
}

// handleEnableStandalone enables standalone mode (no ThothOS authentication)
func handleEnableStandalone(c *gin.Context) {
	middleware.SetStandaloneMode(true)
	log.Info().Msg("Standalone mode enabled via API")

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Standalone mode enabled - no authentication required",
		"mode":    "standalone",
	})
}

// handleLogout clears the authentication configuration
func (s *AuthService) handleLogout(c *gin.Context) {
	// Clear the configuration
	s.db.Where("1 = 1").Delete(&models.ProxyConfig{})

	// Clear global auth context
	middleware.SetGlobalAuthContext(nil)

	log.Info().Msg("Logged out, configuration cleared")

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Logged out successfully",
	})
}

// registerWithThothOS registers the proxy with ThothOS after login
func (s *AuthService) registerWithThothOS(config *models.ProxyConfig) {
	log.Info().Msg("Registering proxy with ThothOS...")

	// Create ThothOS client with the saved API key
	client := thothos.NewClient(config.ThothOSURL, config.APIKey)

	// Validate the API key first
	authResult, err := client.ValidateAPIKey()
	if err != nil {
		log.Error().Err(err).Msg("Failed to validate API key during registration")
		return
	}

	log.Info().
		Str("companyId", authResult.CompanyID).
		Str("apiKeyId", authResult.ApiKeyID).
		Msg("API key validated for registration")

	// Get port from environment
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	portNum, err := strconv.Atoi(port)
	if err != nil {
		log.Error().Err(err).Str("port", port).Msg("Invalid port number, using default")
		portNum = 8080
	}

	// Get callback URL
	callbackURL := os.Getenv("PROXY_CALLBACK_URL")
	if callbackURL == "" {
		localIP := getOutboundIP()
		callbackURL = fmt.Sprintf("http://%s:%s", localIP, port)
	}

	// Register the proxy
	proxyConfig, err := client.RegisterProxy(thothos.ProxyRegistrationInput{
		ProxyName:   config.ProxyName,
		Description: fmt.Sprintf("Network Monitor Proxy registered via login"),
		SupernetID:  "default",
		SubnetID:    "default",
		IPAddress:   getOutboundIP(),
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

	// Update the proxy ID in the config
	now := time.Now()
	s.db.Model(config).Updates(map[string]interface{}{
		"proxy_id":       proxyConfig.ID,
		"last_validated": now,
	})

	// Update the global auth context with proxy ID
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

		// Store webhook secret for signature verification
		SetWebhookSecret(webhookResult.Secret)
	}

	// Pull initial configuration
	if err := pullInitialConfigFromClient(client); err != nil {
		log.Error().Err(err).Msg("Failed to pull initial config from ThothOS")
	}

	log.Info().Msg("ThothOS registration complete")
}

// getOutboundIP gets the preferred outbound IP of this machine
func getOutboundIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "127.0.0.1"
	}
	defer conn.Close()

	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String()
}

// pullInitialConfigFromClient pulls configuration using an existing client
func pullInitialConfigFromClient(client *thothos.Client) error {
	log.Info().Msg("Pulling initial configuration from ThothOS...")

	// Pull ICMP monitoring templates
	icmpMonitoring, err := client.GetICMPMonitoringTemplates()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to pull ICMP monitoring templates")
	} else {
		GetConfigCache().UpdateICMPMonitoringTemplates(icmpMonitoring)
	}

	// Pull ICMP polling templates
	icmpPolling, err := client.GetICMPPollingTemplates()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to pull ICMP polling templates")
	} else {
		GetConfigCache().UpdateICMPPollingTemplates(icmpPolling)
	}

	// Pull SNMPv2 templates
	snmpv2, err := client.GetSNMPv2Templates()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to pull SNMPv2 templates")
	} else {
		GetConfigCache().UpdateSNMPv2Templates(snmpv2)
	}

	// Pull SNMPv3 templates
	snmpv3, err := client.GetSNMPv3Templates()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to pull SNMPv3 templates")
	} else {
		GetConfigCache().UpdateSNMPv3Templates(snmpv3)
	}

	// Pull IPAM configuration
	ipamConfig, err := client.GetIPAMConfig()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to pull IPAM configuration")
	} else {
		GetConfigCache().UpdateIPAMConfig(ipamConfig)
	}

	log.Info().Msg("Initial configuration pull complete")
	return nil
}

// loginPage renders the login page
func loginPage(c *gin.Context) {
	// Check if already authenticated
	if authService != nil {
		var config models.ProxyConfig
		if err := authService.db.First(&config).Error; err == nil && config.IsActive {
			// Already authenticated, redirect to dashboard
			c.Redirect(http.StatusFound, "/")
			return
		}
	}

	c.HTML(http.StatusOK, "login.html", gin.H{
		"title": "Login - Network Monitor",
	})
}

// LoadConfigOnStartup loads existing configuration from database
func LoadConfigOnStartup(db *gorm.DB) (*models.ProxyConfig, error) {
	var config models.ProxyConfig
	result := db.First(&config)

	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			return nil, nil // No config exists, user needs to login
		}
		return nil, result.Error
	}

	if !config.IsActive {
		return nil, nil
	}

	return &config, nil
}
