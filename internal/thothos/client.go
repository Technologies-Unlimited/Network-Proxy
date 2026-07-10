package thothos

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"time"

	"github.com/rs/zerolog/log"
)

// thothosAcceptsCallbackURL mirrors the validation ThothOS's registerProxy
// resolver applies to callback URLs: HTTPS only, and the host must not be
// localhost, a private RFC-1918 range, or link-local. ThothOS throws when
// the URL fails that check — which would fail the entire proxy
// registration — so we pre-screen client-side and omit unacceptable URLs.
func thothosAcceptsCallbackURL(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil || u.Scheme != "https" {
		return false
	}
	host := u.Hostname()
	if host == "" || host == "localhost" || host == "0.0.0.0" {
		return false
	}
	if ip := net.ParseIP(host); ip != nil {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
			return false
		}
	}
	return true
}

// Client is the ThothOS API client
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client

	// Cached data from API key validation
	companyID  string
	apiKeyID   string
	proxyID    string
	permissions []string
}

// NewClient creates a new ThothOS client
func NewClient(baseURL, apiKey string) *Client {
	return &Client{
		baseURL: baseURL,
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// doWithRetry executes the request with bounded exponential backoff. Retries
// only on transient failures (network errors, 502/503/504); 4xx and 401/403
// are returned immediately so we don't hammer ThothOS with broken creds.
//
// Use only for idempotent calls — every Get*Templates / heartbeat /
// validate path is safe; mutating GraphQL is not retried by callers.
func (c *Client) doWithRetry(req *http.Request, body []byte) (*http.Response, error) {
	const maxAttempts = 3
	var lastErr error

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		// Re-set the body each attempt because http.Client consumes it.
		if body != nil {
			req.Body = io.NopCloser(bytes.NewReader(body))
		}
		resp, err := c.httpClient.Do(req)
		if err == nil {
			if resp.StatusCode < 500 && resp.StatusCode != http.StatusRequestTimeout && resp.StatusCode != http.StatusTooManyRequests {
				return resp, nil
			}
			lastErr = fmt.Errorf("upstream returned %d", resp.StatusCode)
			resp.Body.Close()
		} else {
			lastErr = err
		}

		if attempt == maxAttempts {
			break
		}
		// 200ms, 500ms, 1.25s — total ≈ 2s of jitter-free backoff.
		backoff := time.Duration(1<<(attempt-1)) * 200 * time.Millisecond
		log.Debug().
			Err(lastErr).
			Int("attempt", attempt).
			Dur("backoff", backoff).
			Msg("ThothOS request failed; retrying")
		time.Sleep(backoff)
	}
	return nil, fmt.Errorf("ThothOS request failed after %d attempts: %w", maxAttempts, lastErr)
}

// ValidateAPIKey validates the API key and caches the response
func (c *Client) ValidateAPIKey() (*ApiKeyValidationResponse, error) {
	url := fmt.Sprintf("%s/api/auth/api-key/validate", c.baseURL)

	req, err := http.NewRequest("POST", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.apiKey))
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.doWithRetry(req, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to validate API key: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var result ApiKeyValidationResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if !result.Valid {
		return &result, fmt.Errorf("API key validation failed: %s", result.Error)
	}

	// Cache the response
	c.companyID = result.CompanyID
	c.apiKeyID = result.ApiKeyID
	c.proxyID = result.ProxyID
	c.permissions = result.Permissions

	log.Info().
		Str("companyId", c.companyID).
		Str("apiKeyId", c.apiKeyID).
		Strs("permissions", c.permissions).
		Msg("API key validated successfully")

	return &result, nil
}

// GetCompanyID returns the cached company ID
func (c *Client) GetCompanyID() string {
	return c.companyID
}

// GetApiKeyID returns the cached API key ID
func (c *Client) GetApiKeyID() string {
	return c.apiKeyID
}

// GetProxyID returns the cached proxy ID (if set in API key)
func (c *Client) GetProxyID() string {
	return c.proxyID
}

// doGraphQL executes a read/idempotent GraphQL request WITH transient-failure
// retries. Use for queries (template/IPAM pull), heartbeat, and the idempotent
// upsert registrations — all safe to replay.
func (c *Client) doGraphQL(path string, query string, variables map[string]interface{}) (*GraphQLResponse, error) {
	return c.doGraphQLRequest(path, query, variables, true)
}

// doGraphQLOnce executes a GraphQL request WITHOUT retry — a single shot. Use
// for non-idempotent mutations (createOID) where a retry after a
// committed-but-unacknowledged first attempt would double-fire the mutation and
// create duplicates (ThothOS has no server-side uniqueness on OID to absorb it;
// see the doWithRetry doc + the OID-double-create audit finding). updateOID /
// deleteOID are idempotent but are routed here too so ALL OID mutations share
// one single-shot policy.
func (c *Client) doGraphQLOnce(path string, query string, variables map[string]interface{}) (*GraphQLResponse, error) {
	return c.doGraphQLRequest(path, query, variables, false)
}

// doGraphQLRequest is the shared GraphQL executor. When retry is true it routes
// through doWithRetry (bounded exponential backoff on transient 5xx/network
// errors); when false it does exactly one request.
func (c *Client) doGraphQLRequest(path string, query string, variables map[string]interface{}, retry bool) (*GraphQLResponse, error) {
	url := fmt.Sprintf("%s/api/graphql/%s", c.baseURL, path)

	reqBody := GraphQLRequest{
		Query:     query,
		Variables: variables,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.apiKey))
	req.Header.Set("Content-Type", "application/json")

	var resp *http.Response
	if retry {
		resp, err = c.doWithRetry(req, jsonBody)
	} else {
		// Single shot: a mutation must never be replayed by the transport.
		resp, err = c.httpClient.Do(req)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var result GraphQLResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if len(result.Errors) > 0 {
		return &result, fmt.Errorf("GraphQL error: %s", result.Errors[0].Message)
	}

	return &result, nil
}

// RegisterProxy registers or updates this proxy with ThothOS
func (c *Client) RegisterProxy(input ProxyRegistrationInput) (*ProxyConfig, error) {
	query := `mutation registerProxy($companyId: String!, $apiKeyId: String!, $input: ProxyRegistrationInput!) {
		registerProxy(companyId: $companyId, apiKeyId: $apiKeyId, input: $input) {
			_id
			companyId
			supernetId
			subnetId
			proxyName
			proxyStatus
			description
			ipAddress
			port
			callbackUrl
			version
			lastHeartbeat
			apiKeyId
			createdAt
			updatedAt
		}
	}`

	registrationInput := map[string]interface{}{
		"proxyName":   input.ProxyName,
		"description": input.Description,
		"supernetId":  input.SupernetID,
		"subnetId":    input.SubnetID,
		"ipAddress":   input.IPAddress,
		"port":        input.Port,
		"version":     input.Version,
	}
	// ThothOS's registerProxy resolver hard-rejects (throws, failing the
	// whole registration) any callbackUrl that isn't HTTPS on a public,
	// non-link-local host. The default auto-detected callback is
	// http://<LAN-IP>:<port>, which can never pass that check — so only
	// send the callback when it's acceptable, and register without push
	// webhooks otherwise (config is still pulled on startup).
	if input.CallbackURL != "" {
		if thothosAcceptsCallbackURL(input.CallbackURL) {
			registrationInput["callbackUrl"] = input.CallbackURL
		} else {
			log.Warn().
				Str("callbackUrl", input.CallbackURL).
				Msg("Callback URL is not public HTTPS; registering proxy without it (ThothOS would reject the registration outright)")
		}
	}

	variables := map[string]interface{}{
		"companyId": c.companyID,
		"apiKeyId":  c.apiKeyID,
		"input":     registrationInput,
	}

	resp, err := c.doGraphQL("network-administration/proxy", query, variables)
	if err != nil {
		return nil, err
	}

	data, ok := resp.Data["registerProxy"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	// Parse the response
	proxy := &ProxyConfig{}
	jsonData, _ := json.Marshal(data)
	if err := json.Unmarshal(jsonData, proxy); err != nil {
		return nil, fmt.Errorf("failed to parse proxy config: %w", err)
	}

	// Cache the proxy ID
	c.proxyID = proxy.ID

	log.Info().
		Str("proxyId", proxy.ID).
		Str("proxyName", proxy.ProxyName).
		Msg("Proxy registered successfully")

	return proxy, nil
}

// SendHeartbeat sends a heartbeat to ThothOS
func (c *Client) SendHeartbeat(status HeartbeatStatus) (*ProxyConfig, error) {
	if c.proxyID == "" {
		return nil, fmt.Errorf("proxy not registered, cannot send heartbeat")
	}

	query := `mutation proxyHeartbeat($proxyId: String!, $status: HeartbeatStatus!) {
		proxyHeartbeat(proxyId: $proxyId, status: $status) {
			_id
			proxyStatus
			lastHeartbeat
			agentCount
			deviceCount
		}
	}`

	variables := map[string]interface{}{
		"proxyId": c.proxyID,
		"status": map[string]interface{}{
			"ipAddress":   status.IPAddress,
			"port":        status.Port,
			"version":     status.Version,
			"agentCount":  status.AgentCount,
			"deviceCount": status.DeviceCount,
		},
	}

	resp, err := c.doGraphQL("network-administration/proxy", query, variables)
	if err != nil {
		return nil, err
	}

	data, ok := resp.Data["proxyHeartbeat"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	proxy := &ProxyConfig{}
	jsonData, _ := json.Marshal(data)
	if err := json.Unmarshal(jsonData, proxy); err != nil {
		return nil, fmt.Errorf("failed to parse proxy config: %w", err)
	}

	return proxy, nil
}

// ReportMonitoringResults reports a batch of device monitoring results (up/down
// status + latency + packet loss) to ThothOS's reportMonitoringResults mutation
// — the NM→ThothOS results-up channel.
//
// SINGLE-SHOT by design: it routes through doGraphQLOnce (no retry wrapper). The
// caller (the session's results reporter) tolerates a failure by carrying the
// batch forward to the next tick rather than replaying at the transport layer.
//
// The `input` variable is sent as a NESTED JSON OBJECT (exactly like registerProxy
// sends its registrationInput map) — NOT a stringified JSON — so the resolver reads
// vars.input as the object. companyId is NOT sent: ThothOS injects it server-side
// from the tk_ key's tenant, so a key can only ever write its own company's rows.
func (c *Client) ReportMonitoringResults(proxyName string, results []MonitoringResult) (*MonitoringReportResult, error) {
	query := `mutation reportMonitoringResults($input: MonitoringResultsInput!) {
		reportMonitoringResults(input: $input) {
			success
			upserted
		}
	}`

	// results may be an empty (non-nil) slice; ThothOS returns {success:true,
	// upserted:0} for an empty results array. Keep it non-nil so it marshals to
	// [] rather than null.
	if results == nil {
		results = []MonitoringResult{}
	}
	input := map[string]interface{}{
		"results": results,
	}
	if proxyName != "" {
		input["proxyName"] = proxyName
	}

	variables := map[string]interface{}{
		"input": input,
	}

	resp, err := c.doGraphQLOnce("network-administration/results", query, variables)
	if err != nil {
		return nil, err
	}

	data, ok := resp.Data["reportMonitoringResults"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	report := &MonitoringReportResult{}
	jsonData, _ := json.Marshal(data)
	if err := json.Unmarshal(jsonData, report); err != nil {
		return nil, fmt.Errorf("failed to parse monitoring report result: %w", err)
	}

	log.Info().
		Int("sent", len(results)).
		Int("upserted", report.Upserted).
		Bool("success", report.Success).
		Msg("Reported monitoring results to ThothOS")
	return report, nil
}

// GetICMPMonitoringTemplates fetches ICMP monitoring templates (threshold configs)
func (c *Client) GetICMPMonitoringTemplates() ([]ICMPMonitoringTemplate, error) {
	query := `query getICMPMonitoringTemplatesForCompany($companyId: String!) {
		getICMPMonitoringTemplatesForCompany(companyId: $companyId) {
			_id
			companyId
			templateName
			templateDescription
			icmpLossThreshold
			icmpLatencyThreshold
			manufacturerId
			modelNameId
			productId
			stockIds
			networkInventoryIds
			linkedPollingTemplateId
		}
	}`

	variables := map[string]interface{}{
		"companyId": c.companyID,
	}

	resp, err := c.doGraphQL("network-administration/icmp", query, variables)
	if err != nil {
		return nil, err
	}

	data, ok := resp.Data["getICMPMonitoringTemplatesForCompany"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	templates := make([]ICMPMonitoringTemplate, 0, len(data))
	for _, item := range data {
		jsonData, _ := json.Marshal(item)
		var template ICMPMonitoringTemplate
		if err := json.Unmarshal(jsonData, &template); err != nil {
			log.Warn().Err(err).Msg("Failed to parse ICMP monitoring template")
			continue
		}
		templates = append(templates, template)
	}

	log.Info().Int("count", len(templates)).Msg("Fetched ICMP monitoring templates")
	return templates, nil
}

// GetICMPPollingTemplates fetches ICMP polling templates (frequency configs)
func (c *Client) GetICMPPollingTemplates() ([]ICMPPollingTemplate, error) {
	query := `query getICMPPollingTemplatesForCompany($companyId: String!) {
		getICMPPollingTemplatesForCompany(companyId: $companyId) {
			_id
			companyId
			icmpTemplateId
			name
			description
			frequency
			timeout
			retries
			pollingFrequency {
				days
				hours
				minutes
				seconds
			}
			downtimeTrigger {
				days
				hours
				minutes
				seconds
			}
		}
	}`

	variables := map[string]interface{}{
		"companyId": c.companyID,
	}

	resp, err := c.doGraphQL("network-administration/icmp", query, variables)
	if err != nil {
		return nil, err
	}

	data, ok := resp.Data["getICMPPollingTemplatesForCompany"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	templates := make([]ICMPPollingTemplate, 0, len(data))
	for _, item := range data {
		jsonData, _ := json.Marshal(item)
		var template ICMPPollingTemplate
		if err := json.Unmarshal(jsonData, &template); err != nil {
			log.Warn().Err(err).Msg("Failed to parse ICMP polling template")
			continue
		}
		templates = append(templates, template)
	}

	log.Info().Int("count", len(templates)).Msg("Fetched ICMP polling templates")
	return templates, nil
}

// GetOIDs fetches OID definitions
func (c *Client) GetOIDs() ([]OID, error) {
	query := `query getOIDsForCompany($companyId: String!) {
		getOIDsForCompany(companyId: $companyId) {
			_id
			companyId
			oidName
			oid
			description
			manufacturerId
			modelId
			productId
		}
	}`

	variables := map[string]interface{}{
		"companyId": c.companyID,
	}

	resp, err := c.doGraphQL("network-administration/snmp", query, variables)
	if err != nil {
		return nil, err
	}

	data, ok := resp.Data["getOIDsForCompany"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	oids := make([]OID, 0, len(data))
	for _, item := range data {
		jsonData, _ := json.Marshal(item)
		var oid OID
		if err := json.Unmarshal(jsonData, &oid); err != nil {
			log.Warn().Err(err).Msg("Failed to parse OID")
			continue
		}
		oids = append(oids, oid)
	}

	log.Info().Int("count", len(oids)).Msg("Fetched OIDs")
	return oids, nil
}

// OIDInput represents the input for creating/updating an OID in ThothOS
type OIDInput struct {
	OIDName        string `json:"oidName"`
	OID            string `json:"oid"`
	Description    string `json:"description"`
	ManufacturerID string `json:"manufacturerId,omitempty"`
	ModelID        string `json:"modelId,omitempty"`
	ProductID      string `json:"productId,omitempty"`
}

// CreateOID creates a new OID in ThothOS
func (c *Client) CreateOID(input OIDInput) (*OID, error) {
	query := `mutation createOID($companyId: String!, $input: OIDInput!) {
		createOID(companyId: $companyId, input: $input) {
			_id
			companyId
			oidName
			oid
			description
			manufacturerId
			modelId
			productId
		}
	}`

	variables := map[string]interface{}{
		"companyId": c.companyID,
		"input":     input,
	}

	// Single-shot: createOID is NOT idempotent (no server-side uniqueness),
	// so it must never be replayed by the retry transport.
	resp, err := c.doGraphQLOnce("network-administration/snmp", query, variables)
	if err != nil {
		return nil, err
	}

	data, ok := resp.Data["createOID"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	jsonData, _ := json.Marshal(data)
	var oid OID
	if err := json.Unmarshal(jsonData, &oid); err != nil {
		return nil, fmt.Errorf("failed to parse OID response: %w", err)
	}

	log.Info().Str("oid", oid.OID).Str("name", oid.OIDName).Msg("Created OID in ThothOS")
	return &oid, nil
}

// UpdateOID updates an existing OID in ThothOS
func (c *Client) UpdateOID(id string, input OIDInput) (*OID, error) {
	query := `mutation updateOID($companyId: String!, $_id: String!, $input: OIDInput!) {
		updateOID(companyId: $companyId, _id: $_id, input: $input) {
			_id
			companyId
			oidName
			oid
			description
			manufacturerId
			modelId
			productId
		}
	}`

	variables := map[string]interface{}{
		"companyId": c.companyID,
		"_id":       id,
		"input":     input,
	}

	// Single-shot: OID mutations share one no-retry policy (see doGraphQLOnce).
	resp, err := c.doGraphQLOnce("network-administration/snmp", query, variables)
	if err != nil {
		return nil, err
	}

	data, ok := resp.Data["updateOID"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	jsonData, _ := json.Marshal(data)
	var oid OID
	if err := json.Unmarshal(jsonData, &oid); err != nil {
		return nil, fmt.Errorf("failed to parse OID response: %w", err)
	}

	log.Info().Str("id", id).Str("name", oid.OIDName).Msg("Updated OID in ThothOS")
	return &oid, nil
}

// DeleteOID deletes an OID from ThothOS
func (c *Client) DeleteOID(id string) (bool, error) {
	query := `mutation deleteOID($companyId: String!, $_id: String!) {
		deleteOID(companyId: $companyId, _id: $_id)
	}`

	variables := map[string]interface{}{
		"companyId": c.companyID,
		"_id":       id,
	}

	// Single-shot: OID mutations share one no-retry policy (see doGraphQLOnce).
	resp, err := c.doGraphQLOnce("network-administration/snmp", query, variables)
	if err != nil {
		return false, err
	}

	deleted, ok := resp.Data["deleteOID"].(bool)
	if !ok {
		return false, fmt.Errorf("unexpected response format")
	}

	log.Info().Str("id", id).Bool("deleted", deleted).Msg("Deleted OID from ThothOS")
	return deleted, nil
}

// GetSNMPv2Communities fetches SNMPv2 community settings
func (c *Client) GetSNMPv2Communities() ([]SNMPv2Community, error) {
	query := `query getSNMPv2sForCompany($companyId: String!) {
		getSNMPv2sForCompany(companyId: $companyId) {
			_id
			companyId
			communityName
			readCommunity
			writeCommunity
			description
			manufacturerId
			modelId
			productId
		}
	}`

	variables := map[string]interface{}{
		"companyId": c.companyID,
	}

	resp, err := c.doGraphQL("network-administration/snmp", query, variables)
	if err != nil {
		return nil, err
	}

	data, ok := resp.Data["getSNMPv2sForCompany"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	communities := make([]SNMPv2Community, 0, len(data))
	for _, item := range data {
		jsonData, _ := json.Marshal(item)
		var community SNMPv2Community
		if err := json.Unmarshal(jsonData, &community); err != nil {
			log.Warn().Err(err).Msg("Failed to parse SNMPv2 community")
			continue
		}
		communities = append(communities, community)
	}

	log.Info().Int("count", len(communities)).Msg("Fetched SNMPv2 communities")
	return communities, nil
}

// GetSNMPv3Communities fetches SNMPv3 community/security settings
func (c *Client) GetSNMPv3Communities() ([]SNMPv3Community, error) {
	query := `query getSNMPv3sForCompany($companyId: String!) {
		getSNMPv3sForCompany(companyId: $companyId) {
			_id
			companyId
			communityName
			userName
			authMethod
			authPassword
			encryptionMethod
			encryptionPassword
			description
			manufacturerId
			modelId
			productId
		}
	}`

	variables := map[string]interface{}{
		"companyId": c.companyID,
	}

	resp, err := c.doGraphQL("network-administration/snmp", query, variables)
	if err != nil {
		return nil, err
	}

	data, ok := resp.Data["getSNMPv3sForCompany"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	communities := make([]SNMPv3Community, 0, len(data))
	for _, item := range data {
		jsonData, _ := json.Marshal(item)
		var community SNMPv3Community
		if err := json.Unmarshal(jsonData, &community); err != nil {
			log.Warn().Err(err).Msg("Failed to parse SNMPv3 community")
			continue
		}
		communities = append(communities, community)
	}

	log.Info().Int("count", len(communities)).Msg("Fetched SNMPv3 communities")
	return communities, nil
}

// GetSNMPv2Templates fetches SNMPv2 monitoring templates
func (c *Client) GetSNMPv2Templates() ([]SNMPv2Template, error) {
	query := `query getSNMPv2TemplatesForCompany($companyId: String!) {
		getSNMPv2TemplatesForCompany(companyId: $companyId) {
			_id
			companyId
			templateName
			description
			snmpv2SettingId
			oidIds
			manufacturerId
			modelNameId
			productId
			stockIds
			networkInventoryIds
			linkedPollingTemplateId
		}
	}`

	variables := map[string]interface{}{
		"companyId": c.companyID,
	}

	resp, err := c.doGraphQL("network-administration/snmp", query, variables)
	if err != nil {
		return nil, err
	}

	data, ok := resp.Data["getSNMPv2TemplatesForCompany"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	templates := make([]SNMPv2Template, 0, len(data))
	for _, item := range data {
		jsonData, _ := json.Marshal(item)
		var template SNMPv2Template
		if err := json.Unmarshal(jsonData, &template); err != nil {
			log.Warn().Err(err).Msg("Failed to parse SNMPv2 template")
			continue
		}
		templates = append(templates, template)
	}

	log.Info().Int("count", len(templates)).Msg("Fetched SNMPv2 templates")
	return templates, nil
}

// GetSNMPv3Templates fetches SNMPv3 monitoring templates
func (c *Client) GetSNMPv3Templates() ([]SNMPv3Template, error) {
	query := `query getSNMPv3TemplatesForCompany($companyId: String!) {
		getSNMPv3TemplatesForCompany(companyId: $companyId) {
			_id
			companyId
			templateName
			description
			snmpv3SettingId
			oidIds
			manufacturerId
			modelNameId
			productId
			stockIds
			networkInventoryIds
			linkedPollingTemplateId
		}
	}`

	variables := map[string]interface{}{
		"companyId": c.companyID,
	}

	resp, err := c.doGraphQL("network-administration/snmp", query, variables)
	if err != nil {
		return nil, err
	}

	data, ok := resp.Data["getSNMPv3TemplatesForCompany"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	templates := make([]SNMPv3Template, 0, len(data))
	for _, item := range data {
		jsonData, _ := json.Marshal(item)
		var template SNMPv3Template
		if err := json.Unmarshal(jsonData, &template); err != nil {
			log.Warn().Err(err).Msg("Failed to parse SNMPv3 template")
			continue
		}
		templates = append(templates, template)
	}

	log.Info().Int("count", len(templates)).Msg("Fetched SNMPv3 templates")
	return templates, nil
}

// GetSNMPv2PollingTemplates fetches SNMPv2 polling templates
func (c *Client) GetSNMPv2PollingTemplates() ([]SNMPv2PollingTemplate, error) {
	query := `query getSNMPv2PollingTemplatesForCompany($companyId: String!) {
		getSNMPv2PollingTemplatesForCompany(companyId: $companyId) {
			_id
			companyId
			snmpv2TemplateId
			name
			description
			frequency
			timeout
			retries
			pollingFrequency {
				days
				hours
				minutes
				seconds
			}
			downtimeTrigger {
				days
				hours
				minutes
				seconds
			}
		}
	}`

	variables := map[string]interface{}{
		"companyId": c.companyID,
	}

	resp, err := c.doGraphQL("network-administration/snmp", query, variables)
	if err != nil {
		return nil, err
	}

	data, ok := resp.Data["getSNMPv2PollingTemplatesForCompany"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	templates := make([]SNMPv2PollingTemplate, 0, len(data))
	for _, item := range data {
		jsonData, _ := json.Marshal(item)
		var template SNMPv2PollingTemplate
		if err := json.Unmarshal(jsonData, &template); err != nil {
			log.Warn().Err(err).Msg("Failed to parse SNMPv2 polling template")
			continue
		}
		templates = append(templates, template)
	}

	log.Info().Int("count", len(templates)).Msg("Fetched SNMPv2 polling templates")
	return templates, nil
}

// GetSNMPv3PollingTemplates fetches SNMPv3 polling templates
func (c *Client) GetSNMPv3PollingTemplates() ([]SNMPv3PollingTemplate, error) {
	query := `query getSNMPv3PollingTemplatesForCompany($companyId: String!) {
		getSNMPv3PollingTemplatesForCompany(companyId: $companyId) {
			_id
			companyId
			snmpv3TemplateId
			name
			description
			frequency
			timeout
			retries
			pollingFrequency {
				days
				hours
				minutes
				seconds
			}
			downtimeTrigger {
				days
				hours
				minutes
				seconds
			}
		}
	}`

	variables := map[string]interface{}{
		"companyId": c.companyID,
	}

	resp, err := c.doGraphQL("network-administration/snmp", query, variables)
	if err != nil {
		return nil, err
	}

	data, ok := resp.Data["getSNMPv3PollingTemplatesForCompany"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	templates := make([]SNMPv3PollingTemplate, 0, len(data))
	for _, item := range data {
		jsonData, _ := json.Marshal(item)
		var template SNMPv3PollingTemplate
		if err := json.Unmarshal(jsonData, &template); err != nil {
			log.Warn().Err(err).Msg("Failed to parse SNMPv3 polling template")
			continue
		}
		templates = append(templates, template)
	}

	log.Info().Int("count", len(templates)).Msg("Fetched SNMPv3 polling templates")
	return templates, nil
}

// ================================
// IPAM Methods
// ================================

// ipamPageSize is the offset-pagination page size the IPAM getAll walkers
// request per page. ThothOS clamps a requested limit to [1, KERNEL_MAX_CAP=1000]
// server-side, so 1000 is the largest useful page (fewest round-trips). It is a
// package var only so tests can shrink it to exercise the multi-page walk without
// seeding 1000+ rows; production leaves it at 1000.
var ipamPageSize = 1000

// maxIPAMPages bounds the page walk so a misbehaving server that returns a full
// page forever (e.g. ignoring skip) can never hang the proxy in an unbounded
// loop. At the default page size this ceiling is 10,000,000 rows — far above any
// realistic IPAM inventory, so it never truncates real data; it only breaks a
// pathological non-terminating response.
const maxIPAMPages = 10000

// fetchIPAMPages walks the offset-paginated getAll op named responseKey until a
// short page (a page with fewer than ipamPageSize raw rows) signals end-of-data,
// per the shipped IPAM pagination contract:
//
//   - each request sends {companyId, limit: ipamPageSize, skip}
//   - the flat array under responseKey is the page (offset pagination does NOT
//     wrap in a connection envelope)
//   - stop when a page returns fewer than ipamPageSize rows
//
// A query error on ANY page fails the whole walk (returns the error) rather than
// silently returning a partial result — a truncated IPAM inventory is worse than
// a surfaced failure (an operator would allocate already-used addresses). The
// short-page test uses the RAW page length (len(data)), not the parsed count, so
// an unparseable row can't be mistaken for end-of-data.
func fetchIPAMPages[T any](c *Client, path, query, responseKey, label string) ([]T, error) {
	all := make([]T, 0)
	skip := 0

	for page := 0; page < maxIPAMPages; page++ {
		variables := map[string]interface{}{
			"companyId": c.companyID,
			"limit":     ipamPageSize,
			"skip":      skip,
		}

		resp, err := c.doGraphQL(path, query, variables)
		if err != nil {
			return nil, err
		}

		data, ok := resp.Data[responseKey].([]interface{})
		if !ok {
			return nil, fmt.Errorf("unexpected response format for %s", responseKey)
		}

		for _, item := range data {
			jsonData, _ := json.Marshal(item)
			var elem T
			if err := json.Unmarshal(jsonData, &elem); err != nil {
				log.Warn().Err(err).Msgf("Failed to parse %s", label)
				continue
			}
			all = append(all, elem)
		}

		// End of data: a page shorter than the requested size means there are no
		// more rows. Uses the raw page length so a skipped-unparseable row does
		// not prematurely terminate the walk.
		if len(data) < ipamPageSize {
			break
		}
		skip += ipamPageSize
	}

	log.Info().Int("count", len(all)).Msgf("Fetched %s", label)
	return all, nil
}

// GetSupernets fetches all supernets for the company (paged until a short page).
func (c *Client) GetSupernets() ([]Supernet, error) {
	query := `query getSupernetsForCompany($companyId: String!, $limit: Int, $skip: Int) {
		getSupernetsForCompany(companyId: $companyId, limit: $limit, skip: $skip) {
			_id
			companyId
			name
			description
			supernet {
				address
				mask
			}
			createdAt
			updatedAt
		}
	}`

	return fetchIPAMPages[Supernet](c, "network-administration/ipam/supernet", query, "getSupernetsForCompany", "supernet")
}

// GetSubnets fetches all subnets for the company (paged until a short page).
func (c *Client) GetSubnets() ([]Subnet, error) {
	query := `query getSubnetsForCompany($companyId: String!, $limit: Int, $skip: Int) {
		getSubnetsForCompany(companyId: $companyId, limit: $limit, skip: $skip) {
			_id
			companyId
			supernetId
			name
			description
			subnet {
				address
				mask
			}
			gateway
			createdAt
			updatedAt
		}
	}`

	return fetchIPAMPages[Subnet](c, "network-administration/ipam/subnet", query, "getSubnetsForCompany", "subnet")
}

// GetPools fetches all pools for the company (paged until a short page).
func (c *Client) GetPools() ([]Pool, error) {
	query := `query getPoolsForCompany($companyId: String!, $limit: Int, $skip: Int) {
		getPoolsForCompany(companyId: $companyId, limit: $limit, skip: $skip) {
			_id
			companyId
			supernetId
			subnetId
			name
			description
			startIp
			endIp
			createdAt
			updatedAt
		}
	}`

	return fetchIPAMPages[Pool](c, "network-administration/ipam/pool", query, "getPoolsForCompany", "pool")
}

// GetIPAddresses fetches all IP addresses for the company (paged until a short
// page). This is the realistic multi-page case: one fully-enumerated /22 is 1024
// hosts, past the 1000-row default cap, so without paging the address inventory
// and the used/available counters silently truncated.
func (c *Client) GetIPAddresses() ([]IPAddress, error) {
	query := `query getIPAddressesForCompany($companyId: String!, $limit: Int, $skip: Int) {
		getIPAddressesForCompany(companyId: $companyId, limit: $limit, skip: $skip) {
			_id
			companyId
			supernetId
			subnetId
			poolId
			address
			description
			isUsed
			createdAt
			updatedAt
		}
	}`

	return fetchIPAMPages[IPAddress](c, "network-administration/ipam/ip-address", query, "getIPAddressesForCompany", "IP address")
}

// GetVLANs fetches all VLANs for the company (paged until a short page).
func (c *Client) GetVLANs() ([]VLAN, error) {
	query := `query getVLANsForCompany($companyId: String!, $limit: Int, $skip: Int) {
		getVLANsForCompany(companyId: $companyId, limit: $limit, skip: $skip) {
			_id
			companyId
			supernetId
			subnetId
			name
			description
			vlanNumber
			createdAt
			updatedAt
		}
	}`

	return fetchIPAMPages[VLAN](c, "network-administration/ipam/vlan", query, "getVLANsForCompany", "VLAN")
}

// GetIPAMConfig fetches the complete IPAM configuration.
//
// Partial failure is SURFACED, not masked: if any of the five collection queries
// fails, this returns a non-nil error that NAMES the failed collection(s) (joined
// when several fail), alongside whatever partial config it did fetch. Previously
// it swallowed every failure and always returned (config, nil), so a failed
// ip-address query looked identical to "no IP addresses exist" — the IPAM page
// then rendered a torn tree with zero addresses and no warning, and an operator
// doing address planning could allocate already-used addresses. Callers gate on
// the returned error (the handler returns 500; the config-apply step records a
// warning) instead of trusting a silently-incomplete snapshot.
func (c *Client) GetIPAMConfig() (*IPAMConfig, error) {
	config := &IPAMConfig{}
	var fetchErrs []error

	// Fetch supernets
	if supernets, err := c.GetSupernets(); err != nil {
		log.Warn().Err(err).Msg("Failed to fetch supernets")
		fetchErrs = append(fetchErrs, fmt.Errorf("supernets: %w", err))
	} else {
		config.Supernets = supernets
	}

	// Fetch subnets
	if subnets, err := c.GetSubnets(); err != nil {
		log.Warn().Err(err).Msg("Failed to fetch subnets")
		fetchErrs = append(fetchErrs, fmt.Errorf("subnets: %w", err))
	} else {
		config.Subnets = subnets
	}

	// Fetch pools
	if pools, err := c.GetPools(); err != nil {
		log.Warn().Err(err).Msg("Failed to fetch pools")
		fetchErrs = append(fetchErrs, fmt.Errorf("pools: %w", err))
	} else {
		config.Pools = pools
	}

	// Fetch IP addresses
	if ipAddresses, err := c.GetIPAddresses(); err != nil {
		log.Warn().Err(err).Msg("Failed to fetch IP addresses")
		fetchErrs = append(fetchErrs, fmt.Errorf("ipAddresses: %w", err))
	} else {
		config.IPAddresses = ipAddresses
	}

	// Fetch VLANs
	if vlans, err := c.GetVLANs(); err != nil {
		log.Warn().Err(err).Msg("Failed to fetch VLANs")
		fetchErrs = append(fetchErrs, fmt.Errorf("vlans: %w", err))
	} else {
		config.VLANs = vlans
	}

	log.Info().
		Int("supernets", len(config.Supernets)).
		Int("subnets", len(config.Subnets)).
		Int("pools", len(config.Pools)).
		Int("ipAddresses", len(config.IPAddresses)).
		Int("vlans", len(config.VLANs)).
		Int("failedCollections", len(fetchErrs)).
		Msg("Fetched IPAM configuration")

	if len(fetchErrs) > 0 {
		// errors.Join names every failed collection so the caller (and the
		// operator) can see exactly which data is missing rather than trusting a
		// silently-torn snapshot.
		return config, fmt.Errorf("IPAM config incomplete: %w", errors.Join(fetchErrs...))
	}

	return config, nil
}
