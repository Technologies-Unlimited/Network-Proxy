package thothos

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/rs/zerolog/log"
)

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

// ValidateAPIKey validates the API key and caches the response
func (c *Client) ValidateAPIKey() (*ApiKeyValidationResponse, error) {
	url := fmt.Sprintf("%s/api/auth/api-key/validate", c.baseURL)

	req, err := http.NewRequest("POST", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.apiKey))
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
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

// doGraphQL executes a GraphQL request
func (c *Client) doGraphQL(path string, query string, variables map[string]interface{}) (*GraphQLResponse, error) {
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

	resp, err := c.httpClient.Do(req)
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

	variables := map[string]interface{}{
		"companyId": c.companyID,
		"apiKeyId":  c.apiKeyID,
		"input": map[string]interface{}{
			"proxyName":   input.ProxyName,
			"description": input.Description,
			"supernetId":  input.SupernetID,
			"subnetId":    input.SubnetID,
			"ipAddress":   input.IPAddress,
			"port":        input.Port,
			"callbackUrl": input.CallbackURL,
			"version":     input.Version,
		},
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

// RegisterWebhook registers a webhook to receive config updates
func (c *Client) RegisterWebhook(input WebhookRegistrationInput) (*WebhookRegistrationResponse, error) {
	query := `mutation registerWebhook($companyId: String!, $input: WebhookInput!) {
		registerWebhook(companyId: $companyId, input: $input) {
			_id
			name
			callbackUrl
			events
			secret
			isActive
		}
	}`

	variables := map[string]interface{}{
		"companyId": c.companyID,
		"input": map[string]interface{}{
			"name":        input.Name,
			"callbackUrl": input.CallbackURL,
			"events":      input.Events,
			"proxyId":     input.ProxyID,
		},
	}

	resp, err := c.doGraphQL("network-administration/webhook", query, variables)
	if err != nil {
		return nil, err
	}

	data, ok := resp.Data["registerWebhook"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	webhook := &WebhookRegistrationResponse{}
	jsonData, _ := json.Marshal(data)
	if err := json.Unmarshal(jsonData, webhook); err != nil {
		return nil, fmt.Errorf("failed to parse webhook response: %w", err)
	}

	log.Info().
		Str("webhookId", webhook.ID).
		Str("callbackUrl", webhook.CallbackURL).
		Strs("events", webhook.Events).
		Msg("Webhook registered successfully")

	return webhook, nil
}

// ================================
// IPAM Methods
// ================================

// GetSupernets fetches all supernets for the company
func (c *Client) GetSupernets() ([]Supernet, error) {
	query := `query getSupernetsForCompany($companyId: String!) {
		getSupernetsForCompany(companyId: $companyId) {
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

	variables := map[string]interface{}{
		"companyId": c.companyID,
	}

	resp, err := c.doGraphQL("network-administration/ipam/supernet", query, variables)
	if err != nil {
		return nil, err
	}

	data, ok := resp.Data["getSupernetsForCompany"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	supernets := make([]Supernet, 0, len(data))
	for _, item := range data {
		jsonData, _ := json.Marshal(item)
		var supernet Supernet
		if err := json.Unmarshal(jsonData, &supernet); err != nil {
			log.Warn().Err(err).Msg("Failed to parse supernet")
			continue
		}
		supernets = append(supernets, supernet)
	}

	log.Info().Int("count", len(supernets)).Msg("Fetched supernets")
	return supernets, nil
}

// GetSubnets fetches all subnets for the company
func (c *Client) GetSubnets() ([]Subnet, error) {
	query := `query getSubnetsForCompany($companyId: String!) {
		getSubnetsForCompany(companyId: $companyId) {
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

	variables := map[string]interface{}{
		"companyId": c.companyID,
	}

	resp, err := c.doGraphQL("network-administration/ipam/subnet", query, variables)
	if err != nil {
		return nil, err
	}

	data, ok := resp.Data["getSubnetsForCompany"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	subnets := make([]Subnet, 0, len(data))
	for _, item := range data {
		jsonData, _ := json.Marshal(item)
		var subnet Subnet
		if err := json.Unmarshal(jsonData, &subnet); err != nil {
			log.Warn().Err(err).Msg("Failed to parse subnet")
			continue
		}
		subnets = append(subnets, subnet)
	}

	log.Info().Int("count", len(subnets)).Msg("Fetched subnets")
	return subnets, nil
}

// GetPools fetches all pools for the company
func (c *Client) GetPools() ([]Pool, error) {
	query := `query getPoolsForCompany($companyId: String!) {
		getPoolsForCompany(companyId: $companyId) {
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

	variables := map[string]interface{}{
		"companyId": c.companyID,
	}

	resp, err := c.doGraphQL("network-administration/ipam/pool", query, variables)
	if err != nil {
		return nil, err
	}

	data, ok := resp.Data["getPoolsForCompany"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	pools := make([]Pool, 0, len(data))
	for _, item := range data {
		jsonData, _ := json.Marshal(item)
		var pool Pool
		if err := json.Unmarshal(jsonData, &pool); err != nil {
			log.Warn().Err(err).Msg("Failed to parse pool")
			continue
		}
		pools = append(pools, pool)
	}

	log.Info().Int("count", len(pools)).Msg("Fetched pools")
	return pools, nil
}

// GetIPAddresses fetches all IP addresses for the company
func (c *Client) GetIPAddresses() ([]IPAddress, error) {
	query := `query getIPAddressesForCompany($companyId: String!) {
		getIPAddressesForCompany(companyId: $companyId) {
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

	variables := map[string]interface{}{
		"companyId": c.companyID,
	}

	resp, err := c.doGraphQL("network-administration/ipam/ipaddress", query, variables)
	if err != nil {
		return nil, err
	}

	data, ok := resp.Data["getIPAddressesForCompany"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	ipAddresses := make([]IPAddress, 0, len(data))
	for _, item := range data {
		jsonData, _ := json.Marshal(item)
		var ip IPAddress
		if err := json.Unmarshal(jsonData, &ip); err != nil {
			log.Warn().Err(err).Msg("Failed to parse IP address")
			continue
		}
		ipAddresses = append(ipAddresses, ip)
	}

	log.Info().Int("count", len(ipAddresses)).Msg("Fetched IP addresses")
	return ipAddresses, nil
}

// GetVLANs fetches all VLANs for the company
func (c *Client) GetVLANs() ([]VLAN, error) {
	query := `query getVLANsForCompany($companyId: String!) {
		getVLANsForCompany(companyId: $companyId) {
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

	variables := map[string]interface{}{
		"companyId": c.companyID,
	}

	resp, err := c.doGraphQL("network-administration/ipam/vlan", query, variables)
	if err != nil {
		return nil, err
	}

	data, ok := resp.Data["getVLANsForCompany"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	vlans := make([]VLAN, 0, len(data))
	for _, item := range data {
		jsonData, _ := json.Marshal(item)
		var vlan VLAN
		if err := json.Unmarshal(jsonData, &vlan); err != nil {
			log.Warn().Err(err).Msg("Failed to parse VLAN")
			continue
		}
		vlans = append(vlans, vlan)
	}

	log.Info().Int("count", len(vlans)).Msg("Fetched VLANs")
	return vlans, nil
}

// GetIPAMConfig fetches the complete IPAM configuration
func (c *Client) GetIPAMConfig() (*IPAMConfig, error) {
	config := &IPAMConfig{}

	// Fetch supernets
	supernets, err := c.GetSupernets()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to fetch supernets")
	} else {
		config.Supernets = supernets
	}

	// Fetch subnets
	subnets, err := c.GetSubnets()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to fetch subnets")
	} else {
		config.Subnets = subnets
	}

	// Fetch pools
	pools, err := c.GetPools()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to fetch pools")
	} else {
		config.Pools = pools
	}

	// Fetch IP addresses
	ipAddresses, err := c.GetIPAddresses()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to fetch IP addresses")
	} else {
		config.IPAddresses = ipAddresses
	}

	// Fetch VLANs
	vlans, err := c.GetVLANs()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to fetch VLANs")
	} else {
		config.VLANs = vlans
	}

	log.Info().
		Int("supernets", len(config.Supernets)).
		Int("subnets", len(config.Subnets)).
		Int("pools", len(config.Pools)).
		Int("ipAddresses", len(config.IPAddresses)).
		Int("vlans", len(config.VLANs)).
		Msg("Fetched complete IPAM configuration")

	return config, nil
}
