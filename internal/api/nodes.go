package api

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	pb "github.com/Technologies-Unlimited/Network-Proxy/internal/grpc/pb/node"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// Bandwidth test constants
const (
	OptimalChunkSize  = 4 * 1024 * 1024 // 4MB chunks for maximum throughput
	LatencySampleRate = 100             // Only sample latency every N chunks
	ParallelStreams   = 6               // Number of parallel gRPC streams for bandwidth tests

	// gRPC tuning constants for high-throughput
	GRPCMaxMsgSize      = 8 * 1024 * 1024  // 8MB max message size
	GRPCWriteBufferSize = 8 * 1024 * 1024  // 8MB write buffer
	GRPCReadBufferSize  = 8 * 1024 * 1024  // 8MB read buffer
	GRPCInitWindowSize  = 16 * 1024 * 1024 // 16MB initial window size
	GRPCConnWindowSize  = 16 * 1024 * 1024 // 16MB connection window size
)

// CPUStats holds CPU usage statistics during a test
type CPUStats struct {
	AvgUsage float64
	MaxUsage float64
	MinUsage float64
	Samples  []float64
}

// getCPUUsage returns current CPU usage percentage (Windows-compatible)
func getCPUUsage() float64 {
	if runtime.GOOS == "windows" {
		// Use WMIC to get CPU usage on Windows
		cmd := exec.Command("wmic", "cpu", "get", "loadpercentage")
		output, err := cmd.Output()
		if err != nil {
			return 0
		}
		lines := strings.Split(string(output), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line != "" && line != "LoadPercentage" {
				if val, err := strconv.ParseFloat(line, 64); err == nil {
					return val
				}
			}
		}
	}
	return 0
}

// listNodes returns all nodes
func listNodes(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var nodes []models.Node
		result := srv.DB.Find(&nodes)

		if result.Error != nil {
			c.Data(http.StatusOK, "text/html", []byte(`<p style="color: var(--danger);">Error loading nodes</p>`))
			return
		}

		if len(nodes) == 0 {
			c.Data(http.StatusOK, "text/html", []byte(`
				<div style="text-align: center; padding: 40px; color: var(--text-secondary);">
					<h3>No Nodes Registered</h3>
					<p>Nodes will appear here once they connect to the server</p>
				</div>
			`))
			return
		}

		// Build HTML table
		html := `
		<table style="width: 100%; border-collapse: collapse;">
			<thead>
				<tr style="border-bottom: 2px solid var(--border);">
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">Node Name</th>
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">Hostname</th>
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">IP Address</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">gRPC Port</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Status</th>
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">Last Seen</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Actions</th>
				</tr>
			</thead>
			<tbody>`

		for _, node := range nodes {
			statusColor := "var(--text-secondary)"
			statusText := node.Status
			switch node.Status {
			case "online":
				statusColor = "var(--success)"
			case "offline":
				statusColor = "var(--danger)"
			case "connecting":
				statusColor = "var(--warning)"
			}

			lastSeen := "Never"
			if node.LastSeen != nil {
				lastSeen = node.LastSeen.Format("2006-01-02 15:04")
			}

			grpcPort := fmt.Sprintf("%d", node.GRPCPort)
			if !node.GRPCEnabled {
				grpcPort = "Disabled"
			}

			html += fmt.Sprintf(`
				<tr style="border-bottom: 1px solid var(--border);">
					<td style="padding: 12px; color: var(--text-primary);">%s</td>
					<td style="padding: 12px; color: var(--text-primary);">%s</td>
					<td style="padding: 12px; color: var(--text-primary);">%s</td>
					<td style="padding: 12px; text-align: center; color: var(--text-secondary);">%s</td>
					<td style="padding: 12px; text-align: center;">
						<span style="padding: 4px 12px; background: %s; color: white; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase;">%s</span>
					</td>
					<td style="padding: 12px; color: var(--text-secondary);">%s</td>
					<td style="padding: 12px; text-align: center;">
						<button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; margin-right: 5px;" onclick="viewNode('%s')">View</button>
						<button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; background: var(--danger);" hx-delete="/api/v1/nodes/%s" hx-confirm="Delete this node?" hx-target="#nodes-table" hx-swap="innerHTML">Delete</button>
					</td>
				</tr>`, node.Name, node.Hostname, node.IPAddress, grpcPort, statusColor, statusText, lastSeen, node.ID, node.ID)
		}

		html += `
			</tbody>
		</table>`

		c.Data(http.StatusOK, "text/html", []byte(html))
	}
}

// listNodesJSON returns all nodes as JSON
func listNodesJSON(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var nodes []models.Node
		result := srv.DB.Find(&nodes)

		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error loading nodes"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"nodes": nodes})
	}
}

// registerNode registers a new node or updates an existing one with the same name.
// Node names must be unique - if a node with the same name exists, it will be updated
// instead of creating a duplicate. This allows nodes to reconnect after restarts
// without creating duplicate entries.
func registerNode(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input models.Node

		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate required fields
		if input.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "node name is required"})
			return
		}

		// Set defaults if not provided
		if input.GRPCPort == 0 {
			input.GRPCPort = 50051
		}

		now := time.Now()

		// Try to find existing node by name (node names must be unique)
		var existingNode models.Node
		result := srv.DB.Where("name = ?", input.Name).First(&existingNode)

		if result.Error == nil {
			// Node exists - update it with new connection info
			existingNode.Status = "online"
			existingNode.LastSeen = &now
			existingNode.Hostname = input.Hostname
			existingNode.IPAddress = input.IPAddress
			existingNode.Version = input.Version
			existingNode.GRPCPort = input.GRPCPort
			existingNode.GRPCEnabled = true

			if err := srv.DB.Save(&existingNode).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}

			log.Info().
				Str("nodeId", existingNode.ID).
				Str("name", existingNode.Name).
				Int("grpcPort", existingNode.GRPCPort).
				Msg("Node reconnected - updated existing record")

			c.JSON(http.StatusOK, gin.H{"node": existingNode})
			return
		}

		// Node doesn't exist - create new one
		input.Status = "online"
		input.LastSeen = &now
		input.GRPCEnabled = true

		if err := srv.DB.Create(&input).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		log.Info().
			Str("nodeId", input.ID).
			Str("name", input.Name).
			Int("grpcPort", input.GRPCPort).
			Msg("New node registered")

		c.JSON(http.StatusCreated, gin.H{"node": input})
	}
}

// getNode returns a single node
func getNode(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var node models.Node

		result := srv.DB.Preload("Devices").Preload("SourcePeers").Preload("TargetPeers").First(&node, "id = ?", id)

		if result.Error != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"node": node})
	}
}

// updateNode updates a node
func updateNode(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var node models.Node

		if err := srv.DB.First(&node, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
			return
		}

		var updates map[string]interface{}
		if err := c.ShouldBindJSON(&updates); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if err := srv.DB.Model(&node).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"node": node})
	}
}

// nodeHeartbeat updates node's last seen timestamp
func nodeHeartbeat(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var node models.Node

		if err := srv.DB.First(&node, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
			return
		}

		now := time.Now()
		node.LastSeen = &now
		node.Status = "online"

		if err := srv.DB.Save(&node).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"node": node})
	}
}

// deleteNode deletes a node
func deleteNode(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var node models.Node

		if err := srv.DB.First(&node, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
			return
		}

		// Delete associated peers first
		srv.DB.Where("source_node_id = ? OR target_node_id = ?", id, id).Delete(&models.NodePeer{})

		// Delete associated bandwidth tests
		srv.DB.Where("source_node_id = ? OR target_node_id = ?", id, id).Delete(&models.BandwidthTestResult{})

		if err := srv.DB.Delete(&node).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Node deleted successfully"})
	}
}

// cleanupDuplicateNodes removes duplicate nodes, keeping only the most recently seen one for each name+port combination
func cleanupDuplicateNodes(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Find all unique name+port combinations with duplicates
		type NodeGroup struct {
			Name     string
			GRPCPort int
			Count    int64
		}

		var groups []NodeGroup
		srv.DB.Model(&models.Node{}).
			Select("name, grpc_port, COUNT(*) as count").
			Group("name, grpc_port").
			Having("COUNT(*) > 1").
			Scan(&groups)

		if len(groups) == 0 {
			c.JSON(http.StatusOK, gin.H{"message": "No duplicate nodes found", "deleted": 0})
			return
		}

		totalDeleted := 0

		for _, group := range groups {
			// Get all nodes with this name+port, ordered by last_seen DESC
			var nodes []models.Node
			srv.DB.Where("name = ? AND grpc_port = ?", group.Name, group.GRPCPort).
				Order("last_seen DESC NULLS LAST").
				Find(&nodes)

			if len(nodes) <= 1 {
				continue
			}

			// Keep the first one (most recently seen), delete the rest
			for i := 1; i < len(nodes); i++ {
				nodeID := nodes[i].ID
				// Delete associated peers
				srv.DB.Where("source_node_id = ? OR target_node_id = ?", nodeID, nodeID).Delete(&models.NodePeer{})
				// Delete associated bandwidth tests
				srv.DB.Where("source_node_id = ? OR target_node_id = ?", nodeID, nodeID).Delete(&models.BandwidthTestResult{})
				// Delete the node
				srv.DB.Delete(&nodes[i])
				totalDeleted++
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"message": fmt.Sprintf("Cleaned up %d duplicate nodes", totalDeleted),
			"deleted": totalDeleted,
		})
	}
}

// getNodePeers returns peers for a specific node
func getNodePeers(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var peers []models.NodePeer

		result := srv.DB.Preload("SourceNode").Preload("TargetNode").
			Where("source_node_id = ? OR target_node_id = ?", id, id).
			Find(&peers)

		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error loading peers"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"peers": peers})
	}
}

// ===== Node Peer Management =====

// listNodePeers returns all node peer connections
func listNodePeers(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var peers []models.NodePeer
		result := srv.DB.Preload("SourceNode").Preload("TargetNode").Find(&peers)

		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error loading peers"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"peers": peers})
	}
}

// listNodePeersHTML returns HTML table of peer connections
func listNodePeersHTML(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var peers []models.NodePeer
		result := srv.DB.Preload("SourceNode").Preload("TargetNode").Find(&peers)

		if result.Error != nil {
			c.Data(http.StatusOK, "text/html", []byte(`<p style="color: var(--danger);">Error loading peer connections</p>`))
			return
		}

		if len(peers) == 0 {
			c.Data(http.StatusOK, "text/html", []byte(`
				<div style="text-align: center; padding: 40px; color: var(--text-secondary);">
					<h3>No Peer Connections</h3>
					<p>Link two nodes to create a peer connection for bandwidth testing</p>
				</div>
			`))
			return
		}

		html := `
		<table style="width: 100%; border-collapse: collapse;">
			<thead>
				<tr style="border-bottom: 2px solid var(--border);">
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">Source Node</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);"></th>
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">Target Node</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Status</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Latency</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Actions</th>
				</tr>
			</thead>
			<tbody>`

		for _, peer := range peers {
			statusColor := "var(--text-secondary)"
			statusText := peer.Status
			switch peer.Status {
			case "connected":
				statusColor = "var(--success)"
			case "disconnected":
				statusColor = "var(--danger)"
			case "connecting":
				statusColor = "var(--warning)"
			}

			latency := "N/A"
			if peer.Latency > 0 {
				latency = fmt.Sprintf("%.2f ms", float64(peer.Latency)/1000.0)
			}

			html += fmt.Sprintf(`
				<tr style="border-bottom: 1px solid var(--border);">
					<td style="padding: 12px; color: var(--text-primary);">%s<br><span style="font-size: 11px; color: var(--text-secondary);">%s</span></td>
					<td style="padding: 12px; text-align: center; color: var(--accent); font-size: 20px;">⟷</td>
					<td style="padding: 12px; color: var(--text-primary);">%s<br><span style="font-size: 11px; color: var(--text-secondary);">%s</span></td>
					<td style="padding: 12px; text-align: center;">
						<span style="padding: 4px 12px; background: %s; color: white; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase;">%s</span>
					</td>
					<td style="padding: 12px; text-align: center; color: var(--text-secondary);">%s</td>
					<td style="padding: 12px; text-align: center;">
						<button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; margin-right: 5px;" hx-post="/api/v1/node-peers/%s/refresh" hx-target="#peers-table" hx-swap="innerHTML">Refresh</button>
						<button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; background: var(--danger);" hx-delete="/api/v1/node-peers/%s" hx-confirm="Unlink these nodes?" hx-target="#peers-table" hx-swap="innerHTML">Unlink</button>
					</td>
				</tr>`, peer.SourceNode.Name, peer.SourceNode.IPAddress, peer.TargetNode.Name, peer.TargetNode.IPAddress, statusColor, statusText, latency, peer.ID, peer.ID)
		}

		html += `
			</tbody>
		</table>`

		c.Data(http.StatusOK, "text/html", []byte(html))
	}
}

// createNodePeer creates a new peer connection between two nodes
func createNodePeer(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			SourceNodeID string `json:"source_node_id" binding:"required"`
			TargetNodeID string `json:"target_node_id" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if req.SourceNodeID == req.TargetNodeID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot link a node to itself"})
			return
		}

		// Check if both nodes exist
		var sourceNode, targetNode models.Node
		if err := srv.DB.First(&sourceNode, "id = ?", req.SourceNodeID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Source node not found"})
			return
		}
		if err := srv.DB.First(&targetNode, "id = ?", req.TargetNodeID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Target node not found"})
			return
		}

		// Check if peer connection already exists
		var existingPeer models.NodePeer
		result := srv.DB.Where(
			"(source_node_id = ? AND target_node_id = ?) OR (source_node_id = ? AND target_node_id = ?)",
			req.SourceNodeID, req.TargetNodeID, req.TargetNodeID, req.SourceNodeID,
		).First(&existingPeer)

		if result.Error == nil {
			c.JSON(http.StatusConflict, gin.H{"error": "Peer connection already exists"})
			return
		}

		peer := models.NodePeer{
			SourceNodeID: req.SourceNodeID,
			TargetNodeID: req.TargetNodeID,
			Status:       "disconnected",
		}

		if err := srv.DB.Create(&peer).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"peer": peer})
	}
}

// deleteNodePeer removes a peer connection
func deleteNodePeer(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var peer models.NodePeer

		if err := srv.DB.First(&peer, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Peer connection not found"})
			return
		}

		if err := srv.DB.Delete(&peer).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Return updated peers list HTML for HTMX
		listNodePeersHTML(srv)(c)
	}
}

// refreshNodePeer refreshes the connection status of a peer
func refreshNodePeer(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var peer models.NodePeer

		if err := srv.DB.Preload("SourceNode").Preload("TargetNode").First(&peer, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Peer connection not found"})
			return
		}

		// TODO: Implement actual gRPC ping to check connection status
		// For now, set status based on node statuses
		if peer.SourceNode.Status == "online" && peer.TargetNode.Status == "online" {
			peer.Status = "connected"
			now := time.Now()
			peer.LastPing = &now
			// Simulate latency measurement
			peer.Latency = 1500 // 1.5ms in microseconds
		} else {
			peer.Status = "disconnected"
		}

		if err := srv.DB.Save(&peer).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Return updated peers list HTML for HTMX
		listNodePeersHTML(srv)(c)
	}
}

// ===== Bandwidth Tests =====

// listBandwidthTests returns all bandwidth test results
func listBandwidthTests(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tests []models.BandwidthTestResult
		result := srv.DB.Preload("SourceNode").Preload("TargetNode").
			Order("created_at DESC").
			Limit(50).
			Find(&tests)

		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error loading tests"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"tests": tests})
	}
}

// listBandwidthTestsHTML returns HTML table of bandwidth tests
func listBandwidthTestsHTML(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tests []models.BandwidthTestResult
		result := srv.DB.Preload("SourceNode").Preload("TargetNode").
			Order("created_at DESC").
			Limit(50).
			Find(&tests)

		if result.Error != nil {
			c.Data(http.StatusOK, "text/html", []byte(`<p style="color: var(--danger);">Error loading bandwidth tests</p>`))
			return
		}

		if len(tests) == 0 {
			c.Data(http.StatusOK, "text/html", []byte(`
				<div style="text-align: center; padding: 40px; color: var(--text-secondary);">
					<h3>No Bandwidth Tests</h3>
					<p>Run a bandwidth test between two linked nodes to see results here</p>
				</div>
			`))
			return
		}

		html := `
		<table style="width: 100%; border-collapse: collapse;">
			<thead>
				<tr style="border-bottom: 2px solid var(--border);">
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">Source → Target</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Type</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Upload</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Download</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Latency</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Status</th>
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">Date</th>
				</tr>
			</thead>
			<tbody>`

		for _, test := range tests {
			statusColor := "var(--text-secondary)"
			switch test.Status {
			case "completed":
				statusColor = "var(--success)"
			case "running":
				statusColor = "var(--warning)"
			case "failed", "cancelled":
				statusColor = "var(--danger)"
			}

			upload := "N/A"
			download := "N/A"
			latency := "N/A"

			if test.UploadSpeed > 0 {
				upload = fmt.Sprintf("%.2f Mbps", test.UploadSpeed)
			}
			if test.DownloadSpeed > 0 {
				download = fmt.Sprintf("%.2f Mbps", test.DownloadSpeed)
			}
			if test.AvgLatency > 0 {
				latency = fmt.Sprintf("%.2f ms", float64(test.AvgLatency)/1000.0)
			}

			html += fmt.Sprintf(`
				<tr class="clickable-row" style="border-bottom: 1px solid var(--border); cursor: pointer;" onclick="viewTestDetails('%s')">
					<td style="padding: 12px; color: var(--text-primary);">%s → %s</td>
					<td style="padding: 12px; text-align: center; color: var(--text-secondary);">%s</td>
					<td style="padding: 12px; text-align: center; color: var(--success);">%s</td>
					<td style="padding: 12px; text-align: center; color: var(--accent);">%s</td>
					<td style="padding: 12px; text-align: center; color: var(--text-secondary);">%s</td>
					<td style="padding: 12px; text-align: center;">
						<span style="padding: 4px 12px; background: %s; color: white; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase;">%s</span>
					</td>
					<td style="padding: 12px; color: var(--text-secondary);">%s</td>
				</tr>`, test.ID, test.SourceNode.Name, test.TargetNode.Name, test.TestType, upload, download, latency, statusColor, test.Status, test.CreatedAt.Format("2006-01-02 15:04"))
		}

		html += `
			</tbody>
		</table>`

		c.Data(http.StatusOK, "text/html", []byte(html))
	}
}

// startBandwidthTest starts a new bandwidth test between two nodes
func startBandwidthTest(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			SourceNodeID   string `json:"source_node_id" binding:"required"`
			TargetNodeID   string `json:"target_node_id" binding:"required"`
			TestType       string `json:"test_type"`       // upload, download, bidirectional
			Duration       int    `json:"duration"`        // seconds
			TestMode       string `json:"test_mode"`       // direct, local, gateway
			GatewayAddress string `json:"gateway_address"` // Required when test_mode is "gateway"
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if req.TestType == "" {
			req.TestType = "bidirectional"
		}
		if req.Duration <= 0 {
			req.Duration = 10
		}
		if req.TestMode == "" {
			req.TestMode = "direct"
		}

		// Validate test mode
		validModes := map[string]bool{"direct": true, "local": true, "gateway": true}
		if !validModes[req.TestMode] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid test_mode. Must be 'direct', 'local', or 'gateway'"})
			return
		}

		// Gateway mode requires an address
		if req.TestMode == "gateway" && req.GatewayAddress == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "gateway_address is required when test_mode is 'gateway'"})
			return
		}

		// Check if nodes exist and are online
		var sourceNode, targetNode models.Node
		if err := srv.DB.First(&sourceNode, "id = ?", req.SourceNodeID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Source node not found"})
			return
		}
		if err := srv.DB.First(&targetNode, "id = ?", req.TargetNodeID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Target node not found"})
			return
		}

		// Verify both nodes have gRPC enabled
		if !sourceNode.GRPCEnabled || sourceNode.GRPCPort == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Source node does not have gRPC enabled"})
			return
		}
		if !targetNode.GRPCEnabled || targetNode.GRPCPort == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Target node does not have gRPC enabled"})
			return
		}

		// Create test record with network path info
		test := models.BandwidthTestResult{
			SourceNodeID:   req.SourceNodeID,
			TargetNodeID:   req.TargetNodeID,
			TestType:       req.TestType,
			StartTime:      time.Now(),
			Duration:       int64(req.Duration * 1000),
			Status:         "running",
			TestMode:       req.TestMode,
			GatewayAddress: req.GatewayAddress,
		}

		if err := srv.DB.Create(&test).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Run real gRPC bandwidth test
		go runRealBandwidthTest(srv, &test, &sourceNode, &targetNode, req.Duration)

		c.JSON(http.StatusCreated, gin.H{"test": test})
	}
}

// getBandwidthTest returns a specific bandwidth test result
func getBandwidthTest(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var test models.BandwidthTestResult

		if err := srv.DB.Preload("SourceNode").Preload("TargetNode").First(&test, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Test not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"test": test})
	}
}

// cancelBandwidthTest cancels a running bandwidth test
func cancelBandwidthTest(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var test models.BandwidthTestResult

		if err := srv.DB.First(&test, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Test not found"})
			return
		}

		if test.Status != "running" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Test is not running"})
			return
		}

		test.Status = "cancelled"
		endTime := time.Now()
		test.EndTime = &endTime

		if err := srv.DB.Save(&test).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"test": test})
	}
}

// ===== Scheduled Tests =====

// listScheduledTests returns all scheduled tests
func listScheduledTests(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tests []models.ScheduledTest
		result := srv.DB.Preload("SourceNode").Preload("TargetNode").Find(&tests)

		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error loading scheduled tests"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"scheduled_tests": tests})
	}
}

// listScheduledTestsHTML returns HTML table of scheduled tests
func listScheduledTestsHTML(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tests []models.ScheduledTest
		result := srv.DB.Preload("SourceNode").Preload("TargetNode").Find(&tests)

		if result.Error != nil {
			c.Data(http.StatusOK, "text/html", []byte(`<p style="color: var(--danger);">Error loading scheduled tests</p>`))
			return
		}

		if len(tests) == 0 {
			c.Data(http.StatusOK, "text/html", []byte(`
				<div style="text-align: center; padding: 40px; color: var(--text-secondary);">
					<h3>No Scheduled Tests</h3>
					<p>Create a scheduled test to run bandwidth tests automatically</p>
				</div>
			`))
			return
		}

		html := `
		<table style="width: 100%; border-collapse: collapse;">
			<thead>
				<tr style="border-bottom: 2px solid var(--border);">
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">Name</th>
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">Nodes</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Schedule</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Type</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Enabled</th>
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">Last Run</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Actions</th>
				</tr>
			</thead>
			<tbody>`

		for _, test := range tests {
			enabledText := "No"
			enabledColor := "var(--danger)"
			if test.Enabled {
				enabledText = "Yes"
				enabledColor = "var(--success)"
			}

			lastRun := "Never"
			if test.LastRun != nil {
				lastRun = test.LastRun.Format("2006-01-02 15:04")
			}

			html += fmt.Sprintf(`
				<tr style="border-bottom: 1px solid var(--border);">
					<td style="padding: 12px; color: var(--text-primary);">%s</td>
					<td style="padding: 12px; color: var(--text-primary);">%s → %s</td>
					<td style="padding: 12px; text-align: center; color: var(--text-secondary); font-family: monospace;">%s</td>
					<td style="padding: 12px; text-align: center; color: var(--text-secondary);">%s</td>
					<td style="padding: 12px; text-align: center;">
						<span style="color: %s; font-weight: bold;">%s</span>
					</td>
					<td style="padding: 12px; color: var(--text-secondary);">%s</td>
					<td style="padding: 12px; text-align: center;">
						<button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; margin-right: 5px;" hx-post="/api/v1/scheduled-tests/%s/run-now" hx-target="#scheduled-table" hx-swap="innerHTML">Run Now</button>
						<button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; background: var(--danger);" hx-delete="/api/v1/scheduled-tests/%s" hx-confirm="Delete this schedule?" hx-target="#scheduled-table" hx-swap="innerHTML">Delete</button>
					</td>
				</tr>`, test.Name, test.SourceNode.Name, test.TargetNode.Name, test.CronSchedule, test.TestType, enabledColor, enabledText, lastRun, test.ID, test.ID)
		}

		html += `
			</tbody>
		</table>`

		c.Data(http.StatusOK, "text/html", []byte(html))
	}
}

// createScheduledTest creates a new scheduled test
func createScheduledTest(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var test models.ScheduledTest

		if err := c.ShouldBindJSON(&test); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate nodes exist
		var sourceNode, targetNode models.Node
		if err := srv.DB.First(&sourceNode, "id = ?", test.SourceNodeID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Source node not found"})
			return
		}
		if err := srv.DB.First(&targetNode, "id = ?", test.TargetNodeID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Target node not found"})
			return
		}

		if test.Duration <= 0 {
			test.Duration = 30
		}
		if test.TestType == "" {
			test.TestType = "bidirectional"
		}

		if err := srv.DB.Create(&test).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"scheduled_test": test})
	}
}

// updateScheduledTest updates a scheduled test
func updateScheduledTest(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var test models.ScheduledTest

		if err := srv.DB.First(&test, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Scheduled test not found"})
			return
		}

		var updates map[string]interface{}
		if err := c.ShouldBindJSON(&updates); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if err := srv.DB.Model(&test).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"scheduled_test": test})
	}
}

// deleteScheduledTest deletes a scheduled test
func deleteScheduledTest(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var test models.ScheduledTest

		if err := srv.DB.First(&test, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Scheduled test not found"})
			return
		}

		if err := srv.DB.Delete(&test).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Return updated list HTML
		listScheduledTestsHTML(srv)(c)
	}
}

// runScheduledTestNow runs a scheduled test immediately
func runScheduledTestNow(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var scheduledTest models.ScheduledTest

		if err := srv.DB.First(&scheduledTest, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Scheduled test not found"})
			return
		}

		// Create a new bandwidth test from the schedule
		test := models.BandwidthTestResult{
			SourceNodeID: scheduledTest.SourceNodeID,
			TargetNodeID: scheduledTest.TargetNodeID,
			TestType:     scheduledTest.TestType,
			StartTime:    time.Now(),
			Duration:     int64(scheduledTest.Duration * 1000),
			Status:       "running",
		}

		if err := srv.DB.Create(&test).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Update last run time
		now := time.Now()
		scheduledTest.LastRun = &now
		srv.DB.Save(&scheduledTest)

		// Simulate test completion
		go func() {
			time.Sleep(time.Duration(scheduledTest.Duration) * time.Second)

			endTime := time.Now()
			test.EndTime = &endTime
			test.Status = "completed"
			test.BytesSent = int64(scheduledTest.Duration) * 10 * 1024 * 1024
			test.BytesReceived = int64(scheduledTest.Duration) * 10 * 1024 * 1024
			test.UploadSpeed = 80.0 + float64(time.Now().UnixNano()%40)
			test.DownloadSpeed = 80.0 + float64(time.Now().UnixNano()%40)
			test.AvgLatency = 1500 + time.Now().UnixNano()%1000
			test.MinLatency = 1000
			test.MaxLatency = 3000
			test.PacketLoss = 0.1

			srv.DB.Save(&test)
		}()

		// Return updated scheduled tests HTML
		listScheduledTestsHTML(srv)(c)
	}
}

// ===== Real gRPC Bandwidth Testing =====

// runUploadTest performs upload bandwidth test and returns bytes sent and latencies
// It waits for throughput to stabilize before starting the measurement timer
func runUploadTest(ctx context.Context, bwClient pb.BandwidthServiceClient, testID string, data []byte, duration int) (int64, []int64) {
	var totalBytesSent int64
	var latencies []int64

	stream, err := bwClient.StreamUpload(ctx)
	if err != nil {
		log.Error().Err(err).Msg("Failed to create upload stream")
		return 0, nil
	}

	var sequence int64
	var measurementStarted bool
	var measurementDeadline time.Time
	var measurementBytes int64

	// Track throughput samples for stabilization detection
	const sampleWindowMs = 250 // Check every 250ms
	const stabilityThreshold = 0.10 // 10% variation = stable
	const minSamples = 4 // Need 4 samples (1 second) before considering stable
	const maxWarmupSeconds = 10 // Max warmup time

	var throughputSamples []float64
	lastSampleTime := time.Now()
	lastSampleBytes := int64(0)
	warmupDeadline := time.Now().Add(time.Duration(maxWarmupSeconds) * time.Second)

	// Client-side diagnostic tracking
	var minSendNs, maxSendNs, totalSendNs int64
	minSendNs = int64(^uint64(0) >> 1) // Max int64
	var perSecondBytes []int64
	lastSecondTime := time.Now()
	bytesThisSecond := int64(0)
	startTime := time.Now()

	log.Info().Msg("Upload: Starting warmup phase, waiting for throughput to stabilize...")
	log.Info().Msgf("[CLIENT-UPLOAD-START] ChunkSize=%d KB, Duration=%ds, NumCPU=%d",
		len(data)/1024, duration, runtime.NumCPU())

	for {
		// Check if we've exceeded max warmup time
		if !measurementStarted && time.Now().After(warmupDeadline) {
			log.Info().Msg("Upload: Max warmup time reached, starting measurement")
			measurementStarted = true
			measurementDeadline = time.Now().Add(time.Duration(duration) * time.Second)
			measurementBytes = 0
		}

		// Check if measurement period is complete
		if measurementStarted && time.Now().After(measurementDeadline) {
			break
		}

		// Send data with timing
		sendStart := time.Now().UnixNano()
		err := stream.Send(&pb.DataChunk{
			TestId:      testID,
			Sequence:    sequence,
			Data:        data,
			TimestampNs: sendStart,
			IsFinal:     false,
		})
		sendTime := time.Now().UnixNano() - sendStart

		if err != nil {
			log.Warn().Err(err).Msg("Send error during upload")
			break
		}

		// Track send timing
		totalSendNs += sendTime
		if sendTime < minSendNs {
			minSendNs = sendTime
		}
		if sendTime > maxSendNs {
			maxSendNs = sendTime
		}

		chunkLen := int64(len(data))
		totalBytesSent += chunkLen
		bytesThisSecond += chunkLen
		if measurementStarted {
			measurementBytes += chunkLen
		}
		sequence++

		// Track per-second throughput for diagnostics
		if time.Since(lastSecondTime) >= time.Second {
			perSecondBytes = append(perSecondBytes, bytesThisSecond)
			if len(perSecondBytes) <= 3 {
				mbps := float64(bytesThisSecond*8) / 1000000
				avgSendUs := float64(totalSendNs) / float64(sequence) / 1000
				log.Info().Msgf("[CLIENT-UPLOAD] Second %d: %.2f Mbps, chunks=%d, avgSend=%.2fµs",
					len(perSecondBytes), mbps, sequence, avgSendUs)
			}
			bytesThisSecond = 0
			lastSecondTime = time.Now()
		}

		// Check throughput stability every sampleWindowMs
		if time.Since(lastSampleTime).Milliseconds() >= sampleWindowMs {
			bytesSinceLast := totalBytesSent - lastSampleBytes
			elapsedMs := time.Since(lastSampleTime).Milliseconds()
			currentThroughputMbps := float64(bytesSinceLast*8) / float64(elapsedMs) / 1000

			throughputSamples = append(throughputSamples, currentThroughputMbps)

			// Keep only last minSamples+2 samples
			if len(throughputSamples) > minSamples+2 {
				throughputSamples = throughputSamples[1:]
			}

			// Check if stable (only if not already measuring)
			if !measurementStarted && len(throughputSamples) >= minSamples {
				if isStable(throughputSamples, stabilityThreshold) {
					avgSpeed := average(throughputSamples)
					log.Info().Msgf("Upload: Throughput stabilized at %.2f Mbps, starting %ds measurement", avgSpeed, duration)
					measurementStarted = true
					measurementDeadline = time.Now().Add(time.Duration(duration) * time.Second)
					measurementBytes = 0
				}
			}

			lastSampleTime = time.Now()
			lastSampleBytes = totalBytesSent
		}
	}

	// Add final partial second
	if bytesThisSecond > 0 {
		perSecondBytes = append(perSecondBytes, bytesThisSecond)
	}

	// Log client-side diagnostics
	durationMs := time.Since(startTime).Milliseconds()
	avgSendUs := float64(totalSendNs) / float64(sequence) / 1000
	theoreticalMaxMbps := float64(len(data)) * 8 / avgSendUs

	log.Info().Msgf("[CLIENT-UPLOAD-END] Duration=%dms, TotalBytes=%d, Chunks=%d",
		durationMs, totalBytesSent, sequence)
	log.Info().Msgf("[CLIENT-UPLOAD-SEND] MinSend=%.2fµs, MaxSend=%.2fµs, AvgSend=%.2fµs",
		float64(minSendNs)/1000, float64(maxSendNs)/1000, avgSendUs)
	log.Info().Msgf("[CLIENT-UPLOAD-ANALYSIS] TheoreticalMax=%.2f Mbps (based on client send time)", theoreticalMaxMbps)

	if avgSendUs > 200 {
		log.Warn().Msgf("[CLIENT-UPLOAD-BOTTLENECK] High client send latency (%.2fµs) - gRPC client overhead or network buffer full", avgSendUs)
	}
	if maxSendNs > minSendNs*10 {
		log.Warn().Msgf("[CLIENT-UPLOAD-BOTTLENECK] High send variance (max=%.2fµs vs min=%.2fµs) - possible GC or scheduling",
			float64(maxSendNs)/1000, float64(minSendNs)/1000)
	}

	// Send final chunk
	stream.Send(&pb.DataChunk{
		TestId:      testID,
		Sequence:    sequence,
		TimestampNs: time.Now().UnixNano(),
		IsFinal:     true,
	})

	result, err := stream.CloseAndRecv()
	if err != nil {
		log.Warn().Err(err).Msg("Error closing upload stream")
	} else if result != nil {
		latencies = append(latencies, result.AvgLatencyUs)
		log.Info().Msgf("Upload complete: %d total bytes, %d measured bytes, %.2f Mbps", totalBytesSent, measurementBytes, result.ThroughputMbps)
	}

	// Return measurement bytes (excludes warmup) for accurate speed calculation
	if measurementBytes > 0 {
		return measurementBytes, latencies
	}
	return totalBytesSent, latencies
}

// isStable checks if throughput samples have stabilized (low variance)
func isStable(samples []float64, threshold float64) bool {
	if len(samples) < 2 {
		return false
	}
	avg := average(samples)
	if avg == 0 {
		return false
	}
	for _, s := range samples {
		if abs((s-avg)/avg) > threshold {
			return false
		}
	}
	return true
}

func average(samples []float64) float64 {
	if len(samples) == 0 {
		return 0
	}
	sum := 0.0
	for _, s := range samples {
		sum += s
	}
	return sum / float64(len(samples))
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

// runDownloadTest performs download bandwidth test and returns bytes received and latencies
// It waits for throughput to stabilize before starting the measurement timer
func runDownloadTest(ctx context.Context, bwClient pb.BandwidthServiceClient, testID string, chunkSize int, duration int) (int64, []int64) {
	var totalBytesReceived int64
	var latencies []int64
	var totalChunks int64

	// Request extra time for warmup (max 10s warmup + requested duration)
	totalDuration := duration + 10

	stream, err := bwClient.StreamDownload(ctx, &pb.DownloadRequest{
		TestId:          testID,
		ChunkSize:       int32(chunkSize),
		DurationSeconds: int32(totalDuration),
	})
	if err != nil {
		log.Error().Err(err).Msg("Failed to create download stream")
		return 0, nil
	}

	var measurementStarted bool
	var measurementDeadline time.Time
	var measurementBytes int64

	// Track throughput samples for stabilization detection
	const sampleWindowMs = 250
	const stabilityThreshold = 0.10
	const minSamples = 4
	const maxWarmupSeconds = 10

	var throughputSamples []float64
	lastSampleTime := time.Now()
	lastSampleBytes := int64(0)
	warmupDeadline := time.Now().Add(time.Duration(maxWarmupSeconds) * time.Second)

	// Client-side diagnostic tracking
	var minRecvNs, maxRecvNs, totalRecvNs int64
	minRecvNs = int64(^uint64(0) >> 1) // Max int64
	var perSecondBytes []int64
	lastSecondTime := time.Now()
	bytesThisSecond := int64(0)
	startTime := time.Now()

	log.Info().Msg("Download: Starting warmup phase, waiting for throughput to stabilize...")
	log.Info().Msgf("[CLIENT-DOWNLOAD-START] ChunkSize=%d KB, Duration=%ds, NumCPU=%d",
		chunkSize/1024, duration, runtime.NumCPU())

	for {
		// Check if we've exceeded max warmup time
		if !measurementStarted && time.Now().After(warmupDeadline) {
			log.Info().Msg("Download: Max warmup time reached, starting measurement")
			measurementStarted = true
			measurementDeadline = time.Now().Add(time.Duration(duration) * time.Second)
			measurementBytes = 0
		}

		// Check if measurement period is complete
		if measurementStarted && time.Now().After(measurementDeadline) {
			break
		}

		recvStart := time.Now().UnixNano()
		chunk, err := stream.Recv()
		recvTime := time.Now().UnixNano() - recvStart

		if err == io.EOF {
			break
		}
		if err != nil {
			log.Warn().Err(err).Msg("Receive error during download")
			break
		}

		// Track recv timing
		totalRecvNs += recvTime
		if recvTime < minRecvNs {
			minRecvNs = recvTime
		}
		if recvTime > maxRecvNs {
			maxRecvNs = recvTime
		}

		chunkLen := int64(len(chunk.Data))
		totalBytesReceived += chunkLen
		bytesThisSecond += chunkLen
		totalChunks++
		if measurementStarted {
			measurementBytes += chunkLen
		}

		// Sample latency (every Nth chunk to reduce overhead)
		if chunk.TimestampNs > 0 && totalChunks%100 == 0 {
			latency := (time.Now().UnixNano() - chunk.TimestampNs) / 1000
			latencies = append(latencies, latency)
		}

		if chunk.IsFinal {
			break
		}

		// Track per-second throughput for diagnostics
		if time.Since(lastSecondTime) >= time.Second {
			perSecondBytes = append(perSecondBytes, bytesThisSecond)
			if len(perSecondBytes) <= 3 {
				mbps := float64(bytesThisSecond*8) / 1000000
				avgRecvUs := float64(totalRecvNs) / float64(totalChunks) / 1000
				log.Info().Msgf("[CLIENT-DOWNLOAD] Second %d: %.2f Mbps, chunks=%d, avgRecv=%.2fµs",
					len(perSecondBytes), mbps, totalChunks, avgRecvUs)
			}
			bytesThisSecond = 0
			lastSecondTime = time.Now()
		}

		// Check throughput stability every sampleWindowMs
		if time.Since(lastSampleTime).Milliseconds() >= sampleWindowMs {
			bytesSinceLast := totalBytesReceived - lastSampleBytes
			elapsedMs := time.Since(lastSampleTime).Milliseconds()
			currentThroughputMbps := float64(bytesSinceLast*8) / float64(elapsedMs) / 1000

			throughputSamples = append(throughputSamples, currentThroughputMbps)

			if len(throughputSamples) > minSamples+2 {
				throughputSamples = throughputSamples[1:]
			}

			if !measurementStarted && len(throughputSamples) >= minSamples {
				if isStable(throughputSamples, stabilityThreshold) {
					avgSpeed := average(throughputSamples)
					log.Info().Msgf("Download: Throughput stabilized at %.2f Mbps, starting %ds measurement", avgSpeed, duration)
					measurementStarted = true
					measurementDeadline = time.Now().Add(time.Duration(duration) * time.Second)
					measurementBytes = 0
				}
			}

			lastSampleTime = time.Now()
			lastSampleBytes = totalBytesReceived
		}
	}

	// Add final partial second
	if bytesThisSecond > 0 {
		perSecondBytes = append(perSecondBytes, bytesThisSecond)
	}

	// Log client-side diagnostics
	durationMs := time.Since(startTime).Milliseconds()
	avgRecvUs := float64(totalRecvNs) / float64(totalChunks) / 1000
	theoreticalMaxMbps := float64(chunkSize) * 8 / avgRecvUs

	log.Info().Msgf("[CLIENT-DOWNLOAD-END] Duration=%dms, TotalBytes=%d, Chunks=%d",
		durationMs, totalBytesReceived, totalChunks)
	log.Info().Msgf("[CLIENT-DOWNLOAD-RECV] MinRecv=%.2fµs, MaxRecv=%.2fµs, AvgRecv=%.2fµs",
		float64(minRecvNs)/1000, float64(maxRecvNs)/1000, avgRecvUs)
	log.Info().Msgf("[CLIENT-DOWNLOAD-ANALYSIS] TheoreticalMax=%.2f Mbps (based on client recv time)", theoreticalMaxMbps)

	if avgRecvUs > 200 {
		log.Warn().Msgf("[CLIENT-DOWNLOAD-BOTTLENECK] High client recv latency (%.2fµs) - gRPC client overhead or slow processing", avgRecvUs)
	}
	if maxRecvNs > minRecvNs*10 {
		log.Warn().Msgf("[CLIENT-DOWNLOAD-BOTTLENECK] High recv variance (max=%.2fµs vs min=%.2fµs) - possible GC or scheduling",
			float64(maxRecvNs)/1000, float64(minRecvNs)/1000)
	}

	log.Info().Msgf("Download complete: %d total bytes, %d measured bytes", totalBytesReceived, measurementBytes)

	if measurementBytes > 0 {
		return measurementBytes, latencies
	}
	return totalBytesReceived, latencies
}

// runParallelUploadTest runs multiple upload streams in parallel with separate connections
func runParallelUploadTest(ctx context.Context, bwClient pb.BandwidthServiceClient, testID string, data []byte, duration int, numStreams int) (int64, []int64) {
	// Get target address from context or use the existing client for first stream
	return runParallelUploadTestWithAddr(ctx, "", bwClient, testID, data, duration, numStreams)
}

// runParallelUploadTestWithAddr runs multiple upload streams with separate gRPC connections
func runParallelUploadTestWithAddr(ctx context.Context, targetAddr string, bwClient pb.BandwidthServiceClient, testID string, data []byte, duration int, numStreams int) (int64, []int64) {
	log.Info().Msgf("[PARALLEL-UPLOAD] Starting %d parallel connections, ChunkSize=%d KB", numStreams, len(data)/1024)

	var wg sync.WaitGroup
	var mu sync.Mutex
	var totalBytes int64
	var allLatencies []int64

	for i := 0; i < numStreams; i++ {
		wg.Add(1)
		streamID := i
		go func() {
			defer wg.Done()

			// Each goroutine gets its own gRPC connection for maximum throughput
			var client pb.BandwidthServiceClient
			var conn *grpc.ClientConn
			var err error

			if targetAddr != "" && streamID > 0 {
				// Create a new connection for this stream
				conn, err = grpc.NewClient(targetAddr,
					grpc.WithTransportCredentials(insecure.NewCredentials()),
					grpc.WithDefaultCallOptions(
						grpc.MaxCallRecvMsgSize(GRPCMaxMsgSize),
						grpc.MaxCallSendMsgSize(GRPCMaxMsgSize),
					),
					grpc.WithWriteBufferSize(GRPCWriteBufferSize),
					grpc.WithReadBufferSize(GRPCReadBufferSize),
					grpc.WithInitialWindowSize(int32(GRPCInitWindowSize)),
					grpc.WithInitialConnWindowSize(int32(GRPCConnWindowSize)),
				)
				if err != nil {
					log.Error().Err(err).Msgf("[PARALLEL-UPLOAD] Stream %d failed to connect", streamID)
					return
				}
				defer conn.Close()
				client = pb.NewBandwidthServiceClient(conn)
			} else {
				// Use the provided client for the first stream
				client = bwClient
			}

			stream, err := client.StreamUpload(ctx)
			if err != nil {
				log.Error().Err(err).Msgf("[PARALLEL-UPLOAD] Stream %d failed to create", streamID)
				return
			}

			var localBytes int64
			var localLatencies []int64
			var sequence int64
			deadline := time.Now().Add(time.Duration(duration) * time.Second)

			for time.Now().Before(deadline) {
				sendStart := time.Now().UnixNano()
				err := stream.Send(&pb.DataChunk{
					TestId:      testID,
					Sequence:    sequence,
					Data:        data,
					TimestampNs: sendStart,
					IsFinal:     false,
				})
				sendTime := time.Now().UnixNano() - sendStart

				if err != nil {
					log.Debug().Err(err).Msgf("[PARALLEL-UPLOAD] Stream %d send error", streamID)
					break
				}
				localBytes += int64(len(data))
				sequence++

				// Sample latency every N chunks to reduce overhead
				if sequence%int64(LatencySampleRate) == 0 {
					localLatencies = append(localLatencies, sendTime/1000) // Convert to microseconds
				}
			}

			// Close stream
			stream.CloseAndRecv()

			mu.Lock()
			totalBytes += localBytes
			allLatencies = append(allLatencies, localLatencies...)
			mu.Unlock()

			log.Info().Msgf("[PARALLEL-UPLOAD] Stream %d completed: %d MB sent", streamID, localBytes/1024/1024)
		}()
	}

	wg.Wait()

	durationMs := duration * 1000
	mbps := float64(totalBytes*8) / float64(durationMs) / 1000
	log.Info().Msgf("[PARALLEL-UPLOAD-END] Total=%d bytes, Streams=%d, Throughput=%.2f Mbps",
		totalBytes, numStreams, mbps)

	return totalBytes, allLatencies
}

// runParallelDownloadTest runs multiple download streams in parallel with separate connections
func runParallelDownloadTest(ctx context.Context, bwClient pb.BandwidthServiceClient, testID string, chunkSize int, duration int, numStreams int) (int64, []int64) {
	return runParallelDownloadTestWithAddr(ctx, "", bwClient, testID, chunkSize, duration, numStreams)
}

// runParallelDownloadTestWithAddr runs multiple download streams with separate gRPC connections
func runParallelDownloadTestWithAddr(ctx context.Context, targetAddr string, bwClient pb.BandwidthServiceClient, testID string, chunkSize int, duration int, numStreams int) (int64, []int64) {
	log.Info().Msgf("[PARALLEL-DOWNLOAD] Starting %d parallel connections, ChunkSize=%d KB", numStreams, chunkSize/1024)

	var wg sync.WaitGroup
	var mu sync.Mutex
	var totalBytes int64
	var allLatencies []int64

	for i := 0; i < numStreams; i++ {
		wg.Add(1)
		streamID := i
		go func() {
			defer wg.Done()

			// Each goroutine gets its own gRPC connection for maximum throughput
			var client pb.BandwidthServiceClient
			var conn *grpc.ClientConn
			var err error

			if targetAddr != "" && streamID > 0 {
				// Create a new connection for this stream
				conn, err = grpc.NewClient(targetAddr,
					grpc.WithTransportCredentials(insecure.NewCredentials()),
					grpc.WithDefaultCallOptions(
						grpc.MaxCallRecvMsgSize(GRPCMaxMsgSize),
						grpc.MaxCallSendMsgSize(GRPCMaxMsgSize),
					),
					grpc.WithWriteBufferSize(GRPCWriteBufferSize),
					grpc.WithReadBufferSize(GRPCReadBufferSize),
					grpc.WithInitialWindowSize(int32(GRPCInitWindowSize)),
					grpc.WithInitialConnWindowSize(int32(GRPCConnWindowSize)),
				)
				if err != nil {
					log.Error().Err(err).Msgf("[PARALLEL-DOWNLOAD] Stream %d failed to connect", streamID)
					return
				}
				defer conn.Close()
				client = pb.NewBandwidthServiceClient(conn)
			} else {
				// Use the provided client for the first stream
				client = bwClient
			}

			// Request download stream
			stream, err := client.StreamDownload(ctx, &pb.DownloadRequest{
				TestId:          testID,
				ChunkSize:       int32(chunkSize),
				DurationSeconds: int32(duration),
			})
			if err != nil {
				log.Error().Err(err).Msgf("[PARALLEL-DOWNLOAD] Stream %d failed to create", streamID)
				return
			}

			var localBytes int64
			var localLatencies []int64
			var chunkCount int64

			for {
				recvStart := time.Now().UnixNano()
				chunk, err := stream.Recv()
				recvTime := time.Now().UnixNano() - recvStart

				if err != nil {
					if err.Error() != "EOF" {
						log.Debug().Err(err).Msgf("[PARALLEL-DOWNLOAD] Stream %d recv error", streamID)
					}
					break
				}
				localBytes += int64(len(chunk.Data))
				chunkCount++

				// Sample latency every N chunks to reduce overhead
				if chunkCount%int64(LatencySampleRate) == 0 {
					localLatencies = append(localLatencies, recvTime/1000) // Convert to microseconds
				}
			}

			mu.Lock()
			totalBytes += localBytes
			allLatencies = append(allLatencies, localLatencies...)
			mu.Unlock()

			log.Info().Msgf("[PARALLEL-DOWNLOAD] Stream %d completed: %d MB received", streamID, localBytes/1024/1024)
		}()
	}

	wg.Wait()

	durationMs := duration * 1000
	mbps := float64(totalBytes*8) / float64(durationMs) / 1000
	log.Info().Msgf("[PARALLEL-DOWNLOAD-END] Total=%d bytes, Streams=%d, Throughput=%.2f Mbps",
		totalBytes, numStreams, mbps)

	return totalBytes, allLatencies
}

// runRealBandwidthTest performs actual gRPC bandwidth test between two nodes
func runRealBandwidthTest(srv *server.Server, test *models.BandwidthTestResult, sourceNode, targetNode *models.Node, duration int) {
	log.Info().Msgf("Starting real bandwidth test %s: %s -> %s (mode: %s)", test.ID, sourceNode.Name, targetNode.Name, test.TestMode)

	// Get IP addresses - use localhost if not set
	sourceIP := sourceNode.IPAddress
	if sourceIP == "" {
		sourceIP = "127.0.0.1"
	}
	targetIP := targetNode.IPAddress
	if targetIP == "" {
		targetIP = "127.0.0.1"
	}

	// Determine target address based on test mode
	var targetAddr string
	switch test.TestMode {
	case "local":
		// Force traffic through localhost/loopback
		// This tests local system performance without hitting the network
		targetAddr = fmt.Sprintf("127.0.0.1:%d", targetNode.GRPCPort)
		log.Info().Msgf("LOCAL mode: forcing traffic through loopback to %s", targetAddr)
	case "gateway":
		// Route traffic through a specific gateway address
		// This tests the network path through the gateway
		targetAddr = test.GatewayAddress
		log.Info().Msgf("GATEWAY mode: routing traffic through gateway %s", targetAddr)
	default: // "direct"
		// Direct peer-to-peer connection (default behavior)
		targetAddr = fmt.Sprintf("%s:%d", targetIP, targetNode.GRPCPort)
		log.Info().Msgf("DIRECT mode: connecting directly to %s", targetAddr)
	}

	// Store the actual target address used
	test.ActualTargetAddress = targetAddr
	srv.DB.Save(test)

	log.Info().Msgf("Connecting to target node at %s", targetAddr)

	// For bidirectional tests: warmup (up to 10s) + upload duration + warmup (up to 10s) + download duration + buffer
	// So total timeout = 2*duration + 30s warmup + 30s buffer = 2*duration + 60
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(duration*2+60)*time.Second)
	defer cancel()

	// Connect with high-throughput options
	conn, err := grpc.NewClient(targetAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithDefaultCallOptions(
			grpc.MaxCallRecvMsgSize(GRPCMaxMsgSize),
			grpc.MaxCallSendMsgSize(GRPCMaxMsgSize),
		),
		grpc.WithWriteBufferSize(GRPCWriteBufferSize),
		grpc.WithReadBufferSize(GRPCReadBufferSize),
		grpc.WithInitialWindowSize(int32(GRPCInitWindowSize)),
		grpc.WithInitialConnWindowSize(int32(GRPCConnWindowSize)),
	)
	if err != nil {
		log.Error().Err(err).Msg("Failed to connect to target node")
		test.Status = "failed"
		test.ErrorMessage = fmt.Sprintf("Failed to connect to target: %v", err)
		srv.DB.Save(test)
		return
	}
	defer conn.Close()

	bwClient := pb.NewBandwidthServiceClient(conn)

	// Determine test type
	var testType pb.TestType
	switch test.TestType {
	case "upload":
		testType = pb.TestType_TEST_TYPE_UPLOAD
	case "download":
		testType = pb.TestType_TEST_TYPE_DOWNLOAD
	default:
		testType = pb.TestType_TEST_TYPE_BIDIRECTIONAL
	}

	// Start CPU monitoring in background
	var cpuSamples []float64
	var cpuMutex sync.Mutex
	cpuDone := make(chan struct{})
	go func() {
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-cpuDone:
				return
			case <-ticker.C:
				usage := getCPUUsage()
				cpuMutex.Lock()
				cpuSamples = append(cpuSamples, usage)
				cpuMutex.Unlock()
			}
		}
	}()

	// Start the test on the target - use optimal chunk size
	chunkSize := OptimalChunkSize
	startResp, err := bwClient.StartTest(ctx, &pb.StartTestRequest{
		TestId:          test.ID,
		SourceNodeId:    sourceNode.ID,
		TargetNodeId:    targetNode.ID,
		TestType:        testType,
		DurationSeconds: int32(duration),
		ChunkSize:       int32(chunkSize),
	})
	if err != nil {
		log.Error().Err(err).Msg("Failed to start test on target")
		test.Status = "failed"
		test.ErrorMessage = fmt.Sprintf("Failed to start test: %v", err)
		close(cpuDone)
		srv.DB.Save(test)
		return
	}
	log.Info().Msgf("Test started on target: %s (chunk size: %d KB)", startResp.Message, chunkSize/1024)

	// Run the actual bandwidth test based on type
	var totalBytesSent, totalBytesReceived int64
	var latencies []int64

	data := make([]byte, chunkSize)
	rand.Read(data) // Fill with random data

	switch testType {
	case pb.TestType_TEST_TYPE_UPLOAD:
		// Parallel upload with separate connections
		totalBytesSent, latencies = runParallelUploadTestWithAddr(ctx, targetAddr, bwClient, test.ID, data, duration, ParallelStreams)

	case pb.TestType_TEST_TYPE_DOWNLOAD:
		// Parallel download with separate connections
		totalBytesReceived, latencies = runParallelDownloadTestWithAddr(ctx, targetAddr, bwClient, test.ID, chunkSize, duration, ParallelStreams)

	case pb.TestType_TEST_TYPE_BIDIRECTIONAL:
		// Run parallel upload first, then parallel download (each with separate connections)
		log.Info().Msgf("Starting upload phase with %d parallel connections...", ParallelStreams)
		totalBytesSent, latencies = runParallelUploadTestWithAddr(ctx, targetAddr, bwClient, test.ID, data, duration, ParallelStreams)

		log.Info().Msgf("Starting download phase with %d parallel connections...", ParallelStreams)
		var downloadLatencies []int64
		totalBytesReceived, downloadLatencies = runParallelDownloadTestWithAddr(ctx, targetAddr, bwClient, test.ID, chunkSize, duration, ParallelStreams)
		latencies = append(latencies, downloadLatencies...)
	}

	// Stop CPU monitoring
	close(cpuDone)

	// Calculate CPU stats
	cpuMutex.Lock()
	cpuStats := calculateCPUStats(cpuSamples)
	cpuMutex.Unlock()

	// Calculate results
	endTime := time.Now()
	// Use the requested measurement duration for speed calculation (not total time including warmup)
	measurementDurationMs := int64(duration * 1000)

	test.EndTime = &endTime
	test.BytesSent = totalBytesSent
	test.BytesReceived = totalBytesReceived
	test.Status = "completed"

	// Calculate speeds in Mbps (bits per second / 1,000,000)
	if measurementDurationMs > 0 {
		test.UploadSpeed = float64(totalBytesSent*8) / float64(measurementDurationMs) / 1000
		test.DownloadSpeed = float64(totalBytesReceived*8) / float64(measurementDurationMs) / 1000
	}

	// Calculate latency stats and save samples for charting
	if len(latencies) > 0 {
		var sum, min, max int64
		min = latencies[0]
		for _, l := range latencies {
			sum += l
			if l < min {
				min = l
			}
			if l > max {
				max = l
			}
		}
		test.AvgLatency = sum / int64(len(latencies))
		test.MinLatency = min
		test.MaxLatency = max

		// Save latency samples for charting (limit to ~100 samples for reasonable chart display)
		sampledLatencies := latencies
		if len(latencies) > 100 {
			// Downsample to 100 points by taking every Nth sample
			step := len(latencies) / 100
			sampledLatencies = make([]int64, 0, 100)
			for i := 0; i < len(latencies); i += step {
				sampledLatencies = append(sampledLatencies, latencies[i])
			}
		}
		if latencySamplesJSON, err := json.Marshal(sampledLatencies); err == nil {
			test.LatencySamples = string(latencySamplesJSON)
		}
	}

	srv.DB.Save(test)

	// Log results with CPU stats
	log.Info().Msgf("Bandwidth test %s completed: upload=%.2f Mbps, download=%.2f Mbps",
		test.ID, test.UploadSpeed, test.DownloadSpeed)
	log.Info().Msgf("CPU usage during test: avg=%.1f%%, min=%.1f%%, max=%.1f%% (%d samples)",
		cpuStats.AvgUsage, cpuStats.MinUsage, cpuStats.MaxUsage, len(cpuStats.Samples))

	// Determine if CPU was likely a bottleneck
	if cpuStats.AvgUsage > 80 {
		log.Warn().Msgf("HIGH CPU USAGE (%.1f%%) - CPU is likely limiting bandwidth!", cpuStats.AvgUsage)
	} else if cpuStats.AvgUsage > 50 {
		log.Info().Msgf("Moderate CPU usage (%.1f%%) - some CPU headroom available", cpuStats.AvgUsage)
	} else {
		log.Info().Msgf("Low CPU usage (%.1f%%) - CPU is not the bottleneck", cpuStats.AvgUsage)
	}
}

// calculateCPUStats computes average, min, max from CPU samples
func calculateCPUStats(samples []float64) CPUStats {
	if len(samples) == 0 {
		return CPUStats{}
	}

	stats := CPUStats{
		Samples:  samples,
		MinUsage: samples[0],
		MaxUsage: samples[0],
	}

	sum := 0.0
	for _, s := range samples {
		sum += s
		if s < stats.MinUsage {
			stats.MinUsage = s
		}
		if s > stats.MaxUsage {
			stats.MaxUsage = s
		}
	}
	stats.AvgUsage = sum / float64(len(samples))

	return stats
}

// ===== Prometheus Metrics Proxy =====

// queryMetrics proxies queries to Prometheus
func queryMetrics(_ *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get Prometheus URL from environment or use default
		prometheusURL := os.Getenv("PROMETHEUS_URL")
		if prometheusURL == "" {
			prometheusURL = "http://localhost:9090"
		}

		// Get query parameters
		query := c.Query("query")
		if query == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "query parameter is required"})
			return
		}

		// Build Prometheus query URL
		queryType := c.DefaultQuery("type", "query") // "query" for instant, "query_range" for range
		var promURL string

		switch queryType {
		case "query_range":
			start := c.Query("start")
			end := c.Query("end")
			step := c.DefaultQuery("step", "15s")

			if start == "" || end == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "start and end parameters required for range queries"})
				return
			}

			promURL = fmt.Sprintf("%s/api/v1/query_range?query=%s&start=%s&end=%s&step=%s",
				prometheusURL,
				url.QueryEscape(query),
				url.QueryEscape(start),
				url.QueryEscape(end),
				url.QueryEscape(step),
			)
		default:
			// Instant query
			timeParam := c.Query("time")
			if timeParam != "" {
				promURL = fmt.Sprintf("%s/api/v1/query?query=%s&time=%s",
					prometheusURL,
					url.QueryEscape(query),
					url.QueryEscape(timeParam),
				)
			} else {
				promURL = fmt.Sprintf("%s/api/v1/query?query=%s",
					prometheusURL,
					url.QueryEscape(query),
				)
			}
		}

		// Create HTTP client with timeout
		client := &http.Client{Timeout: 30 * time.Second}

		// Make request to Prometheus
		resp, err := client.Get(promURL)
		if err != nil {
			log.Error().Err(err).Str("url", promURL).Msg("Failed to query Prometheus")
			c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("failed to connect to Prometheus: %v", err)})
			return
		}
		defer resp.Body.Close()

		// Read response body
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			log.Error().Err(err).Msg("Failed to read Prometheus response")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read Prometheus response"})
			return
		}

		// Parse and forward the response
		var promResponse map[string]interface{}
		if err := json.Unmarshal(body, &promResponse); err != nil {
			log.Error().Err(err).Msg("Failed to parse Prometheus response")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse Prometheus response"})
			return
		}

		// Return the Prometheus response
		c.JSON(resp.StatusCode, promResponse)
	}
}
