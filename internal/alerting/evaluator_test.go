package alerting

import (
	"testing"
)

func TestEvaluateCondition(t *testing.T) {
	tests := []struct {
		name      string
		condition string
		threshold string
		value     string
		expected  bool
	}{
		// Numeric comparisons
		{"Greater than - true", "gt", "100", "150", true},
		{"Greater than - false", "gt", "100", "50", false},
		{"Less than - true", "lt", "100", "50", true},
		{"Less than - false", "lt", "100", "150", false},
		{"Equal to - true", "eq", "100", "100", true},
		{"Equal to - false", "eq", "100", "99", false},
		{"Not equal to - true", "ne", "100", "99", true},
		{"Not equal to - false", "ne", "100", "100", false},
		{"Greater or equal - true (greater)", "ge", "100", "150", true},
		{"Greater or equal - true (equal)", "ge", "100", "100", true},
		{"Greater or equal - false", "ge", "100", "50", false},
		{"Less or equal - true (less)", "le", "100", "50", true},
		{"Less or equal - true (equal)", "le", "100", "100", true},
		{"Less or equal - false", "le", "100", "150", false},

		// Float comparisons
		{"Float greater than", "gt", "50.5", "75.3", true},
		{"Float less than", "lt", "100.0", "99.9", true},

		// String comparisons
		{"String equal - true", "eq", "down", "down", true},
		{"String equal - false", "eq", "up", "down", false},
		{"String not equal - true", "ne", "up", "down", true},
		{"String contains - true", "contains", "error", "system error occurred", true},
		{"String contains - false", "contains", "success", "system error occurred", false},
		{"String starts with - true", "starts_with", "error", "error: connection failed", true},
		{"String starts with - false", "starts_with", "warning", "error: connection failed", false},
		{"String ends with - true", "ends_with", "failed", "connection failed", true},
		{"String ends with - false", "ends_with", "success", "connection failed", false},

		// Case insensitive
		{"String equal case insensitive", "eq", "DOWN", "down", true},
		{"String contains case insensitive", "contains", "ERROR", "System Error", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := EvaluateCondition(tt.condition, tt.threshold, tt.value)
			if result != tt.expected {
				t.Errorf("EvaluateCondition(%s, %s, %s) = %v, expected %v",
					tt.condition, tt.threshold, tt.value, result, tt.expected)
			}
		})
	}
}

func TestValidateCondition(t *testing.T) {
	tests := []struct {
		condition string
		expected  bool
	}{
		{"gt", true},
		{"lt", true},
		{"eq", true},
		{"ne", true},
		{"ge", true},
		{"le", true},
		{"contains", true},
		{"starts_with", true},
		{"ends_with", true},
		{"invalid", false},
		{"", false},
	}

	for _, tt := range tests {
		t.Run(tt.condition, func(t *testing.T) {
			result := ValidateCondition(tt.condition)
			if result != tt.expected {
				t.Errorf("ValidateCondition(%s) = %v, expected %v",
					tt.condition, result, tt.expected)
			}
		})
	}
}

func TestValidateMetric(t *testing.T) {
	tests := []struct {
		metric   string
		expected bool
	}{
		{"device_status", true},
		{"ping_latency", true},
		{"snmp_oid", true},
		{"packet_loss", true},
		{"bandwidth", true},
		{"cpu_usage", true},
		{"memory_usage", true},
		{"disk_usage", true},
		{"invalid_metric", false},
		{"", false},
	}

	for _, tt := range tests {
		t.Run(tt.metric, func(t *testing.T) {
			result := ValidateMetric(tt.metric)
			if result != tt.expected {
				t.Errorf("ValidateMetric(%s) = %v, expected %v",
					tt.metric, result, tt.expected)
			}
		})
	}
}

func TestParseThreshold(t *testing.T) {
	tests := []struct {
		name          string
		threshold     string
		expectedValue float64
		expectedUnit  string
		expectError   bool
	}{
		{"Simple number", "100", 100, "", false},
		{"Milliseconds", "100ms", 100, "ms", false},
		{"Seconds", "30s", 30, "s", false},
		{"Percentage", "80%", 80, "%", false},
		{"Megabytes", "500MB", 500, "mb", false},
		{"Gigabytes", "2GB", 2, "gb", false},
		{"Decimal", "99.5", 99.5, "", false},
		{"Decimal with unit", "99.5%", 99.5, "%", false},
		{"Negative", "-10", -10, "", false},
		{"Invalid - no number", "abc", 0, "", true},
		{"Empty string", "", 0, "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			value, unit, err := ParseThreshold(tt.threshold)
			if tt.expectError {
				if err == nil {
					t.Errorf("ParseThreshold(%s) expected error, got nil", tt.threshold)
				}
				return
			}
			if err != nil {
				t.Errorf("ParseThreshold(%s) unexpected error: %v", tt.threshold, err)
				return
			}
			if value != tt.expectedValue {
				t.Errorf("ParseThreshold(%s) value = %v, expected %v",
					tt.threshold, value, tt.expectedValue)
			}
			if unit != tt.expectedUnit {
				t.Errorf("ParseThreshold(%s) unit = %s, expected %s",
					tt.threshold, unit, tt.expectedUnit)
			}
		})
	}
}

func TestConditionGroup(t *testing.T) {
	tests := []struct {
		name     string
		operator string
		results  []bool
		expected bool
	}{
		{"AND - all true", "and", []bool{true, true, true}, true},
		{"AND - one false", "and", []bool{true, false, true}, false},
		{"AND - all false", "and", []bool{false, false, false}, false},
		{"OR - all true", "or", []bool{true, true, true}, true},
		{"OR - one true", "or", []bool{false, true, false}, true},
		{"OR - all false", "or", []bool{false, false, false}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cg := &ConditionGroup{
				Operator:   tt.operator,
				Conditions: make([]Condition, len(tt.results)),
			}

			// Create conditions that will produce the desired results
			for i, result := range tt.results {
				if result {
					cg.Conditions[i] = Condition{
						Condition: "eq",
						Threshold: "100",
						Value:     "100",
					}
				} else {
					cg.Conditions[i] = Condition{
						Condition: "eq",
						Threshold: "100",
						Value:     "99",
					}
				}
			}

			result := cg.Evaluate()
			if result != tt.expected {
				t.Errorf("ConditionGroup.Evaluate() = %v, expected %v", result, tt.expected)
			}
		})
	}
}

func TestGetMetricDescription(t *testing.T) {
	tests := []struct {
		metric   string
		contains string
	}{
		{"device_status", "connectivity"},
		{"ping_latency", "ping"},
		{"cpu_usage", "CPU"},
		{"memory_usage", "Memory"},
		{"unknown_metric", "Unknown"},
	}

	for _, tt := range tests {
		t.Run(tt.metric, func(t *testing.T) {
			desc := GetMetricDescription(tt.metric)
			if desc == "" {
				t.Errorf("GetMetricDescription(%s) returned empty string", tt.metric)
			}
		})
	}
}

func TestGetConditionDescription(t *testing.T) {
	tests := []struct {
		condition string
		expected  string
	}{
		{"gt", "greater than"},
		{"lt", "less than"},
		{"eq", "equal to"},
		{"ne", "not equal to"},
		{"ge", "greater than or equal to"},
		{"le", "less than or equal to"},
		{"unknown", "unknown"},
	}

	for _, tt := range tests {
		t.Run(tt.condition, func(t *testing.T) {
			desc := GetConditionDescription(tt.condition)
			if desc != tt.expected {
				t.Errorf("GetConditionDescription(%s) = %s, expected %s",
					tt.condition, desc, tt.expected)
			}
		})
	}
}

func BenchmarkEvaluateCondition(b *testing.B) {
	for i := 0; i < b.N; i++ {
		EvaluateCondition("gt", "100", "150")
	}
}

func BenchmarkEvaluateConditionString(b *testing.B) {
	for i := 0; i < b.N; i++ {
		EvaluateCondition("eq", "down", "down")
	}
}
