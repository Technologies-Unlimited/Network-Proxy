package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/api"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/database"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/thothos"
	"gorm.io/gorm"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

const (
	defaultPort             = "8080"
	heartbeatInterval       = 60 * time.Second
	configSyncInterval      = 5 * time.Minute
	nodeStatusCheckInterval = 30 * time.Second // How often to check node status
	nodeOfflineTimeout      = 5 * time.Minute  // Mark node offline after 5 minutes without heartbeat
	nodeStaleTimeout        = 15 * time.Minute // Remove stale nodes after 15 minutes without heartbeat
	version                 = "1.0.0"
)

func main() {
	// Initialize logger
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})

	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Warn().Msg("No .env file found, using environment variables")
	}

	// Initialize database
	db, err := database.Initialize()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize database")
	}

	// Initialize server
	srv := server.New(db)

	// Get configuration from environment
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	// First, try to load config from database (set via login UI)
	savedConfig, configErr := api.LoadConfigOnStartup(db)
	if configErr != nil {
		log.Debug().Err(configErr).Msg("No saved ThothOS config found, using environment variables")
	}

	// Fall back to environment variables if no saved config
	thothosURL := os.Getenv("THOTHOS_URL")
	thothosAPIKey := os.Getenv("THOTHOS_API_KEY")
	callbackURL := os.Getenv("PROXY_CALLBACK_URL")
	proxyName := os.Getenv("PROXY_NAME")

	// Use saved config if available
	if savedConfig != nil {
		log.Info().
			Str("companyId", savedConfig.CompanyID).
			Str("userName", savedConfig.UserName).
			Msg("Loaded saved ThothOS configuration from database")
		thothosURL = savedConfig.ThothOSURL
		thothosAPIKey = savedConfig.APIKey
		if savedConfig.ProxyName != "" {
			proxyName = savedConfig.ProxyName
		}
	}

	if proxyName == "" {
		hostname, _ := os.Hostname()
		proxyName = fmt.Sprintf("Network-Monitor-%s", hostname)
	}

	// Initialize ThothOS connection if configured
	var thothosClient *thothos.Client
	if thothosURL != "" && thothosAPIKey != "" {
		thothosClient = thothos.NewClient(thothosURL, thothosAPIKey)

		// Validate API key
		authResult, err := thothosClient.ValidateAPIKey()
		if err != nil {
			log.Error().Err(err).Msg("Failed to validate ThothOS API key - running in standalone mode")
			middleware.SetStandaloneMode(true)
		} else {
			log.Info().
				Str("companyId", authResult.CompanyID).
				Str("apiKeyId", authResult.ApiKeyID).
				Msg("ThothOS API key validated successfully")

			// Set global auth context
			middleware.SetGlobalAuthContext(&middleware.AuthContext{
				CompanyID:   authResult.CompanyID,
				APIKeyID:    authResult.ApiKeyID,
				ProxyID:     authResult.ProxyID,
				Permissions: authResult.Permissions,
			})

			// Register this proxy with ThothOS
			if callbackURL == "" {
				// Try to determine callback URL from local IP
				localIP := getOutboundIP()
				callbackURL = fmt.Sprintf("http://%s:%s", localIP, port)
			}

			portNum, err := strconv.Atoi(port)
			if err != nil {
				log.Error().Err(err).Str("port", port).Msg("Invalid port number")
				portNum = 8080
			}
			proxyConfig, err := thothosClient.RegisterProxy(thothos.ProxyRegistrationInput{
				ProxyName:   proxyName,
				Description: fmt.Sprintf("Network Monitor Proxy v%s", version),
				SupernetID:  "default",
				SubnetID:    "default",
				IPAddress:   getOutboundIP(),
				Port:        portNum,
				CallbackURL: fmt.Sprintf("%s/api/v1/webhooks/config-update", callbackURL),
				Version:     version,
			})
			if err != nil {
				log.Error().Err(err).Msg("Failed to register proxy with ThothOS")
			} else {
				log.Info().
					Str("proxyId", proxyConfig.ID).
					Str("proxyName", proxyConfig.ProxyName).
					Msg("Proxy registered with ThothOS")

				// Update proxy ID in auth context
				middleware.UpdateProxyID(proxyConfig.ID)

				// Register webhook for config updates
				webhookResult, err := thothosClient.RegisterWebhook(thothos.WebhookRegistrationInput{
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
					api.SetWebhookSecret(webhookResult.Secret)
				}

				// Pull initial configuration
				go func() {
					if err := pullInitialConfig(thothosClient); err != nil {
						log.Error().Err(err).Msg("Failed to pull initial config from ThothOS")
					}
				}()

				// Start heartbeat goroutine
				go startHeartbeat(thothosClient, port, db)
			}
		}
	} else {
		log.Warn().Msg("ThothOS not configured - running in standalone mode")
		log.Warn().Msg("Set THOTHOS_URL and THOTHOS_API_KEY to enable ThothOS integration")
		middleware.SetStandaloneMode(true)
	}

	// Set up Gin router
	router := gin.Default()

	// Load HTML templates
	router.LoadHTMLGlob("web/templates/*.html")

	// Serve static files
	router.Static("/static", "web/static")

	// Register API routes
	api.RegisterRoutes(router, srv)

	// Create HTTP server
	httpServer := &http.Server{
		Addr:    fmt.Sprintf(":%s", port),
		Handler: router,
	}

	// Start node status monitor goroutine
	go startNodeStatusMonitor(db)

	// Start server in goroutine
	go func() {
		log.Info().Msgf("Server starting on port %s", port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("Failed to start server")
		}
	}()

	// Wait for interrupt signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("Shutting down server...")

	// Graceful shutdown with 5 second timeout
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil {
		log.Fatal().Err(err).Msg("Server forced to shutdown")
	}

	log.Info().Msg("Server exited")
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

// pullInitialConfig pulls the initial configuration from ThothOS
func pullInitialConfig(client *thothos.Client) error {
	log.Info().Msg("Pulling initial configuration from ThothOS...")

	// Pull ICMP monitoring templates
	icmpMonitoring, err := client.GetICMPMonitoringTemplates()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to pull ICMP monitoring templates")
	} else {
		api.GetConfigCache().UpdateICMPMonitoringTemplates(icmpMonitoring)
	}

	// Pull ICMP polling templates
	icmpPolling, err := client.GetICMPPollingTemplates()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to pull ICMP polling templates")
	} else {
		api.GetConfigCache().UpdateICMPPollingTemplates(icmpPolling)
	}

	// Pull SNMPv2 templates
	snmpv2, err := client.GetSNMPv2Templates()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to pull SNMPv2 templates")
	} else {
		api.GetConfigCache().UpdateSNMPv2Templates(snmpv2)
	}

	// Pull SNMPv3 templates
	snmpv3, err := client.GetSNMPv3Templates()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to pull SNMPv3 templates")
	} else {
		api.GetConfigCache().UpdateSNMPv3Templates(snmpv3)
	}

	// Pull IPAM configuration (supernets, subnets, pools, IP addresses, VLANs)
	ipamConfig, err := client.GetIPAMConfig()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to pull IPAM configuration")
	} else {
		api.GetConfigCache().UpdateIPAMConfig(ipamConfig)
	}

	log.Info().Msg("Initial configuration pull complete")
	return nil
}

// startHeartbeat starts the heartbeat goroutine
func startHeartbeat(client *thothos.Client, port string, db *gorm.DB) {
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()

	portNum, err := strconv.Atoi(port)
	if err != nil {
		log.Error().Err(err).Str("port", port).Msg("Invalid port number for heartbeat, using default")
		portNum = 8080
	}

	for range ticker.C {
		// Get actual node and device counts from database
		var nodeCount int64
		var deviceCount int64

		if err := db.Model(&models.Node{}).Count(&nodeCount).Error; err != nil {
			log.Error().Err(err).Msg("Failed to count nodes for heartbeat")
		}

		if err := db.Model(&models.Device{}).Count(&deviceCount).Error; err != nil {
			log.Error().Err(err).Msg("Failed to count devices for heartbeat")
		}

		_, err := client.SendHeartbeat(thothos.HeartbeatStatus{
			IPAddress:   getOutboundIP(),
			Port:        portNum,
			Version:     version,
			AgentCount:  int(nodeCount),
			DeviceCount: int(deviceCount),
		})
		if err != nil {
			log.Warn().Err(err).Msg("Failed to send heartbeat to ThothOS")
		} else {
			log.Debug().
				Int64("nodes", nodeCount).
				Int64("devices", deviceCount).
				Msg("Heartbeat sent to ThothOS")
		}
	}
}

// startNodeStatusMonitor periodically checks node heartbeats and manages node lifecycle:
// - Marks nodes offline after 5 minutes without heartbeat
// - Deletes stale nodes after 15 minutes without heartbeat
func startNodeStatusMonitor(db *gorm.DB) {
	ticker := time.NewTicker(nodeStatusCheckInterval)
	defer ticker.Stop()

	log.Info().
		Dur("checkInterval", nodeStatusCheckInterval).
		Dur("offlineTimeout", nodeOfflineTimeout).
		Dur("staleTimeout", nodeStaleTimeout).
		Msg("Node status monitor started")

	for range ticker.C {
		now := time.Now()
		offlineCutoff := now.Add(-nodeOfflineTimeout)
		staleCutoff := now.Add(-nodeStaleTimeout)

		// Step 1: Delete stale nodes (not seen for 15+ minutes)
		var staleNodes []models.Node
		db.Where("last_seen < ?", staleCutoff).Find(&staleNodes)

		if len(staleNodes) > 0 {
			for _, node := range staleNodes {
				// Delete associated peers
				db.Where("source_node_id = ? OR target_node_id = ?", node.ID, node.ID).Delete(&models.NodePeer{})
				// Delete associated bandwidth tests
				db.Where("source_node_id = ? OR target_node_id = ?", node.ID, node.ID).Delete(&models.BandwidthTestResult{})
				// Delete the node
				db.Delete(&node)
			}
			log.Info().
				Int("count", len(staleNodes)).
				Msg("Removed stale nodes (no heartbeat for 15+ minutes)")
		}

		// Step 2: Mark nodes offline (not seen for 5+ minutes but less than 15)
		result := db.Model(&models.Node{}).
			Where("status = ? AND last_seen < ? AND last_seen >= ?", "online", offlineCutoff, staleCutoff).
			Update("status", "offline")

		if result.Error != nil {
			log.Error().Err(result.Error).Msg("Failed to update node statuses")
		} else if result.RowsAffected > 0 {
			log.Info().
				Int64("count", result.RowsAffected).
				Msg("Marked nodes as offline (no heartbeat for 5+ minutes)")
		}
	}
}
