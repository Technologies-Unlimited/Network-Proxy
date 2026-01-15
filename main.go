package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
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
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
	"gorm.io/gorm"
)

const version = "1.0.0"

// Build-time variables (set via -ldflags)
var (
	commitSHA  = "dev"
	buildTime  = "unknown"
)

// Server constants
const (
	heartbeatInterval       = 60 * time.Second
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

// Server flags
var (
	serverPort int
)

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

	// Server command flags
	serverCmd.Flags().IntVarP(&serverPort, "port", "p", 8080, "HTTP port to listen on")

	// Node command flags
	nodeCmd.Flags().StringVarP(&nodeName, "name", "n", "", "Node name (required)")
	nodeCmd.Flags().IntVarP(&nodePort, "grpc-port", "p", 50051, "gRPC port to listen on")
	nodeCmd.Flags().StringVarP(&serverAddr, "server", "s", "http://localhost:8080", "Central server address")
	nodeCmd.Flags().StringVarP(&companyID, "company", "c", "default", "Company ID")
	nodeCmd.MarkFlagRequired("name")
}

func main() {
	// Initialize logger with both console and file output
	logFile, err := os.OpenFile("network-monitor.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		fmt.Printf("Failed to open log file: %v\n", err)
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})
	} else {
		// Write to both console and file
		consoleWriter := zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339}
		multi := zerolog.MultiLevelWriter(consoleWriter, logFile)
		log.Logger = zerolog.New(multi).With().Timestamp().Logger()
	}

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

	// Initialize database
	db, err := database.Initialize()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize database")
	}

	// Initialize server
	srv := server.New(db)


	// Load ThothOS configuration from database settings
	thothosConfig, _ := models.GetThothOSConfig(db)
	thothosURL := thothosConfig.URL
	thothosAPIKey := thothosConfig.APIKey
	proxyName := thothosConfig.ProxyName

	// Also check legacy ProxyConfig table (from login flow)
	if thothosURL == "" || thothosAPIKey == "" {
		savedConfig, configErr := api.LoadConfigOnStartup(db)
		if configErr == nil && savedConfig != nil {
			log.Info().
				Str("companyId", savedConfig.CompanyID).
				Str("userName", savedConfig.UserName).
				Msg("Loaded ThothOS configuration from login session")
			thothosURL = savedConfig.ThothOSURL
			thothosAPIKey = savedConfig.APIKey
			if savedConfig.ProxyName != "" {
				proxyName = savedConfig.ProxyName
			}
		}
	}

	// Default proxy name to hostname if not set
	if proxyName == "" {
		hostname, _ := os.Hostname()
		proxyName = fmt.Sprintf("Network-Monitor-%s", hostname)
	}

	// Auto-detect callback URL
	callbackURL := ""

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
				callbackURL = fmt.Sprintf("http://%s:%d", localIP, serverPort)
			}

			proxyConfig, err := thothosClient.RegisterProxy(thothos.ProxyRegistrationInput{
				ProxyName:   proxyName,
				Description: fmt.Sprintf("Network Monitor Proxy v%s", version),
				SupernetID:  "default",
				SubnetID:    "default",
				IPAddress:   getOutboundIP(),
				Port:        serverPort,
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

				go startHeartbeat(thothosClient, serverPort, db)
			}
		}
	} else {
		log.Warn().Msg("ThothOS not configured - running in standalone mode")
		log.Warn().Msgf("Configure ThothOS at http://localhost:%d/settings to enable integration", serverPort)
		middleware.SetStandaloneMode(true)
	}

	// Set up Gin router
	router := gin.Default()

	// Load HTML templates
	router.LoadHTMLGlob("web/templates/*.html")

	// Serve static files
	router.Static("/static", "web/static")

	// Initialize updater
	api.InitUpdater(version, commitSHA)

	// Register API routes
	api.RegisterRoutes(router, srv)

	// Start node status monitor goroutine
	go startNodeStatusMonitor(db)

	// Try to bind to the port, killing any existing process if needed
	addr := fmt.Sprintf(":%d", serverPort)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		// Port is in use, try to kill the process using it
		log.Warn().Msgf("Port %d is in use, attempting to kill existing process...", serverPort)
		if killErr := killProcessOnPort(serverPort); killErr != nil {
			log.Error().Err(killErr).Msgf("Failed to kill process on port %d", serverPort)
		} else {
			// Wait a moment for the port to be released
			time.Sleep(2 * time.Second)
			// Try again
			listener, err = net.Listen("tcp", addr)
			if err != nil {
				log.Fatal().Err(err).Msgf("Failed to bind to port %d even after killing existing process", serverPort)
			}
			log.Info().Msgf("Successfully claimed port %d after killing previous process", serverPort)
		}
	}

	httpServer := &http.Server{
		Handler: router,
	}

	// Start server using the listener we already have
	go func() {
		log.Info().Msgf("Server starting on port %d", serverPort)
		log.Info().Msgf("Web UI available at http://localhost:%d", serverPort)
		if err := httpServer.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("Failed to start server")
		}
	}()

	// Auto-launch browser after a short delay to ensure server is ready
	go func() {
		time.Sleep(500 * time.Millisecond)
		url := fmt.Sprintf("http://localhost:%d", serverPort)
		openBrowser(url)
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

// openBrowser opens the specified URL in the default browser
func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default: // Linux and other Unix-like systems
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		log.Warn().Err(err).Msg("Failed to open browser automatically")
	} else {
		log.Info().Str("url", url).Msg("Browser opened")
	}
}

// killProcessOnPort kills any process using the specified port (Windows only for now)
func killProcessOnPort(port int) error {
	if runtime.GOOS != "windows" {
		// On Unix-like systems, use lsof and kill
		cmd := exec.Command("sh", "-c", fmt.Sprintf("lsof -ti:%d | xargs kill -9", port))
		return cmd.Run()
	}

	// On Windows, use netstat to find the PID and taskkill to kill it
	cmd := exec.Command("cmd", "/c", fmt.Sprintf("for /f \"tokens=5\" %%a in ('netstat -aon ^| findstr :%d ^| findstr LISTENING') do taskkill /F /PID %%a", port))
	output, err := cmd.CombinedOutput()
	if err != nil {
		// Try alternative approach - parse netstat output manually
		netstatCmd := exec.Command("netstat", "-aon")
		netstatOutput, netstatErr := netstatCmd.Output()
		if netstatErr != nil {
			return fmt.Errorf("netstat failed: %v", netstatErr)
		}

		// Find the PID for the listening port
		lines := string(netstatOutput)
		searchStr := fmt.Sprintf(":%d", port)
		for _, line := range splitLines(lines) {
			if contains(line, searchStr) && contains(line, "LISTENING") {
				// Extract PID (last column)
				fields := splitFields(line)
				if len(fields) > 0 {
					pid := fields[len(fields)-1]
					killCmd := exec.Command("taskkill", "/F", "/PID", pid)
					if killErr := killCmd.Run(); killErr != nil {
						log.Warn().Str("pid", pid).Err(killErr).Msg("Failed to kill process")
					} else {
						log.Info().Str("pid", pid).Msgf("Killed process on port %d", port)
						return nil
					}
				}
			}
		}
		return fmt.Errorf("could not find process on port %d: %s", port, string(output))
	}
	log.Info().Msgf("Killed process on port %d", port)
	return nil
}

// Helper functions for string parsing
func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			line := s[start:i]
			if len(line) > 0 && line[len(line)-1] == '\r' {
				line = line[:len(line)-1]
			}
			lines = append(lines, line)
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}

func splitFields(s string) []string {
	var fields []string
	start := -1
	for i := 0; i < len(s); i++ {
		if s[i] == ' ' || s[i] == '\t' {
			if start >= 0 {
				fields = append(fields, s[start:i])
				start = -1
			}
		} else {
			if start < 0 {
				start = i
			}
		}
	}
	if start >= 0 {
		fields = append(fields, s[start:])
	}
	return fields
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 || findSubstring(s, substr) >= 0)
}

func findSubstring(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
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

func startHeartbeat(client *thothos.Client, port int, db *gorm.DB) {
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()

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
			Port:        port,
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
