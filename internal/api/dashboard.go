package api

import (
	"fmt"
	"net/http"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// renderCountTile runs a scoped GORM Count and writes the number as plain text.
// On a DB error it renders "—" (unknown) instead of "0": a monitoring dashboard
// that silently shows "0 down / 0 active alerts" precisely when its own
// datastore is failing would tell the operator all-clear during an outage. The
// error is logged so the failure is diagnosable.
func renderCountTile(c *gin.Context, query *gorm.DB, tile string) {
	var count int64
	if err := query.Count(&count).Error; err != nil {
		log.Error().Err(err).Str("tile", tile).Msg("Dashboard count query failed")
		c.String(http.StatusOK, "—")
		return
	}
	c.String(http.StatusOK, "%d", count)
}

// getDashboardDeviceCount returns the total device count as plain text,
// scoped to the caller's company.
func getDashboardDeviceCount(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		renderCountTile(c, scopeByCompany(c, srv.DB).Model(&models.Device{}), "device_count")
	}
}

// getDashboardDevicesUp returns the count of devices with status "up", scoped.
func getDashboardDevicesUp(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		renderCountTile(c, scopeByCompany(c, srv.DB).Model(&models.Device{}).Where("status = ?", "up"), "devices_up")
	}
}

// getDashboardDevicesDown returns the count of devices with status "down", scoped.
func getDashboardDevicesDown(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		renderCountTile(c, scopeByCompany(c, srv.DB).Model(&models.Device{}).Where("status = ?", "down"), "devices_down")
	}
}

// getDashboardActiveAlerts returns the count of active alerts, scoped.
func getDashboardActiveAlerts(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		renderCountTile(c, scopeByCompany(c, srv.DB).Model(&models.Alert{}).Where("status = ?", "active"), "active_alerts")
	}
}

// getDashboardRecentAlerts returns formatted HTML for recent alerts
func getDashboardRecentAlerts(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var alerts []models.Alert

		result := scopeByCompany(c, srv.DB).Preload("Device").
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
				hesc(alert.Title),
				hesc(alert.Message),
				hesc(hostname),
				alert.TriggeredAt.Format("2006-01-02 15:04"),
				severityColor,
				hesc(alert.Severity),
			)
		}

		c.Data(http.StatusOK, "text/html", []byte(html))
	}
}
