package exporters

import (
	"encoding/json"
	"fmt"
)

// ExportDevicesJSON exports device data to JSON format
func ExportDevicesJSON(data []DeviceReportData) ([]byte, error) {
	result := map[string]interface{}{
		"report_type": "devices",
		"total_count": len(data),
		"devices":     data,
	}

	jsonData, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("failed to marshal JSON: %w", err)
	}

	return jsonData, nil
}

// ExportUptimeJSON exports uptime data to JSON format
func ExportUptimeJSON(data []UptimeReportData) ([]byte, error) {
	result := map[string]interface{}{
		"report_type": "uptime",
		"total_count": len(data),
		"uptime_data": data,
	}

	jsonData, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("failed to marshal JSON: %w", err)
	}

	return jsonData, nil
}

// ExportAlertsJSON exports alert data to JSON format
func ExportAlertsJSON(data []AlertReportData) ([]byte, error) {
	// Calculate summary statistics
	var criticalCount, warningCount, infoCount int
	var activeCount, acknowledgedCount, resolvedCount int

	for _, alert := range data {
		switch alert.Severity {
		case "critical":
			criticalCount++
		case "warning":
			warningCount++
		case "info":
			infoCount++
		}

		switch alert.Status {
		case "active":
			activeCount++
		case "acknowledged":
			acknowledgedCount++
		case "resolved":
			resolvedCount++
		}
	}

	result := map[string]interface{}{
		"report_type": "alerts",
		"total_count": len(data),
		"summary": map[string]interface{}{
			"by_severity": map[string]int{
				"critical": criticalCount,
				"warning":  warningCount,
				"info":     infoCount,
			},
			"by_status": map[string]int{
				"active":       activeCount,
				"acknowledged": acknowledgedCount,
				"resolved":     resolvedCount,
			},
		},
		"alerts": data,
	}

	jsonData, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("failed to marshal JSON: %w", err)
	}

	return jsonData, nil
}

// ExportPerformanceJSON exports performance data to JSON format
func ExportPerformanceJSON(data []PerformanceReportData) ([]byte, error) {
	// Group metrics by device
	deviceMetrics := make(map[string][]PerformanceReportData)
	for _, perf := range data {
		deviceMetrics[perf.DeviceID] = append(deviceMetrics[perf.DeviceID], perf)
	}

	result := map[string]interface{}{
		"report_type":    "performance",
		"total_metrics":  len(data),
		"device_count":   len(deviceMetrics),
		"metrics":        data,
		"by_device":      deviceMetrics,
	}

	jsonData, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("failed to marshal JSON: %w", err)
	}

	return jsonData, nil
}
