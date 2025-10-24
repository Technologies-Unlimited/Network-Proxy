# Network Monitor Reporting System

This package provides comprehensive reporting and export functionality for the Network Monitor application.

## Features

- Multiple report types (Devices, Uptime, Alerts, Performance)
- Multiple export formats (CSV, JSON, PDF)
- RESTful API endpoints
- Interactive web UI
- Date range filtering
- Device-specific reports

## Directory Structure

```
internal/reporting/
├── generator.go           # Core report generation logic
├── types.go              # Report types and data structures
├── exporters/
│   ├── csv.go           # CSV export functionality
│   ├── json.go          # JSON export with summaries
│   └── pdf.go           # PDF generation with gofpdf
└── README.md            # This file
```

## Report Types

### 1. Device Report
Comprehensive inventory of all monitored devices.

**Data includes:**
- Device ID, Hostname, IP/MAC addresses
- Device type, vendor, location
- Current status and last seen timestamp
- Agent assignment
- Uptime statistics

### 2. Uptime Report
Availability and uptime statistics for devices.

**Data includes:**
- Total checks (success/failed)
- Uptime percentage
- Latency statistics (min/max/avg)
- Time period coverage

### 3. Alert Report
Historical alert data with severity and resolution information.

**Data includes:**
- Alert details (severity, status, title, message)
- Source and metric information
- Timestamps (triggered, acknowledged, resolved)
- Duration calculation
- Summary statistics by severity and status

### 4. Performance Report
Performance metrics including latency, CPU, memory, and SNMP data.

**Data includes:**
- Metric values with units
- Statistical aggregations (min/max/avg/stddev)
- Device grouping
- Time-series data points

## API Endpoints

### Report Generation
All reports support query parameters for filtering:
- `format` - Output format: csv, json, or pdf (default: json)
- `start` - Start date in YYYY-MM-DD format
- `end` - End date in YYYY-MM-DD format
- `device_id` - Device ID (for uptime and performance reports)

```
GET /api/v1/reports/devices?format=csv&start=2024-01-01&end=2024-12-31
GET /api/v1/reports/uptime?device_id=abc123&format=pdf
GET /api/v1/reports/alerts?format=json&start=2024-06-01
GET /api/v1/reports/performance?device_id=abc123&format=csv
```

### Quick Export
Simplified endpoints for common export scenarios:

```
GET /api/v1/export/devices?format=csv
GET /api/v1/export/metrics?format=json
```

### Web UI
```
GET /reports - Interactive reports page
```

## Usage Examples

### Programmatic Usage

```go
package main

import (
    "time"
    "github.com/Technologies-Unlimited/Network-Proxy/internal/reporting"
    "gorm.io/gorm"
)

func generateReport(db *gorm.DB) {
    generator := reporting.NewGenerator(db)

    startDate := time.Now().AddDate(0, -1, 0) // 1 month ago
    endDate := time.Now()

    // Generate CSV report
    csvData, err := generator.GenerateDeviceReport("csv", startDate, endDate)
    if err != nil {
        panic(err)
    }

    // Generate PDF report
    pdfData, err := generator.GenerateAlertReport("pdf", startDate, endDate)
    if err != nil {
        panic(err)
    }
}
```

### API Usage

```bash
# Download device report as CSV
curl "http://localhost:8080/api/v1/reports/devices?format=csv&start=2024-01-01&end=2024-12-31" \
  -o device-report.csv

# Get uptime report as JSON
curl "http://localhost:8080/api/v1/reports/uptime?device_id=abc123&format=json" \
  -o uptime-report.json

# Download alert report as PDF
curl "http://localhost:8080/api/v1/reports/alerts?format=pdf&start=2024-06-01" \
  -o alert-report.pdf

# Quick export all devices
curl "http://localhost:8080/api/v1/export/devices?format=csv" \
  -o all-devices.csv
```

## Export Formats

### CSV
- Standard comma-separated values
- Headers included
- UTF-8 encoding
- Compatible with Excel, Google Sheets, etc.

### JSON
- Pretty-printed with 2-space indentation
- Includes metadata and summaries
- Total count and statistics
- Easy to parse programmatically

### PDF
- Professional landscape layout (A4)
- Formatted tables with headers
- Automatic pagination
- Report metadata (generation date, date range, record count)
- Color-coded headers
- Summary information where applicable

## Response Headers

All export endpoints set appropriate headers for file downloads:

```
Content-Type: text/csv | application/json | application/pdf
Content-Disposition: attachment; filename=report-name-YYYY-MM-DD.format
Cache-Control: no-cache, no-store, must-revalidate
```

## Dependencies

- **github.com/jung-kurt/gofpdf** - PDF generation
- **encoding/csv** - CSV export (standard library)
- **encoding/json** - JSON export (standard library)
- **gorm.io/gorm** - Database queries

## Web UI Features

The `/reports` page provides:

1. **Quick Export Section**
   - One-click exports for common scenarios
   - No date filtering required

2. **Report Type Selection**
   - Visual cards for each report type
   - Description of what each report contains

3. **Configuration Form**
   - Date range picker (defaults to last 30 days)
   - Device ID filter (for applicable reports)
   - Format selection buttons (CSV/JSON/PDF)

4. **Live Preview**
   - JSON preview of first 10 records
   - Summary statistics
   - Auto-refresh on parameter changes

## Implementation Notes

### Performance Metrics
Currently uses sample data. In production, integrate with:
- Prometheus for time-series metrics
- Custom metrics storage
- SNMP polling results

### Date Handling
- All dates use YYYY-MM-DD format
- Times are stored in RFC3339 format
- Timezone-aware processing
- Empty dates return all records

### Error Handling
- Invalid date formats return 400 Bad Request
- Database errors return 500 Internal Server Error
- Missing devices return empty result sets
- Unsupported formats return error messages

## Future Enhancements

- [ ] Scheduled report generation
- [ ] Email delivery of reports
- [ ] Custom report templates
- [ ] Excel (.xlsx) export format
- [ ] Chart/graph generation
- [ ] Report caching
- [ ] Webhook notifications
- [ ] Custom date range presets
- [ ] Report scheduling UI
- [ ] Historical report archive

## License

Part of the Network Monitor project.
