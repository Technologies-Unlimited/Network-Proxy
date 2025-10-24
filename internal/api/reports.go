package api

import (
	"fmt"
	"net/http"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/reporting"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
)

// generateDeviceReport generates a device report
func generateDeviceReport(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		format := c.DefaultQuery("format", "json")
		startDateStr := c.Query("start")
		endDateStr := c.Query("end")

		// Parse dates
		var startDate, endDate time.Time
		var err error

		if startDateStr != "" {
			startDate, err = time.Parse("2006-01-02", startDateStr)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start date format, use YYYY-MM-DD"})
				return
			}
		}

		if endDateStr != "" {
			endDate, err = time.Parse("2006-01-02", endDateStr)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end date format, use YYYY-MM-DD"})
				return
			}
		}

		// Generate report
		generator := reporting.NewGenerator(srv.DB)
		data, err := generator.GenerateDeviceReport(format, startDate, endDate)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Set appropriate content type and filename
		filename := fmt.Sprintf("device-report-%s.%s", time.Now().Format("2006-01-02"), format)
		setResponseHeaders(c, format, filename)
		c.Data(http.StatusOK, getContentType(format), data)
	}
}

// generateUptimeReport generates an uptime report
func generateUptimeReport(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		format := c.DefaultQuery("format", "json")
		deviceID := c.Query("device_id")
		startDateStr := c.Query("start")
		endDateStr := c.Query("end")

		// Parse dates
		var startDate, endDate time.Time
		var err error

		if startDateStr != "" {
			startDate, err = time.Parse("2006-01-02", startDateStr)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start date format, use YYYY-MM-DD"})
				return
			}
		}

		if endDateStr != "" {
			endDate, err = time.Parse("2006-01-02", endDateStr)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end date format, use YYYY-MM-DD"})
				return
			}
		}

		// Generate report
		generator := reporting.NewGenerator(srv.DB)
		data, err := generator.GenerateUptimeReport(format, deviceID, startDate, endDate)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Set appropriate content type and filename
		filename := fmt.Sprintf("uptime-report-%s.%s", time.Now().Format("2006-01-02"), format)
		setResponseHeaders(c, format, filename)
		c.Data(http.StatusOK, getContentType(format), data)
	}
}

// generateAlertReport generates an alert report
func generateAlertReport(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		format := c.DefaultQuery("format", "json")
		startDateStr := c.Query("start")
		endDateStr := c.Query("end")

		// Parse dates
		var startDate, endDate time.Time
		var err error

		if startDateStr != "" {
			startDate, err = time.Parse("2006-01-02", startDateStr)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start date format, use YYYY-MM-DD"})
				return
			}
		}

		if endDateStr != "" {
			endDate, err = time.Parse("2006-01-02", endDateStr)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end date format, use YYYY-MM-DD"})
				return
			}
		}

		// Generate report
		generator := reporting.NewGenerator(srv.DB)
		data, err := generator.GenerateAlertReport(format, startDate, endDate)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Set appropriate content type and filename
		filename := fmt.Sprintf("alert-report-%s.%s", time.Now().Format("2006-01-02"), format)
		setResponseHeaders(c, format, filename)
		c.Data(http.StatusOK, getContentType(format), data)
	}
}

// generatePerformanceReport generates a performance report
func generatePerformanceReport(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		format := c.DefaultQuery("format", "json")
		deviceID := c.Query("device_id")
		startDateStr := c.Query("start")
		endDateStr := c.Query("end")

		// Parse dates
		var startDate, endDate time.Time
		var err error

		if startDateStr != "" {
			startDate, err = time.Parse("2006-01-02", startDateStr)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start date format, use YYYY-MM-DD"})
				return
			}
		}

		if endDateStr != "" {
			endDate, err = time.Parse("2006-01-02", endDateStr)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end date format, use YYYY-MM-DD"})
				return
			}
		}

		// Generate report
		generator := reporting.NewGenerator(srv.DB)
		data, err := generator.GeneratePerformanceReport(format, deviceID, startDate, endDate)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Set appropriate content type and filename
		filename := fmt.Sprintf("performance-report-%s.%s", time.Now().Format("2006-01-02"), format)
		setResponseHeaders(c, format, filename)
		c.Data(http.StatusOK, getContentType(format), data)
	}
}

// exportDevices exports device data in the specified format
func exportDevices(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		format := c.DefaultQuery("format", "csv")

		// Use a wide date range to get all devices
		startDate := time.Time{}
		endDate := time.Now()

		generator := reporting.NewGenerator(srv.DB)
		data, err := generator.GenerateDeviceReport(format, startDate, endDate)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		filename := fmt.Sprintf("devices-export-%s.%s", time.Now().Format("2006-01-02"), format)
		setResponseHeaders(c, format, filename)
		c.Data(http.StatusOK, getContentType(format), data)
	}
}

// exportMetrics exports performance metrics in the specified format
func exportMetrics(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		format := c.DefaultQuery("format", "json")
		deviceID := c.Query("device_id")

		// Use last 24 hours as default
		endDate := time.Now()
		startDate := endDate.Add(-24 * time.Hour)

		if startDateStr := c.Query("start"); startDateStr != "" {
			var err error
			startDate, err = time.Parse("2006-01-02", startDateStr)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start date format, use YYYY-MM-DD"})
				return
			}
		}

		if endDateStr := c.Query("end"); endDateStr != "" {
			var err error
			endDate, err = time.Parse("2006-01-02", endDateStr)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end date format, use YYYY-MM-DD"})
				return
			}
		}

		generator := reporting.NewGenerator(srv.DB)
		data, err := generator.GeneratePerformanceReport(format, deviceID, startDate, endDate)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		filename := fmt.Sprintf("metrics-export-%s.%s", time.Now().Format("2006-01-02"), format)
		setResponseHeaders(c, format, filename)
		c.Data(http.StatusOK, getContentType(format), data)
	}
}

// reportsPage serves the reports UI page
func reportsPage(c *gin.Context) {
	c.HTML(http.StatusOK, "reports.html", gin.H{
		"title": "Reports",
	})
}

// Helper functions

// getContentType returns the MIME type for the given format
func getContentType(format string) string {
	switch format {
	case "csv":
		return "text/csv"
	case "json":
		return "application/json"
	case "pdf":
		return "application/pdf"
	default:
		return "application/octet-stream"
	}
}

// setResponseHeaders sets appropriate response headers for file download
func setResponseHeaders(c *gin.Context, format, filename string) {
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	c.Header("Content-Type", getContentType(format))
	c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
	c.Header("Pragma", "no-cache")
	c.Header("Expires", "0")
}
