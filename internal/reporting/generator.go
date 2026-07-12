package reporting

import (
	"fmt"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/reporting/exporters"
	"gorm.io/gorm"
)

// MetricsSource is the subset of the live metrics registry the report generator
// reads to fill uptime/latency columns with REAL measured values instead of
// hardcoded constants. It may be nil — device/alert reports do not need it, and
// unit tests can omit it — in which case metric-dependent reports return an
// explicit "no monitoring data yet" result rather than invented numbers.
type MetricsSource interface {
	// PingLatency is the most recent ICMP latency (ms) for a device.
	PingLatency(deviceID, ipAddress string) (float64, error)
	// PingCounts is the cumulative (success, failure) ping counts — the real
	// basis for availability%: success / (success + failure) * 100.
	PingCounts(deviceID, ipAddress string) (success, failure float64, err error)
}

// Generator handles report generation
type Generator struct {
	db      *gorm.DB
	metrics MetricsSource // may be nil (metrics-free reports / tests)
}

// NewGenerator creates a report generator with no metrics source. Suitable for
// the device and alert reports, which read only the database.
func NewGenerator(db *gorm.DB) *Generator {
	return &Generator{db: db}
}

// NewGeneratorWithMetrics creates a generator that fills the uptime and
// performance reports from the live metrics registry. Pass nil for metrics.
func NewGeneratorWithMetrics(db *gorm.DB, metrics MetricsSource) *Generator {
	return &Generator{db: db, metrics: metrics}
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

	// Fill each row from REAL metrics. Availability is the cumulative
	// success/total ping ratio; the latency columns come from the latest measured
	// sample. With no time-series store there is a single latest sample, so
	// min=max=avg=that sample and there is no historical spread — honest, not the
	// old hardcoded constants. A device with no real sample yet gets an explicit
	// "no data" row rather than an invented uptime.
	reportData := make([]exporters.UptimeReportData, 0, len(devices))
	for _, device := range devices {
		row := exporters.UptimeReportData{
			DeviceID:  device.ID,
			Hostname:  device.Hostname,
			IPAddress: device.IPAddress,
			Period:    "No monitoring data collected yet",
		}

		if g.metrics != nil {
			if success, failure, err := g.metrics.PingCounts(device.ID, device.IPAddress); err == nil {
				if total := success + failure; total > 0 {
					row.TotalChecks = int(total)
					row.SuccessChecks = int(success)
					row.FailedChecks = int(failure)
					row.UptimePercent = success / total * 100
					row.Period = "Live counters since server start"
					if !startDate.IsZero() && !endDate.IsZero() {
						row.Period = fmt.Sprintf("%s to %s requested; live counters since server start",
							startDate.Format("2006-01-02"), endDate.Format("2006-01-02"))
					}
				}
			}
			if lat, err := g.metrics.PingLatency(device.ID, device.IPAddress); err == nil {
				row.AvgLatency = lat
				row.MinLatency = lat
				row.MaxLatency = lat
			}
		}

		reportData = append(reportData, row)
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
	var devices []models.Device
	query := g.db.Model(&models.Device{})

	if deviceID != "" {
		query = query.Where("id = ?", deviceID)
	}

	if err := query.Find(&devices).Error; err != nil {
		return nil, fmt.Errorf("failed to fetch devices: %w", err)
	}

	// Emit a metric row only when there is a REAL measurement. With no
	// time-series store there is a single latest latency sample, so
	// min=max=avg=that sample and std-dev is 0 (one data point) — honest
	// single-sample values, not hardcoded constants. Devices with no real sample
	// yet (and SNMP-derived metrics we do not actually collect here) are omitted
	// rather than fabricated.
	reportData := make([]exporters.PerformanceReportData, 0)
	for _, device := range devices {
		if g.metrics == nil {
			continue
		}
		latency, err := g.metrics.PingLatency(device.ID, device.IPAddress)
		if err != nil {
			continue // no real sample — do not invent a row
		}
		reportData = append(reportData, exporters.PerformanceReportData{
			DeviceID:     device.ID,
			Hostname:     device.Hostname,
			MetricName:   "Ping Latency",
			MetricValue:  latency,
			MetricUnit:   "ms",
			Timestamp:    time.Now(),
			MinValue:     latency,
			MaxValue:     latency,
			AvgValue:     latency,
			StdDeviation: 0,
		})
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
