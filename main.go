package main

import (
	"context"
	"embed"
	"fmt"
	"html/template"
	"io/fs"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/collector"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/icmp"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/snmp"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/alerting"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/api"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/database"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/metrics"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

//go:embed web/templates/* web/static/*
var webFS embed.FS

func main() {
	// Initialize logger
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})

	// Print banner
	printBanner()

	// Load environment variables (optional)
	_ = godotenv.Load()

	// Initialize database
	db, err := database.Initialize()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize database")
	}

	// Seed default devices
	if err := database.SeedDefaultDevices(db); err != nil {
		log.Error().Err(err).Msg("Failed to seed default devices")
	}

	// Seed default alert rules
	if err := database.SeedDefaultAlertRules(db); err != nil {
		log.Error().Err(err).Msg("Failed to seed default alert rules")
	}

	// Get ports from environment or use defaults
	serverPort := getEnv("SERVER_PORT", "8080")
	metricsPort := getEnv("METRICS_PORT", "9090")

	// Create wait group for goroutines
	var wg sync.WaitGroup

	// Context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize monitoring agent
	metricsRegistry := metrics.NewRegistry()
	icmpCollector := icmp.NewCollector(metricsRegistry, db)
	snmpCollector := snmp.NewCollector(metricsRegistry)
	mainCollector := collector.New(icmpCollector, snmpCollector)

	// Load existing devices into collectors
	database.LoadDevicesIntoCollectors(db, icmpCollector, snmpCollector)

	// Start agent collectors
	wg.Add(1)
	go func() {
		defer wg.Done()
		log.Info().Msg("Starting monitoring agent")
		mainCollector.Start(ctx)
	}()

	// Initialize and start alerting engine
	alertEngine := alerting.NewEngine(db)
	wg.Add(1)
	go func() {
		defer wg.Done()
		log.Info().Msg("Starting alerting engine")
		alertEngine.Start(ctx)
	}()

	// Start Prometheus metrics server
	metricsServer := &http.Server{
		Addr: fmt.Sprintf(":%s", metricsPort),
	}
	http.Handle("/metrics", promhttp.Handler())

	wg.Add(1)
	go func() {
		defer wg.Done()
		log.Info().Msgf("Metrics server starting on port %s", metricsPort)
		if err := metricsServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error().Err(err).Msg("Metrics server error")
		}
	}()

	// Initialize HTTP server
	srv := server.New(db)
	router := gin.Default()

	// Load templates from embedded filesystem
	tmpl := template.Must(template.New("").ParseFS(webFS, "web/templates/*.html"))
	router.SetHTMLTemplate(tmpl)

	// Serve static files from embedded filesystem
	staticFS, err := fs.Sub(webFS, "web/static")
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to load static files")
	}
	router.StaticFS("/static", http.FS(staticFS))

	// Register API routes
	api.RegisterRoutes(router, srv)

	// Create HTTP server
	httpServer := &http.Server{
		Addr:    fmt.Sprintf(":%s", serverPort),
		Handler: router,
	}

	// Start HTTP server
	wg.Add(1)
	go func() {
		defer wg.Done()
		log.Info().Msgf("Server starting on port %s", serverPort)
		log.Info().Msgf("Web UI available at http://localhost:%s", serverPort)
		log.Info().Msgf("Metrics available at http://localhost:%s/metrics", metricsPort)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error().Err(err).Msg("HTTP server error")
		}
	}()

	// Wait for interrupt signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("Shutting down...")

	// Cancel context to stop collectors
	cancel()

	// Graceful shutdown with timeout
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	// Shutdown servers
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("HTTP server shutdown error")
	}

	if err := metricsServer.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("Metrics server shutdown error")
	}

	// Wait for all goroutines to finish
	wg.Wait()

	log.Info().Msg("Application stopped")
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

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
