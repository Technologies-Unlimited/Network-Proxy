package api

import (
	"net/http"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
)

// listAgents returns all agents
func listAgents(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var agents []models.Agent
		result := srv.DB.Find(&agents)

		if result.Error != nil {
			c.Data(http.StatusOK, "text/html", []byte(`<p style="color: var(--danger);">Error loading agents</p>`))
			return
		}

		if len(agents) == 0 {
			c.Data(http.StatusOK, "text/html", []byte(`
				<div style="text-align: center; padding: 40px; color: var(--text-secondary);">
					<h3>No Agents Registered</h3>
					<p>Agents will appear here once they connect to the server</p>
				</div>
			`))
			return
		}

		// Build HTML table
		html := `
		<table style="width: 100%; border-collapse: collapse;">
			<thead>
				<tr style="border-bottom: 2px solid var(--border);">
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">Agent Name</th>
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">Hostname</th>
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">IP Address</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Status</th>
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">Last Seen</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Actions</th>
				</tr>
			</thead>
			<tbody>`

		for _, agent := range agents {
			statusColor := "var(--text-secondary)"
			statusText := agent.Status
			if agent.Status == "online" {
				statusColor = "var(--success)"
			} else if agent.Status == "offline" {
				statusColor = "var(--danger)"
			}

			lastSeen := "Never"
			if agent.LastSeen != nil {
				lastSeen = agent.LastSeen.Format("2006-01-02 15:04")
			}

			html += `
				<tr style="border-bottom: 1px solid var(--border);">
					<td style="padding: 12px; color: var(--text-primary);">` + agent.Name + `</td>
					<td style="padding: 12px; color: var(--text-primary);">` + agent.Hostname + `</td>
					<td style="padding: 12px; color: var(--text-primary);">` + agent.IPAddress + `</td>
					<td style="padding: 12px; text-align: center;">
						<span style="padding: 4px 12px; background: ` + statusColor + `; color: white; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase;">` + statusText + `</span>
					</td>
					<td style="padding: 12px; color: var(--text-secondary);">` + lastSeen + `</td>
					<td style="padding: 12px; text-align: center;">
						<button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; margin-right: 5px;">View</button>
						<button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; background: var(--danger);">Delete</button>
					</td>
				</tr>`
		}

		html += `
			</tbody>
		</table>`

		c.Data(http.StatusOK, "text/html", []byte(html))
	}
}

// registerAgent registers a new agent
func registerAgent(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var agent models.Agent

		if err := c.ShouldBindJSON(&agent); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Set initial status
		now := time.Now()
		agent.Status = "online"
		agent.LastSeen = &now

		if err := srv.DB.Create(&agent).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"agent": agent})
	}
}

// getAgent returns a single agent
func getAgent(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var agent models.Agent

		result := srv.DB.Preload("Devices").First(&agent, "id = ?", id)

		if result.Error != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Agent not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"agent": agent})
	}
}

// agentHeartbeat updates agent's last seen timestamp
func agentHeartbeat(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var agent models.Agent

		if err := srv.DB.First(&agent, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Agent not found"})
			return
		}

		now := time.Now()
		agent.LastSeen = &now
		agent.Status = "online"

		if err := srv.DB.Save(&agent).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"agent": agent})
	}
}

// deleteAgent deletes an agent
func deleteAgent(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var agent models.Agent

		if err := srv.DB.First(&agent, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Agent not found"})
			return
		}

		if err := srv.DB.Delete(&agent).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Agent deleted successfully"})
	}
}

// queryMetrics proxies queries to Prometheus
func queryMetrics(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		// TODO: Implement Prometheus query proxy
		// This would forward PromQL queries to Prometheus and return results
		c.JSON(http.StatusNotImplemented, gin.H{
			"message": "Metrics query endpoint not yet implemented",
		})
	}
}
