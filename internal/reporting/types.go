package reporting

import "time"

// ReportType defines the type of report to generate
type ReportType string

const (
	DeviceReport      ReportType = "devices"
	UptimeReport      ReportType = "uptime"
	AlertReport       ReportType = "alerts"
	PerformanceReport ReportType = "performance"
)

// ReportFormat defines the output format
type ReportFormat string

const (
	FormatCSV  ReportFormat = "csv"
	FormatJSON ReportFormat = "json"
	FormatPDF  ReportFormat = "pdf"
)

// ReportRequest contains parameters for generating a report
type ReportRequest struct {
	Type      ReportType
	Format    ReportFormat
	StartDate time.Time
	EndDate   time.Time
	DeviceID  string // Optional, for device-specific reports
}
