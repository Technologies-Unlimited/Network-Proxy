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
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"agents": agents,
			"count":  len(agents),
		})
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
