package api

import (
	"fmt"
	"net/http"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
)

// getDashboardDeviceCount returns the total device count as plain text
func getDashboardDeviceCount(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var count int64
		srv.DB.Model(&models.Device{}).Count(&count)
		c.String(http.StatusOK, "%d", count)
	}
}

// getDashboardDevicesUp returns the count of devices with status "up"
func getDashboardDevicesUp(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var count int64
		srv.DB.Model(&models.Device{}).Where("status = ?", "up").Count(&count)
		c.String(http.StatusOK, "%d", count)
	}
}

// getDashboardDevicesDown returns the count of devices with status "down"
func getDashboardDevicesDown(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var count int64
		srv.DB.Model(&models.Device{}).Where("status = ?", "down").Count(&count)
		c.String(http.StatusOK, "%d", count)
	}
}

// getDashboardActiveAlerts returns the count of active alerts
func getDashboardActiveAlerts(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var count int64
		srv.DB.Model(&models.Alert{}).Where("status = ?", "active").Count(&count)
		c.String(http.StatusOK, "%d", count)
	}
}

// getDashboardRecentAlerts returns formatted HTML for recent alerts
func getDashboardRecentAlerts(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var alerts []models.Alert

		result := srv.DB.Preload("Device").
			Where("status = ?", "active").
			Order("triggered_at DESC").
			Limit(5).
			Find(&alerts)

		if result.Error != nil {
			c.Data(http.StatusOK, "text/html", []byte(`<p style="color: var(--danger);">Error loading alerts</p>`))
			return
		}

		if len(alerts) == 0 {
			c.Data(http.StatusOK, "text/html", []byte(`<p style="color: var(--text-secondary);">No active alerts</p>`))
			return
		}

		html := ""
		for _, alert := range alerts {
			severityColor := "var(--warning)"
			if alert.Severity == "critical" {
				severityColor = "var(--danger)"
			} else if alert.Severity == "info" {
				severityColor = "var(--success)"
			}

			hostname := "Unknown"
			if alert.Device != nil {
				hostname = alert.Device.Hostname
			}

			html += fmt.Sprintf(`<div style="padding: 15px; margin-bottom: 10px; background: var(--bg-secondary); border-left: 4px solid %s; border-radius: 4px;">
				<div style="display: flex; justify-content: space-between; align-items: start;">
					<div style="flex: 1;">
						<h4 style="margin: 0 0 5px 0; color: %s;">%s</h4>
						<p style="margin: 0 0 5px 0; color: var(--text-secondary); font-size: 14px;">%s</p>
						<p style="margin: 0; color: var(--text-secondary); font-size: 12px;">Device: %s | Triggered: %s</p>
					</div>
					<span style="padding: 4px 12px; background: %s; color: white; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; white-space: nowrap; margin-left: 10px;">%s</span>
				</div>
			</div>`,
				severityColor,
				severityColor,
				alert.Title,
				alert.Message,
				hostname,
				alert.TriggeredAt.Format("2006-01-02 15:04"),
				severityColor,
				alert.Severity,
			)
		}

		c.Data(http.StatusOK, "text/html", []byte(html))
	}
}
