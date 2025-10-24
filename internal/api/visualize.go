package api

import (
	"net/http"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
)

// visualizePage renders the visualization dashboard
func visualizePage(c *gin.Context) {
	c.HTML(http.StatusOK, "visualize.html", gin.H{
		"title": "Visualize - Network Monitor",
	})
}

// DeviceStatusResponse represents device status metrics
type DeviceStatusResponse struct {
	Up      int            `json:"up"`
	Down    int            `json:"down"`
	Unknown int            `json:"unknown"`
	Total   int            `json:"total"`
	ByType  map[string]int `json:"by_type"`
}

// getDeviceStatus returns device status counts
func getDeviceStatus(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var devices []models.Device
		result := srv.DB.Find(&devices)
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}

		response := DeviceStatusResponse{
			ByType: make(map[string]int),
		}

		// Count devices by status
		for _, device := range devices {
			switch device.Status {
			case "up":
				response.Up++
			case "down":
				response.Down++
			default:
				response.Unknown++
			}

			// Count by type
			deviceType := device.DeviceType
			if deviceType == "" {
				deviceType = "unknown"
			}
			response.ByType[deviceType]++
		}

		response.Total = len(devices)

		c.JSON(http.StatusOK, response)
	}
}

// PingDataPoint represents a single ping measurement
type PingDataPoint struct {
	Timestamp string  `json:"timestamp"`
	Latency   float64 `json:"latency"`
}

// DevicePingHistory represents ping history for a single device
type DevicePingHistory struct {
	DeviceID string          `json:"device_id"`
	Name     string          `json:"name"`
	Data     []float64       `json:"data"`
}

// PingHistoryResponse represents ping history for all devices
type PingHistoryResponse struct {
	Timestamps  []string            `json:"timestamps"`
	Devices     []DevicePingHistory `json:"devices"`
	AvgLatency  float64             `json:"avg_latency"`
}

// getPingHistory returns ping history for devices
func getPingHistory(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		deviceID := c.Query("device_id")
		timeRange := c.DefaultQuery("range", "1h")

		// Calculate time range
		duration := parseDuration(timeRange)
		startTime := time.Now().Add(-duration)

		var devices []models.Device
		query := srv.DB

		// Filter by device if specified
		if deviceID != "" {
			query = query.Where("id = ?", deviceID)
		}

		result := query.Find(&devices)
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}

		// Generate time labels
		timestamps := generateTimestamps(startTime, time.Now(), duration)

		response := PingHistoryResponse{
			Timestamps: timestamps,
			Devices:    make([]DevicePingHistory, 0),
		}

		var totalLatency float64
		var totalPoints int

		// For each device, generate ping data
		// In a real implementation, this would query a time-series database or metrics store
		// For now, we'll generate sample data based on device status
		for _, device := range devices {
			deviceHistory := DevicePingHistory{
				DeviceID: device.ID,
				Name:     device.Hostname,
				Data:     make([]float64, len(timestamps)),
			}

			// Generate realistic ping data based on device status
			baseLatency := 10.0 // ms
			if device.Status == "down" {
				baseLatency = 0 // No response
			} else if device.Status == "unknown" {
				baseLatency = 5.0
			}

			for i := range timestamps {
				// Add some variation to make it realistic
				variation := (float64(time.Now().UnixNano()%100) / 100.0) * 5.0
				latency := baseLatency + variation

				if device.Status == "up" && i%10 == 0 {
					// Occasional spike
					latency += 15.0
				}

				deviceHistory.Data[i] = latency
				totalLatency += latency
				totalPoints++
			}

			response.Devices = append(response.Devices, deviceHistory)
		}

		// Calculate average latency
		if totalPoints > 0 {
			response.AvgLatency = totalLatency / float64(totalPoints)
		}

		c.JSON(http.StatusOK, response)
	}
}

// AlertStatsResponse represents alert statistics
type AlertStatsResponse struct {
	Total    int            `json:"total"`
	Critical int            `json:"critical"`
	Warning  int            `json:"warning"`
	Info     int            `json:"info"`
	Active   int            `json:"active"`
	BySeverity map[string]int `json:"by_severity"`
}

// getAlertStats returns alert statistics
func getAlertStats(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var alerts []models.Alert
		result := srv.DB.Where("status = ?", "active").Find(&alerts)
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}

		response := AlertStatsResponse{
			BySeverity: make(map[string]int),
		}

		// Count alerts by severity
		for _, alert := range alerts {
			switch alert.Severity {
			case "critical":
				response.Critical++
			case "warning":
				response.Warning++
			case "info":
				response.Info++
			}

			response.BySeverity[alert.Severity]++

			if alert.Status == "active" {
				response.Active++
			}
		}

		response.Total = len(alerts)

		c.JSON(http.StatusOK, response)
	}
}

// UptimeResponse represents device uptime statistics
type UptimeResponse struct {
	DeviceID          string    `json:"device_id"`
	Hostname          string    `json:"hostname"`
	UptimePercentage  float64   `json:"uptime_percentage"`
	TotalChecks       int       `json:"total_checks"`
	SuccessfulChecks  int       `json:"successful_checks"`
	FailedChecks      int       `json:"failed_checks"`
	LastSeen          *time.Time `json:"last_seen"`
	CurrentStatus     string    `json:"current_status"`
}

// getDeviceUptime returns uptime statistics for a device
func getDeviceUptime(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		deviceID := c.Query("device_id")
		if deviceID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "device_id is required"})
			return
		}

		timeRange := c.DefaultQuery("range", "24h")
		duration := parseDuration(timeRange)

		var device models.Device
		result := srv.DB.Where("id = ?", deviceID).First(&device)
		if result.Error != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "device not found"})
			return
		}

		// In a real implementation, this would query a metrics database
		// For now, we'll calculate based on device status and generate estimates
		response := UptimeResponse{
			DeviceID:      device.ID,
			Hostname:      device.Hostname,
			LastSeen:      device.LastSeen,
			CurrentStatus: device.Status,
		}

		// Simulate uptime calculation
		// In production, this would be based on actual ping/check results stored in a time-series DB
		hoursInRange := int(duration.Hours())
		checksPerHour := 12 // Every 5 minutes
		response.TotalChecks = hoursInRange * checksPerHour

		switch device.Status {
		case "up":
			// High uptime for devices currently up
			response.SuccessfulChecks = int(float64(response.TotalChecks) * 0.98)
			response.FailedChecks = response.TotalChecks - response.SuccessfulChecks
			response.UptimePercentage = 98.0 + (float64(time.Now().Unix()%200) / 100.0)
		case "down":
			// Low uptime for devices currently down
			response.SuccessfulChecks = int(float64(response.TotalChecks) * 0.15)
			response.FailedChecks = response.TotalChecks - response.SuccessfulChecks
			response.UptimePercentage = 15.0 + (float64(time.Now().Unix()%100) / 100.0)
		default:
			// Medium uptime for unknown status
			response.SuccessfulChecks = int(float64(response.TotalChecks) * 0.50)
			response.FailedChecks = response.TotalChecks - response.SuccessfulChecks
			response.UptimePercentage = 50.0 + (float64(time.Now().Unix()%200) / 100.0)
		}

		// Ensure percentage doesn't exceed 100
		if response.UptimePercentage > 100 {
			response.UptimePercentage = 99.99
		}

		c.JSON(http.StatusOK, response)
	}
}

// NetworkThroughputResponse represents network throughput data
type NetworkThroughputResponse struct {
	Timestamps []string  `json:"timestamps"`
	Inbound    []float64 `json:"inbound"`   // Mbps
	Outbound   []float64 `json:"outbound"`  // Mbps
}

// getNetworkThroughput returns network throughput metrics
func getNetworkThroughput(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		_ = c.Query("device_id") // deviceID for future device-specific filtering
		timeRange := c.DefaultQuery("range", "1h")

		duration := parseDuration(timeRange)
		startTime := time.Now().Add(-duration)

		timestamps := generateTimestamps(startTime, time.Now(), duration)

		response := NetworkThroughputResponse{
			Timestamps: timestamps,
			Inbound:    make([]float64, len(timestamps)),
			Outbound:   make([]float64, len(timestamps)),
		}

		// In a real implementation, this would query SNMP data or a metrics database
		// For now, generate sample data
		for i := range timestamps {
			// Generate realistic-looking throughput data
			baseInbound := 50.0 + (float64(time.Now().UnixNano()%300) / 10.0)
			baseOutbound := 30.0 + (float64(time.Now().UnixNano()%200) / 10.0)

			response.Inbound[i] = baseInbound
			response.Outbound[i] = baseOutbound
		}

		c.JSON(http.StatusOK, response)
	}
}

// Helper functions

// parseDuration parses a time range string into a duration
func parseDuration(timeRange string) time.Duration {
	switch timeRange {
	case "1h":
		return time.Hour
	case "6h":
		return 6 * time.Hour
	case "24h":
		return 24 * time.Hour
	case "7d":
		return 7 * 24 * time.Hour
	case "30d":
		return 30 * 24 * time.Hour
	default:
		return time.Hour
	}
}

// generateTimestamps generates timestamp labels for charts
func generateTimestamps(start, end time.Time, duration time.Duration) []string {
	var timestamps []string
	var interval time.Duration
	var count int

	// Determine appropriate interval based on duration
	switch {
	case duration <= time.Hour:
		interval = 5 * time.Minute
		count = 12
	case duration <= 6*time.Hour:
		interval = 10 * time.Minute
		count = 36
	case duration <= 24*time.Hour:
		interval = 30 * time.Minute
		count = 48
	case duration <= 7*24*time.Hour:
		interval = time.Hour
		count = 168
	default:
		interval = 2 * time.Hour
		count = 360
	}

	current := start
	for i := 0; i < count && current.Before(end); i++ {
		timestamps = append(timestamps, current.Format("15:04"))
		current = current.Add(interval)
	}

	return timestamps
}

// parseCustomRange parses custom start and end time strings
func parseCustomRange(start, end string) (time.Time, time.Time, error) {
	startTime, err := time.Parse(time.RFC3339, start)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}

	endTime, err := time.Parse(time.RFC3339, end)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}

	return startTime, endTime, nil
}
