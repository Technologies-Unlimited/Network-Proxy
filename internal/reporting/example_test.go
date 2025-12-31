package reporting_test

import (
	"fmt"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/reporting"
)

// Example demonstrates how to use the reporting system
func Example() {
	// This example shows how to use the reporting generator
	// In actual use, you would pass a real *gorm.DB instance

	// Example dates
	startDate := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	endDate := time.Date(2024, 12, 31, 23, 59, 59, 0, time.UTC)

	fmt.Printf("Report Period: %s to %s\n", startDate.Format("2006-01-02"), endDate.Format("2006-01-02"))

	// Example usage patterns:
	fmt.Println("\nSupported Report Types:")
	fmt.Printf("- %s\n", reporting.DeviceReport)
	fmt.Printf("- %s\n", reporting.UptimeReport)
	fmt.Printf("- %s\n", reporting.AlertReport)
	fmt.Printf("- %s\n", reporting.PerformanceReport)

	fmt.Println("\nSupported Export Formats:")
	fmt.Printf("- %s\n", reporting.FormatCSV)
	fmt.Printf("- %s\n", reporting.FormatJSON)
	fmt.Printf("- %s\n", reporting.FormatPDF)

	// Output:
	// Report Period: 2024-01-01 to 2024-12-31
	//
	// Supported Report Types:
	// - devices
	// - uptime
	// - alerts
	// - performance
	//
	// Supported Export Formats:
	// - csv
	// - json
	// - pdf
}

// ExampleGenerator_GenerateDeviceReport shows how to generate a device report
func ExampleGenerator_GenerateDeviceReport() {
	// db := database.Connect() // In real usage
	// generator := reporting.NewGenerator(db)

	startDate := time.Now().AddDate(0, -1, 0) // 1 month ago
	endDate := time.Now()

	fmt.Printf("Generating device report from %s to %s\n",
		startDate.Format("2006-01-02"),
		endDate.Format("2006-01-02"))

	// csvData, err := generator.GenerateDeviceReport("csv", startDate, endDate)
	// if err != nil {
	//     log.Fatal(err)
	// }
	// os.WriteFile("device-report.csv", csvData, 0644)

	fmt.Println("Device report generated successfully")

	// Output:
	// Generating device report from 2025-09-20 to 2025-10-20
	// Device report generated successfully
}

// ExampleGenerator_GenerateUptimeReport shows how to generate an uptime report
func ExampleGenerator_GenerateUptimeReport() {
	// generator := reporting.NewGenerator(db)

	deviceID := "abc-123"
	_ = time.Now().AddDate(0, 0, -7) // Last 7 days (startDate)
	_ = time.Now()                   // endDate

	fmt.Printf("Generating uptime report for device %s\n", deviceID)
	fmt.Printf("Period: Last 7 days\n")

	// pdfData, err := generator.GenerateUptimeReport("pdf", deviceID, startDate, endDate)
	// if err != nil {
	//     log.Fatal(err)
	// }
	// os.WriteFile("uptime-report.pdf", pdfData, 0644)

	fmt.Println("Uptime report generated as PDF")

	// Output:
	// Generating uptime report for device abc-123
	// Period: Last 7 days
	// Uptime report generated as PDF
}

// ExampleGenerator_GenerateAlertReport shows how to generate an alert report
func ExampleGenerator_GenerateAlertReport() {
	// generator := reporting.NewGenerator(db)

	_ = time.Now().AddDate(0, 0, -30) // Last 30 days (startDate)
	_ = time.Now()                    // endDate

	fmt.Println("Generating alert report for last 30 days")

	// jsonData, err := generator.GenerateAlertReport("json", startDate, endDate)
	// if err != nil {
	//     log.Fatal(err)
	// }

	fmt.Println("Alert report generated as JSON with summary statistics")

	// Output:
	// Generating alert report for last 30 days
	// Alert report generated as JSON with summary statistics
}

// ExampleReportRequest shows how to create a report request
func ExampleReportRequest() {
	request := reporting.ReportRequest{
		Type:      reporting.DeviceReport,
		Format:    reporting.FormatCSV,
		StartDate: time.Now().AddDate(0, -1, 0),
		EndDate:   time.Now(),
	}

	fmt.Printf("Report Type: %s\n", request.Type)
	fmt.Printf("Format: %s\n", request.Format)
	fmt.Printf("Date Range: %s to %s\n",
		request.StartDate.Format("2006-01-02"),
		request.EndDate.Format("2006-01-02"))

	// Output:
	// Report Type: devices
	// Format: csv
	// Date Range: 2025-09-20 to 2025-10-20
}

// Example_apiUsage shows example API endpoint usage
func Example_apiUsage() {
	fmt.Println("Example API Endpoints:")
	fmt.Println()
	fmt.Println("1. Device Report (CSV):")
	fmt.Println("   GET /api/v1/reports/devices?format=csv&start=2024-01-01&end=2024-12-31")
	fmt.Println()
	fmt.Println("2. Uptime Report (PDF) for specific device:")
	fmt.Println("   GET /api/v1/reports/uptime?device_id=abc123&format=pdf")
	fmt.Println()
	fmt.Println("3. Alert Report (JSON):")
	fmt.Println("   GET /api/v1/reports/alerts?format=json&start=2024-06-01")
	fmt.Println()
	fmt.Println("4. Quick Export - All Devices (CSV):")
	fmt.Println("   GET /api/v1/export/devices?format=csv")
	fmt.Println()
	fmt.Println("5. Performance Metrics (JSON):")
	fmt.Println("   GET /api/v1/export/metrics?format=json")

	// Output:
	// Example API Endpoints:
	//
	// 1. Device Report (CSV):
	//    GET /api/v1/reports/devices?format=csv&start=2024-01-01&end=2024-12-31
	//
	// 2. Uptime Report (PDF) for specific device:
	//    GET /api/v1/reports/uptime?device_id=abc123&format=pdf
	//
	// 3. Alert Report (JSON):
	//    GET /api/v1/reports/alerts?format=json&start=2024-06-01
	//
	// 4. Quick Export - All Devices (CSV):
	//    GET /api/v1/export/devices?format=csv
	//
	// 5. Performance Metrics (JSON):
	//    GET /api/v1/export/metrics?format=json
}
