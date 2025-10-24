package exporters

import (
	"bytes"
	"fmt"
	"time"

	"github.com/jung-kurt/gofpdf"
)

// ExportDevicesPDF exports device data to PDF format
func ExportDevicesPDF(data []DeviceReportData, startDate, endDate time.Time) ([]byte, error) {
	pdf := gofpdf.New("L", "mm", "A4", "") // Landscape orientation
	pdf.AddPage()

	// Title
	pdf.SetFont("Arial", "B", 16)
	pdf.Cell(0, 10, "Device Report")
	pdf.Ln(12)

	// Report metadata
	pdf.SetFont("Arial", "", 10)
	pdf.Cell(0, 6, fmt.Sprintf("Generated: %s", time.Now().Format("2006-01-02 15:04:05")))
	pdf.Ln(6)
	if !startDate.IsZero() && !endDate.IsZero() {
		pdf.Cell(0, 6, fmt.Sprintf("Period: %s to %s", startDate.Format("2006-01-02"), endDate.Format("2006-01-02")))
		pdf.Ln(6)
	}
	pdf.Cell(0, 6, fmt.Sprintf("Total Devices: %d", len(data)))
	pdf.Ln(10)

	// Table header
	pdf.SetFont("Arial", "B", 8)
	pdf.SetFillColor(200, 220, 255)
	headers := []string{"Hostname", "IP Address", "Type", "Location", "Status", "Last Seen"}
	widths := []float64{50, 35, 30, 40, 25, 40}

	for i, header := range headers {
		pdf.CellFormat(widths[i], 7, header, "1", 0, "C", true, 0, "")
	}
	pdf.Ln(-1)

	// Table data
	pdf.SetFont("Arial", "", 7)
	for _, device := range data {
		lastSeen := "Never"
		if device.LastSeen != nil {
			lastSeen = device.LastSeen.Format("2006-01-02 15:04")
		}

		pdf.CellFormat(widths[0], 6, device.Hostname, "1", 0, "L", false, 0, "")
		pdf.CellFormat(widths[1], 6, device.IPAddress, "1", 0, "L", false, 0, "")
		pdf.CellFormat(widths[2], 6, device.DeviceType, "1", 0, "L", false, 0, "")
		pdf.CellFormat(widths[3], 6, device.Location, "1", 0, "L", false, 0, "")
		pdf.CellFormat(widths[4], 6, device.Status, "1", 0, "C", false, 0, "")
		pdf.CellFormat(widths[5], 6, lastSeen, "1", 0, "L", false, 0, "")
		pdf.Ln(-1)

		// Add new page if needed
		if pdf.GetY() > 180 {
			pdf.AddPage()
			// Reprint header
			pdf.SetFont("Arial", "B", 8)
			for i, header := range headers {
				pdf.CellFormat(widths[i], 7, header, "1", 0, "C", true, 0, "")
			}
			pdf.Ln(-1)
			pdf.SetFont("Arial", "", 7)
		}
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("failed to generate PDF: %w", err)
	}
	return buf.Bytes(), nil
}

// ExportUptimePDF exports uptime data to PDF format
func ExportUptimePDF(data []UptimeReportData, startDate, endDate time.Time) ([]byte, error) {
	pdf := gofpdf.New("L", "mm", "A4", "")
	pdf.AddPage()

	// Title
	pdf.SetFont("Arial", "B", 16)
	pdf.Cell(0, 10, "Uptime Report")
	pdf.Ln(12)

	// Report metadata
	pdf.SetFont("Arial", "", 10)
	pdf.Cell(0, 6, fmt.Sprintf("Generated: %s", time.Now().Format("2006-01-02 15:04:05")))
	pdf.Ln(6)
	if !startDate.IsZero() && !endDate.IsZero() {
		pdf.Cell(0, 6, fmt.Sprintf("Period: %s to %s", startDate.Format("2006-01-02"), endDate.Format("2006-01-02")))
		pdf.Ln(6)
	}
	pdf.Cell(0, 6, fmt.Sprintf("Total Devices: %d", len(data)))
	pdf.Ln(10)

	// Table header
	pdf.SetFont("Arial", "B", 8)
	pdf.SetFillColor(200, 220, 255)
	headers := []string{"Hostname", "IP Address", "Uptime %", "Success", "Failed", "Avg Latency"}
	widths := []float64{60, 40, 30, 30, 30, 30}

	for i, header := range headers {
		pdf.CellFormat(widths[i], 7, header, "1", 0, "C", true, 0, "")
	}
	pdf.Ln(-1)

	// Table data
	pdf.SetFont("Arial", "", 8)
	for _, uptime := range data {
		pdf.CellFormat(widths[0], 6, uptime.Hostname, "1", 0, "L", false, 0, "")
		pdf.CellFormat(widths[1], 6, uptime.IPAddress, "1", 0, "L", false, 0, "")
		pdf.CellFormat(widths[2], 6, fmt.Sprintf("%.2f%%", uptime.UptimePercent), "1", 0, "C", false, 0, "")
		pdf.CellFormat(widths[3], 6, fmt.Sprintf("%d", uptime.SuccessChecks), "1", 0, "C", false, 0, "")
		pdf.CellFormat(widths[4], 6, fmt.Sprintf("%d", uptime.FailedChecks), "1", 0, "C", false, 0, "")
		pdf.CellFormat(widths[5], 6, fmt.Sprintf("%.2f ms", uptime.AvgLatency), "1", 0, "C", false, 0, "")
		pdf.Ln(-1)

		if pdf.GetY() > 180 {
			pdf.AddPage()
			pdf.SetFont("Arial", "B", 8)
			for i, header := range headers {
				pdf.CellFormat(widths[i], 7, header, "1", 0, "C", true, 0, "")
			}
			pdf.Ln(-1)
			pdf.SetFont("Arial", "", 8)
		}
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("failed to generate PDF: %w", err)
	}
	return buf.Bytes(), nil
}

// ExportAlertsPDF exports alert data to PDF format
func ExportAlertsPDF(data []AlertReportData, startDate, endDate time.Time) ([]byte, error) {
	pdf := gofpdf.New("L", "mm", "A4", "")
	pdf.AddPage()

	// Title
	pdf.SetFont("Arial", "B", 16)
	pdf.Cell(0, 10, "Alert Report")
	pdf.Ln(12)

	// Report metadata
	pdf.SetFont("Arial", "", 10)
	pdf.Cell(0, 6, fmt.Sprintf("Generated: %s", time.Now().Format("2006-01-02 15:04:05")))
	pdf.Ln(6)
	if !startDate.IsZero() && !endDate.IsZero() {
		pdf.Cell(0, 6, fmt.Sprintf("Period: %s to %s", startDate.Format("2006-01-02"), endDate.Format("2006-01-02")))
		pdf.Ln(6)
	}

	// Calculate summary
	var criticalCount, warningCount, infoCount int
	for _, alert := range data {
		switch alert.Severity {
		case "critical":
			criticalCount++
		case "warning":
			warningCount++
		case "info":
			infoCount++
		}
	}

	pdf.Cell(0, 6, fmt.Sprintf("Total Alerts: %d (Critical: %d, Warning: %d, Info: %d)",
		len(data), criticalCount, warningCount, infoCount))
	pdf.Ln(10)

	// Table header
	pdf.SetFont("Arial", "B", 7)
	pdf.SetFillColor(200, 220, 255)
	headers := []string{"Hostname", "Severity", "Status", "Title", "Source", "Triggered At", "Duration"}
	widths := []float64{40, 25, 25, 60, 25, 40, 30}

	for i, header := range headers {
		pdf.CellFormat(widths[i], 7, header, "1", 0, "C", true, 0, "")
	}
	pdf.Ln(-1)

	// Table data
	pdf.SetFont("Arial", "", 6)
	for _, alert := range data {
		// Truncate title if too long
		title := alert.Title
		if len(title) > 50 {
			title = title[:47] + "..."
		}

		pdf.CellFormat(widths[0], 6, alert.Hostname, "1", 0, "L", false, 0, "")
		pdf.CellFormat(widths[1], 6, alert.Severity, "1", 0, "C", false, 0, "")
		pdf.CellFormat(widths[2], 6, alert.Status, "1", 0, "C", false, 0, "")
		pdf.CellFormat(widths[3], 6, title, "1", 0, "L", false, 0, "")
		pdf.CellFormat(widths[4], 6, alert.Source, "1", 0, "C", false, 0, "")
		pdf.CellFormat(widths[5], 6, alert.TriggeredAt.Format("2006-01-02 15:04"), "1", 0, "L", false, 0, "")
		pdf.CellFormat(widths[6], 6, alert.Duration, "1", 0, "C", false, 0, "")
		pdf.Ln(-1)

		if pdf.GetY() > 180 {
			pdf.AddPage()
			pdf.SetFont("Arial", "B", 7)
			for i, header := range headers {
				pdf.CellFormat(widths[i], 7, header, "1", 0, "C", true, 0, "")
			}
			pdf.Ln(-1)
			pdf.SetFont("Arial", "", 6)
		}
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("failed to generate PDF: %w", err)
	}
	return buf.Bytes(), nil
}

// ExportPerformancePDF exports performance data to PDF format
func ExportPerformancePDF(data []PerformanceReportData, startDate, endDate time.Time) ([]byte, error) {
	pdf := gofpdf.New("L", "mm", "A4", "")
	pdf.AddPage()

	// Title
	pdf.SetFont("Arial", "B", 16)
	pdf.Cell(0, 10, "Performance Report")
	pdf.Ln(12)

	// Report metadata
	pdf.SetFont("Arial", "", 10)
	pdf.Cell(0, 6, fmt.Sprintf("Generated: %s", time.Now().Format("2006-01-02 15:04:05")))
	pdf.Ln(6)
	if !startDate.IsZero() && !endDate.IsZero() {
		pdf.Cell(0, 6, fmt.Sprintf("Period: %s to %s", startDate.Format("2006-01-02"), endDate.Format("2006-01-02")))
		pdf.Ln(6)
	}
	pdf.Cell(0, 6, fmt.Sprintf("Total Metrics: %d", len(data)))
	pdf.Ln(10)

	// Table header
	pdf.SetFont("Arial", "B", 8)
	pdf.SetFillColor(200, 220, 255)
	headers := []string{"Hostname", "Metric", "Current", "Min", "Max", "Avg", "Std Dev"}
	widths := []float64{50, 50, 30, 30, 30, 30, 30}

	for i, header := range headers {
		pdf.CellFormat(widths[i], 7, header, "1", 0, "C", true, 0, "")
	}
	pdf.Ln(-1)

	// Table data
	pdf.SetFont("Arial", "", 7)
	for _, perf := range data {
		pdf.CellFormat(widths[0], 6, perf.Hostname, "1", 0, "L", false, 0, "")
		pdf.CellFormat(widths[1], 6, perf.MetricName, "1", 0, "L", false, 0, "")
		pdf.CellFormat(widths[2], 6, fmt.Sprintf("%.2f %s", perf.MetricValue, perf.MetricUnit), "1", 0, "C", false, 0, "")
		pdf.CellFormat(widths[3], 6, fmt.Sprintf("%.2f", perf.MinValue), "1", 0, "C", false, 0, "")
		pdf.CellFormat(widths[4], 6, fmt.Sprintf("%.2f", perf.MaxValue), "1", 0, "C", false, 0, "")
		pdf.CellFormat(widths[5], 6, fmt.Sprintf("%.2f", perf.AvgValue), "1", 0, "C", false, 0, "")
		pdf.CellFormat(widths[6], 6, fmt.Sprintf("%.2f", perf.StdDeviation), "1", 0, "C", false, 0, "")
		pdf.Ln(-1)

		if pdf.GetY() > 180 {
			pdf.AddPage()
			pdf.SetFont("Arial", "B", 8)
			for i, header := range headers {
				pdf.CellFormat(widths[i], 7, header, "1", 0, "C", true, 0, "")
			}
			pdf.Ln(-1)
			pdf.SetFont("Arial", "", 7)
		}
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("failed to generate PDF: %w", err)
	}
	return buf.Bytes(), nil
}
