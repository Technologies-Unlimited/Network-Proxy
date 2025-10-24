package exporters

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"time"
)

// ExportDevicesCSV exports device data to CSV format
func ExportDevicesCSV(data []DeviceReportData) ([]byte, error) {
	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)

	// Write header
	header := []string{
		"ID", "Hostname", "IP Address", "MAC Address", "Vendor",
		"Device Type", "Location", "Status", "Last Seen", "Agent ID",
		"Created At", "Uptime Hours",
	}
	if err := writer.Write(header); err != nil {
		return nil, fmt.Errorf("failed to write CSV header: %w", err)
	}

	// Write data rows
	for _, device := range data {
		lastSeen := "Never"
		if device.LastSeen != nil {
			lastSeen = device.LastSeen.Format(time.RFC3339)
		}

		row := []string{
			device.ID,
			device.Hostname,
			device.IPAddress,
			device.MACAddress,
			device.Vendor,
			device.DeviceType,
			device.Location,
			device.Status,
			lastSeen,
			device.AgentID,
			device.CreatedAt.Format(time.RFC3339),
			fmt.Sprintf("%.2f", device.UptimeHours),
		}
		if err := writer.Write(row); err != nil {
			return nil, fmt.Errorf("failed to write CSV row: %w", err)
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, fmt.Errorf("CSV writer error: %w", err)
	}

	return buf.Bytes(), nil
}

// ExportUptimeCSV exports uptime data to CSV format
func ExportUptimeCSV(data []UptimeReportData) ([]byte, error) {
	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)

	// Write header
	header := []string{
		"Device ID", "Hostname", "IP Address", "Total Checks",
		"Success Checks", "Failed Checks", "Uptime %",
		"Avg Latency (ms)", "Min Latency (ms)", "Max Latency (ms)", "Period",
	}
	if err := writer.Write(header); err != nil {
		return nil, fmt.Errorf("failed to write CSV header: %w", err)
	}

	// Write data rows
	for _, uptime := range data {
		row := []string{
			uptime.DeviceID,
			uptime.Hostname,
			uptime.IPAddress,
			fmt.Sprintf("%d", uptime.TotalChecks),
			fmt.Sprintf("%d", uptime.SuccessChecks),
			fmt.Sprintf("%d", uptime.FailedChecks),
			fmt.Sprintf("%.2f", uptime.UptimePercent),
			fmt.Sprintf("%.2f", uptime.AvgLatency),
			fmt.Sprintf("%.2f", uptime.MinLatency),
			fmt.Sprintf("%.2f", uptime.MaxLatency),
			uptime.Period,
		}
		if err := writer.Write(row); err != nil {
			return nil, fmt.Errorf("failed to write CSV row: %w", err)
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, fmt.Errorf("CSV writer error: %w", err)
	}

	return buf.Bytes(), nil
}

// ExportAlertsCSV exports alert data to CSV format
func ExportAlertsCSV(data []AlertReportData) ([]byte, error) {
	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)

	// Write header
	header := []string{
		"ID", "Device ID", "Hostname", "Severity", "Status",
		"Title", "Message", "Source", "Metric", "Value",
		"Threshold", "Triggered At", "Acknowledged At", "Resolved At", "Duration",
	}
	if err := writer.Write(header); err != nil {
		return nil, fmt.Errorf("failed to write CSV header: %w", err)
	}

	// Write data rows
	for _, alert := range data {
		ackedAt := ""
		if alert.AckedAt != nil {
			ackedAt = alert.AckedAt.Format(time.RFC3339)
		}

		resolvedAt := ""
		if alert.ResolvedAt != nil {
			resolvedAt = alert.ResolvedAt.Format(time.RFC3339)
		}

		row := []string{
			alert.ID,
			alert.DeviceID,
			alert.Hostname,
			alert.Severity,
			alert.Status,
			alert.Title,
			alert.Message,
			alert.Source,
			alert.Metric,
			alert.Value,
			alert.Threshold,
			alert.TriggeredAt.Format(time.RFC3339),
			ackedAt,
			resolvedAt,
			alert.Duration,
		}
		if err := writer.Write(row); err != nil {
			return nil, fmt.Errorf("failed to write CSV row: %w", err)
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, fmt.Errorf("CSV writer error: %w", err)
	}

	return buf.Bytes(), nil
}

// ExportPerformanceCSV exports performance data to CSV format
func ExportPerformanceCSV(data []PerformanceReportData) ([]byte, error) {
	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)

	// Write header
	header := []string{
		"Device ID", "Hostname", "Metric Name", "Current Value",
		"Unit", "Min Value", "Max Value", "Avg Value",
		"Std Deviation", "Timestamp",
	}
	if err := writer.Write(header); err != nil {
		return nil, fmt.Errorf("failed to write CSV header: %w", err)
	}

	// Write data rows
	for _, perf := range data {
		row := []string{
			perf.DeviceID,
			perf.Hostname,
			perf.MetricName,
			fmt.Sprintf("%.2f", perf.MetricValue),
			perf.MetricUnit,
			fmt.Sprintf("%.2f", perf.MinValue),
			fmt.Sprintf("%.2f", perf.MaxValue),
			fmt.Sprintf("%.2f", perf.AvgValue),
			fmt.Sprintf("%.2f", perf.StdDeviation),
			perf.Timestamp.Format(time.RFC3339),
		}
		if err := writer.Write(row); err != nil {
			return nil, fmt.Errorf("failed to write CSV row: %w", err)
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, fmt.Errorf("CSV writer error: %w", err)
	}

	return buf.Bytes(), nil
}
