package api

import (
	"context"
	"net"
	"net/http"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/discovery"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
)

var (
	// Global scanner instance
	globalScanner *discovery.Scanner
)

func init() {
	globalScanner = discovery.NewScanner()
}

// ScanRequest represents a network scan request
type ScanRequest struct {
	CIDR    string `json:"cidr" binding:"required"`
	Timeout int    `json:"timeout"` // Timeout in seconds (optional, default 300)
}

// ScanResponse represents a scan response
type ScanResponse struct {
	Success    bool                    `json:"success"`
	Message    string                  `json:"message"`
	Discovered int                     `json:"discovered"`
	Devices    []DeviceScanResult      `json:"devices,omitempty"`
	Status     *discovery.ScanStatus   `json:"status,omitempty"`
}

// DeviceScanResult represents a discovered device
type DeviceScanResult struct {
	IPAddress  string `json:"ip_address"`
	Hostname   string `json:"hostname"`
	DeviceType string `json:"device_type"`
	Status     string `json:"status"`
}

// scanNetwork handles POST /api/v1/discovery/scan
func scanNetwork(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req ScanRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, ScanResponse{
				Success: false,
				Message: "Invalid request: " + err.Error(),
			})
			return
		}

		// Validate CIDR format to prevent injection attacks
		_, _, err := net.ParseCIDR(req.CIDR)
		if err != nil {
			c.JSON(http.StatusBadRequest, ScanResponse{
				Success: false,
				Message: "Invalid CIDR format: " + err.Error(),
			})
			return
		}

		// Set default timeout with maximum limit
		timeout := 300 // 5 minutes default
		if req.Timeout > 0 {
			timeout = req.Timeout
		}
		// Cap timeout to prevent DoS
		if timeout > 600 {
			timeout = 600 // Max 10 minutes
		}

		// Create context with timeout
		ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
		defer cancel()

		// Start scan in background
		go func() {
			devices, err := globalScanner.ScanCIDR(ctx, req.CIDR)
			if err != nil {
				// Log error but don't fail the response
				// The client can check status via /api/v1/discovery/status
				return
			}

			// Save discovered devices to database
			if srv.DB != nil {
				for _, device := range devices {
					// Check if device already exists
					var existingDevice struct {
						ID string
					}
					result := srv.DB.Model(device).Where("ip_address = ?", device.IPAddress).First(&existingDevice)

					if result.Error != nil {
						// Device doesn't exist, create it
						srv.DB.Create(device)
					} else {
						// Device exists, update it
						srv.DB.Model(device).Where("ip_address = ?", device.IPAddress).Updates(map[string]interface{}{
							"hostname":    device.Hostname,
							"status":      device.Status,
							"last_seen":   device.LastSeen,
							"device_type": device.DeviceType,
						})
					}
				}
			}
		}()

		// Return immediate response
		c.JSON(http.StatusOK, ScanResponse{
			Success: true,
			Message: "Network scan started for " + req.CIDR,
			Status:  &discovery.ScanStatus{
				Scanning: true,
			},
		})
	}
}

// getScanStatus handles GET /api/v1/discovery/status
func getScanStatus(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		status := globalScanner.GetStatus()

		response := ScanResponse{
			Success:    true,
			Message:    "Scan status retrieved",
			Discovered: status.Discovered,
			Status:     &status,
		}

		// If scan is complete, include discovered devices
		if !status.Scanning && status.Discovered > 0 {
			devices := globalScanner.GetDevices()
			response.Devices = make([]DeviceScanResult, 0, len(devices))

			for _, device := range devices {
				response.Devices = append(response.Devices, DeviceScanResult{
					IPAddress:  device.IPAddress,
					Hostname:   device.Hostname,
					DeviceType: device.DeviceType,
					Status:     device.Status,
				})
			}
		}

		c.JSON(http.StatusOK, response)
	}
}

// clearScanCache handles DELETE /api/v1/discovery/cache
func clearScanCache(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		globalScanner.ClearDevices()

		c.JSON(http.StatusOK, ScanResponse{
			Success: true,
			Message: "Scan cache cleared",
		})
	}
}

// getDiscoveredDevices handles GET /api/v1/discovery/devices
func getDiscoveredDevices(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		devices := globalScanner.GetDevices()

		response := ScanResponse{
			Success:    true,
			Message:    "Discovered devices retrieved",
			Discovered: len(devices),
			Devices:    make([]DeviceScanResult, 0, len(devices)),
		}

		for _, device := range devices {
			response.Devices = append(response.Devices, DeviceScanResult{
				IPAddress:  device.IPAddress,
				Hostname:   device.Hostname,
				DeviceType: device.DeviceType,
				Status:     device.Status,
			})
		}

		c.JSON(http.StatusOK, response)
	}
}
