package reporting

import (
	"fmt"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/reporting/exporters"
	"gorm.io/gorm"
)

// Generator handles report generation
type Generator struct {
	db *gorm.DB
}

// NewGenerator creates a new report generator
func NewGenerator(db *gorm.DB) *Generator {
	return &Generator{db: db}
}

// GenerateDeviceReport generates a report of all devices
func (g *Generator) GenerateDeviceReport(format string, startDate, endDate time.Time) ([]byte, error) {
	var devices []models.Device

	query := g.db.Model(&models.Device{})

	// Filter by date range if provided
	if !startDate.IsZero() && !endDate.IsZero() {
		query = query.Where("created_at BETWEEN ? AND ?", startDate, endDate)
	}

	if err := query.Preload("SNMPTemplate").Find(&devices).Error; err != nil {
		return nil, fmt.Errorf("failed to fetch devices: %w", err)
	}

	// Convert to report data
	reportData := make([]exporters.DeviceReportData, 0, len(devices))
	for _, device := range devices {
		var uptimeHours float64
		if device.LastSeen != nil && !device.LastSeen.IsZero() {
			uptimeHours = time.Since(*device.LastSeen).Hours()
		}

		reportData = append(reportData, exporters.DeviceReportData{
			ID:          device.ID,
			Hostname:    device.Hostname,
			IPAddress:   device.IPAddress,
			MACAddress:  device.MACAddress,
			Vendor:      device.Vendor,
			DeviceType:  device.DeviceType,
			Location:    device.Location,
			Status:      device.Status,
			LastSeen:    device.LastSeen,
			NodeID:      device.NodeID,
			CreatedAt:   device.CreatedAt,
			UptimeHours: uptimeHours,
		})
	}

	// Export based on format
	switch format {
	case "csv":
		return exporters.ExportDevicesCSV(reportData)
	case "json":
		return exporters.ExportDevicesJSON(reportData)
	case "pdf":
		return exporters.ExportDevicesPDF(reportData, startDate, endDate)
	default:
		return nil, fmt.Errorf("unsupported format: %s", format)
	}
}

// GenerateUptimeReport generates uptime statistics for devices
func (g *Generator) GenerateUptimeReport(format string, deviceID string, startDate, endDate time.Time) ([]byte, error) {
	var devices []models.Device

	query := g.db.Model(&models.Device{})

	// Filter by device ID if provided
	if deviceID != "" {
		query = query.Where("id = ?", deviceID)
	}

	if err := query.Find(&devices).Error; err != nil {
		return nil, fmt.Errorf("failed to fetch devices: %w", err)
	}

	// Calculate uptime statistics
	reportData := make([]exporters.UptimeReportData, 0, len(devices))
	for _, device := range devices {
		// In a real implementation, you would query metrics from Prometheus or a time-series DB
		// For now, we'll create sample data based on device status
		uptimePercent := 0.0
		if device.Status == "up" {
			uptimePercent = 99.9
		} else if device.Status == "down" {
			uptimePercent = 0.0
		} else {
			uptimePercent = 50.0
		}

		period := fmt.Sprintf("%s to %s", startDate.Format("2006-01-02"), endDate.Format("2006-01-02"))
		if startDate.IsZero() || endDate.IsZero() {
			period = "Last 30 days"
		}

		reportData = append(reportData, exporters.UptimeReportData{
			DeviceID:      device.ID,
			Hostname:      device.Hostname,
			IPAddress:     device.IPAddress,
			TotalChecks:   1440, // Sample: 1 check per minute for a day
			SuccessChecks: int(1440 * uptimePercent / 100),
			FailedChecks:  1440 - int(1440*uptimePercent/100),
			UptimePercent: uptimePercent,
			AvgLatency:    25.5,
			MinLatency:    10.0,
			MaxLatency:    100.0,
			Period:        period,
		})
	}

	// Export based on format
	switch format {
	case "csv":
		return exporters.ExportUptimeCSV(reportData)
	case "json":
		return exporters.ExportUptimeJSON(reportData)
	case "pdf":
		return exporters.ExportUptimePDF(reportData, startDate, endDate)
	default:
		return nil, fmt.Errorf("unsupported format: %s", format)
	}
}

// GenerateAlertReport generates a report of alerts
func (g *Generator) GenerateAlertReport(format string, startDate, endDate time.Time) ([]byte, error) {
	var alerts []models.Alert

	query := g.db.Model(&models.Alert{}).Preload("Device")

	// Filter by date range if provided
	if !startDate.IsZero() && !endDate.IsZero() {
		query = query.Where("triggered_at BETWEEN ? AND ?", startDate, endDate)
	}

	if err := query.Order("triggered_at DESC").Find(&alerts).Error; err != nil {
		return nil, fmt.Errorf("failed to fetch alerts: %w", err)
	}

	// Convert to report data
	reportData := make([]exporters.AlertReportData, 0, len(alerts))
	for _, alert := range alerts {
		hostname := "Unknown"
		if alert.Device != nil {
			hostname = alert.Device.Hostname
		}

		duration := "N/A"
		if alert.ResolvedAt != nil {
			d := alert.ResolvedAt.Sub(alert.TriggeredAt)
			duration = formatDuration(d)
		} else if alert.Status == "active" {
			d := time.Since(alert.TriggeredAt)
			duration = formatDuration(d) + " (ongoing)"
		}

		reportData = append(reportData, exporters.AlertReportData{
			ID:          alert.ID,
			DeviceID:    alert.DeviceID,
			Hostname:    hostname,
			Severity:    alert.Severity,
			Status:      alert.Status,
			Title:       alert.Title,
			Message:     alert.Message,
			Source:      alert.Source,
			Metric:      alert.Metric,
			Value:       alert.Value,
			Threshold:   alert.Threshold,
			TriggeredAt: alert.TriggeredAt,
			AckedAt:     alert.AckedAt,
			ResolvedAt:  alert.ResolvedAt,
			Duration:    duration,
		})
	}

	// Export based on format
	switch format {
	case "csv":
		return exporters.ExportAlertsCSV(reportData)
	case "json":
		return exporters.ExportAlertsJSON(reportData)
	case "pdf":
		return exporters.ExportAlertsPDF(reportData, startDate, endDate)
	default:
		return nil, fmt.Errorf("unsupported format: %s", format)
	}
}

// GeneratePerformanceReport generates performance metrics report
func (g *Generator) GeneratePerformanceReport(format string, deviceID string, startDate, endDate time.Time) ([]byte, error) {
	// In a real implementation, this would query from Prometheus or time-series database
	// For now, we'll generate sample data

	var devices []models.Device
	query := g.db.Model(&models.Device{})

	if deviceID != "" {
		query = query.Where("id = ?", deviceID)
	}

	if err := query.Find(&devices).Error; err != nil {
		return nil, fmt.Errorf("failed to fetch devices: %w", err)
	}

	// Generate sample performance data
	reportData := make([]exporters.PerformanceReportData, 0)
	for _, device := range devices {
		// Sample metrics
		reportData = append(reportData, exporters.PerformanceReportData{
			DeviceID:     device.ID,
			Hostname:     device.Hostname,
			MetricName:   "Ping Latency",
			MetricValue:  25.5,
			MetricUnit:   "ms",
			Timestamp:    time.Now(),
			MinValue:     10.0,
			MaxValue:     100.0,
			AvgValue:     25.5,
			StdDeviation: 5.2,
		})

		if device.SNMPEnabled {
			reportData = append(reportData, exporters.PerformanceReportData{
				DeviceID:     device.ID,
				Hostname:     device.Hostname,
				MetricName:   "CPU Usage",
				MetricValue:  45.2,
				MetricUnit:   "%",
				Timestamp:    time.Now(),
				MinValue:     10.0,
				MaxValue:     85.0,
				AvgValue:     45.2,
				StdDeviation: 12.3,
			})
		}
	}

	// Export based on format
	switch format {
	case "csv":
		return exporters.ExportPerformanceCSV(reportData)
	case "json":
		return exporters.ExportPerformanceJSON(reportData)
	case "pdf":
		return exporters.ExportPerformancePDF(reportData, startDate, endDate)
	default:
		return nil, fmt.Errorf("unsupported format: %s", format)
	}
}

// formatDuration formats a duration as a human-readable string
func formatDuration(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	} else if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	} else if d < 24*time.Hour {
		return fmt.Sprintf("%dh %dm", int(d.Hours()), int(d.Minutes())%60)
	}
	days := int(d.Hours() / 24)
	hours := int(d.Hours()) % 24
	return fmt.Sprintf("%dd %dh", days, hours)
}
