package exporters

import "time"

// DeviceReportData represents a row in the device report
type DeviceReportData struct {
	ID          string
	Hostname    string
	IPAddress   string
	MACAddress  string
	Vendor      string
	DeviceType  string
	Location    string
	Status      string
	LastSeen    *time.Time
	AgentID     string
	CreatedAt   time.Time
	UptimeHours float64
}

// UptimeReportData represents uptime statistics
type UptimeReportData struct {
	DeviceID      string
	Hostname      string
	IPAddress     string
	TotalChecks   int
	SuccessChecks int
	FailedChecks  int
	UptimePercent float64
	AvgLatency    float64
	MinLatency    float64
	MaxLatency    float64
	Period        string
}

// AlertReportData represents alert statistics
type AlertReportData struct {
	ID          string
	DeviceID    string
	Hostname    string
	Severity    string
	Status      string
	Title       string
	Message     string
	Source      string
	Metric      string
	Value       string
	Threshold   string
	TriggeredAt time.Time
	AckedAt     *time.Time
	ResolvedAt  *time.Time
	Duration    string
}

// PerformanceReportData represents performance metrics
type PerformanceReportData struct {
	DeviceID     string
	Hostname     string
	MetricName   string
	MetricValue  float64
	MetricUnit   string
	Timestamp    time.Time
	MinValue     float64
	MaxValue     float64
	AvgValue     float64
	StdDeviation float64
}
