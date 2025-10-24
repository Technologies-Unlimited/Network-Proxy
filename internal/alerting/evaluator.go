package alerting

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"gorm.io/gorm"
)

// RuleEvaluator evaluates alert rule conditions
type RuleEvaluator struct {
	ruleID string
	db     *gorm.DB
}

// NewRuleEvaluator creates a new rule evaluator
func NewRuleEvaluator(ruleID string, db *gorm.DB) *RuleEvaluator {
	return &RuleEvaluator{
		ruleID: ruleID,
		db:     db,
	}
}

// EvaluateCondition evaluates a condition against a threshold and value
// Supports: gt (>), lt (<), eq (=), ne (!=), ge (>=), le (<=)
func EvaluateCondition(condition, threshold, value string) bool {
	// Try numeric comparison first
	numericResult, err := evaluateNumeric(condition, threshold, value)
	if err == nil {
		return numericResult
	}

	// Fall back to string comparison
	return evaluateString(condition, threshold, value)
}

// evaluateNumeric performs numeric comparison
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
	case "gt": // Greater than
		return valueNum > thresholdNum, nil
	case "lt": // Less than
		return valueNum < thresholdNum, nil
	case "eq": // Equal to
		return valueNum == thresholdNum, nil
	case "ne": // Not equal to
		return valueNum != thresholdNum, nil
	case "ge": // Greater than or equal to
		return valueNum >= thresholdNum, nil
	case "le": // Less than or equal to
		return valueNum <= thresholdNum, nil
	default:
		return false, fmt.Errorf("unknown condition: %s", condition)
	}
}

// evaluateString performs string comparison
func evaluateString(condition, threshold, value string) bool {
	// Normalize strings for comparison
	thresholdNorm := strings.ToLower(strings.TrimSpace(threshold))
	valueNorm := strings.ToLower(strings.TrimSpace(value))

	switch condition {
	case "eq": // Equal to
		return valueNorm == thresholdNorm
	case "ne": // Not equal to
		return valueNorm != thresholdNorm
	case "contains": // Contains substring
		return strings.Contains(valueNorm, thresholdNorm)
	case "starts_with": // Starts with
		return strings.HasPrefix(valueNorm, thresholdNorm)
	case "ends_with": // Ends with
		return strings.HasSuffix(valueNorm, thresholdNorm)
	default:
		// For unknown conditions with strings, default to equality
		return valueNorm == thresholdNorm
	}
}

// CheckDeviceStatus retrieves the current status of a device
func CheckDeviceStatus(deviceID string, db *gorm.DB) (string, error) {
	var device models.Device
	if err := db.Select("status").First(&device, "id = ?", deviceID).Error; err != nil {
		return "", fmt.Errorf("failed to fetch device status: %w", err)
	}
	return device.Status, nil
}

// CheckPingLatency retrieves the latest ping latency for a device
// This would typically come from metrics/time-series data
func CheckPingLatency(deviceID string, db *gorm.DB) (float64, error) {
	// In a real implementation, this would query Prometheus or a time-series database
	// For now, we'll use device status as a proxy
	var device models.Device
	if err := db.Select("status").First(&device, "id = ?", deviceID).Error; err != nil {
		return 0, fmt.Errorf("failed to fetch device: %w", err)
	}

	// If device is down, return a high latency value to trigger alerts
	if device.Status == "down" {
		return 9999.0, nil
	}

	// If device is up, return a simulated latency
	// In production, this would be real data from metrics
	return 50.0, nil
}

// EvaluateThreshold is a helper function that combines condition evaluation
func EvaluateThreshold(metric, condition, threshold, value string) bool {
	return EvaluateCondition(condition, threshold, value)
}

// ValidateCondition checks if a condition operator is valid
func ValidateCondition(condition string) bool {
	validConditions := map[string]bool{
		"gt":          true, // Greater than
		"lt":          true, // Less than
		"eq":          true, // Equal to
		"ne":          true, // Not equal to
		"ge":          true, // Greater than or equal
		"le":          true, // Less than or equal
		"contains":    true, // String contains
		"starts_with": true, // String starts with
		"ends_with":   true, // String ends with
	}
	return validConditions[condition]
}

// ValidateMetric checks if a metric type is valid
func ValidateMetric(metric string) bool {
	validMetrics := map[string]bool{
		"device_status": true,
		"ping_latency":  true,
		"last_seen":     true,
		"snmp_oid":      true,
		"packet_loss":   true,
		"bandwidth":     true,
		"cpu_usage":     true,
		"memory_usage":  true,
		"disk_usage":    true,
	}
	return validMetrics[metric]
}

// GetMetricDescription returns a human-readable description of a metric
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

// GetConditionDescription returns a human-readable description of a condition
func GetConditionDescription(condition string) string {
	descriptions := map[string]string{
		"gt":          "greater than",
		"lt":          "less than",
		"eq":          "equal to",
		"ne":          "not equal to",
		"ge":          "greater than or equal to",
		"le":          "less than or equal to",
		"contains":    "contains",
		"starts_with": "starts with",
		"ends_with":   "ends with",
	}

	if desc, ok := descriptions[condition]; ok {
		return desc
	}
	return condition
}

// EvaluateMultipleConditions evaluates multiple conditions with AND/OR logic
type ConditionGroup struct {
	Operator   string      // "and" or "or"
	Conditions []Condition
}

// Condition represents a single evaluation condition
type Condition struct {
	Metric    string
	Condition string
	Threshold string
	Value     string
}

// Evaluate evaluates a condition group
func (cg *ConditionGroup) Evaluate() bool {
	if len(cg.Conditions) == 0 {
		return false
	}

	results := make([]bool, len(cg.Conditions))
	for i, cond := range cg.Conditions {
		results[i] = EvaluateCondition(cond.Condition, cond.Threshold, cond.Value)
	}

	switch cg.Operator {
	case "and":
		// All conditions must be true
		for _, result := range results {
			if !result {
				return false
			}
		}
		return true
	case "or":
		// At least one condition must be true
		for _, result := range results {
			if result {
				return true
			}
		}
		return false
	default:
		// Default to AND logic
		for _, result := range results {
			if !result {
				return false
			}
		}
		return true
	}
}

// ParseThreshold parses threshold values with units
// Examples: "100ms", "80%", "1GB", "50"
func ParseThreshold(threshold string) (float64, string, error) {
	threshold = strings.TrimSpace(threshold)

	// Extract numeric part and unit
	var numPart string
	var unit string

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

// NormalizeValue normalizes a value to match threshold units
func NormalizeValue(value string, targetUnit string) (float64, error) {
	val, unit, err := ParseThreshold(value)
	if err != nil {
		return 0, err
	}

	// Convert units if necessary
	if unit == targetUnit {
		return val, nil
	}

	// Handle time conversions (ms, s, m, h)
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

	// Handle percentage conversions
	if targetUnit == "%" && unit == "" {
		// Assume decimal (0.8 = 80%)
		return val * 100, nil
	}

	// Handle byte conversions (b, kb, mb, gb, tb)
	byteUnits := map[string]float64{
		"b":  1,
		"kb": 1024,
		"mb": 1024 * 1024,
		"gb": 1024 * 1024 * 1024,
		"tb": 1024 * 1024 * 1024 * 1024,
	}

	if targetMultiplier, ok := byteUnits[targetUnit]; ok {
		if sourceMultiplier, ok := byteUnits[unit]; ok {
			return val * (sourceMultiplier / targetMultiplier), nil
		}
	}

	// If no conversion needed or available, return as-is
	return val, nil
}
