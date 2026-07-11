package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"sync"
	"syscall"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/collector"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/icmp"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/snmp"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/alerting"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/api"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/database"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/envcfg"
	nodeGrpc "github.com/Technologies-Unlimited/Network-Proxy/internal/grpc"
	pb "github.com/Technologies-Unlimited/Network-Proxy/internal/grpc/pb/node"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/metrics"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/netutil"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/safego"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/thothos"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/updater"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
	"gorm.io/gorm"
)

// Build-time variables (set via -ldflags)
var (
	version    = "1.1.2"
	commitSHA  = "dev"
	buildTime  = "unknown"
)

// Server constants. The ThothOS heartbeat interval lives with the session
// lifecycle in internal/api (defaultHeartbeatInterval).
const (
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
	// Hostname/IPAddress are captured at boot so a heartbeat that 404s (the
	// server swept or lost the node) can re-register with the same identity
	// instead of leaving the live node orphaned forever.
	Hostname  string
	IPAddress string
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
	// Initialize logger with both console and file output. The log file is
	// owner-only (0600) — it can contain enough operational detail to be
	// sensitive on shared hosts.
	logFile, err := os.OpenFile("network-monitor.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
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

			// Register this proxy with ThothOS and start the heartbeat +
			// config-pull/apply session under a cancelable context. This is the
			// same routine the login and settings-connect flows call, so all
			// three entry points bring the proxy fully online (register -> apply
			// config -> heartbeat + periodic re-apply) rather than only the boot
			// path. Config now flows via the pull-apply loop, not a webhook push.
			proxyConfig, err := api.StartThothOSSession(api.ThothOSSessionConfig{
				Client:      thothosClient,
				DB:          db,
				ProxyName:   proxyName,
				Description: fmt.Sprintf("Network Monitor Proxy v%s", version),
				IPAddress:   netutil.OutboundIP(),
				Port:        serverPort,
				Version:     version,
			})
			if err != nil {
				log.Error().Err(err).Msg("Failed to register proxy with ThothOS")
			} else {
				log.Info().
					Str("proxyId", proxyConfig.ID).
					Str("proxyName", proxyConfig.ProxyName).
					Msg("Proxy registered with ThothOS")
			}
		}
	} else {
		log.Warn().Msg("ThothOS not configured - running in standalone mode")
		log.Warn().Msgf("Configure ThothOS at http://localhost:%d/settings to enable integration", serverPort)
		middleware.SetStandaloneMode(true)
	}

	// Set up Gin router. gin.Default() bundles Logger + Recovery; the
	// Recovery middleware turns a panicked handler into a 500 instead of
	// killing the whole process.
	router := gin.Default()

	// Request-ID first so every subsequent middleware/handler log line can
	// include it. Body limit second so size validation runs before any
	// handler reads the body. CORS last because it may short-circuit on
	// preflight.
	router.Use(middleware.RequestID())
	router.Use(middleware.BodyLimit(middleware.MaxBodyBytes))
	router.Use(middleware.SameOriginOnly())

	// Log risky configuration loudly so an operator inspecting the boot
	// log can see which posture they shipped with.
	if envcfg.Bool("UPDATER_ALLOW_UNVERIFIED") {
		log.Warn().Msg("UPDATER_ALLOW_UNVERIFIED=true: self-updates will skip checksum verification")
	}
	if v := os.Getenv("CORS_ALLOWED_ORIGINS"); v != "" {
		log.Info().Str("allowed", v).Msg("CORS: cross-origin allowlist configured")
	}

	// Load HTML templates
	router.LoadHTMLGlob("web/templates/*.html")

	// Serve static files
	router.Static("/static", "web/static")

	// Initialize updater
	api.InitUpdater(version, commitSHA)

	// Record build provenance so an operator reading the logs can tell exactly
	// which build is running (version + commit + build time set via -ldflags).
	log.Info().
		Str("version", version).
		Str("commit", commitSHA).
		Str("buildTime", buildTime).
		Msg("Network Monitor server build info")

	// Warn loudly if no encryption key is configured for at-rest secrets —
	// the field-level cipher falls back to plaintext to keep first-run
	// installs working, but operators should set NETWORK_MONITOR_SECRET_KEY.
	if !models.CryptoKeyConfigured() {
		log.Warn().Msgf(
			"%s is not set; ProxyConfig API key and SNMP credentials will be stored UNENCRYPTED",
			models.NETWORK_MONITOR_SECRET_KEY_ENV)
	}

	// Build the metrics registry, then the per-protocol collectors, then a
	// supervisor that runs both. Without this, the alert engine has no real
	// data to evaluate against and Prometheus /metrics is empty.
	metricsRegistry := metrics.NewRegistry()
	icmpCollector := icmp.NewCollector(metricsRegistry, db)
	snmpCollector := snmp.NewCollector(metricsRegistry)
	collectors := collector.New(icmpCollector, snmpCollector)

	// Publish the collectors to the API package so device create/update/delete
	// and the ThothOS config-apply step act on the LIVE pollers, and load the
	// existing rows so a boot with no restart already polls everything.
	api.SetCollectors(icmpCollector, snmpCollector)
	database.LoadDevicesIntoCollectors(db, icmpCollector, snmpCollector)

	// Publish a metrics querier so the ThothOS session's results reporter can
	// read each device's latest status/latency/loss sample and report it UP to
	// ThothOS (the results-up channel). Wired before any session starts so all
	// three connect paths (boot, login, settings) report results.
	api.SetSampleSource(metrics.NewLocalQuerier(metricsRegistry))

	collectorCtx, cancelCollectors := context.WithCancel(context.Background())
	collectorsDone := make(chan struct{})
	safego.Go("collectors", func() {
		defer close(collectorsDone)
		collectors.Start(collectorCtx)
	})

	// Start alerting engine, backed by the in-process metrics registry.
	alertEngine := alerting.NewEngine(db)
	alertEngine.SetMetricSource(alerting.NewLocalMetricSource(metrics.NewLocalQuerier(metricsRegistry)))
	api.SetAlertEngine(alertEngine)
	alertCtx, cancelAlerts := context.WithCancel(context.Background())
	alertsDone := make(chan struct{})
	safego.Go("alert-engine", func() {
		defer close(alertsDone)
		alertEngine.Start(alertCtx)
	})

	// Healthz / readyz: split per the k8s convention. Liveness is always
	// 200 once the process is up; readiness flips to 200 once collectors
	// and the listener are running, and back to 503 during shutdown.
	ready := &readinessGate{}
	router.GET("/healthz", func(c *gin.Context) { c.String(http.StatusOK, "ok") })
	router.GET("/readyz", func(c *gin.Context) {
		if ready.Ready() {
			c.String(http.StatusOK, "ready")
			return
		}
		c.String(http.StatusServiceUnavailable, "not ready")
	})

	// Prometheus scrape endpoint. By default it requires auth (so device
	// inventory isn't world-readable); operators that front it with their
	// own auth proxy can opt out via METRICS_PUBLIC=true.
	if envcfg.Bool("METRICS_PUBLIC") {
		log.Warn().Msg("METRICS_PUBLIC=true: /metrics is exposed without auth")
		router.GET("/metrics", gin.WrapH(promhttp.Handler()))
	} else {
		// Mount under the auth-gated v1 group via the api package's hook.
		api.SetMetricsHandler(promhttp.Handler())
	}

	// Register API routes
	api.RegisterRoutes(router, srv)

	// Start node status monitor goroutine
	nodeMonCtx, cancelNodeMon := context.WithCancel(context.Background())
	safego.Go("node-status-monitor", func() {
		startNodeStatusMonitorCtx(nodeMonCtx, db)
	})

	// Try to bind to the port, killing any existing process if needed.
	addr := fmt.Sprintf(":%d", serverPort)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		log.Warn().Msgf("Port %d is in use, attempting to kill existing process...", serverPort)
		if killErr := killProcessOnPort(serverPort); killErr != nil {
			log.Error().Err(killErr).Msgf("Failed to kill process on port %d", serverPort)
		} else {
			time.Sleep(2 * time.Second)
			listener, err = net.Listen("tcp", addr)
			if err != nil {
				log.Fatal().Err(err).Msgf("Failed to bind to port %d even after killing existing process", serverPort)
			}
			log.Info().Msgf("Successfully claimed port %d after killing previous process", serverPort)
		}
	}

	// HTTP server with explicit timeouts. The previous default-zero values
	// left the server slowloris-vulnerable: a handful of slow-header
	// connections could pin every goroutine indefinitely.
	httpServer := &http.Server{
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20, // 1 MiB
	}

	// Start serving. A non-EOF error from Serve is reported through the
	// `serveErr` channel so the main goroutine can fold it into the
	// shutdown sequence — log.Fatal here would have skipped every defer
	// (collectors, DB close, log file) and corrupted state.
	serveErr := make(chan error, 1)
	safego.Go("http-serve", func() {
		log.Info().Msgf("Server starting on port %d", serverPort)
		log.Info().Msgf("Web UI available at http://localhost:%d", serverPort)
		if err := httpServer.Serve(listener); err != nil && err != http.ErrServerClosed {
			serveErr <- err
		}
	})

	// Signal the parent updater (if any) that we're up and bound.
	if execPath, err := os.Executable(); err == nil {
		if signalErr := updater.SignalReady(filepath.Dir(execPath)); signalErr != nil {
			log.Debug().Err(signalErr).Msg("Could not write update ready marker")
		}
	}

	// Mark ready *after* listener is bound, so /readyz returns 503 during
	// the brief window between process start and listener-bound.
	ready.SetReady(true)

	// Auto-launch browser only once the listener actually accepts a TCP
	// connection. A fixed 500ms sleep raced ports and produced
	// "connection refused" on slow boxes.
	safego.Go("browser-launcher", func() {
		url := fmt.Sprintf("http://localhost:%d", serverPort)
		if waitForListener(addr, 5*time.Second) {
			openBrowser(url)
		} else {
			log.Debug().Str("url", url).Msg("Browser auto-launch skipped: listener never became ready")
		}
	})

	// Wait for interrupt or for Serve to fail. Either way we run the same
	// cleanup so the process exits with everything closed.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-quit:
		log.Info().Str("signal", sig.String()).Msg("Shutting down server...")
	case err := <-serveErr:
		log.Error().Err(err).Msg("HTTP serve failed; shutting down")
	}

	shutdownStart := time.Now()
	ready.SetReady(false)

	// Stop accepting new HTTP connections; allow in-flight requests up to
	// 10s to finish. Do this BEFORE cancelling background workers so
	// handlers in flight still have a working DB / alert engine.
	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelShutdown()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("HTTP server shutdown reported error")
	}

	// Now stop background workers. Cancel their contexts and give them up
	// to 5s each to drain. Stop the ThothOS heartbeat/config-pull session too
	// so no stray heartbeat fires during shutdown drain.
	api.StopThothOSSession()
	cancelCollectors()
	cancelAlerts()
	cancelNodeMon()
	for _, w := range []struct {
		name string
		done chan struct{}
	}{
		{"collectors", collectorsDone},
		{"alert-engine", alertsDone},
	} {
		select {
		case <-w.done:
		case <-time.After(5 * time.Second):
			log.Warn().Str("worker", w.name).Msg("worker did not finish within 5s")
		}
	}

	// Close the DB last so any worker still running mid-cleanup can finish
	// its in-flight statement before the connection pool tears down.
	if sqlDB, err := db.DB(); err == nil {
		if closeErr := sqlDB.Close(); closeErr != nil {
			log.Error().Err(closeErr).Msg("DB close failed")
		}
	}

	log.Info().Dur("elapsed", time.Since(shutdownStart)).Msg("Server exited cleanly")
}

// readinessGate is a tiny atomic boolean wrapped to satisfy /readyz.
type readinessGate struct {
	mu    sync.Mutex
	ready bool
}

func (g *readinessGate) SetReady(v bool) {
	g.mu.Lock()
	g.ready = v
	g.mu.Unlock()
}

func (g *readinessGate) Ready() bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.ready
}

// waitForListener dials addr until it succeeds or timeout elapses. Used to
// avoid the auto-browser race where the open beat the listener.
func waitForListener(addr string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", addr, 250*time.Millisecond)
		if err == nil {
			conn.Close()
			return true
		}
		time.Sleep(100 * time.Millisecond)
	}
	return false
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

// startNodeStatusMonitorCtx runs the periodic stale-node sweep until ctx
// is cancelled. The previous version had no exit condition, so on shutdown
// it kept poking the DB after the connection pool was already closing.
func startNodeStatusMonitorCtx(ctx context.Context, db *gorm.DB) {
	ticker := time.NewTicker(nodeStatusCheckInterval)
	defer ticker.Stop()

	log.Info().
		Dur("checkInterval", nodeStatusCheckInterval).
		Dur("offlineTimeout", nodeOfflineTimeout).
		Dur("staleTimeout", nodeStaleTimeout).
		Msg("Node status monitor started")

	for {
		select {
		case <-ctx.Done():
			log.Info().Msg("Node status monitor stopped")
			return
		case <-ticker.C:
		}

		sweepStaleNodes(db, time.Now())
	}
}

// sweepStaleNodes runs one pass of the node status monitor and returns how many
// nodes it deleted and how many it marked offline. It is split out of the tick
// loop so it can be unit-tested.
//
// Race safety: the stale-node DELETE re-asserts `last_seen < staleCutoff` (the
// same predicate the Find used) so a heartbeat that lands between the Find and
// the Delete refreshes last_seen, the row no longer matches, and the live node
// is SPARED (RowsAffected == 0) instead of being deleted out from under a fresh
// heartbeat. Dependent rows (peers, bandwidth results, AND scheduled tests) are
// cascaded ONLY when the node was actually deleted, so a spared node keeps its
// history.
//
// Atomicity: each node's full cascade (node delete + its peers + bandwidth
// results + scheduled tests) runs inside a single db.Transaction, so it is
// all-or-nothing. A crash or error between the node delete and any child delete
// can never commit a partial orphan (node gone with dangling children, or a
// still-live node's history torn out). The race-safe last_seen re-assertion
// lives INSIDE the transaction; if the node lost the race (RowsAffected == 0)
// the transaction commits without touching that node's children. A per-node
// transaction error is logged and skipped so one bad node cannot abort the
// whole sweep.
func sweepStaleNodes(db *gorm.DB, now time.Time) (deleted int, markedOffline int64) {
	offlineCutoff := now.Add(-nodeOfflineTimeout)
	staleCutoff := now.Add(-nodeStaleTimeout)

	// Step 1: Delete stale nodes (not seen for 15+ minutes).
	var staleNodes []models.Node
	db.Where("last_seen < ?", staleCutoff).Find(&staleNodes)

	for _, node := range staleNodes {
		nodeDeleted := false
		err := db.Transaction(func(tx *gorm.DB) error {
			// Re-check the staleness predicate INSIDE the delete: if a heartbeat
			// refreshed last_seen after the Find above, this matches 0 rows and
			// the node survives.
			res := tx.Where("last_seen < ?", staleCutoff).Delete(&models.Node{}, "id = ?", node.ID)
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected == 0 {
				// Saved by a fresh heartbeat in the race window — commit
				// without cascading, so a still-alive node keeps its history.
				return nil
			}
			if err := tx.Where("source_node_id = ? OR target_node_id = ?", node.ID, node.ID).Delete(&models.NodePeer{}).Error; err != nil {
				return err
			}
			if err := tx.Where("source_node_id = ? OR target_node_id = ?", node.ID, node.ID).Delete(&models.BandwidthTestResult{}).Error; err != nil {
				return err
			}
			if err := tx.Where("source_node_id = ? OR target_node_id = ?", node.ID, node.ID).Delete(&models.ScheduledTest{}).Error; err != nil {
				return err
			}
			nodeDeleted = true
			return nil
		})
		if err != nil {
			log.Error().Err(err).Str("nodeId", node.ID).Msg("Failed to delete stale node cascade; skipping")
			continue
		}
		if nodeDeleted {
			deleted++
		}
	}

	if deleted > 0 {
		log.Info().
			Int("count", deleted).
			Msg("Removed stale nodes (no heartbeat for 15+ minutes)")
	}

	// Step 2: Mark nodes offline (not seen for 5+ minutes but less than 15).
	result := db.Model(&models.Node{}).
		Where("status = ? AND last_seen < ? AND last_seen >= ?", "online", offlineCutoff, staleCutoff).
		Update("status", "offline")

	if result.Error != nil {
		log.Error().Err(result.Error).Msg("Failed to update node statuses")
	} else if result.RowsAffected > 0 {
		markedOffline = result.RowsAffected
		log.Info().
			Int64("count", result.RowsAffected).
			Msg("Marked nodes as offline (no heartbeat for 5+ minutes)")
	}

	return deleted, markedOffline
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
		Hostname:   hostname,
		IPAddress:  ipAddress,
	}

	fmt.Printf("Starting node '%s' on gRPC port %d\n", config.NodeName, config.GRPCPort)
	fmt.Printf("Registering with server at %s\n", config.ServerAddr)

	// Register with central server
	nodeID, err := registerWithServer(config, hostname, ipAddress)
	if err != nil {
		fmt.Printf("Warning: Failed to register with server: %v\n", err)
		fmt.Println("Continuing in standalone mode...")
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

	safego.Go("node-heartbeat", func() {
		runNodeHeartbeat(ctx, config)
	})

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
	// Bounded client. The previous http.Post used the default client (zero
	// timeout), so a wedged central server hung node startup forever and
	// blocked SIGTERM-based shutdown.
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Post(url, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to register: %w", err)
	}
	defer func() {
		// Drain so the connection can be reused even on non-2xx.
		_, _ = io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}()

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

// nodeHTTPClient is a single client reused across heartbeats so we don't
// rebuild TLS state on every tick. 10s is comfortably above network RTT
// but tight enough that a wedged server can't pile up goroutines.
var nodeHTTPClient = &http.Client{Timeout: 10 * time.Second}

func sendNodeHeartbeat(config *NodeConfig) {
	url := fmt.Sprintf("%s/api/v1/nodes/%s/heartbeat", config.ServerAddr, config.NodeID)
	resp, err := nodeHTTPClient.Post(url, "application/json", nil)
	if err != nil {
		fmt.Printf("Heartbeat failed: %v\n", err)
		return
	}
	defer func() {
		_, _ = io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}()

	if resp.StatusCode == http.StatusNotFound {
		// The server no longer knows this node (swept after a >15-min
		// partition, or the initial registration never succeeded). Re-register
		// with the same identity instead of 404-ing forever — this is the
		// self-heal the old warn-and-continue loop lacked.
		fmt.Printf("Heartbeat 404: node %s no longer registered — re-registering\n", config.NodeID)
		newID, err := registerWithServer(config, config.Hostname, config.IPAddress)
		if err != nil {
			fmt.Printf("Re-registration failed: %v\n", err)
			return
		}
		config.NodeID = newID
		fmt.Printf("Re-registered successfully with ID: %s\n", newID)
		return
	}

	if resp.StatusCode != http.StatusOK {
		fmt.Printf("Heartbeat returned status %d\n", resp.StatusCode)
	}
}
