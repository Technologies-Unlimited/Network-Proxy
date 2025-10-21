package api

import (
	"net/http"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
)

// listAlerts returns all alerts
func listAlerts(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var alerts []models.Alert

		// Filter by status if provided
		query := srv.DB.Preload("Device")
		if status := c.Query("status"); status != "" {
			query = query.Where("status = ?", status)
		}

		result := query.Order("triggered_at DESC").Find(&alerts)

		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"alerts": alerts,
			"count":  len(alerts),
		})
	}
}

// getAlert returns a single alert
func getAlert(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var alert models.Alert

		result := srv.DB.Preload("Device").First(&alert, "id = ?", id)

		if result.Error != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Alert not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"alert": alert})
	}
}

// acknowledgeAlert marks an alert as acknowledged
func acknowledgeAlert(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var alert models.Alert

		if err := srv.DB.First(&alert, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Alert not found"})
			return
		}

		now := time.Now()
		alert.Status = "acknowledged"
		alert.AckedAt = &now

		// TODO: Get user ID from JWT token
		// alert.AckedBy = &userID

		if err := srv.DB.Save(&alert).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"alert": alert})
	}
}

// resolveAlert marks an alert as resolved
func resolveAlert(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var alert models.Alert

		if err := srv.DB.First(&alert, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Alert not found"})
			return
		}

		now := time.Now()
		alert.Status = "resolved"
		alert.ResolvedAt = &now

		if err := srv.DB.Save(&alert).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"alert": alert})
	}
}

// listAlertRules returns all alert rules
func listAlertRules(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var rules []models.AlertRule
		result := srv.DB.Find(&rules)

		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"rules": rules,
			"count": len(rules),
		})
	}
}

// createAlertRule creates a new alert rule
func createAlertRule(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var rule models.AlertRule

		if err := c.ShouldBindJSON(&rule); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if err := srv.DB.Create(&rule).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"rule": rule})
	}
}

// getAlertRule returns a single alert rule
func getAlertRule(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var rule models.AlertRule

		if err := srv.DB.First(&rule, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Alert rule not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"rule": rule})
	}
}

// updateAlertRule updates an existing alert rule
func updateAlertRule(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var rule models.AlertRule

		if err := srv.DB.First(&rule, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Alert rule not found"})
			return
		}

		if err := c.ShouldBindJSON(&rule); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if err := srv.DB.Save(&rule).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"rule": rule})
	}
}

// deleteAlertRule deletes an alert rule
func deleteAlertRule(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var rule models.AlertRule

		if err := srv.DB.First(&rule, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Alert rule not found"})
			return
		}

		if err := srv.DB.Delete(&rule).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Alert rule deleted successfully"})
	}
}
