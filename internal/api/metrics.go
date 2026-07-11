package api

import (
	"net/http"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// getDeviceStatusMetrics returns device status counts
func getDeviceStatusMetrics(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var devices []models.Device
		if err := srv.DB.Find(&devices).Error; err != nil {
			// Do NOT emit {up:0,down:0,unknown:0} on a failed read — that is a
			// fabricated all-healthy snapshot served with 200 OK.
			log.Error().Err(err).Msg("getDeviceStatusMetrics: device query failed")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load device status"})
			return
		}

		statusCounts := map[string]int{
			"up":      0,
			"down":    0,
			"unknown": 0,
		}

		typeCounts := make(map[string]int)

		for _, device := range devices {
			statusCounts[device.Status]++
			if device.DeviceType != "" {
				typeCounts[device.DeviceType]++
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"up":      statusCounts["up"],
			"down":    statusCounts["down"],
			"unknown": statusCounts["unknown"],
			"by_type": typeCounts,
		})
	}
}

// getPingHistoryMetrics returns ping latency history
func getPingHistoryMetrics(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		timeRange := c.DefaultQuery("range", "1h")

		var devices []models.Device
		if err := srv.DB.Where("icmp_enabled = ?", true).Find(&devices).Error; err != nil {
			log.Error().Err(err).Msg("getPingHistoryMetrics: device query failed")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load ping history"})
			return
		}

		// Generate mock data since we don't have time-series storage yet
		// In production, this would query Prometheus or a time-series database
		now := time.Now()
		points := 12
		interval := 5 * time.Minute

		if timeRange == "6h" {
			points = 36
			interval = 10 * time.Minute
		} else if timeRange == "24h" {
			points = 48
			interval = 30 * time.Minute
		} else if timeRange == "7d" {
			points = 84
			interval = 2 * time.Hour
		} else if timeRange == "30d" {
			points = 120
			interval = 6 * time.Hour
		}

		timestamps := make([]string, points)
		deviceData := make([]map[string]interface{}, 0)

		for i := 0; i < points; i++ {
			t := now.Add(-time.Duration(points-i-1) * interval)
			timestamps[i] = t.Format("15:04")
		}

		totalLatency := 0.0
		totalPoints := 0

		for _, device := range devices {
			data := make([]float64, points)
			for i := 0; i < points; i++ {
				// Generate realistic latency data
				baseLatency := 20.0 + float64(i%10)*2
				if device.Status == "up" {
					data[i] = baseLatency
					totalLatency += baseLatency
					totalPoints++
				} else {
					data[i] = 0
				}
			}

			deviceData = append(deviceData, map[string]interface{}{
				"name": device.Hostname,
				"data": data,
			})
		}

		avgLatency := 0.0
		if totalPoints > 0 {
			avgLatency = totalLatency / float64(totalPoints)
		}

		c.JSON(http.StatusOK, gin.H{
			"timestamps":  timestamps,
			"devices":     deviceData,
			"avg_latency": avgLatency,
		})
	}
}

// getAlertStatsMetrics returns alert statistics
func getAlertStatsMetrics(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var alerts []models.Alert
		if err := srv.DB.Where("status = ?", "active").Find(&alerts).Error; err != nil {
			// A failed read must not report {total:0,critical:0,warning:0} — an
			// all-clear that hides the fleet's real alert state.
			log.Error().Err(err).Msg("getAlertStatsMetrics: alert query failed")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load alert stats"})
			return
		}

		criticalCount := 0
		warningCount := 0

		for _, alert := range alerts {
			if alert.Severity == "critical" {
				criticalCount++
			} else if alert.Severity == "warning" {
				warningCount++
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"total":    len(alerts),
			"critical": criticalCount,
			"warning":  warningCount,
		})
	}
}

// getDevicesJSON returns devices as JSON array
func getDevicesJSON(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var devices []models.Device
		if err := srv.DB.Find(&devices).Error; err != nil {
			// Returning [] on a failed read looks identical to "no devices" —
			// a silent lie to any UI/automation consuming this endpoint.
			log.Error().Err(err).Msg("getDevicesJSON: device query failed")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load devices"})
			return
		}

		c.JSON(http.StatusOK, devices)
	}
}

// getUptimeMetrics returns uptime percentage for a device
func getUptimeMetrics(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		deviceID := c.Query("device_id")

		var device models.Device
		if err := srv.DB.First(&device, "id = ?", deviceID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
			return
		}

		// Calculate uptime (mock calculation - in production would use historical data)
		var uptimePercentage float64
		if device.Status == "up" {
			uptimePercentage = 99.9 // Assume high uptime if currently up
		} else if device.Status == "down" {
			uptimePercentage = 85.0 // Lower uptime if currently down
		} else {
			uptimePercentage = 50.0 // Unknown status
		}

		c.JSON(http.StatusOK, gin.H{
			"device_id":         deviceID,
			"uptime_percentage": uptimePercentage,
		})
	}
}

// getOutageHistory returns outage/downtime periods for devices
func getOutageHistory(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		timeRange := c.DefaultQuery("range", "24h")

		var devices []models.Device
		if err := srv.DB.Find(&devices).Error; err != nil {
			log.Error().Err(err).Msg("getOutageHistory: device query failed")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load outage history"})
			return
		}

		// Generate mock outage data (in production, track actual outages)
		now := time.Now()
		outages := make([]map[string]interface{}, 0)

		// Calculate time window based on range
		var startTime time.Time
		if timeRange == "1h" {
			startTime = now.Add(-1 * time.Hour)
		} else if timeRange == "6h" {
			startTime = now.Add(-6 * time.Hour)
		} else if timeRange == "24h" {
			startTime = now.Add(-24 * time.Hour)
		} else if (timeRange == "7d") {
			startTime = now.Add(-7 * 24 * time.Hour)
		} else {
			startTime = now.Add(-30 * 24 * time.Hour)
		}

		// Generate some mock outages for visualization
		for _, device := range devices {
			if device.Status == "down" {
				// Current outage
				outages = append(outages, map[string]interface{}{
					"device_name": device.Hostname,
					"device_id":   device.ID,
					"start_time":  now.Add(-15 * time.Minute).Format(time.RFC3339),
					"end_time":    nil, // Still ongoing
					"duration":    15,  // minutes
					"status":      "ongoing",
				})
			}
		}

		// Add some historical outages for demonstration
		if timeRange == "24h" || timeRange == "7d" || timeRange == "30d" {
			outages = append(outages, map[string]interface{}{
				"device_name": "Google DNS (Primary)",
				"device_id":   "sample",
				"start_time":  now.Add(-8 * time.Hour).Format(time.RFC3339),
				"end_time":    now.Add(-7*time.Hour - 45*time.Minute).Format(time.RFC3339),
				"duration":    15,
				"status":      "resolved",
			})
		}

		c.JSON(http.StatusOK, gin.H{
			"time_range":  timeRange,
			"start_time":  startTime.Format(time.RFC3339),
			"end_time":    now.Format(time.RFC3339),
			"outages":     outages,
			"total_count": len(outages),
		})
	}
}
