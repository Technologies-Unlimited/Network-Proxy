package thothos

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

// captured is the decoded shape of a GraphQL request the stub server received,
// keeping `variables` untyped so a test can assert whether `input` arrived as a
// nested OBJECT (the contract) rather than a stringified JSON.
type captured struct {
	Query     string                 `json:"query"`
	Variables map[string]interface{} `json:"variables"`
}

// TestReportMonitoringResults_WireShape pins the exact wire contract of the
// results-up mutation: the endpoint path, the Bearer auth, the operation name,
// the declared MonitoringResultsInput! variable, `input` sent as a NESTED OBJECT
// (never a stringified JSON), and every MonitoringResult element field.
func TestReportMonitoringResults_WireShape(t *testing.T) {
	var got captured
	var gotPath, gotAuth string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &got); err != nil {
			t.Errorf("server could not decode request body: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"reportMonitoringResults":{"success":true,"upserted":1}}}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, "tk_testkey")

	latency := 12.5
	loss := 3.0
	report, err := client.ReportMonitoringResults("proxy-alpha", []MonitoringResult{
		{
			DeviceName:    "router-1",
			IPAddress:     "10.0.0.1",
			DeviceType:    "router",
			Status:        "up",
			LatencyMs:     &latency,
			PacketLossPct: &loss,
			CheckedAt:     "2026-07-10T00:00:00Z",
		},
	})
	if err != nil {
		t.Fatalf("ReportMonitoringResults returned error: %v", err)
	}

	// Response parsed.
	if !report.Success || report.Upserted != 1 {
		t.Fatalf("unexpected report result: %+v", report)
	}

	// Endpoint + auth.
	if gotPath != "/api/graphql/network-administration/results" {
		t.Errorf("path = %q, want /api/graphql/network-administration/results", gotPath)
	}
	if gotAuth != "Bearer tk_testkey" {
		t.Errorf("auth = %q, want Bearer tk_testkey", gotAuth)
	}

	// Operation name + declared input variable type.
	if !contains(got.Query, "reportMonitoringResults") {
		t.Errorf("query missing operation name reportMonitoringResults: %q", got.Query)
	}
	if !contains(got.Query, "$input: MonitoringResultsInput!") {
		t.Errorf("query missing $input: MonitoringResultsInput! declaration: %q", got.Query)
	}

	// input MUST be a nested object, not a stringified JSON.
	inputRaw, ok := got.Variables["input"]
	if !ok {
		t.Fatalf("variables missing 'input'")
	}
	if _, isString := inputRaw.(string); isString {
		t.Fatalf("input was sent as a STRING; the contract requires a nested JSON object")
	}
	input, ok := inputRaw.(map[string]interface{})
	if !ok {
		t.Fatalf("input is not a JSON object, got %T", inputRaw)
	}

	if input["proxyName"] != "proxy-alpha" {
		t.Errorf("input.proxyName = %v, want proxy-alpha", input["proxyName"])
	}

	resultsRaw, ok := input["results"].([]interface{})
	if !ok {
		t.Fatalf("input.results is not an array, got %T", input["results"])
	}
	if len(resultsRaw) != 1 {
		t.Fatalf("input.results len = %d, want 1", len(resultsRaw))
	}
	elem := resultsRaw[0].(map[string]interface{})

	assertField(t, elem, "deviceName", "router-1")
	assertField(t, elem, "ipAddress", "10.0.0.1")
	assertField(t, elem, "deviceType", "router")
	assertField(t, elem, "status", "up")
	assertField(t, elem, "checkedAt", "2026-07-10T00:00:00Z")
	// JSON numbers decode to float64.
	if elem["latencyMs"] != 12.5 {
		t.Errorf("latencyMs = %v, want 12.5", elem["latencyMs"])
	}
	if elem["packetLossPct"] != 3.0 {
		t.Errorf("packetLossPct = %v, want 3", elem["packetLossPct"])
	}
}

// TestReportMonitoringResults_EmptyBatch confirms an empty batch is sent as an
// empty ARRAY (not null) — the contract returns {success:true, upserted:0}.
func TestReportMonitoringResults_EmptyBatch(t *testing.T) {
	var got captured
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &got)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"reportMonitoringResults":{"success":true,"upserted":0}}}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, "tk_testkey")
	report, err := client.ReportMonitoringResults("", nil)
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if !report.Success || report.Upserted != 0 {
		t.Fatalf("unexpected report: %+v", report)
	}

	input := got.Variables["input"].(map[string]interface{})
	results, ok := input["results"].([]interface{})
	if !ok {
		t.Fatalf("results not an array (must be [] not null), got %T", input["results"])
	}
	if len(results) != 0 {
		t.Fatalf("results len = %d, want 0", len(results))
	}
	// proxyName omitted when empty.
	if _, present := input["proxyName"]; present {
		t.Errorf("proxyName should be omitted when empty, got %v", input["proxyName"])
	}
}

func assertField(t *testing.T, m map[string]interface{}, key, want string) {
	t.Helper()
	if got := m[key]; got != want {
		t.Errorf("%s = %v, want %v", key, got, want)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && indexOf(s, sub) >= 0
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
