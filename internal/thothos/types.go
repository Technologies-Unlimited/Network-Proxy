package thothos

import "time"

// ApiKeyValidationResponse is the response from /api/auth/api-key/validate
type ApiKeyValidationResponse struct {
	Valid       bool     `json:"valid"`
	CompanyID   string   `json:"companyId,omitempty"`
	ApiKeyID    string   `json:"apiKeyId,omitempty"`
	Name        string   `json:"name,omitempty"`
	Permissions []string `json:"permissions,omitempty"`
	ProxyID     string   `json:"proxyId,omitempty"`
	ExpiresAt   string   `json:"expiresAt,omitempty"`
	Error       string   `json:"error,omitempty"`
}

// ProxyConfig represents the proxy configuration from ThothOS
type ProxyConfig struct {
	ID            string     `json:"_id"`
	CompanyID     string     `json:"companyId"`
	SupernetID    string     `json:"supernetId"`
	SubnetID      string     `json:"subnetId"`
	ProxyName     string     `json:"proxyName"`
	ProxyStatus   string     `json:"proxyStatus"`
	Description   string     `json:"description"`
	IPAddress     string     `json:"ipAddress,omitempty"`
	Port          int        `json:"port,omitempty"`
	CallbackURL   string     `json:"callbackUrl,omitempty"`
	Version       string     `json:"version,omitempty"`
	LastHeartbeat *time.Time `json:"lastHeartbeat,omitempty"`
	ApiKeyID      string     `json:"apiKeyId,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}

// ================================
// Time Interval for polling configurations
// ================================

// TimeInterval represents a time duration broken into components
type TimeInterval struct {
	Days    int `json:"days"`
	Hours   int `json:"hours"`
	Minutes int `json:"minutes"`
	Seconds int `json:"seconds"`
}

// ================================
// ICMP Types from ThothOS
// ================================

// ICMPMonitoringTemplate from ThothOS (threshold configuration)
type ICMPMonitoringTemplate struct {
	ID                      string   `json:"_id"`
	CompanyID               string   `json:"companyId"`
	TemplateName            string   `json:"templateName"`
	TemplateDescription     string   `json:"templateDescription"`
	ICMPLossThreshold       float64  `json:"icmpLossThreshold"`
	ICMPLatencyThreshold    float64  `json:"icmpLatencyThreshold"`
	ManufacturerID          string   `json:"manufacturerId,omitempty"`
	ModelNameID             string   `json:"modelNameId,omitempty"`
	ProductID               string   `json:"productId,omitempty"`
	StockIDs                []string `json:"stockIds,omitempty"`
	NetworkInventoryIDs     []string `json:"networkInventoryIds,omitempty"`
	LinkedPollingTemplateID string   `json:"linkedPollingTemplateId,omitempty"`
}

// ICMPPollingTemplate from ThothOS (polling frequency configuration)
type ICMPPollingTemplate struct {
	ID               string       `json:"_id"`
	CompanyID        string       `json:"companyId"`
	ICMPTemplateID   string       `json:"icmpTemplateId"`
	Name             string       `json:"name"`
	Description      string       `json:"description"`
	Frequency        int          `json:"frequency"`
	Timeout          int          `json:"timeout"`
	Retries          int          `json:"retries"`
	PollingFrequency TimeInterval `json:"pollingFrequency"`
	DowntimeTrigger  TimeInterval `json:"downtimeTrigger"`
}

// ================================
// SNMP Types from ThothOS
// ================================

// OID from ThothOS
type OID struct {
	ID             string `json:"_id"`
	CompanyID      string `json:"companyId"`
	OIDName        string `json:"oidName"`
	OID            string `json:"oid"`
	Description    string `json:"description"`
	ManufacturerID string `json:"manufacturerId,omitempty"`
	ModelID        string `json:"modelId,omitempty"`
	ProductID      string `json:"productId,omitempty"`
}

// SNMPv2Community from ThothOS (community settings)
type SNMPv2Community struct {
	ID             string `json:"_id"`
	CompanyID      string `json:"companyId"`
	CommunityName  string `json:"communityName"`
	ReadCommunity  string `json:"readCommunity"`
	WriteCommunity string `json:"writeCommunity"`
	Description    string `json:"description"`
	ManufacturerID string `json:"manufacturerId,omitempty"`
	ModelID        string `json:"modelId,omitempty"`
	ProductID      string `json:"productId,omitempty"`
}

// SNMPv3Community from ThothOS (v3 security settings)
type SNMPv3Community struct {
	ID                 string `json:"_id"`
	CompanyID          string `json:"companyId"`
	CommunityName      string `json:"communityName"`
	UserName           string `json:"userName"`
	AuthMethod         string `json:"authMethod"`
	AuthPassword       string `json:"authPassword"`
	EncryptionMethod   string `json:"encryptionMethod"`
	EncryptionPassword string `json:"encryptionPassword"`
	Description        string `json:"description"`
	ManufacturerID     string `json:"manufacturerId,omitempty"`
	ModelID            string `json:"modelId,omitempty"`
	ProductID          string `json:"productId,omitempty"`
}

// SNMPv2Template from ThothOS (monitoring template)
type SNMPv2Template struct {
	ID                      string   `json:"_id"`
	CompanyID               string   `json:"companyId"`
	TemplateName            string   `json:"templateName"`
	Description             string   `json:"description"`
	SNMPv2SettingID         string   `json:"snmpv2SettingId"`
	OIDIDs                  []string `json:"oidIds,omitempty"`
	ManufacturerID          string   `json:"manufacturerId,omitempty"`
	ModelNameID             string   `json:"modelNameId,omitempty"`
	ProductID               string   `json:"productId,omitempty"`
	StockIDs                []string `json:"stockIds,omitempty"`
	NetworkInventoryIDs     []string `json:"networkInventoryIds,omitempty"`
	LinkedPollingTemplateID string   `json:"linkedPollingTemplateId,omitempty"`
}

// SNMPv3Template from ThothOS (monitoring template)
type SNMPv3Template struct {
	ID                      string   `json:"_id"`
	CompanyID               string   `json:"companyId"`
	TemplateName            string   `json:"templateName"`
	Description             string   `json:"description"`
	SNMPv3SettingID         string   `json:"snmpv3SettingId"`
	OIDIDs                  []string `json:"oidIds,omitempty"`
	ManufacturerID          string   `json:"manufacturerId,omitempty"`
	ModelNameID             string   `json:"modelNameId,omitempty"`
	ProductID               string   `json:"productId,omitempty"`
	StockIDs                []string `json:"stockIds,omitempty"`
	NetworkInventoryIDs     []string `json:"networkInventoryIds,omitempty"`
	LinkedPollingTemplateID string   `json:"linkedPollingTemplateId,omitempty"`
}

// SNMPv2PollingTemplate from ThothOS
type SNMPv2PollingTemplate struct {
	ID               string       `json:"_id"`
	CompanyID        string       `json:"companyId"`
	SNMPv2TemplateID string       `json:"snmpv2TemplateId"`
	Name             string       `json:"name"`
	Description      string       `json:"description"`
	Frequency        int          `json:"frequency"`
	Timeout          int          `json:"timeout"`
	Retries          int          `json:"retries"`
	PollingFrequency TimeInterval `json:"pollingFrequency"`
	DowntimeTrigger  TimeInterval `json:"downtimeTrigger"`
}

// SNMPv3PollingTemplate from ThothOS
type SNMPv3PollingTemplate struct {
	ID               string       `json:"_id"`
	CompanyID        string       `json:"companyId"`
	SNMPv3TemplateID string       `json:"snmpv3TemplateId"`
	Name             string       `json:"name"`
	Description      string       `json:"description"`
	Frequency        int          `json:"frequency"`
	Timeout          int          `json:"timeout"`
	Retries          int          `json:"retries"`
	PollingFrequency TimeInterval `json:"pollingFrequency"`
	DowntimeTrigger  TimeInterval `json:"downtimeTrigger"`
}

// GraphQLRequest is a generic GraphQL request
type GraphQLRequest struct {
	Query     string                 `json:"query"`
	Variables map[string]interface{} `json:"variables"`
}

// GraphQLResponse is a generic GraphQL response
type GraphQLResponse struct {
	Data   map[string]interface{} `json:"data,omitempty"`
	Errors []GraphQLError         `json:"errors,omitempty"`
}

// GraphQLError represents a GraphQL error
type GraphQLError struct {
	Message    string   `json:"message"`
	Path       []string `json:"path,omitempty"`
	Extensions struct {
		Code         string                   `json:"code,omitempty"`
		Dependencies []map[string]interface{} `json:"dependencies,omitempty"`
	} `json:"extensions,omitempty"`
}

// ProxyRegistrationInput is the input for registering a proxy
type ProxyRegistrationInput struct {
	ProxyName   string `json:"proxyName"`
	Description string `json:"description"`
	SupernetID  string `json:"supernetId"`
	SubnetID    string `json:"subnetId"`
	IPAddress   string `json:"ipAddress"`
	Port        int    `json:"port"`
	CallbackURL string `json:"callbackUrl"`
	Version     string `json:"version"`
}

// HeartbeatStatus is the status sent in heartbeat
type HeartbeatStatus struct {
	IPAddress   string `json:"ipAddress,omitempty"`
	Port        int    `json:"port,omitempty"`
	Version     string `json:"version,omitempty"`
	AgentCount  int    `json:"agentCount,omitempty"`
	DeviceCount int    `json:"deviceCount,omitempty"`
}

// ================================
// Monitoring results (NM -> ThothOS results-up channel)
// ================================

// MonitoringResult is one device's latest monitoring sample as reported to
// ThothOS's reportMonitoringResults mutation. It is the results-up half of the
// integration: the proxy's ICMP/SNMP pollers observe up/down + latency + loss
// on the buyer's LAN and batch them here so a down router is visible in ThothOS.
//
// Wire contract (ThothOS DeviceStatus entity, results.entity.ts):
//   - deviceName/ipAddress are REQUIRED and must be non-empty (server trims and
//     throws on empty) — the reporter never enqueues a device missing either.
//   - status MUST be "up" or "down" (any other value throws server-side, failing
//     the whole batch) — never-polled/unknown devices are excluded upstream.
//   - latencyMs/packetLossPct are optional; a nil pointer omits the field (so a
//     genuine 0 is still sent, distinct from "not measured").
//   - checkedAt is an optional ISO-8601 string (server defaults to now()).
type MonitoringResult struct {
	DeviceName    string   `json:"deviceName"`
	IPAddress     string   `json:"ipAddress"`
	DeviceType    string   `json:"deviceType,omitempty"`
	Status        string   `json:"status"`
	LatencyMs     *float64 `json:"latencyMs,omitempty"`
	PacketLossPct *float64 `json:"packetLossPct,omitempty"`
	CheckedAt     string   `json:"checkedAt,omitempty"`
}

// MonitoringReportResult is ThothOS's response to reportMonitoringResults: how
// many device-status rows it upserted this call.
type MonitoringReportResult struct {
	Success  bool `json:"success"`
	Upserted int  `json:"upserted"`
}

// ================================
// IPAM Types from ThothOS
// ================================

// SupernetCIDR represents the supernet address and mask
type SupernetCIDR struct {
	Address string `json:"address"`
	Mask    int    `json:"mask"`
}

// Supernet from ThothOS IPAM
type Supernet struct {
	ID          string       `json:"_id"`
	CompanyID   string       `json:"companyId"`
	Name        string       `json:"name"`
	Description string       `json:"description,omitempty"`
	Supernet    SupernetCIDR `json:"supernet"`
	CreatedAt   string       `json:"createdAt"`
	UpdatedAt   string       `json:"updatedAt"`
}

// SubnetCIDR represents the subnet address and mask
type SubnetCIDR struct {
	Address string `json:"address"`
	Mask    int    `json:"mask"`
}

// Subnet from ThothOS IPAM
type Subnet struct {
	ID          string     `json:"_id"`
	CompanyID   string     `json:"companyId"`
	SupernetID  string     `json:"supernetId"`
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	Subnet      SubnetCIDR `json:"subnet"`
	Gateway     string     `json:"gateway"`
	CreatedAt   string     `json:"createdAt"`
	UpdatedAt   string     `json:"updatedAt"`
}

// Pool from ThothOS IPAM
type Pool struct {
	ID          string `json:"_id"`
	CompanyID   string `json:"companyId"`
	SupernetID  string `json:"supernetId"`
	SubnetID    string `json:"subnetId"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	StartIP     string `json:"startIp"`
	EndIP       string `json:"endIp"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

// IPAddress from ThothOS IPAM
type IPAddress struct {
	ID          string `json:"_id"`
	CompanyID   string `json:"companyId"`
	SupernetID  string `json:"supernetId"`
	SubnetID    string `json:"subnetId"`
	PoolID      string `json:"poolId"`
	Address     string `json:"address"`
	Description string `json:"description"`
	IsUsed      bool   `json:"isUsed"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

// VLAN from ThothOS IPAM
type VLAN struct {
	ID          string `json:"_id"`
	CompanyID   string `json:"companyId"`
	SupernetID  string `json:"supernetId"`
	SubnetID    string `json:"subnetId"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	VLANNumber  int    `json:"vlanNumber"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

// IPAMConfig is the complete IPAM configuration from ThothOS
type IPAMConfig struct {
	Supernets   []Supernet  `json:"supernets"`
	Subnets     []Subnet    `json:"subnets"`
	Pools       []Pool      `json:"pools"`
	IPAddresses []IPAddress `json:"ipAddresses"`
	VLANs       []VLAN      `json:"vlans"`
}
