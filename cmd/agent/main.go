package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/collector"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/icmp"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/snmp"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/database"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/metrics"
	"github.com/joho/godotenv"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
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

	// Initialize metrics
	metricsRegistry := metrics.NewRegistry()

	// Initialize collectors
	icmpCollector := icmp.NewCollector(metricsRegistry, db)
	snmpCollector := snmp.NewCollector(metricsRegistry)

	// Initialize main collector
	mainCollector := collector.New(icmpCollector, snmpCollector)

	// Start collectors
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go mainCollector.Start(ctx)

	// Set up Prometheus metrics endpoint
	http.Handle("/metrics", promhttp.Handler())

	// Get metrics port from environment or use default
	metricsPort := os.Getenv("METRICS_PORT")
	if metricsPort == "" {
		metricsPort = "9090"
	}

	// Start metrics server in goroutine
	server := &http.Server{
		Addr: fmt.Sprintf(":%s", metricsPort),
	}

	go func() {
		log.Info().Msgf("Agent metrics server starting on port %s", metricsPort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("Failed to start metrics server")
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("Shutting down agent...")

	// Graceful shutdown
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Fatal().Err(err).Msg("Agent forced to shutdown")
	}

	log.Info().Msg("Agent exited")
}
