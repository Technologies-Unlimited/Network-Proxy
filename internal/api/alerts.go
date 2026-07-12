package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
)

// listAlerts returns alerts (paginated). Filter ?status=, paginate
// ?page=&page_size=.
func listAlerts(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit, offset := Page(c)
		var alerts []models.Alert

		// scopeByCompany applies the WHERE company_id = ? filter required
		// for tenant isolation. Without it, every operator saw every
		// other tenant's alerts.
		query := scopeByCompany(c, srv.DB).Preload("Device")
		if status := c.Query("status"); status != "" {
			query = query.Where("status = ?", status)
		}

		result := query.Order("triggered_at DESC").Limit(limit).Offset(offset).Find(&alerts)

		if result.Error != nil {
			c.Data(http.StatusOK, "text/html", []byte(`<p style="color: var(--danger);">Error loading alerts</p>`))
			return
		}

		if len(alerts) == 0 {
			c.Data(http.StatusOK, "text/html", []byte(`
				<div style="text-align: center; padding: 40px; color: var(--text-secondary);">
					<h3>No Alerts Found</h3>
					<p>Alerts will appear here when monitoring detects issues</p>
				</div>
			`))
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

			statusBadge := ""
			if alert.Status == "acknowledged" {
				statusBadge = `<span style="padding: 4px 8px; background: var(--warning); color: white; border-radius: 8px; font-size: 11px; margin-left: 10px;">ACKNOWLEDGED</span>`
			} else if alert.Status == "resolved" {
				statusBadge = `<span style="padding: 4px 8px; background: var(--success); color: white; border-radius: 8px; font-size: 11px; margin-left: 10px;">RESOLVED</span>`
			}

			// Acknowledge/Resolve controls. Without these the POST
			// /alerts/:id/{acknowledge,resolve} endpoints were unreachable from
			// the UI and an active alert could never be worked from the page.
			// alert.ID is embedded in a JS string literal, so JS-escape it.
			jsID := jsStringEscape(alert.ID)
			actions := ""
			if alert.Status == "active" {
				actions += `<button onclick="ackAlert('` + jsID + `')" class="btn btn-secondary" style="padding: 4px 10px; font-size: 12px;">Acknowledge</button>`
			}
			if alert.Status != "resolved" {
				actions += `<button onclick="resolveAlert('` + jsID + `')" class="btn btn-secondary" style="padding: 4px 10px; font-size: 12px; background: var(--success);">Resolve</button>`
			}
			actionRow := ""
			if actions != "" {
				actionRow = `<div style="display: flex; gap: 8px; margin-top: 10px;">` + actions + `</div>`
			}

			html += `<div style="padding: 15px; margin-bottom: 10px; background: var(--bg-secondary); border-left: 4px solid ` + severityColor + `; border-radius: 4px;">
				<div style="display: flex; justify-content: space-between; align-items: start;">
					<div style="flex: 1;">
						<h4 style="margin: 0 0 5px 0; color: ` + severityColor + `;">` + hesc(alert.Title) + statusBadge + `</h4>
						<p style="margin: 0 0 5px 0; color: var(--text-secondary); font-size: 14px;">` + hesc(alert.Message) + `</p>
						<p style="margin: 0; color: var(--text-secondary); font-size: 12px;">Device: ` + hesc(hostname) + ` | Triggered: ` + alert.TriggeredAt.Format("2006-01-02 15:04") + `</p>
					</div>
					<div style="display: flex; gap: 8px; margin-left: 10px;">
						<span style="padding: 4px 12px; background: ` + severityColor + `; color: white; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; white-space: nowrap;">` + hesc(alert.Severity) + `</span>
					</div>
				</div>
				` + actionRow + `
			</div>`
		}

		c.Data(http.StatusOK, "text/html", []byte(html))
	}
}

// getAlert returns a single alert
func getAlert(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var alert models.Alert

		result := srv.DB.Preload("Device").First(&alert, "id = ?", id)

		if result.Error != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Alert not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"alert": alert})
	}
}

// acknowledgeAlert marks an alert as acknowledged
func acknowledgeAlert(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var alert models.Alert

		if err := srv.DB.First(&alert, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Alert not found"})
			return
		}

		now := time.Now()
		alert.Status = "acknowledged"
		alert.AckedAt = &now

		// Get user ID from auth context
		userID := middleware.GetUserID(c)
		if userID != "" {
			alert.AckedBy = &userID
		}

		if err := srv.DB.Save(&alert).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"alert": alert})
	}
}

// resolveAlert marks an alert as resolved
func resolveAlert(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var alert models.Alert

		if err := srv.DB.First(&alert, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Alert not found"})
			return
		}

		now := time.Now()
		alert.Status = "resolved"
		alert.ResolvedAt = &now

		if err := srv.DB.Save(&alert).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"alert": alert})
	}
}

// listAlertRules returns alert rules (paginated, company-scoped) as the HTML
// table fragment.
func listAlertRules(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		writeAlertRuleListHTML(c, srv)
	}
}

// writeAlertRuleListHTML renders the company-scoped alert-rule table as an HTML
// fragment. Shared by the list endpoint AND the create/update form handlers so
// an htmx form swaps the freshly-updated table back into #rules-list.
func writeAlertRuleListHTML(c *gin.Context, srv *server.Server) {
	{
		limit, offset := Page(c)
		var rules []models.AlertRule
		result := scopeByCompany(c, srv.DB).Limit(limit).Offset(offset).Find(&rules)

		if result.Error != nil {
			c.Data(http.StatusOK, "text/html", []byte(`<p style="color: var(--danger);">Error loading alert rules</p>`))
			return
		}

		if len(rules) == 0 {
			c.Data(http.StatusOK, "text/html", []byte(`
				<div style="text-align: center; padding: 40px; color: var(--text-secondary);">
					<h3>No Alert Rules Configured</h3>
					<p>Click the Add Rule button above to create your first alert rule</p>
				</div>
			`))
			return
		}

		html := `<table style="width: 100%; border-collapse: collapse;">
			<thead>
				<tr style="border-bottom: 2px solid var(--border);">
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">Rule Name</th>
					<th style="padding: 12px; text-align: left; color: var(--text-secondary);">Metric</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Condition</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Threshold</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Severity</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Enabled</th>
					<th style="padding: 12px; text-align: center; color: var(--text-secondary);">Actions</th>
				</tr>
			</thead>
			<tbody>`

		for _, rule := range rules {
			severityColor := "var(--warning)"
			if rule.Severity == "critical" {
				severityColor = "var(--danger)"
			} else if rule.Severity == "info" {
				severityColor = "var(--success)"
			}

			enabledBadge := `<span style="padding: 4px 12px; background: var(--danger); color: white; border-radius: 12px; font-size: 12px;">DISABLED</span>`
			if rule.Enabled {
				enabledBadge = `<span style="padding: 4px 12px; background: var(--success); color: white; border-radius: 12px; font-size: 12px;">ENABLED</span>`
			}

			conditionSymbol := "="
			switch rule.Condition {
			case "gt":
				conditionSymbol = ">"
			case "lt":
				conditionSymbol = "<"
			case "ne":
				conditionSymbol = "≠"
			}

			// Rule fields and IDs are operator-controlled but still routed
			// through hesc; rule.Name is also embedded inside a JS string
			// literal for the delete confirm, so we additionally JS-escape
			// single-quote/backslash to keep it from breaking out.
			jsName := jsStringEscape(rule.Name)
			html += `
				<tr style="border-bottom: 1px solid var(--border);">
					<td style="padding: 12px; color: var(--text-primary);">` + hesc(rule.Name) + `</td>
					<td style="padding: 12px; color: var(--text-primary);">` + hesc(rule.Metric) + `</td>
					<td style="padding: 12px; text-align: center; color: var(--text-primary);">` + hesc(conditionSymbol) + `</td>
					<td style="padding: 12px; text-align: center; color: var(--text-primary);">` + hesc(rule.Threshold) + `</td>
					<td style="padding: 12px; text-align: center;">
						<span style="padding: 4px 12px; background: ` + severityColor + `; color: white; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase;">` + hesc(rule.Severity) + `</span>
					</td>
					<td style="padding: 12px; text-align: center;">` + enabledBadge + `</td>
					<td style="padding: 12px; text-align: center;">
						<button onclick="showEditRuleForm('` + hesc(rule.ID) + `')" class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; margin-right: 5px;">Edit</button>
						<button onclick="deleteRule('` + hesc(rule.ID) + `', '` + jsName + `')" class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; background: var(--danger);">Delete</button>
					</td>
				</tr>`
		}

		html += `</tbody></table>`

		c.Data(http.StatusOK, "text/html", []byte(html))
	}
}

// sourceForMetric derives the collector Source (icmp/snmp) a rule evaluates
// against from its Metric. The add/edit forms don't ask for Source, but the
// alert engine needs it or the rule never evaluates — so we infer it rather
// than persist an empty, dead rule.
func sourceForMetric(metric string) string {
	if strings.HasPrefix(strings.ToLower(metric), "snmp") {
		return "snmp"
	}
	return "icmp"
}

// applyAlertRuleForm populates an (existing or zero) AlertRule from an
// x-www-form-urlencoded submission — the fields alerts.html actually sends.
func applyAlertRuleForm(c *gin.Context, rule *models.AlertRule) {
	rule.Name = strings.TrimSpace(c.PostForm("name"))
	rule.Severity = c.PostForm("severity")
	rule.Metric = c.PostForm("metric")
	rule.Condition = c.PostForm("condition")
	rule.Threshold = strings.TrimSpace(c.PostForm("threshold"))
	rule.Duration = formInt(c.PostForm("duration"), 300)
	rule.Source = sourceForMetric(rule.Metric)
}

// createAlertRule creates a new alert rule. Serves both the JSON API and the
// htmx add-rule form (url-encoded -> refreshed #rules-list HTML fragment).
func createAlertRule(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		// htmx / browser form submission.
		if !isJSONRequest(c) {
			var rule models.AlertRule
			applyAlertRuleForm(c, &rule)
			if rule.Name == "" || rule.Threshold == "" {
				c.Data(http.StatusOK, "text/html",
					[]byte(`<p style="color: var(--danger);">Rule Name and Threshold are required.</p>`))
				return
			}
			// The add-rule form has no enable toggle; new rules start enabled.
			rule.Enabled = true
			rule.CompanyID = companyIDForWrite(c, "")
			if err := srv.DB.Create(&rule).Error; err != nil {
				c.Data(http.StatusOK, "text/html",
					[]byte(`<p style="color: var(--danger);">Error creating alert rule</p>`))
				return
			}
			writeAlertRuleListHTML(c, srv)
			return
		}

		// JSON API client.
		var rule models.AlertRule
		if err := c.ShouldBindJSON(&rule); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Stamp the authenticated tenant so the rule is owned by the caller's
		// company (and visible to company-scoped reads); never trust a
		// client-asserted CompanyID in the body.
		rule.CompanyID = companyIDForWrite(c, rule.CompanyID)

		if err := srv.DB.Create(&rule).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"rule": rule})
	}
}

// getAlertRule returns a single alert rule
func getAlertRule(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var rule models.AlertRule

		if err := srv.DB.First(&rule, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Alert rule not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"rule": rule})
	}
}

// updateAlertRule updates an existing alert rule. Serves both the JSON API and
// the htmx edit-rule form (url-encoded -> refreshed #rules-list HTML fragment).
func updateAlertRule(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var rule models.AlertRule

		if err := srv.DB.First(&rule, "id = ?", id).Error; err != nil {
			if !isJSONRequest(c) {
				c.Data(http.StatusOK, "text/html",
					[]byte(`<p style="color: var(--danger);">Alert rule not found</p>`))
				return
			}
			c.JSON(http.StatusNotFound, gin.H{"error": "Alert rule not found"})
			return
		}

		// htmx / browser form submission.
		if !isJSONRequest(c) {
			applyAlertRuleForm(c, &rule)
			if rule.Name == "" || rule.Threshold == "" {
				c.Data(http.StatusOK, "text/html",
					[]byte(`<p style="color: var(--danger);">Rule Name and Threshold are required.</p>`))
				return
			}
			// The edit form has an enable checkbox; an absent value means off.
			rule.Enabled = c.PostForm("enabled") != ""
			if err := srv.DB.Save(&rule).Error; err != nil {
				c.Data(http.StatusOK, "text/html",
					[]byte(`<p style="color: var(--danger);">Error saving alert rule</p>`))
				return
			}
			writeAlertRuleListHTML(c, srv)
			return
		}

		// JSON API client.
		if err := c.ShouldBindJSON(&rule); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if err := srv.DB.Save(&rule).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"rule": rule})
	}
}

// deleteAlertRule deletes an alert rule
func deleteAlertRule(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var rule models.AlertRule

		if err := srv.DB.First(&rule, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Alert rule not found"})
			return
		}

		if err := srv.DB.Delete(&rule).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Alert rule deleted successfully"})
	}
}
