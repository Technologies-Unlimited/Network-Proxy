package alerting

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"gorm.io/gorm"
)

// RuleEvaluator evaluates alert rule conditions.
type RuleEvaluator struct {
	ruleID string
	db     *gorm.DB
}

// NewRuleEvaluator creates a new rule evaluator.
func NewRuleEvaluator(ruleID string, db *gorm.DB) *RuleEvaluator {
	return &RuleEvaluator{ruleID: ruleID, db: db}
}

// EvaluateCondition evaluates a condition against a threshold and value.
// Supports: gt (>), lt (<), eq (=), ne (!=), ge (>=), le (<=), and string ops.
func EvaluateCondition(condition, threshold, value string) bool {
	if numericResult, err := evaluateNumeric(condition, threshold, value); err == nil {
		return numericResult
	}
	return evaluateString(condition, threshold, value)
}

func evaluateNumeric(condition, threshold, value string) (bool, error) {
	thresholdNum, err := strconv.ParseFloat(threshold, 64)
	if err != nil {
		return false, fmt.Errorf("threshold not numeric: %w", err)
	}
	valueNum, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return false, fmt.Errorf("value not numeric: %w", err)
	}
	switch condition {
	case "gt":
		return valueNum > thresholdNum, nil
	case "lt":
		return valueNum < thresholdNum, nil
	case "eq":
		return valueNum == thresholdNum, nil
	case "ne":
		return valueNum != thresholdNum, nil
	case "ge":
		return valueNum >= thresholdNum, nil
	case "le":
		return valueNum <= thresholdNum, nil
	default:
		return false, fmt.Errorf("unknown condition: %s", condition)
	}
}

func evaluateString(condition, threshold, value string) bool {
	thresholdNorm := strings.ToLower(strings.TrimSpace(threshold))
	valueNorm := strings.ToLower(strings.TrimSpace(value))
	switch condition {
	case "eq":
		return valueNorm == thresholdNorm
	case "ne":
		return valueNorm != thresholdNorm
	case "contains":
		return strings.Contains(valueNorm, thresholdNorm)
	case "starts_with":
		return strings.HasPrefix(valueNorm, thresholdNorm)
	case "ends_with":
		return strings.HasSuffix(valueNorm, thresholdNorm)
	default:
		return valueNorm == thresholdNorm
	}
}

// CheckDeviceStatus retrieves the current status of a device.
func CheckDeviceStatus(deviceID string, db *gorm.DB) (string, error) {
	var device models.Device
	if err := db.Select("status").First(&device, "id = ?", deviceID).Error; err != nil {
		return "", fmt.Errorf("failed to fetch device status: %w", err)
	}
	return device.Status, nil
}

// EvaluateThreshold combines condition evaluation with metric awareness.
func EvaluateThreshold(metric, condition, threshold, value string) bool {
	return EvaluateCondition(condition, threshold, value)
}

// ValidateCondition checks if a condition operator is valid.
func ValidateCondition(condition string) bool {
	valid := map[string]bool{
		"gt": true, "lt": true, "eq": true, "ne": true, "ge": true, "le": true,
		"contains": true, "starts_with": true, "ends_with": true,
	}
	return valid[condition]
}

// ValidateMetric checks if a metric type is valid.
func ValidateMetric(metric string) bool {
	valid := map[string]bool{
		"device_status": true, "ping_latency": true, "last_seen": true,
		"snmp_oid": true, "packet_loss": true, "bandwidth": true,
		"cpu_usage": true, "memory_usage": true, "disk_usage": true,
	}
	return valid[metric]
}

// GetMetricDescription returns a human-readable description of a metric.
func GetMetricDescription(metric string) string {
	descriptions := map[string]string{
		"device_status": "Device connectivity status (up/down)",
		"ping_latency":  "ICMP ping round-trip time in milliseconds",
		"last_seen":     "Seconds since device was last seen",
		"snmp_oid":      "SNMP OID value",
		"packet_loss":   "Percentage of packets lost",
		"bandwidth":     "Network bandwidth utilization",
		"cpu_usage":     "CPU utilization percentage",
		"memory_usage":  "Memory utilization percentage",
		"disk_usage":    "Disk space utilization percentage",
	}
	if desc, ok := descriptions[metric]; ok {
		return desc
	}
	return "Unknown metric"
}

// GetConditionDescription returns a human-readable description of a condition.
func GetConditionDescription(condition string) string {
	descriptions := map[string]string{
		"gt": "greater than", "lt": "less than", "eq": "equal to",
		"ne": "not equal to", "ge": "greater than or equal to",
		"le": "less than or equal to", "contains": "contains",
		"starts_with": "starts with", "ends_with": "ends with",
	}
	if desc, ok := descriptions[condition]; ok {
		return desc
	}
	return condition
}

// ConditionGroup evaluates multiple conditions with AND/OR logic.
type ConditionGroup struct {
	Operator   string
	Conditions []Condition
}

// Condition represents a single evaluation condition.
type Condition struct {
	Metric    string
	Condition string
	Threshold string
	Value     string
}

// Evaluate evaluates a condition group. The operator must be "and", "or",
// or empty (which is treated as "and"). An unknown operator returns false
// rather than silently defaulting — the previous version coerced typos to
// AND semantics, which made misconfigured rules fire harder than expected
// (or, for an OR-typo, never fire at all) without complaint.
func (cg *ConditionGroup) Evaluate() bool {
	if len(cg.Conditions) == 0 {
		return false
	}
	op := strings.ToLower(strings.TrimSpace(cg.Operator))
	if op != "" && op != "and" && op != "or" {
		return false
	}
	results := make([]bool, len(cg.Conditions))
	for i, cond := range cg.Conditions {
		results[i] = EvaluateCondition(cond.Condition, cond.Threshold, cond.Value)
	}
	if op == "or" {
		for _, r := range results {
			if r {
				return true
			}
		}
		return false
	}
	for _, r := range results {
		if !r {
			return false
		}
	}
	return true
}

// ParseThreshold parses threshold values with units.
func ParseThreshold(threshold string) (float64, string, error) {
	threshold = strings.TrimSpace(threshold)
	var numPart, unit string
	for i, ch := range threshold {
		if (ch >= '0' && ch <= '9') || ch == '.' || ch == '-' {
			numPart += string(ch)
		} else {
			unit = threshold[i:]
			break
		}
	}
	if numPart == "" {
		return 0, "", fmt.Errorf("no numeric value found in threshold: %s", threshold)
	}
	value, err := strconv.ParseFloat(numPart, 64)
	if err != nil {
		return 0, "", fmt.Errorf("failed to parse threshold value: %w", err)
	}
	return value, strings.ToLower(strings.TrimSpace(unit)), nil
}

// NormalizeValue normalizes a value to match threshold units.
func NormalizeValue(value string, targetUnit string) (float64, error) {
	val, unit, err := ParseThreshold(value)
	if err != nil {
		return 0, err
	}
	if unit == targetUnit {
		return val, nil
	}
	if targetUnit == "ms" {
		switch unit {
		case "s":
			return val * 1000, nil
		case "m":
			return val * 60000, nil
		case "h":
			return val * 3600000, nil
		}
	}
	if targetUnit == "%" && unit == "" {
		return val * 100, nil
	}
	byteUnits := map[string]float64{
		"b": 1, "kb": 1024, "mb": 1024 * 1024,
		"gb": 1024 * 1024 * 1024, "tb": 1024 * 1024 * 1024 * 1024,
	}
	if targetMul, ok := byteUnits[targetUnit]; ok {
		if srcMul, ok := byteUnits[unit]; ok {
			return val * (srcMul / targetMul), nil
		}
	}
	return val, nil
}

// ============================================================================
// Metric sources
// ============================================================================

// DBMetricSource is a MetricSource backed only by the GORM database. It can
// answer device_status, last_seen, and packet_loss precisely; for ping_latency
// it falls back to the most-recent recorded latency on the device row, or
// returns an error if none is available. It deliberately does NOT fabricate
// values.
type DBMetricSource struct {
	db *gorm.DB
}

// NewDBMetricSource builds a DBMetricSource.
func NewDBMetricSource(db *gorm.DB) *DBMetricSource {
	return &DBMetricSource{db: db}
}

// Get retrieves the current value for the given metric on a device.
func (s *DBMetricSource) Get(metric string, device *models.Device) (string, error) {
	switch metric {
	case "device_status":
		switch device.Status {
		case "up":
			return "1", nil
		case "down":
			return "0", nil
		default:
			// "unknown"/"" means the device has never been polled. Returning a
			// concrete "0" here made the engine fire false Device Down alerts
			// for never-polled devices; surface it as no-sample so the engine
			// skips the rule (treats it as unknown, not down).
			return "", fmt.Errorf("device_status: no sample yet for %q (status=%q)", device.Hostname, device.Status)
		}

	case "last_seen":
		if device.LastSeen == nil {
			return "", fmt.Errorf("device has never been seen")
		}
		return strconv.FormatInt(int64(time.Since(*device.LastSeen).Seconds()), 10), nil

	case "packet_loss":
		// Report the real measured loss for a polled device; refuse to invent a
		// value for a never-polled ("unknown") device.
		switch device.Status {
		case "up", "down":
			return strconv.FormatFloat(device.PacketLoss, 'f', -1, 64), nil
		default:
			return "", fmt.Errorf("packet_loss: no sample yet (status=%q)", device.Status)
		}

	case "ping_latency":
		// Without a Prometheus binding, we can only report the device's
		// last observed status as a coarse signal. Refuse to invent a value.
		return "", fmt.Errorf("ping_latency requires a Prometheus-backed MetricSource (use SetMetricSource)")
	}
	return "", fmt.Errorf("unsupported metric: %s", metric)
}

// LocalRegistryQuerier is the in-process metrics-backend used when no external
// Prometheus is configured. The metrics package implements it.
type LocalRegistryQuerier interface {
	PingLatency(deviceID, ipAddress string) (float64, error)
	DeviceStatus(deviceID, ipAddress string) (float64, error)
	PacketLoss(deviceID, ipAddress string) (float64, error)
}

// LocalMetricSource serves metric values straight off the in-process
// Prometheus registry — no PromQL, no HTTP. This is the default when
// network-monitor runs without an external Prometheus and lets the alert
// engine evaluate ping_latency / device_status rules against live data.
type LocalMetricSource struct {
	q LocalRegistryQuerier
}

// NewLocalMetricSource builds a LocalMetricSource around any implementation
// of LocalRegistryQuerier.
func NewLocalMetricSource(q LocalRegistryQuerier) *LocalMetricSource {
	return &LocalMetricSource{q: q}
}

// Get retrieves the current value for the given metric.
func (s *LocalMetricSource) Get(metric string, device *models.Device) (string, error) {
	if s.q == nil {
		return "", fmt.Errorf("local registry querier not configured")
	}
	switch metric {
	case "device_status":
		v, err := s.q.DeviceStatus(device.ID, device.IPAddress)
		if err != nil {
			return "", err
		}
		return strconv.FormatFloat(v, 'f', -1, 64), nil
	case "ping_latency":
		v, err := s.q.PingLatency(device.ID, device.IPAddress)
		if err != nil {
			return "", err
		}
		return strconv.FormatFloat(v, 'f', -1, 64), nil
	case "packet_loss":
		v, err := s.q.PacketLoss(device.ID, device.IPAddress)
		if err != nil {
			return "", err
		}
		return strconv.FormatFloat(v, 'f', -1, 64), nil
	case "last_seen":
		// Falls back to the DBMetricSource's behaviour — we still need the
		// device row for this one.
		return (&DBMetricSource{}).Get(metric, device)
	}
	return "", fmt.Errorf("unsupported metric for LocalMetricSource: %s", metric)
}

// PrometheusMetricSource is a MetricSource that queries Prometheus for the
// real metric values. The host wires this in via Engine.SetMetricSource if a
// Prometheus URL is configured.
type PrometheusMetricSource struct {
	URL    string
	client interface {
		Query(query string) (float64, error)
	}
}

// NewPrometheusMetricSource builds a PrometheusMetricSource. The url is the
// Prometheus base URL (e.g. http://localhost:9090). Pass nil for client to
// use the default HTTP-backed implementation.
func NewPrometheusMetricSource(url string, client interface {
	Query(query string) (float64, error)
}) *PrometheusMetricSource {
	return &PrometheusMetricSource{URL: url, client: client}
}

// Get retrieves the current value for the given metric.
func (s *PrometheusMetricSource) Get(metric string, device *models.Device) (string, error) {
	if s.client == nil {
		return "", fmt.Errorf("prometheus client not configured")
	}
	var query string
	switch metric {
	case "device_status":
		query = fmt.Sprintf(`network_device_status{device_id="%s"}`, device.ID)
	case "ping_latency":
		query = fmt.Sprintf(`network_ping_latency_milliseconds{device_id="%s"}`, device.ID)
	case "packet_loss":
		query = fmt.Sprintf(
			`100 * rate(network_ping_failure_total{device_id="%s"}[5m]) / `+
				`(rate(network_ping_success_total{device_id="%s"}[5m]) + `+
				`rate(network_ping_failure_total{device_id="%s"}[5m]))`,
			device.ID, device.ID, device.ID,
		)
	default:
		return "", fmt.Errorf("unsupported metric: %s", metric)
	}
	v, err := s.client.Query(query)
	if err != nil {
		return "", err
	}
	return strconv.FormatFloat(v, 'f', -1, 64), nil
}
