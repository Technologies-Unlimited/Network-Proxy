package api

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
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

	nodeGrpc "github.com/Technologies-Unlimited/Network-Proxy/internal/grpc"
	pb "github.com/Technologies-Unlimited/Network-Proxy/internal/grpc/pb/node"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/safego"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
	"gorm.io/gorm"
)

// pingPeerNode opens a one-shot gRPC connection to the target node, sends 3
// Ping RPCs, and returns the average round-trip latency in microseconds. Any
// dial/RPC error is propagated so the caller can surface the peer as
// disconnected. The connection is closed before this function returns.
func pingPeerNode(ctx context.Context, target *models.Node) (int64, error) {
	if target == nil {
		return 0, fmt.Errorf("target node is nil")
	}
	if target.IPAddress == "" || target.GRPCPort == 0 {
		return 0, fmt.Errorf("target node %q has no IP/port", target.Name)
	}

	dialOpts, err := peerDialOptions()
	if err != nil {
		return 0, err
	}

	addr := fmt.Sprintf("%s:%d", target.IPAddress, target.GRPCPort)
	conn, err := grpc.NewClient(addr, dialOpts...)
	if err != nil {
		return 0, fmt.Errorf("dial %s: %w", addr, err)
	}
	defer conn.Close()

	client := pb.NewNodeServiceClient(conn)

	const samples = 3
	var totalUs int64
	var ok int64
	for i := 0; i < samples; i++ {
		callCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		start := time.Now()
		_, err := client.Ping(callCtx, &pb.PingRequest{
			RequesterId: "network-monitor-server",
			Sequence:    int64(i),
		})
		cancel()
		if err != nil {
			continue
		}
		totalUs += time.Since(start).Microseconds()
		ok++
	}
	if ok == 0 {
		return 0, fmt.Errorf("no successful ping samples to %s", addr)
	}
	return totalUs / ok, nil
}

// peerDialOptions returns the auth-aware dial options used by every
// node-to-node bandwidth-test connection. Centralising this means the API
// handlers and the gRPC peer code share a single security posture.
func peerDialOptions() ([]grpc.DialOption, error) {
	cfg := nodeGrpc.LoadSecurityConfigFromEnv()
	authOpts, err := cfg.DialOptions()
	if err != nil {
		return nil, err
	}
	return append([]grpc.DialOption{
		grpc.WithDefaultCallOptions(
			grpc.MaxCallRecvMsgSize(GRPCMaxMsgSize),
			grpc.MaxCallSendMsgSize(GRPCMaxMsgSize),
		),
		grpc.WithWriteBufferSize(GRPCWriteBufferSize),
		grpc.WithReadBufferSize(GRPCReadBufferSize),
		grpc.WithInitialWindowSize(int32(GRPCInitWindowSize)),
		grpc.WithInitialConnWindowSize(int32(GRPCConnWindowSize)),
	}, authOpts...), nil
}

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

// getCPUUsage returns current CPU usage as a percentage (0-100).
// Supports Windows (wmic), Linux (/proc/stat sample), and macOS (top).
//
// Returns 0 only when the platform-specific probe genuinely fails — the
// previous implementation silently returned 0 on every non-Windows host,
// which made the "Low CPU usage" diagnostic line a permanent lie.
func getCPUUsage() float64 {
	switch runtime.GOOS {
	case "windows":
		return cpuUsageWindows()
	case "linux":
		return cpuUsageLinux()
	case "darwin":
		return cpuUsageDarwin()
	}
	return 0
}

func cpuUsageWindows() float64 {
	cmd := exec.Command("wmic", "cpu", "get", "loadpercentage")
	output, err := cmd.Output()
	if err != nil {
		return 0
	}
	for _, line := range strings.Split(string(output), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || line == "LoadPercentage" {
			continue
		}
		if val, err := strconv.ParseFloat(line, 64); err == nil {
			return val
		}
	}
	return 0
}

// cpuUsageLinux samples /proc/stat twice 100ms apart and computes
// 100 * (1 - idle_delta / total_delta). No external dependency required.
func cpuUsageLinux() float64 {
	read := func() (idle, total uint64, ok bool) {
		data, err := os.ReadFile("/proc/stat")
		if err != nil {
			return 0, 0, false
		}
		for _, line := range strings.Split(string(data), "\n") {
			if !strings.HasPrefix(line, "cpu ") {
				continue
			}
			fields := strings.Fields(line)
			for i, f := range fields[1:] {
				v, err := strconv.ParseUint(f, 10, 64)
				if err != nil {
					return 0, 0, false
				}
				total += v
				if i == 3 { // idle is the 4th field
					idle = v
				}
			}
			return idle, total, true
		}
		return 0, 0, false
	}
	idle1, total1, ok := read()
	if !ok {
		return 0
	}
	time.Sleep(100 * time.Millisecond)
	idle2, total2, ok := read()
	if !ok || total2 <= total1 {
		return 0
	}
	idleDelta := float64(idle2 - idle1)
	totalDelta := float64(total2 - total1)
	return 100 * (1 - idleDelta/totalDelta)
}

// cpuUsageDarwin shells to `top -l 1 -n 0` and parses the "CPU usage" line.
func cpuUsageDarwin() float64 {
	cmd := exec.Command("top", "-l", "1", "-n", "0")
	output, err := cmd.Output()
	if err != nil {
		return 0
	}
	for _, line := range strings.Split(string(output), "\n") {
		if !strings.HasPrefix(line, "CPU usage:") {
			continue
		}
		// "CPU usage: 4.76% user, 9.52% sys, 85.71% idle"
		fields := strings.Split(line, ",")
		var user, sys float64
		for _, f := range fields {
			f = strings.TrimSpace(f)
			f = strings.TrimPrefix(f, "CPU usage:")
			f = strings.TrimSpace(f)
			parts := strings.SplitN(f, "%", 2)
			if len(parts) < 2 {
				continue
			}
			val, err := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
			if err != nil {
				continue
			}
			label := strings.TrimSpace(parts[1])
			switch label {
			case "user":
				user = val
			case "sys":
				sys = val
			}
		}
		return user + sys
	}
	return 0
}

// listNodes returns nodes as an HTML table; paginated, company-scoped.
func listNodes(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit, offset := Page(c)
		var nodes []models.Node
		result := scopeByCompany(c, srv.DB).Limit(limit).Offset(offset).Find(&nodes)

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
				</tr>`,
				hesc(node.Name), hesc(node.Hostname), hesc(node.IPAddress),
				hesc(grpcPort), statusColor, hesc(statusText), hesc(lastSeen),
				hesc(node.ID), hesc(node.ID))
		}

		html += `
			</tbody>
		</table>`

		c.Data(http.StatusOK, "text/html", []byte(html))
	}
}

// listNodesJSON returns nodes as JSON. Paginated, company-scoped.
func listNodesJSON(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit, offset := Page(c)
		var nodes []models.Node
		var total int64
		if err := scopeByCompany(c, srv.DB).Model(&models.Node{}).Count(&total).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error loading nodes"})
			return
		}
		if err := scopeByCompany(c, srv.DB).Limit(limit).Offset(offset).Find(&nodes).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error loading nodes"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"nodes": nodes, "total": total, "limit": limit, "offset": offset})
	}
}

// registerNode registers a new node or updates an existing one with the same
// (company, name) identity.
//
// Node identity is (company_id, name), NOT name alone: in integrated mode the
// company is the authenticated tenant, so two different companies may each own
// a "Node-Alpha" without merging into one row. The company stamped on the row
// is ALWAYS the authenticated company (companyIDForWrite) — a client-asserted
// company_id in the body is ignored — so registered nodes are visible to the
// same tenant-scoped reads the dashboard/API run. Re-registration also repairs
// a legacy row that was created before company stamping (empty company_id).
//
// The find-then-upsert runs in a single transaction and is backstopped by a
// partial unique index on live (company_id, name) rows (see the database
// package migration), so a concurrent duplicate registration can never fork
// two live rows for the same identity.
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

		// Stamp the authenticated tenant — never trust the body's company_id.
		companyID := companyIDForWrite(c, input.CompanyID)
		now := time.Now()

		var out models.Node
		created := false
		txErr := srv.DB.Transaction(func(tx *gorm.DB) error {
			node, wasCreated, err := upsertNodeRegistration(tx, &input, companyID, now)
			if err != nil {
				return err
			}
			out = *node
			created = wasCreated
			return nil
		})
		if txErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": txErr.Error()})
			return
		}

		if created {
			log.Info().
				Str("nodeId", out.ID).
				Str("name", out.Name).
				Str("companyId", out.CompanyID).
				Int("grpcPort", out.GRPCPort).
				Msg("New node registered")
			c.JSON(http.StatusCreated, gin.H{"node": out})
			return
		}

		log.Info().
			Str("nodeId", out.ID).
			Str("name", out.Name).
			Str("companyId", out.CompanyID).
			Int("grpcPort", out.GRPCPort).
			Msg("Node reconnected - updated existing record")
		c.JSON(http.StatusOK, gin.H{"node": out})
	}
}

// upsertNodeRegistration finds the node owned by companyID with the given name
// (adopting a legacy empty-company row so its company_id gets repaired) and
// updates it, or creates a fresh row stamped with companyID. It returns the
// resulting node and whether it was newly created. Must run inside a
// transaction so the find-then-write is atomic; the partial unique index is
// the final backstop if two registrations still race past the find.
func upsertNodeRegistration(tx *gorm.DB, input *models.Node, companyID string, now time.Time) (*models.Node, bool, error) {
	applyConnInfo := func(n *models.Node) {
		n.Status = "online"
		n.LastSeen = &now
		n.Hostname = input.Hostname
		n.IPAddress = input.IPAddress
		n.Version = input.Version
		n.GRPCPort = input.GRPCPort
		n.GRPCEnabled = true
		// Re-assert ownership: this repairs a legacy empty company_id and
		// keeps an exact-company match unchanged.
		n.CompanyID = companyID
	}

	// Prefer an exact (company, name) match; fall back to adopting a legacy
	// row with an empty company_id. Order company_id DESC so a non-empty
	// exact match wins over the empty-company repair candidate.
	var existing models.Node
	findErr := tx.Where("name = ? AND (company_id = ? OR company_id = ?)", input.Name, companyID, "").
		Order("company_id DESC").
		First(&existing).Error
	if findErr == nil {
		applyConnInfo(&existing)
		if err := tx.Save(&existing).Error; err != nil {
			return nil, false, err
		}
		return &existing, false, nil
	}
	if !errors.Is(findErr, gorm.ErrRecordNotFound) {
		return nil, false, findErr
	}

	// No existing row — create one stamped with the authed company.
	applyConnInfo(input)
	if err := tx.Create(input).Error; err != nil {
		// A concurrent registration for the same (company, name) may have won
		// between our find and this create, tripping the partial unique index.
		// Re-find that row and update it instead of failing the reconnect.
		var raced models.Node
		if reErr := tx.Where("name = ? AND company_id = ?", input.Name, companyID).First(&raced).Error; reErr == nil {
			applyConnInfo(&raced)
			if err2 := tx.Save(&raced).Error; err2 != nil {
				return nil, false, err2
			}
			return &raced, false, nil
		}
		return nil, false, err
	}
	return input, true, nil
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

// updateNode updates a node.
//
// The body is decoded into a typed allowlist of editable columns with
// DisallowUnknownFields, so a client typo (e.g. a wrong casing/name that is not
// a real column) is rejected with a clean 400 "unknown field" rather than being
// handed to GORM as a raw column name — which previously built invalid SQL,
// returned a 500, and leaked the DB schema in the error body. Pointer fields
// give partial-update semantics: only keys the client actually sent are written
// (so a bool can be set to false), and the column mapping is an explicit,
// hard-coded allowlist — never client-controlled.
func updateNode(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var node models.Node

		if err := srv.DB.First(&node, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
			return
		}

		var payload struct {
			Name              *string `json:"name"`
			Hostname          *string `json:"hostname"`
			IPAddress         *string `json:"ip_address"`
			Version           *string `json:"version"`
			Status            *string `json:"status"`
			GRPCPort          *int    `json:"grpc_port"`
			GRPCEnabled       *bool   `json:"grpc_enabled"`
			SupportsICMP      *bool   `json:"supports_icmp"`
			SupportsSNMP      *bool   `json:"supports_snmp"`
			SupportsDiscovery *bool   `json:"supports_discovery"`
			SupportsBandwidth *bool   `json:"supports_bandwidth"`
		}
		if err := decodeStrictJSON(c, &payload); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		updates := map[string]interface{}{}
		if payload.Name != nil {
			updates["name"] = *payload.Name
		}
		if payload.Hostname != nil {
			updates["hostname"] = *payload.Hostname
		}
		if payload.IPAddress != nil {
			updates["ip_address"] = *payload.IPAddress
		}
		if payload.Version != nil {
			updates["version"] = *payload.Version
		}
		if payload.Status != nil {
			updates["status"] = *payload.Status
		}
		if payload.GRPCPort != nil {
			updates["grpc_port"] = *payload.GRPCPort
		}
		if payload.GRPCEnabled != nil {
			updates["grpc_enabled"] = *payload.GRPCEnabled
		}
		if payload.SupportsICMP != nil {
			updates["supports_icmp"] = *payload.SupportsICMP
		}
		if payload.SupportsSNMP != nil {
			updates["supports_snmp"] = *payload.SupportsSNMP
		}
		if payload.SupportsDiscovery != nil {
			updates["supports_discovery"] = *payload.SupportsDiscovery
		}
		if payload.SupportsBandwidth != nil {
			updates["supports_bandwidth"] = *payload.SupportsBandwidth
		}

		if len(updates) > 0 {
			if err := srv.DB.Model(&node).Updates(updates).Error; err != nil {
				log.Error().Err(err).Str("node_id", id).Msg("updateNode: failed to persist node update")
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update node"})
				return
			}
			// Reload so the response reflects the persisted state, not the
			// pre-update in-memory copy.
			if err := srv.DB.First(&node, "id = ?", id).Error; err != nil {
				log.Error().Err(err).Str("node_id", id).Msg("updateNode: failed to reload node after update")
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load updated node"})
				return
			}
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

		// Delete the node and its children ATOMICALLY, mirroring the background
		// sweepStaleNodes cascade. Previously the three child deletes ran
		// unchecked and outside a transaction, so a failed child delete left
		// orphaned rows (an orphaned scheduled test's run-now can fabricate a
		// result for a deleted endpoint) while the handler still reported
		// "Node deleted successfully". Only report success if the tx commits.
		err := srv.DB.Transaction(func(tx *gorm.DB) error {
			// Peers.
			if err := tx.Where("source_node_id = ? OR target_node_id = ?", id, id).Delete(&models.NodePeer{}).Error; err != nil {
				return err
			}
			// Bandwidth test results.
			if err := tx.Where("source_node_id = ? OR target_node_id = ?", id, id).Delete(&models.BandwidthTestResult{}).Error; err != nil {
				return err
			}
			// Scheduled tests so they don't orphan against a node ID that no
			// longer exists.
			if err := tx.Where("source_node_id = ? OR target_node_id = ?", id, id).Delete(&models.ScheduledTest{}).Error; err != nil {
				return err
			}
			// The node itself.
			return tx.Delete(&node).Error
		})
		if err != nil {
			log.Error().Err(err).Str("nodeId", id).Msg("Failed to delete node cascade")
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
		if err := srv.DB.Model(&models.Node{}).
			Select("name, grpc_port, COUNT(*) as count").
			Group("name, grpc_port").
			Having("COUNT(*) > 1").
			Scan(&groups).Error; err != nil {
			log.Error().Err(err).Msg("cleanupDuplicateNodes: failed to scan duplicate groups")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error scanning for duplicate nodes"})
			return
		}

		if len(groups) == 0 {
			c.JSON(http.StatusOK, gin.H{"message": "No duplicate nodes found", "deleted": 0})
			return
		}

		totalDeleted := 0

		for _, group := range groups {
			// Get all nodes with this name+port, ordered by last_seen DESC
			var nodes []models.Node
			if err := srv.DB.Where("name = ? AND grpc_port = ?", group.Name, group.GRPCPort).
				Order("last_seen DESC NULLS LAST").
				Find(&nodes).Error; err != nil {
				log.Error().Err(err).Str("name", group.Name).Msg("cleanupDuplicateNodes: failed to load duplicate set")
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Error loading duplicate nodes"})
				return
			}

			if len(nodes) <= 1 {
				continue
			}

			// Keep the first one (most recently seen), delete the rest. Each
			// removal cascades ATOMICALLY (same as the sweep and manual delete)
			// so a failed child delete can't orphan schedules/peers/results
			// against the removed duplicate's ID while still counting it deleted.
			for i := 1; i < len(nodes); i++ {
				nodeID := nodes[i].ID
				target := nodes[i]
				err := srv.DB.Transaction(func(tx *gorm.DB) error {
					if err := tx.Where("source_node_id = ? OR target_node_id = ?", nodeID, nodeID).Delete(&models.NodePeer{}).Error; err != nil {
						return err
					}
					if err := tx.Where("source_node_id = ? OR target_node_id = ?", nodeID, nodeID).Delete(&models.BandwidthTestResult{}).Error; err != nil {
						return err
					}
					if err := tx.Where("source_node_id = ? OR target_node_id = ?", nodeID, nodeID).Delete(&models.ScheduledTest{}).Error; err != nil {
						return err
					}
					return tx.Delete(&target).Error
				})
				if err != nil {
					log.Error().Err(err).Str("nodeId", nodeID).Msg("cleanupDuplicateNodes: failed to delete duplicate cascade")
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Error deleting duplicate node", "deleted": totalDeleted})
					return
				}
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

// listNodePeers returns node peer connections; paginated, scoped to nodes
// the caller's company owns.
func listNodePeers(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit, offset := Page(c)
		var peers []models.NodePeer
		var total int64
		if err := scopeByNodeOwnership(c, srv.DB).Model(&models.NodePeer{}).Count(&total).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error loading peers"})
			return
		}
		if err := scopeByNodeOwnership(c, srv.DB).Preload("SourceNode").Preload("TargetNode").
			Limit(limit).Offset(offset).Find(&peers).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error loading peers"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"peers": peers, "total": total, "limit": limit, "offset": offset})
	}
}

// listNodePeersHTML returns HTML table of peer connections; paginated,
// scoped to nodes the caller's company owns.
func listNodePeersHTML(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit, offset := Page(c)
		var peers []models.NodePeer
		result := scopeByNodeOwnership(c, srv.DB).Preload("SourceNode").Preload("TargetNode").
			Limit(limit).Offset(offset).Find(&peers)

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
				</tr>`,
				hesc(peer.SourceNode.Name), hesc(peer.SourceNode.IPAddress),
				hesc(peer.TargetNode.Name), hesc(peer.TargetNode.IPAddress),
				statusColor, hesc(statusText), hesc(latency),
				hesc(peer.ID), hesc(peer.ID))
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

		// Real gRPC ping. Connect to the target node and measure round-trip
		// latency over three samples; the previous implementation hard-coded
		// 1500us regardless of whether the peer was even reachable.
		latencyUs, pingErr := pingPeerNode(c.Request.Context(), &peer.TargetNode)
		if pingErr != nil {
			log.Debug().
				Err(pingErr).
				Str("peer_id", peer.ID).
				Str("target", peer.TargetNode.Name).
				Msg("Peer ping failed")
			peer.Status = "disconnected"
			peer.Latency = 0
		} else {
			now := time.Now()
			peer.Status = "connected"
			peer.LastPing = &now
			peer.Latency = latencyUs
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

// listBandwidthTests returns recent bandwidth test results scoped to nodes
// owned by the caller's company.
func listBandwidthTests(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tests []models.BandwidthTestResult
		result := scopeByNodeOwnership(c, srv.DB).
			Preload("SourceNode").Preload("TargetNode").
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

// listBandwidthTestsHTML returns HTML table of bandwidth tests, scoped.
func listBandwidthTestsHTML(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tests []models.BandwidthTestResult
		result := scopeByNodeOwnership(c, srv.DB).
			Preload("SourceNode").Preload("TargetNode").
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
				</tr>`,
				hesc(test.ID),
				hesc(test.SourceNode.Name), hesc(test.TargetNode.Name),
				hesc(test.TestType), hesc(upload), hesc(download), hesc(latency),
				statusColor, hesc(test.Status), test.CreatedAt.Format("2006-01-02 15:04"))
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

		// Run real gRPC bandwidth test in a panic-recovered goroutine.
		// runRealBandwidthTest does ~200 lines of nested gRPC streams and
		// dereferences plenty of pointers; a single nil-deref used to take
		// the whole process down. safego.Go logs the stack and returns.
		testCopy := test
		srcCopy := sourceNode
		dstCopy := targetNode
		dur := req.Duration
		safego.Go("bandwidth-test:"+test.ID, func() {
			runRealBandwidthTest(srv, &testCopy, &srcCopy, &dstCopy, dur)
		})

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

		// Actually stop the in-flight goroutine. cancelBandwidthRun returns
		// false if the run already completed; we still mark the row
		// "cancelled" so the UI reflects user intent.
		stopped := cancelBandwidthRun(test.ID)

		test.Status = "cancelled"
		endTime := time.Now()
		test.EndTime = &endTime

		if err := srv.DB.Save(&test).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"test": test, "stopped_in_flight": stopped})
	}
}

// ===== Scheduled Tests =====

// listScheduledTests returns scheduled tests scoped to caller's nodes.
func listScheduledTests(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tests []models.ScheduledTest
		result := scopeByNodeOwnership(c, srv.DB).
			Preload("SourceNode").Preload("TargetNode").Find(&tests)

		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error loading scheduled tests"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"scheduled_tests": tests})
	}
}

// listScheduledTestsHTML returns HTML table of scheduled tests, scoped.
func listScheduledTestsHTML(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tests []models.ScheduledTest
		result := scopeByNodeOwnership(c, srv.DB).
			Preload("SourceNode").Preload("TargetNode").Find(&tests)

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
				</tr>`,
				hesc(test.Name), hesc(test.SourceNode.Name), hesc(test.TargetNode.Name),
				hesc(test.CronSchedule), hesc(test.TestType),
				enabledColor, hesc(enabledText), hesc(lastRun),
				hesc(test.ID), hesc(test.ID))
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

		// Typed allowlist + DisallowUnknownFields (see updateNode): an unknown
		// key is a clean 400, never a raw-SQL 500. Keys mirror the model's
		// field names (the create endpoint binds the tag-less model, so its
		// wire vocabulary is the Go field names).
		var payload struct {
			Name         *string `json:"Name"`
			SourceNodeID *string `json:"SourceNodeID"`
			TargetNodeID *string `json:"TargetNodeID"`
			CronSchedule *string `json:"CronSchedule"`
			TestType     *string `json:"TestType"`
			Duration     *int    `json:"Duration"`
			Enabled      *bool   `json:"Enabled"`
		}
		if err := decodeStrictJSON(c, &payload); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		updates := map[string]interface{}{}
		if payload.Name != nil {
			updates["name"] = *payload.Name
		}
		if payload.SourceNodeID != nil {
			updates["source_node_id"] = *payload.SourceNodeID
		}
		if payload.TargetNodeID != nil {
			updates["target_node_id"] = *payload.TargetNodeID
		}
		if payload.CronSchedule != nil {
			updates["cron_schedule"] = *payload.CronSchedule
		}
		if payload.TestType != nil {
			updates["test_type"] = *payload.TestType
		}
		if payload.Duration != nil {
			updates["duration"] = *payload.Duration
		}
		if payload.Enabled != nil {
			updates["enabled"] = *payload.Enabled
		}

		if len(updates) > 0 {
			if err := srv.DB.Model(&test).Updates(updates).Error; err != nil {
				log.Error().Err(err).Str("scheduled_test_id", id).Msg("updateScheduledTest: failed to persist update")
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update scheduled test"})
				return
			}
			if err := srv.DB.First(&test, "id = ?", id).Error; err != nil {
				log.Error().Err(err).Str("scheduled_test_id", id).Msg("updateScheduledTest: failed to reload after update")
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load updated scheduled test"})
				return
			}
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

// runScheduledTestNow runs a scheduled test immediately by executing a REAL
// gRPC bandwidth test between the scheduled endpoints — never fabricated
// numbers. If either endpoint no longer exists or can't run a gRPC test, it
// records an honest failed result and returns an error instead of inventing
// throughput figures indistinguishable from a real measurement.
func runScheduledTestNow(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var scheduledTest models.ScheduledTest

		if err := srv.DB.First(&scheduledTest, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Scheduled test not found"})
			return
		}

		// Both endpoints must still exist and support gRPC bandwidth testing.
		// An orphaned schedule (its node was swept/deleted) must fail honestly.
		var sourceNode, targetNode models.Node
		if err := srv.DB.First(&sourceNode, "id = ?", scheduledTest.SourceNodeID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Source node no longer exists"})
			return
		}
		if err := srv.DB.First(&targetNode, "id = ?", scheduledTest.TargetNodeID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Target node no longer exists"})
			return
		}
		if !sourceNode.GRPCEnabled || sourceNode.GRPCPort == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Source node does not have gRPC enabled"})
			return
		}
		if !targetNode.GRPCEnabled || targetNode.GRPCPort == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Target node does not have gRPC enabled"})
			return
		}

		// Create the test record in the running state; the real test fills in
		// the measured numbers (or marks it failed on error).
		test := models.BandwidthTestResult{
			SourceNodeID: scheduledTest.SourceNodeID,
			TargetNodeID: scheduledTest.TargetNodeID,
			TestType:     scheduledTest.TestType,
			StartTime:    time.Now(),
			Duration:     int64(scheduledTest.Duration * 1000),
			Status:       "running",
			TestMode:     "direct",
		}

		if err := srv.DB.Create(&test).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Update last run time
		now := time.Now()
		scheduledTest.LastRun = &now
		if err := srv.DB.Save(&scheduledTest).Error; err != nil {
			log.Error().Err(err).Str("schedule_id", scheduledTest.ID).Msg("failed to stamp scheduled test LastRun")
		}

		// Execute the REAL bandwidth test in a panic-recovered goroutine, the
		// same path startBandwidthTest uses. On success it writes measured
		// throughput/latency; on failure it sets status=failed with the error.
		testCopy := test
		srcCopy := sourceNode
		dstCopy := targetNode
		dur := scheduledTest.Duration
		safego.Go("scheduled-bandwidth-test:"+test.ID, func() {
			runRealBandwidthTest(srv, &testCopy, &srcCopy, &dstCopy, dur)
		})

		// Return updated scheduled tests HTML
		listScheduledTestsHTML(srv)(c)
	}
}

// ===== Real gRPC Bandwidth Testing =====

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
				dialOpts, dialErr := peerDialOptions()
				if dialErr != nil {
					log.Error().Err(dialErr).Msgf("[PARALLEL-UPLOAD] Stream %d aborted: %v", streamID, dialErr)
					return
				}
				conn, err = grpc.NewClient(targetAddr, dialOpts...)
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

			// Close stream with a bounded wait. CloseAndRecv reads the
			// server's final StreamResult; if the peer hangs, the goroutine
			// would leak. Run it in a daughter goroutine and time out.
			closeDone := make(chan struct{})
			go func() {
				defer close(closeDone)
				_, _ = stream.CloseAndRecv()
			}()
			select {
			case <-closeDone:
			case <-time.After(5 * time.Second):
				log.Warn().Msgf("[PARALLEL-UPLOAD] Stream %d CloseAndRecv timed out after 5s", streamID)
			}

			mu.Lock()
			totalBytes += localBytes
			allLatencies = append(allLatencies, localLatencies...)
			mu.Unlock()

			log.Info().Msgf("[PARALLEL-UPLOAD] Stream %d completed: %d MB sent", streamID, localBytes/1024/1024)
		}()
	}

	wg.Wait()

	mbps := mbpsFromBytes(totalBytes, duration*1000)
	log.Info().Msgf("[PARALLEL-UPLOAD-END] Total=%d bytes, Streams=%d, Throughput=%.2f Mbps",
		totalBytes, numStreams, mbps)

	return totalBytes, allLatencies
}

// mbpsFromBytes safely converts a byte total + duration into Mbps. Guards
// against duration==0 producing +Inf/NaN downstream.
func mbpsFromBytes(bytes int64, durationMs int) float64 {
	if durationMs <= 0 {
		return 0
	}
	return float64(bytes*8) / float64(durationMs) / 1000
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
				dialOpts, dialErr := peerDialOptions()
				if dialErr != nil {
					log.Error().Err(dialErr).Msgf("[PARALLEL-DOWNLOAD] Stream %d aborted: %v", streamID, dialErr)
					return
				}
				conn, err = grpc.NewClient(targetAddr, dialOpts...)
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
					// io.EOF is the normal end-of-stream marker; only log
					// real recv errors to avoid spamming the logs.
					if !errors.Is(err, io.EOF) {
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

	mbps := mbpsFromBytes(totalBytes, duration*1000)
	log.Info().Msgf("[PARALLEL-DOWNLOAD-END] Total=%d bytes, Streams=%d, Throughput=%.2f Mbps",
		totalBytes, numStreams, mbps)

	return totalBytes, allLatencies
}

// runRealBandwidthTest performs an actual gRPC bandwidth test between two
// nodes. It refuses to silently fall back to 127.0.0.1 when a node has no
// recorded IP — that previously made every "test" measure loopback and
// reported impossible throughput numbers.
func runRealBandwidthTest(srv *server.Server, test *models.BandwidthTestResult, sourceNode, targetNode *models.Node, duration int) {
	log.Info().Msgf("Starting real bandwidth test %s: %s -> %s (mode: %s)", test.ID, sourceNode.Name, targetNode.Name, test.TestMode)

	failTest := func(msg string) {
		log.Error().Str("test_id", test.ID).Msg(msg)
		test.Status = "failed"
		test.ErrorMessage = msg
		now := time.Now()
		test.EndTime = &now
		// If THIS write fails a genuinely-failed test is never recorded as
		// failed; surface it so a stuck record is at least diagnosable.
		if err := srv.DB.Save(test).Error; err != nil {
			log.Error().Err(err).Str("test_id", test.ID).Msg("failed to persist failed bandwidth test state")
		}
	}

	// Determine target address based on test mode. Refuse direct mode if the
	// target node has no IP — the previous silent 127.0.0.1 fallback turned
	// every direct test into a loopback test and reported nonsense Mbps.
	var targetAddr string
	switch test.TestMode {
	case "local":
		targetAddr = fmt.Sprintf("127.0.0.1:%d", targetNode.GRPCPort)
		log.Info().Msgf("LOCAL mode: forcing traffic through loopback to %s", targetAddr)
	case "gateway":
		if test.GatewayAddress == "" {
			failTest("gateway test requested but no gateway_address was provided")
			return
		}
		targetAddr = test.GatewayAddress
		log.Info().Msgf("GATEWAY mode: routing traffic through gateway %s", targetAddr)
	default: // "direct"
		if targetNode.IPAddress == "" {
			failTest(fmt.Sprintf(
				"target node %q has no IP address recorded; refusing to fall back to loopback",
				targetNode.Name))
			return
		}
		targetAddr = fmt.Sprintf("%s:%d", targetNode.IPAddress, targetNode.GRPCPort)
		log.Info().Msgf("DIRECT mode: connecting directly to %s", targetAddr)
	}

	// Store the actual target address used
	test.ActualTargetAddress = targetAddr
	if err := srv.DB.Save(test).Error; err != nil {
		log.Error().Err(err).Str("test_id", test.ID).Msg("failed to persist bandwidth test target address")
	}

	log.Info().Msgf("Connecting to target node at %s", targetAddr)

	// Register the cancel func so cancelBandwidthTest can stop the run.
	// Using context.Background() (not the request ctx) is intentional — the
	// HTTP request that started this returned immediately, so its ctx is
	// already cancelled. The user-facing cancel path goes through the
	// bandwidthRuns registry instead.
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(duration*2+60)*time.Second)
	defer cancel()
	registerBandwidthRun(test.ID, cancel)
	defer unregisterBandwidthRun(test.ID)

	dialOpts, err := peerDialOptions()
	if err != nil {
		failTest(fmt.Sprintf("gRPC security misconfigured: %v", err))
		return
	}
	conn, err := grpc.NewClient(targetAddr, dialOpts...)
	if err != nil {
		failTest(fmt.Sprintf("Failed to connect to target: %v", err))
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
		if serr := srv.DB.Save(test).Error; serr != nil {
			log.Error().Err(serr).Str("test_id", test.ID).Msg("failed to persist bandwidth test start-failure state")
		}
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

	// Calculate speeds in Mbps (bits per second / 1,000,000). Use the helper
	// so a zero duration produces 0 instead of +Inf.
	test.UploadSpeed = mbpsFromBytes(totalBytesSent, int(measurementDurationMs))
	test.DownloadSpeed = mbpsFromBytes(totalBytesReceived, int(measurementDurationMs))

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

	// Terminal write of the completed result. If this fails the record stays
	// Status="running" forever in the UI even though the test finished — log
	// loudly so a stuck-running row is diagnosable.
	if err := srv.DB.Save(test).Error; err != nil {
		log.Error().Err(err).Str("test_id", test.ID).Msg("failed to persist completed bandwidth test result; UI may show it stuck 'running'")
	}

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

// queryMetrics used to forward to a hard-coded http://localhost:9090, which
// returned 502 in single-binary deployments (the 99% case) because no
// external Prometheus was running. With the in-process registry, the
// dashboard should hit /api/v1/metrics directly and parse the exposition
// format client-side, OR forward to an external Prometheus only when
// PROMETHEUS_URL is explicitly set. We do the latter here so existing
// dashboard JS still works for operators who *do* run Prometheus.
func queryMetrics(_ *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		prometheusURL := os.Getenv("PROMETHEUS_URL")
		if prometheusURL == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "no external Prometheus configured; set PROMETHEUS_URL env, " +
					"or scrape the in-process /api/v1/metrics endpoint directly",
			})
			return
		}

		query := c.Query("query")
		if query == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "query parameter is required"})
			return
		}

		queryType := c.DefaultQuery("type", "query")
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

		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Get(promURL)
		if err != nil {
			log.Error().Err(err).Str("url", promURL).Msg("Failed to query Prometheus")
			c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("failed to connect to Prometheus: %v", err)})
			return
		}
		defer func() {
			_, _ = io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
		}()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			log.Error().Err(err).Msg("Failed to read Prometheus response")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read Prometheus response"})
			return
		}

		var promResponse map[string]interface{}
		if err := json.Unmarshal(body, &promResponse); err != nil {
			log.Error().Err(err).Msg("Failed to parse Prometheus response")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse Prometheus response"})
			return
		}

		c.JSON(resp.StatusCode, promResponse)
	}
}
