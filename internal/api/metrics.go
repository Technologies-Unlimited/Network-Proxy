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

		// This build keeps no per-device latency time-series, so there is no
		// history to chart. Rather than invent a curve, plot the ONE real value we
		// have — each device's latest measured latency, straight from the metrics
		// registry — at the trailing timestamp and leave earlier points empty
		// (null => a gap). history_available:false lets the UI label it honestly.
		now := time.Now()
		points := 12
		interval := 5 * time.Minute

		switch timeRange {
		case "6h":
			points, interval = 36, 10*time.Minute
		case "24h":
			points, interval = 48, 30*time.Minute
		case "7d":
			points, interval = 84, 2*time.Hour
		case "30d":
			points, interval = 120, 6*time.Hour
		}

		timestamps := make([]string, points)
		for i := 0; i < points; i++ {
			t := now.Add(-time.Duration(points-i-1) * interval)
			timestamps[i] = t.Format("15:04")
		}

		querier := getMetricsQuerier()
		deviceData := make([]map[string]interface{}, 0, len(devices))
		totalLatency := 0.0
		measured := 0

		for _, device := range devices {
			// []interface{} so an unmeasured slot serializes as JSON null (a chart
			// gap), never a fake 0 that reads as "0 ms".
			data := make([]interface{}, points)
			// Only an up device with a real recorded sample gets a real trailing
			// point; everything else stays null (no data), never an invented value.
			if querier != nil && device.Status == "up" {
				if latency, err := querier.PingLatency(device.ID, device.IPAddress); err == nil {
					data[points-1] = latency
					totalLatency += latency
					measured++
				}
			}
			deviceData = append(deviceData, map[string]interface{}{
				"name": device.Hostname,
				"data": data,
			})
		}

		resp := gin.H{
			"timestamps":        timestamps,
			"devices":           deviceData,
			"history_available": false,
		}
		// Omit avg_latency entirely when nothing was measured so the UI shows its
		// "-" placeholder instead of a fabricated average.
		if measured > 0 {
			resp["avg_latency"] = totalLatency / float64(measured)
		}
		c.JSON(http.StatusOK, resp)
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

		// Availability is a REAL ratio of cumulative ping successes to total
		// checks (uptime% = success / total * 100), read from the metrics
		// registry — never a constant keyed off the current up/down flag. When
		// the device has no real sample yet (never polled / unmeasurable), we OMIT
		// uptime_percentage so the caller renders "no data" rather than an invented
		// figure. (The registry is process-lifetime; historical range windows need
		// a persisted time-series store, tracked separately.)
		resp := gin.H{"device_id": deviceID}
		if querier := getMetricsQuerier(); querier != nil {
			if success, failure, err := querier.PingCounts(device.ID, device.IPAddress); err == nil {
				if total := success + failure; total > 0 {
					resp["uptime_percentage"] = success / total * 100
					resp["total_checks"] = total
					resp["success_checks"] = success
					resp["failed_checks"] = failure
				}
			}
		}
		if _, ok := resp["uptime_percentage"]; !ok {
			resp["status"] = "no_data"
		}

		c.JSON(http.StatusOK, resp)
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

		now := time.Now()

		// Calculate the requested time window (used only for the reported bounds).
		var startTime time.Time
		switch timeRange {
		case "1h":
			startTime = now.Add(-1 * time.Hour)
		case "6h":
			startTime = now.Add(-6 * time.Hour)
		case "7d":
			startTime = now.Add(-7 * 24 * time.Hour)
		case "30d":
			startTime = now.Add(-30 * 24 * time.Hour)
		default: // 24h
			startTime = now.Add(-24 * time.Hour)
		}

		// This build keeps no status-transition history, so we cannot report
		// resolved past outages or how long a current one has lasted. We DO know,
		// truthfully, which devices are down RIGHT NOW — report those as ongoing
		// outages with an unknown (null) start time and duration, rather than
		// inventing a start time or a demonstration device.
		outages := make([]map[string]interface{}, 0)
		for _, device := range devices {
			if device.Status == "down" {
				outages = append(outages, map[string]interface{}{
					"device_name": device.Hostname,
					"device_id":   device.ID,
					"start_time":  nil, // not tracked (no history store)
					"end_time":    nil,
					"duration":    nil,
					"status":      "ongoing",
				})
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"time_range":  timeRange,
			"start_time":  startTime.Format(time.RFC3339),
			"end_time":    now.Format(time.RFC3339),
			"outages":     outages,
			"total_count": len(outages),
			"note":        "Only currently-down devices are shown; outage history is not retained.",
		})
	}
}
