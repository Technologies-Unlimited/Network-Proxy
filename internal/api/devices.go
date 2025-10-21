package api

import (
	"net/http"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
)

// listDevices returns all devices
func listDevices(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var devices []models.Device

		// Preload relationships
		result := srv.DB.Preload("SNMPTemplate").Find(&devices)

		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"devices": devices,
			"count":   len(devices),
		})
	}
}

// createDevice creates a new device
func createDevice(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var device models.Device

		if err := c.ShouldBindJSON(&device); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Set initial status
		device.Status = "unknown"

		if err := srv.DB.Create(&device).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"device": device})
	}
}

// getDevice returns a single device by ID
func getDevice(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var device models.Device

		result := srv.DB.Preload("SNMPTemplate").First(&device, "id = ?", id)

		if result.Error != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"device": device})
	}
}

// updateDevice updates an existing device
func updateDevice(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var device models.Device

		// Check if device exists
		if err := srv.DB.First(&device, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
			return
		}

		// Bind update data
		if err := c.ShouldBindJSON(&device); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Update device
		if err := srv.DB.Save(&device).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"device": device})
	}
}

// deleteDevice deletes a device (soft delete)
func deleteDevice(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var device models.Device

		// Check if device exists
		if err := srv.DB.First(&device, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
			return
		}

		// Soft delete
		if err := srv.DB.Delete(&device).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Device deleted successfully"})
	}
}
