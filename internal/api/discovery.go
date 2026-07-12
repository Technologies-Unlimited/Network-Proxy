package api

import (
	"context"
	"errors"
	"net"
	"net/http"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/discovery"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
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

// ScanResponse represents a scan response.
//
// Error carries the machine-readable failure message so every /api error body
// shares the one canonical "error" envelope the rest of the API uses (a generic
// REST client reads response.error uniformly). Message stays for the
// human-readable SUCCESS text; on a failure it is left empty and Error is set.
type ScanResponse struct {
	Success    bool                  `json:"success"`
	Message    string                `json:"message,omitempty"`
	Error      string                `json:"error,omitempty"`
	Discovered int                   `json:"discovered"`
	Devices    []DeviceScanResult    `json:"devices,omitempty"`
	Status     *discovery.ScanStatus `json:"status,omitempty"`
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
				Error:   "Invalid request: " + err.Error(),
			})
			return
		}

		// Validate CIDR format to prevent injection attacks
		_, _, err := net.ParseCIDR(req.CIDR)
		if err != nil {
			c.JSON(http.StatusBadRequest, ScanResponse{
				Success: false,
				Error:   "Invalid CIDR format: " + err.Error(),
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

		// Resolve the authenticated tenant BEFORE spawning the goroutine — the
		// gin.Context must not be touched off-request. Discovered devices are
		// stamped with (and scoped to) this company so they're visible to the
		// same company-scoped reads and can't clobber another tenant's device
		// that happens to share an IP.
		companyID := companyIDForWrite(c, "")

		// Start scan in background
		go func() {
			devices, err := globalScanner.ScanCIDR(ctx, req.CIDR)
			if err != nil {
				// Log error but don't fail the response
				// The client can check status via /api/v1/discovery/status
				return
			}

			// Save discovered devices to database. A dropped Create/Updates here
			// means a device the operator SEES in the scan results never enters
			// the DB-backed inventory and is never polled — it silently drops out
			// of monitoring. Check every write and log per-device failures.
			if srv.DB != nil {
				for _, device := range devices {
					device.CompanyID = companyID
					// Check if a device with this IP already exists FOR THIS
					// company (IP is not unique across tenants).
					var existingDevice struct {
						ID string
					}
					result := srv.DB.Model(device).
						Where("ip_address = ? AND company_id = ?", device.IPAddress, companyID).
						First(&existingDevice)

					switch {
					case result.Error == nil:
						// Device exists, update it.
						if err := srv.DB.Model(device).
							Where("ip_address = ? AND company_id = ?", device.IPAddress, companyID).
							Updates(map[string]interface{}{
								"hostname":    device.Hostname,
								"status":      device.Status,
								"last_seen":   device.LastSeen,
								"device_type": device.DeviceType,
							}).Error; err != nil {
							log.Error().Err(err).Str("ip", device.IPAddress).Msg("discovery: failed to update discovered device")
						}
					case errors.Is(result.Error, gorm.ErrRecordNotFound):
						// Genuinely absent — create it.
						if err := srv.DB.Create(device).Error; err != nil {
							log.Error().Err(err).Str("ip", device.IPAddress).Msg("discovery: failed to persist discovered device")
						}
					default:
						// A transient READ error is NOT proof the device is
						// absent; taking the create branch here would risk a
						// duplicate. Log and skip this device.
						log.Error().Err(result.Error).Str("ip", device.IPAddress).Msg("discovery: existence check failed; skipping device")
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
