package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	nodeGrpc "github.com/Technologies-Unlimited/Network-Proxy/internal/grpc"
	pb "github.com/Technologies-Unlimited/Network-Proxy/internal/grpc/pb/node"

	"github.com/google/uuid"
)

// Config holds the node configuration
type Config struct {
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

func main() {
	// Parse command line flags
	name := flag.String("name", "", "Node name (required)")
	grpcPort := flag.Int("grpc-port", 50051, "gRPC port to listen on")
	serverAddr := flag.String("server", "http://localhost:8080", "Central server address")
	companyID := flag.String("company", "default", "Company ID")
	flag.Parse()

	if *name == "" {
		fmt.Println("Error: --name is required")
		flag.Usage()
		os.Exit(1)
	}

	// Get hostname
	hostname, err := os.Hostname()
	if err != nil {
		hostname = "unknown"
	}

	// Get IP address (use localhost for testing)
	ipAddress := "127.0.0.1"

	config := &Config{
		NodeID:     uuid.New().String(),
		NodeName:   *name,
		GRPCPort:   *grpcPort,
		ServerAddr: *serverAddr,
		CompanyID:  *companyID,
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
		Version:    "1.0.0",
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

	go runHeartbeat(ctx, config)

	// Wait for shutdown signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	fmt.Println("\nShutting down...")
	grpcServer.Stop()
	fmt.Println("Node stopped")
}

// registerWithServer registers this node with the central server
func registerWithServer(config *Config, hostname, ipAddress string) (string, error) {
	registration := NodeRegistration{
		Name:        config.NodeName,
		Hostname:    hostname,
		IPAddress:   ipAddress,
		Version:     "1.0.0",
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

// runHeartbeat sends periodic heartbeats to the central server
func runHeartbeat(ctx context.Context, config *Config) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sendHeartbeat(config)
		}
	}
}

// sendHeartbeat sends a heartbeat to the central server
func sendHeartbeat(config *Config) {
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
