package main

import (
	"bytes"
	"context"
	"encoding/json"
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
	nodeGrpc "github.com/Technologies-Unlimited/Network-Proxy/internal/grpc"
	pb "github.com/Technologies-Unlimited/Network-Proxy/internal/grpc/pb/node"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/thothos"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
	"gorm.io/gorm"
)

const version = "1.0.0"

// Server constants
const (
	defaultPort             = "8080"
	heartbeatInterval       = 60 * time.Second
	configSyncInterval      = 5 * time.Minute
	nodeStatusCheckInterval = 30 * time.Second
	nodeOfflineTimeout      = 5 * time.Minute
	nodeStaleTimeout        = 15 * time.Minute
)

// Node configuration
type NodeConfig struct {
	NodeID     string
	NodeName   string
	GRPCPort   int
	ServerAddr string
	CompanyID  string
}

// NodeRegistration is the request body for registering with the server
type NodeRegistration struct {
	Name        string `json:"name"`
	Hostname    string `json:"hostname"`
	IPAddress   string `json:"ip_address"`
	Version     string `json:"version"`
	CompanyID   string `json:"company_id"`
	GRPCPort    int    `json:"grpc_port"`
	GRPCEnabled bool   `json:"grpc_enabled"`
}

// NodeData contains the node information from registration
type NodeData struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Hostname  string `json:"hostname"`
	IPAddress string `json:"ip_address"`
	Status    string `json:"status"`
	GRPCPort  int    `json:"grpc_port"`
}

// NodeResponse is the response from the server after registration
type NodeResponse struct {
	Node NodeData `json:"node"`
}

var rootCmd = &cobra.Command{
	Use:   "network-monitor",
	Short: "Network Monitor - High-Performance Network Monitoring",
	Long: `Network Monitor is a high-performance network monitoring solution
that provides ICMP monitoring, SNMP polling, bandwidth testing, and more.

Use 'network-monitor server' to start the central server.
Use 'network-monitor node' to start a monitoring node.`,
	Version: version,
}

var serverCmd = &cobra.Command{
	Use:   "server",
	Short: "Start the central monitoring server",
	Long:  `Start the Network Monitor central server that coordinates nodes and provides the web UI.`,
	Run:   runServer,
}

var nodeCmd = &cobra.Command{
	Use:   "node",
	Short: "Start a monitoring node",
	Long:  `Start a Network Monitor node that connects to a central server for distributed monitoring.`,
	Run:   runNode,
}

// Node flags
var (
	nodeName   string
	nodePort   int
	serverAddr string
	companyID  string
)

func init() {
	// Add subcommands
	rootCmd.AddCommand(serverCmd)
	rootCmd.AddCommand(nodeCmd)

	// Node command flags
	nodeCmd.Flags().StringVarP(&nodeName, "name", "n", "", "Node name (required)")
	nodeCmd.Flags().IntVarP(&nodePort, "grpc-port", "p", 50051, "gRPC port to listen on")
	nodeCmd.Flags().StringVarP(&serverAddr, "server", "s", "http://localhost:8080", "Central server address")
	nodeCmd.Flags().StringVarP(&companyID, "company", "c", "default", "Company ID")
	nodeCmd.MarkFlagRequired("name")
}

func main() {
	// Initialize logger
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})

	if err := rootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}

// ============================================================================
// SERVER IMPLEMENTATION
// ============================================================================

func runServer(cmd *cobra.Command, args []string) {
	printBanner()

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

				middleware.UpdateProxyID(proxyConfig.ID)

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
					api.SetWebhookSecret(webhookResult.Secret)
				}

				go func() {
					if err := pullInitialConfig(thothosClient); err != nil {
						log.Error().Err(err).Msg("Failed to pull initial config from ThothOS")
					}
				}()

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
		log.Info().Msgf("Web UI available at http://localhost:%s", port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("Failed to start server")
		}
	}()

	// Wait for interrupt signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil {
		log.Fatal().Err(err).Msg("Server forced to shutdown")
	}

	log.Info().Msg("Server exited")
}

func printBanner() {
	banner := `
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║     NETWORK MONITOR - High-Performance Monitoring        ║
║                                                          ║
║     Built with Go | Faster than Zabbix                   ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`
	fmt.Println(banner)
}

func getOutboundIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "127.0.0.1"
	}
	defer conn.Close()

	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String()
}

func pullInitialConfig(client *thothos.Client) error {
	log.Info().Msg("Pulling initial configuration from ThothOS...")

	icmpMonitoring, err := client.GetICMPMonitoringTemplates()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to pull ICMP monitoring templates")
	} else {
		api.GetConfigCache().UpdateICMPMonitoringTemplates(icmpMonitoring)
	}

	icmpPolling, err := client.GetICMPPollingTemplates()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to pull ICMP polling templates")
	} else {
		api.GetConfigCache().UpdateICMPPollingTemplates(icmpPolling)
	}

	snmpv2, err := client.GetSNMPv2Templates()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to pull SNMPv2 templates")
	} else {
		api.GetConfigCache().UpdateSNMPv2Templates(snmpv2)
	}

	snmpv3, err := client.GetSNMPv3Templates()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to pull SNMPv3 templates")
	} else {
		api.GetConfigCache().UpdateSNMPv3Templates(snmpv3)
	}

	ipamConfig, err := client.GetIPAMConfig()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to pull IPAM configuration")
	} else {
		api.GetConfigCache().UpdateIPAMConfig(ipamConfig)
	}

	log.Info().Msg("Initial configuration pull complete")
	return nil
}

func startHeartbeat(client *thothos.Client, port string, db *gorm.DB) {
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()

	portNum, err := strconv.Atoi(port)
	if err != nil {
		log.Error().Err(err).Str("port", port).Msg("Invalid port number for heartbeat, using default")
		portNum = 8080
	}

	for range ticker.C {
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
				db.Where("source_node_id = ? OR target_node_id = ?", node.ID, node.ID).Delete(&models.NodePeer{})
				db.Where("source_node_id = ? OR target_node_id = ?", node.ID, node.ID).Delete(&models.BandwidthTestResult{})
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

// ============================================================================
// NODE IMPLEMENTATION
// ============================================================================

func runNode(cmd *cobra.Command, args []string) {
	hostname, err := os.Hostname()
	if err != nil {
		hostname = "unknown"
	}

	ipAddress := "127.0.0.1"

	config := &NodeConfig{
		NodeID:     uuid.New().String(),
		NodeName:   nodeName,
		GRPCPort:   nodePort,
		ServerAddr: serverAddr,
		CompanyID:  companyID,
	}

	fmt.Printf("Starting node '%s' on gRPC port %d\n", config.NodeName, config.GRPCPort)
	fmt.Printf("Registering with server at %s\n", config.ServerAddr)

	// Register with central server
	nodeID, err := registerWithServer(config, hostname, ipAddress)
	if err != nil {
		fmt.Printf("Warning: Failed to register with server: %v\n", err)
		fmt.Println("Continuing in standalone mode...")
		nodeID = config.NodeID
	} else {
		fmt.Printf("Registered successfully with ID: %s\n", nodeID)
		config.NodeID = nodeID
	}

	// Create and start gRPC server
	grpcServer := nodeGrpc.NewServer(nodeGrpc.ServerConfig{
		NodeID:     config.NodeID,
		NodeName:   config.NodeName,
		Hostname:   hostname,
		IPAddress:  ipAddress,
		GRPCPort:   config.GRPCPort,
		Version:    version,
		ServerAddr: config.ServerAddr,
	})

	// Set callbacks
	grpcServer.SetHeartbeatCallback(func(nodeID, status string) {
		fmt.Printf("Received heartbeat from %s: %s\n", nodeID, status)
	})

	grpcServer.SetPeerConnectCallback(func(peerID, peerName string) {
		fmt.Printf("Peer connected: %s (%s)\n", peerName, peerID)
	})

	grpcServer.SetTestCompleteCallback(func(testID string, results *pb.TestResults) {
		fmt.Printf("Test %s completed: upload=%.2f Mbps, download=%.2f Mbps\n",
			testID, results.UploadSpeedMbps, results.DownloadSpeedMbps)
	})

	if err := grpcServer.Start(); err != nil {
		fmt.Printf("Failed to start gRPC server: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Node '%s' is running. gRPC server listening on port %d\n", config.NodeName, config.GRPCPort)

	// Start heartbeat goroutine
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go runNodeHeartbeat(ctx, config)

	// Wait for shutdown signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	fmt.Println("\nShutting down...")
	grpcServer.Stop()
	fmt.Println("Node stopped")
}

func registerWithServer(config *NodeConfig, hostname, ipAddress string) (string, error) {
	registration := NodeRegistration{
		Name:        config.NodeName,
		Hostname:    hostname,
		IPAddress:   ipAddress,
		Version:     version,
		CompanyID:   config.CompanyID,
		GRPCPort:    config.GRPCPort,
		GRPCEnabled: true,
	}

	jsonData, err := json.Marshal(registration)
	if err != nil {
		return "", fmt.Errorf("failed to marshal registration: %w", err)
	}

	url := fmt.Sprintf("%s/api/v1/nodes", config.ServerAddr)
	resp, err := http.Post(url, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to register: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("registration failed with status %d", resp.StatusCode)
	}

	var nodeResp NodeResponse
	if err := json.NewDecoder(resp.Body).Decode(&nodeResp); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	return nodeResp.Node.ID, nil
}

func runNodeHeartbeat(ctx context.Context, config *NodeConfig) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sendNodeHeartbeat(config)
		}
	}
}

func sendNodeHeartbeat(config *NodeConfig) {
	url := fmt.Sprintf("%s/api/v1/nodes/%s/heartbeat", config.ServerAddr, config.NodeID)
	resp, err := http.Post(url, "application/json", nil)
	if err != nil {
		fmt.Printf("Heartbeat failed: %v\n", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Printf("Heartbeat returned status %d\n", resp.StatusCode)
	}
}
