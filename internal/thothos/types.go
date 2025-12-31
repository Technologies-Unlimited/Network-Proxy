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

// ICMPMonitoringTemplate from ThothOS
type ICMPMonitoringTemplate struct {
	ID          string `json:"_id"`
	CompanyID   string `json:"companyId"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Interval    int    `json:"interval"`    // seconds between pings
	Timeout     int    `json:"timeout"`     // milliseconds
	PacketSize  int    `json:"packetSize"`  // bytes
	PacketCount int    `json:"packetCount"` // number of packets per poll
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

// ICMPPollingTemplate from ThothOS
type ICMPPollingTemplate struct {
	ID                   string `json:"_id"`
	CompanyID            string `json:"companyId"`
	Name                 string `json:"name"`
	Description          string `json:"description"`
	MonitoringTemplateID string `json:"monitoringTemplateId"`
	Enabled              bool   `json:"enabled"`
	Schedule             string `json:"schedule"` // cron expression or interval
	CreatedAt            string `json:"createdAt"`
	UpdatedAt            string `json:"updatedAt"`
}

// SNMPv2Template from ThothOS
type SNMPv2Template struct {
	ID          string   `json:"_id"`
	CompanyID   string   `json:"companyId"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Community   string   `json:"community"`
	Port        int      `json:"port"`
	Timeout     int      `json:"timeout"` // milliseconds
	Retries     int      `json:"retries"`
	OIDList     []string `json:"oidList"`
	CreatedAt   string   `json:"createdAt"`
	UpdatedAt   string   `json:"updatedAt"`
}

// SNMPv3Template from ThothOS
type SNMPv3Template struct {
	ID                 string   `json:"_id"`
	CompanyID          string   `json:"companyId"`
	Name               string   `json:"name"`
	Description        string   `json:"description"`
	SecurityLevel      string   `json:"securityLevel"` // noAuthNoPriv, authNoPriv, authPriv
	AuthProtocol       string   `json:"authProtocol"`  // MD5, SHA
	AuthPassword       string   `json:"authPassword"`
	PrivProtocol       string   `json:"privProtocol"` // DES, AES
	PrivPassword       string   `json:"privPassword"`
	ContextName        string   `json:"contextName"`
	SecurityName       string   `json:"securityName"`
	Port               int      `json:"port"`
	Timeout            int      `json:"timeout"` // milliseconds
	Retries            int      `json:"retries"`
	OIDList            []string `json:"oidList"`
	CreatedAt          string   `json:"createdAt"`
	UpdatedAt          string   `json:"updatedAt"`
}

// WebhookPayload is the payload received from ThothOS webhooks
type WebhookPayload struct {
	Event     string                 `json:"event"`
	Timestamp string                 `json:"timestamp"`
	CompanyID string                 `json:"companyId"`
	ProxyID   string                 `json:"proxyId,omitempty"`
	Data      map[string]interface{} `json:"data"`
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

// WebhookRegistrationInput is the input for registering a webhook
type WebhookRegistrationInput struct {
	Name        string   `json:"name"`
	CallbackURL string   `json:"callbackUrl"`
	Events      []string `json:"events"`
	ProxyID     string   `json:"proxyId,omitempty"`
}

// WebhookRegistrationResponse is the response from registering a webhook
type WebhookRegistrationResponse struct {
	ID          string   `json:"_id"`
	Name        string   `json:"name"`
	CallbackURL string   `json:"callbackUrl"`
	Events      []string `json:"events"`
	Secret      string   `json:"secret"` // Only returned on creation
	IsActive    bool     `json:"isActive"`
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
