package alerting

import (
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
)

// ExampleAlertRules returns a set of common alert rule examples
func ExampleAlertRules() []*models.AlertRule {
	return []*models.AlertRule{
		// Device Down Alert
		{
			Name:        "Device Unreachable",
			Description: "Triggers when a device becomes unreachable for more than 3 minutes",
			Enabled:     true,
			Severity:    "critical",
			Source:      "icmp",
			Metric:      "device_status",
			Condition:   "eq",
			Threshold:   "down",
			Duration:    180, // 3 minutes
			NotifyEmail: true,
		},

		// High Latency Warning
		{
			Name:        "High Ping Latency",
			Description: "Triggers when ping latency exceeds 100ms for 5 minutes",
			Enabled:     true,
			Severity:    "warning",
			Source:      "icmp",
			Metric:      "ping_latency",
			Condition:   "gt",
			Threshold:   "100",
			Duration:    300, // 5 minutes
			NotifyEmail: true,
		},

		// Critical Latency
		{
			Name:        "Critical Ping Latency",
			Description: "Triggers when ping latency exceeds 500ms for 3 minutes",
			Enabled:     true,
			Severity:    "critical",
			Source:      "icmp",
			Metric:      "ping_latency",
			Condition:   "gt",
			Threshold:   "500",
			Duration:    180, // 3 minutes
			NotifyEmail: true,
		},

		// Device Recovery
		{
			Name:        "Device Recovered",
			Description: "Informational alert when device comes back online",
			Enabled:     false, // Disabled by default
			Severity:    "info",
			Source:      "icmp",
			Metric:      "device_status",
			Condition:   "eq",
			Threshold:   "up",
			Duration:    60, // 1 minute
			NotifyEmail: false,
		},

		// High CPU Usage
		{
			Name:        "High CPU Usage",
			Description: "Triggers when CPU usage exceeds 80% for 10 minutes",
			Enabled:     true,
			Severity:    "warning",
			Source:      "snmp",
			Metric:      "cpu_usage",
			Condition:   "gt",
			Threshold:   "80",
			Duration:    600, // 10 minutes
			NotifyEmail: true,
		},

		// Critical CPU Usage
		{
			Name:        "Critical CPU Usage",
			Description: "Triggers when CPU usage exceeds 95% for 5 minutes",
			Enabled:     true,
			Severity:    "critical",
			Source:      "snmp",
			Metric:      "cpu_usage",
			Condition:   "gt",
			Threshold:   "95",
			Duration:    300, // 5 minutes
			NotifyEmail: true,
		},

		// High Memory Usage
		{
			Name:        "High Memory Usage",
			Description: "Triggers when memory usage exceeds 85% for 10 minutes",
			Enabled:     true,
			Severity:    "warning",
			Source:      "snmp",
			Metric:      "memory_usage",
			Condition:   "gt",
			Threshold:   "85",
			Duration:    600, // 10 minutes
			NotifyEmail: true,
		},

		// Critical Memory Usage
		{
			Name:        "Critical Memory Usage",
			Description: "Triggers when memory usage exceeds 95% for 5 minutes",
			Enabled:     true,
			Severity:    "critical",
			Source:      "snmp",
			Metric:      "memory_usage",
			Condition:   "gt",
			Threshold:   "95",
			Duration:    300, // 5 minutes
			NotifyEmail: true,
		},

		// High Disk Usage
		{
			Name:        "High Disk Usage",
			Description: "Triggers when disk usage exceeds 85% for 30 minutes",
			Enabled:     true,
			Severity:    "warning",
			Source:      "snmp",
			Metric:      "disk_usage",
			Condition:   "gt",
			Threshold:   "85",
			Duration:    1800, // 30 minutes
			NotifyEmail: true,
		},

		// Critical Disk Usage
		{
			Name:        "Critical Disk Usage",
			Description: "Triggers when disk usage exceeds 95% for 10 minutes",
			Enabled:     true,
			Severity:    "critical",
			Source:      "snmp",
			Metric:      "disk_usage",
			Condition:   "gt",
			Threshold:   "95",
			Duration:    600, // 10 minutes
			NotifyEmail: true,
		},

		// Packet Loss
		{
			Name:        "High Packet Loss",
			Description: "Triggers when packet loss exceeds 5% for 5 minutes",
			Enabled:     true,
			Severity:    "warning",
			Source:      "icmp",
			Metric:      "packet_loss",
			Condition:   "gt",
			Threshold:   "5",
			Duration:    300, // 5 minutes
			NotifyEmail: true,
		},

		// Bandwidth Utilization
		{
			Name:        "High Bandwidth Utilization",
			Description: "Triggers when bandwidth utilization exceeds 80% for 10 minutes",
			Enabled:     false, // Disabled by default
			Severity:    "warning",
			Source:      "snmp",
			Metric:      "bandwidth",
			Condition:   "gt",
			Threshold:   "80",
			Duration:    600, // 10 minutes
			NotifyEmail: true,
		},
	}
}

// GetRuleBySeverity returns example rules filtered by severity
func GetRuleBySeverity(severity string) []*models.AlertRule {
	all := ExampleAlertRules()
	filtered := make([]*models.AlertRule, 0)

	for _, rule := range all {
		if rule.Severity == severity {
			filtered = append(filtered, rule)
		}
	}

	return filtered
}

// GetRuleByMetric returns example rules filtered by metric type
func GetRuleByMetric(metric string) []*models.AlertRule {
	all := ExampleAlertRules()
	filtered := make([]*models.AlertRule, 0)

	for _, rule := range all {
		if rule.Metric == metric {
			filtered = append(filtered, rule)
		}
	}

	return filtered
}

// CreateDefaultRules is a helper function to create default alert rules in the database
// This should be called during initial setup or when seeding the database
func CreateDefaultRules(engine *Engine) error {
	rules := ExampleAlertRules()

	for _, rule := range rules {
		if err := engine.db.Create(rule).Error; err != nil {
			return err
		}
	}

	return nil
}
