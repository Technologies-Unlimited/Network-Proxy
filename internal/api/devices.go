package api

import (
	"net/http"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
)

// listDevices returns devices (paginated).
func listDevices(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit, offset := Page(c)
		var devices []models.Device

		// Tenant scoping: in standalone mode this is a no-op; otherwise
		// the result is filtered to the caller's CompanyID.
		result := scopeByCompany(c, srv.DB).Preload("SNMPTemplate").
			Limit(limit).Offset(offset).Find(&devices)

		if result.Error != nil {
			c.Data(http.StatusOK, "text/html", []byte(`<p style="color: var(--danger);">Error loading devices</p>`))
			return
		}

		if len(devices) == 0 {
			c.Data(http.StatusOK, "text/html", []byte(`
				<div style="text-align: center; padding: 40px; color: var(--text-secondary);">
					<h3>No Devices Found</h3>
					<p>Click the Add Device button above to add your first device</p>
				</div>
			`))
			return
		}

		// Build HTML table
		html := `
		<table style="width: 100%; border-collapse: collapse;">
			<thead>
				<tr style="border-bottom: 2px solid var(--border);">
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">Hostname</th>
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">IP Address / FQDN</th>
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">Type</th>
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">Location</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Status</th>
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">Last Seen</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Actions</th>
				</tr>
			</thead>
			<tbody>`

		for _, device := range devices {
			statusColor := "var(--text-secondary)"
			statusText := device.Status
			if device.Status == "up" {
				statusColor = "var(--success)"
			} else if device.Status == "down" {
				statusColor = "var(--danger)"
			}

			lastSeen := "Never"
			if device.LastSeen != nil {
				lastSeen = device.LastSeen.Format("2006-01-02 15:04")
			}

			// Escape all user-provided data to prevent XSS. Use the package
			// helpers so every emit site shares one escaping policy.
			safeHostname := hesc(device.Hostname)
			safeIPAddress := hesc(device.IPAddress)
			safeDeviceType := hesc(device.DeviceType)
			safeLocation := hesc(device.Location)
			safeStatus := hesc(statusText)
			safeID := hesc(device.ID)
			// JS string contexts need stricter escaping than HTML; e.g.
			// hostname `O'Brien` would break out of a single-quoted JS arg
			// even after HTML-escaping.
			jsID := jsStringEscape(device.ID)
			jsHostname := jsStringEscape(device.Hostname)

			html += `
				<tr style="border-bottom: 1px solid var(--border);">
					<td style="padding: 12px; color: var(--text-primary);">` + safeHostname + `</td>
					<td style="padding: 12px; color: var(--text-primary);">` + safeIPAddress + `</td>
					<td style="padding: 12px; color: var(--text-primary);">` + safeDeviceType + `</td>
					<td style="padding: 12px; color: var(--text-primary);">` + safeLocation + `</td>
					<td style="padding: 12px; text-align: center;">
						<span style="padding: 4px 12px; background: ` + statusColor + `; color: white; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase;">` + safeStatus + `</span>
					</td>
					<td style="padding: 12px; color: var(--text-secondary);">` + lastSeen + `</td>
					<td style="padding: 12px; text-align: center;">
						<a href="/visualize?device=` + safeID + `" class="btn btn-primary" style="padding: 4px 8px; font-size: 12px; margin-right: 5px; text-decoration: none;">View</a>
						<button onclick="showEditDeviceForm('` + jsID + `')" class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; margin-right: 5px;">Edit</button>
						<button onclick="deleteDevice('` + jsID + `', '` + jsHostname + `')" class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; background: var(--danger);">Delete</button>
					</td>
				</tr>`
		}

		html += `
			</tbody>
		</table>`

		c.Data(http.StatusOK, "text/html", []byte(html))
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

		// Start polling immediately (fixes the "first-run path polls nothing"
		// gap where a device was only monitored after a process restart).
		wireDeviceIntoCollectors(srv.DB, &device)

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

		// Re-wire the live collectors to reflect the edit: drop the old
		// registration and re-add per the (possibly changed) enabled protocols,
		// interval, or SNMP template. Without this a UI edit only took effect
		// after a restart.
		unwireDeviceFromCollectors(device.ID)
		wireDeviceIntoCollectors(srv.DB, &device)

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

		// Stop polling the deleted device on the live collectors immediately.
		unwireDeviceFromCollectors(id)

		c.JSON(http.StatusOK, gin.H{"message": "Device deleted successfully"})
	}
}
