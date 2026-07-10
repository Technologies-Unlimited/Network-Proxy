package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/envcfg"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/thothos"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// WebhookConfig holds the webhook configuration
type WebhookConfig struct {
	Secret string
	mu     sync.RWMutex
}

var webhookConfig = &WebhookConfig{}

// SetWebhookSecret sets the webhook secret for signature verification
func SetWebhookSecret(secret string) {
	webhookConfig.mu.Lock()
	defer webhookConfig.mu.Unlock()
	webhookConfig.Secret = secret
	log.Info().Msg("Webhook secret configured")
}

// GetWebhookSecret returns the current webhook secret
func GetWebhookSecret() string {
	webhookConfig.mu.RLock()
	defer webhookConfig.mu.RUnlock()
	return webhookConfig.Secret
}

// PersistWebhookCredentials stores the webhook ID + secret on the ProxyConfig
// row (when one exists) so a process restart can verify webhook signatures
// before — or without — a successful re-registration with ThothOS. The
// in-memory secret alone is lost on restart, which left a window where every
// inbound webhook 401'd until re-registration completed. Settings-flow
// installs without a ProxyConfig row are a no-op; their secret is refreshed
// by the registration that runs on every boot. Encryption at rest is handled
// by the model's BeforeSave hook.
func PersistWebhookCredentials(db *gorm.DB, webhookID, secret string) {
	var config models.ProxyConfig
	if err := db.First(&config).Error; err != nil {
		return
	}
	config.WebhookID = webhookID
	config.WebhookSecret = secret
	if err := db.Save(&config).Error; err != nil {
		log.Error().Err(err).Msg("Failed to persist webhook credentials")
	}
}

// ConfigCache stores the latest configuration from ThothOS
type ConfigCache struct {
	mu               sync.RWMutex
	ICMPMonitoring   []thothos.ICMPMonitoringTemplate
	ICMPPolling      []thothos.ICMPPollingTemplate
	SNMPv2Templates  []thothos.SNMPv2Template
	SNMPv3Templates  []thothos.SNMPv3Template
	LastSyncTime     string

	// IPAM data
	Supernets   []thothos.Supernet
	Subnets     []thothos.Subnet
	Pools       []thothos.Pool
	IPAddresses []thothos.IPAddress
	VLANs       []thothos.VLAN
}

var configCache = &ConfigCache{}

// GetConfigCache returns the current config cache
func GetConfigCache() *ConfigCache {
	return configCache
}

// UpdateICMPMonitoringTemplates updates the ICMP monitoring templates in cache
func (c *ConfigCache) UpdateICMPMonitoringTemplates(templates []thothos.ICMPMonitoringTemplate) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.ICMPMonitoring = templates
	log.Info().Int("count", len(templates)).Msg("Updated ICMP monitoring templates in cache")
}

// UpdateICMPPollingTemplates updates the ICMP polling templates in cache
func (c *ConfigCache) UpdateICMPPollingTemplates(templates []thothos.ICMPPollingTemplate) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.ICMPPolling = templates
	log.Info().Int("count", len(templates)).Msg("Updated ICMP polling templates in cache")
}

// UpdateSNMPv2Templates updates the SNMPv2 templates in cache
func (c *ConfigCache) UpdateSNMPv2Templates(templates []thothos.SNMPv2Template) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.SNMPv2Templates = templates
	log.Info().Int("count", len(templates)).Msg("Updated SNMPv2 templates in cache")
}

// UpdateSNMPv3Templates updates the SNMPv3 templates in cache
func (c *ConfigCache) UpdateSNMPv3Templates(templates []thothos.SNMPv3Template) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.SNMPv3Templates = templates
	log.Info().Int("count", len(templates)).Msg("Updated SNMPv3 templates in cache")
}

// GetICMPMonitoringTemplates returns ICMP monitoring templates from cache
func (c *ConfigCache) GetICMPMonitoringTemplates() []thothos.ICMPMonitoringTemplate {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.ICMPMonitoring
}

// GetICMPPollingTemplates returns ICMP polling templates from cache
func (c *ConfigCache) GetICMPPollingTemplates() []thothos.ICMPPollingTemplate {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.ICMPPolling
}

// GetSNMPv2Templates returns SNMPv2 templates from cache
func (c *ConfigCache) GetSNMPv2Templates() []thothos.SNMPv2Template {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.SNMPv2Templates
}

// GetSNMPv3Templates returns SNMPv3 templates from cache
func (c *ConfigCache) GetSNMPv3Templates() []thothos.SNMPv3Template {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.SNMPv3Templates
}

// UpdateIPAMConfig updates the full IPAM configuration in cache
func (c *ConfigCache) UpdateIPAMConfig(config *thothos.IPAMConfig) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.Supernets = config.Supernets
	c.Subnets = config.Subnets
	c.Pools = config.Pools
	c.IPAddresses = config.IPAddresses
	c.VLANs = config.VLANs
	log.Info().
		Int("supernets", len(config.Supernets)).
		Int("subnets", len(config.Subnets)).
		Int("pools", len(config.Pools)).
		Int("ipAddresses", len(config.IPAddresses)).
		Int("vlans", len(config.VLANs)).
		Msg("Updated IPAM configuration in cache")
}

// GetSupernets returns supernets from cache
func (c *ConfigCache) GetSupernets() []thothos.Supernet {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.Supernets
}

// GetSubnets returns subnets from cache
func (c *ConfigCache) GetSubnets() []thothos.Subnet {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.Subnets
}

// GetPools returns pools from cache
func (c *ConfigCache) GetPools() []thothos.Pool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.Pools
}

// GetIPAddresses returns IP addresses from cache
func (c *ConfigCache) GetIPAddresses() []thothos.IPAddress {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.IPAddresses
}

// GetVLANs returns VLANs from cache
func (c *ConfigCache) GetVLANs() []thothos.VLAN {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.VLANs
}

// verifyWebhookSignature verifies the HMAC signature of a webhook payload
func verifyWebhookSignature(payload []byte, signature string) bool {
	secret := GetWebhookSecret()
	if secret == "" {
		log.Error().Msg("Webhook secret not configured - rejecting webhook for security")
		return false
	}
	if signature == "" {
		log.Warn().Msg("Webhook received without signature")
		return false
	}

	// Length-check first so the constant-time compare doesn't leak length
	// via early-return.
	expected := computeWebhookHMAC(secret, payload)
	if len(signature) != len(expected) {
		return false
	}
	return hmac.Equal([]byte(signature), []byte(expected))
}

// computeWebhookHMAC computes the canonical webhook signature: sha256-HMAC
// over the raw request body. Wrapped so the replay-protection variant
// (signature-with-timestamp) shares the same primitive.
func computeWebhookHMAC(secret string, payload []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}

// computeWebhookHMACWithTimestamp binds a timestamp into the signed input so
// captured (body, signature) pairs can't be replayed indefinitely. The
// timestamp is included in the HMAC pre-image as `timestamp + "." + body`.
func computeWebhookHMACWithTimestamp(secret, timestamp string, payload []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp))
	mac.Write([]byte("."))
	mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}

// webhookReplayWindow is the maximum acceptable skew between a signed
// webhook timestamp and now. Anything outside the window is rejected even
// if the signature is otherwise valid.
const webhookReplayWindow = 5 * time.Minute

// seenWebhookIDs tracks recently-processed webhook IDs to defend against
// in-window replays. Entries expire after webhookReplayWindow. A background
// ticker (started by init) sweeps the map every minute so the hot path
// stays O(1) — the previous implementation walked the whole map on every
// webhook, which became a latency spike at scale.
var (
	seenWebhookMu  sync.Mutex
	seenWebhookIDs = map[string]time.Time{}
)

func init() {
	go func() {
		t := time.NewTicker(time.Minute)
		defer t.Stop()
		for range t.C {
			gcSeenWebhookIDs(time.Now())
		}
	}()
}

func gcSeenWebhookIDs(now time.Time) {
	seenWebhookMu.Lock()
	defer seenWebhookMu.Unlock()
	for k, ts := range seenWebhookIDs {
		if now.Sub(ts) > webhookReplayWindow {
			delete(seenWebhookIDs, k)
		}
	}
}

// validateAndConsumeWebhookID returns true if id has not been seen recently
// and records it. An empty id is allowed (legacy senders) but loses replay
// protection at the ID layer; the timestamp window still applies.
func validateAndConsumeWebhookID(id string) bool {
	if id == "" {
		return true
	}
	seenWebhookMu.Lock()
	defer seenWebhookMu.Unlock()
	if _, dup := seenWebhookIDs[id]; dup {
		return false
	}
	seenWebhookIDs[id] = time.Now()
	return true
}

// verifyWebhookTimestamp parses an X-Webhook-Timestamp header (RFC3339 or
// unix seconds) and returns an error if it is missing, malformed, or
// outside the allowed skew window.
func verifyWebhookTimestamp(ts string) error {
	if ts == "" {
		return fmt.Errorf("missing X-Webhook-Timestamp")
	}
	var sent time.Time
	if t, err := time.Parse(time.RFC3339, ts); err == nil {
		sent = t
	} else if secs, err := strconv.ParseInt(ts, 10, 64); err == nil {
		sent = time.Unix(secs, 0)
	} else {
		return fmt.Errorf("malformed timestamp: %s", ts)
	}
	if d := time.Since(sent); d > webhookReplayWindow || d < -webhookReplayWindow {
		return fmt.Errorf("timestamp outside replay window: skew=%s", d.Round(time.Second))
	}
	return nil
}

// handleWebhook handles incoming webhooks from ThothOS
func handleWebhook(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			// Distinguish "body exceeded the BodyLimit middleware cap" from
			// a generic read error so senders can tell whether to retry
			// (network blip) or fix their payload (oversized).
			var maxBytesErr *http.MaxBytesError
			if errors.As(err, &maxBytesErr) {
				log.Warn().Int64("limit", maxBytesErr.Limit).Msg("Webhook body exceeded size limit")
				c.JSON(http.StatusRequestEntityTooLarge, gin.H{
					"error": fmt.Sprintf("payload exceeded %d bytes", maxBytesErr.Limit),
				})
				return
			}
			log.Error().Err(err).Msg("Failed to read webhook body")
			c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read body"})
			return
		}

		// Replay protection: if the sender includes a timestamp, validate
		// it falls inside the allowed skew window AND verify the signature
		// covers (timestamp || body). If no timestamp is sent, fall back to
		// the legacy body-only verification path so older callers still
		// work — operators that want to require timestamps everywhere can
		// set WEBHOOK_REQUIRE_TIMESTAMP=true.
		signature := c.GetHeader("X-Webhook-Signature")
		timestamp := c.GetHeader("X-Webhook-Timestamp")
		webhookID := c.GetHeader("X-Webhook-Id")
		requireTS := envcfg.Bool("WEBHOOK_REQUIRE_TIMESTAMP")

		if timestamp != "" || requireTS {
			if err := verifyWebhookTimestamp(timestamp); err != nil {
				log.Warn().Err(err).Msg("Webhook timestamp rejected")
				c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
				return
			}
			secret := GetWebhookSecret()
			if secret == "" {
				log.Error().Msg("Webhook secret not configured - rejecting timestamped webhook")
				c.JSON(http.StatusUnauthorized, gin.H{"error": "secret not configured"})
				return
			}
			expected := computeWebhookHMACWithTimestamp(secret, timestamp, body)
			if len(signature) != len(expected) || !hmac.Equal([]byte(signature), []byte(expected)) {
				log.Warn().Msg("Invalid webhook signature (timestamped)")
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid signature"})
				return
			}
			if !validateAndConsumeWebhookID(webhookID) {
				log.Warn().Str("id", webhookID).Msg("Replayed webhook id rejected")
				c.JSON(http.StatusConflict, gin.H{"error": "Replayed webhook"})
				return
			}
		} else if !verifyWebhookSignature(body, signature) {
			log.Warn().Msg("Invalid webhook signature")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid signature"})
			return
		}

		// Parse the payload
		var payload thothos.WebhookPayload
		if err := json.Unmarshal(body, &payload); err != nil {
			log.Error().Err(err).Msg("Failed to parse webhook payload")
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
			return
		}

		log.Info().
			Str("event", payload.Event).
			Str("companyId", payload.CompanyID).
			Str("proxyId", payload.ProxyID).
			Msg("Received webhook from ThothOS")

		// Handle different event types
		switch payload.Event {
		case "config.sync":
			handleConfigSync(payload)
		case "proxy.updated":
			handleProxyUpdated(payload)
		case "snmp.template.created", "snmp.template.updated", "snmp.template.deleted":
			handleSNMPTemplateEvent(payload)
		case "icmp.template.created", "icmp.template.updated", "icmp.template.deleted":
			handleICMPTemplateEvent(payload)
		default:
			log.Warn().Str("event", payload.Event).Msg("Unknown webhook event type")
		}

		c.JSON(http.StatusOK, gin.H{"status": "received"})
	}
}

// handleConfigSync handles a full config sync event
func handleConfigSync(payload thothos.WebhookPayload) {
	log.Info().Msg("Processing config sync webhook")

	// Update the last sync time
	configCache.mu.Lock()
	configCache.LastSyncTime = payload.Timestamp
	configCache.mu.Unlock()

	// The data field should contain the full config
	// Parse and update cache accordingly
	if icmpMonitoring, ok := payload.Data["icmpMonitoringTemplates"].([]interface{}); ok {
		templates := make([]thothos.ICMPMonitoringTemplate, 0, len(icmpMonitoring))
		for _, item := range icmpMonitoring {
			jsonData, _ := json.Marshal(item)
			var template thothos.ICMPMonitoringTemplate
			if err := json.Unmarshal(jsonData, &template); err == nil {
				templates = append(templates, template)
			}
		}
		configCache.UpdateICMPMonitoringTemplates(templates)
	}

	if icmpPolling, ok := payload.Data["icmpPollingTemplates"].([]interface{}); ok {
		templates := make([]thothos.ICMPPollingTemplate, 0, len(icmpPolling))
		for _, item := range icmpPolling {
			jsonData, _ := json.Marshal(item)
			var template thothos.ICMPPollingTemplate
			if err := json.Unmarshal(jsonData, &template); err == nil {
				templates = append(templates, template)
			}
		}
		configCache.UpdateICMPPollingTemplates(templates)
	}

	if snmpv2, ok := payload.Data["snmpv2Templates"].([]interface{}); ok {
		templates := make([]thothos.SNMPv2Template, 0, len(snmpv2))
		for _, item := range snmpv2 {
			jsonData, _ := json.Marshal(item)
			var template thothos.SNMPv2Template
			if err := json.Unmarshal(jsonData, &template); err == nil {
				templates = append(templates, template)
			}
		}
		configCache.UpdateSNMPv2Templates(templates)
	}

	if snmpv3, ok := payload.Data["snmpv3Templates"].([]interface{}); ok {
		templates := make([]thothos.SNMPv3Template, 0, len(snmpv3))
		for _, item := range snmpv3 {
			jsonData, _ := json.Marshal(item)
			var template thothos.SNMPv3Template
			if err := json.Unmarshal(jsonData, &template); err == nil {
				templates = append(templates, template)
			}
		}
		configCache.UpdateSNMPv3Templates(templates)
	}

	log.Info().Str("timestamp", payload.Timestamp).Msg("Config sync completed")
}

// handleProxyUpdated handles proxy update events
func handleProxyUpdated(payload thothos.WebhookPayload) {
	log.Info().
		Str("proxyId", payload.ProxyID).
		Msg("Received proxy update notification")
	// The proxy itself is being notified of its own update
	// This could trigger a re-fetch of config if needed
}

// handleSNMPTemplateEvent handles SNMP template changes
func handleSNMPTemplateEvent(payload thothos.WebhookPayload) {
	log.Info().
		Str("event", payload.Event).
		Msg("Received SNMP template change notification")

	// Extract template data from payload
	templateData, ok := payload.Data["template"].(map[string]interface{})
	if !ok {
		log.Warn().Msg("No template data in webhook payload, skipping incremental update")
		return
	}

	// Determine template type (v2 or v3)
	templateType, _ := payload.Data["templateType"].(string)

	switch payload.Event {
	case "snmp.template.created", "snmp.template.updated":
		if templateType == "v3" {
			// Parse and add/update SNMPv3 template
			jsonData, _ := json.Marshal(templateData)
			var template thothos.SNMPv3Template
			if err := json.Unmarshal(jsonData, &template); err != nil {
				log.Error().Err(err).Msg("Failed to parse SNMPv3 template from webhook")
				return
			}
			updateSNMPv3Template(template)
		} else {
			// Default to v2
			jsonData, _ := json.Marshal(templateData)
			var template thothos.SNMPv2Template
			if err := json.Unmarshal(jsonData, &template); err != nil {
				log.Error().Err(err).Msg("Failed to parse SNMPv2 template from webhook")
				return
			}
			updateSNMPv2Template(template)
		}

	case "snmp.template.deleted":
		templateID, _ := payload.Data["templateId"].(string)
		if templateID != "" {
			if templateType == "v3" {
				deleteSNMPv3Template(templateID)
			} else {
				deleteSNMPv2Template(templateID)
			}
		}
	}
}

// updateSNMPv2Template adds or updates an SNMPv2 template in the cache
func updateSNMPv2Template(template thothos.SNMPv2Template) {
	configCache.mu.Lock()
	defer configCache.mu.Unlock()

	// Find and update existing, or append new
	found := false
	for i, t := range configCache.SNMPv2Templates {
		if t.ID == template.ID {
			configCache.SNMPv2Templates[i] = template
			found = true
			break
		}
	}
	if !found {
		configCache.SNMPv2Templates = append(configCache.SNMPv2Templates, template)
	}

	log.Info().
		Str("templateId", template.ID).
		Str("name", template.TemplateName).
		Bool("isNew", !found).
		Msg("Updated SNMPv2 template in cache")
}

// updateSNMPv3Template adds or updates an SNMPv3 template in the cache
func updateSNMPv3Template(template thothos.SNMPv3Template) {
	configCache.mu.Lock()
	defer configCache.mu.Unlock()

	found := false
	for i, t := range configCache.SNMPv3Templates {
		if t.ID == template.ID {
			configCache.SNMPv3Templates[i] = template
			found = true
			break
		}
	}
	if !found {
		configCache.SNMPv3Templates = append(configCache.SNMPv3Templates, template)
	}

	log.Info().
		Str("templateId", template.ID).
		Str("name", template.TemplateName).
		Bool("isNew", !found).
		Msg("Updated SNMPv3 template in cache")
}

// deleteSNMPv2Template removes an SNMPv2 template from the cache
func deleteSNMPv2Template(templateID string) {
	configCache.mu.Lock()
	defer configCache.mu.Unlock()

	for i, t := range configCache.SNMPv2Templates {
		if t.ID == templateID {
			configCache.SNMPv2Templates = append(configCache.SNMPv2Templates[:i], configCache.SNMPv2Templates[i+1:]...)
			log.Info().Str("templateId", templateID).Msg("Deleted SNMPv2 template from cache")
			return
		}
	}
}

// deleteSNMPv3Template removes an SNMPv3 template from the cache
func deleteSNMPv3Template(templateID string) {
	configCache.mu.Lock()
	defer configCache.mu.Unlock()

	for i, t := range configCache.SNMPv3Templates {
		if t.ID == templateID {
			configCache.SNMPv3Templates = append(configCache.SNMPv3Templates[:i], configCache.SNMPv3Templates[i+1:]...)
			log.Info().Str("templateId", templateID).Msg("Deleted SNMPv3 template from cache")
			return
		}
	}
}

// handleICMPTemplateEvent handles ICMP template changes
func handleICMPTemplateEvent(payload thothos.WebhookPayload) {
	log.Info().
		Str("event", payload.Event).
		Msg("Received ICMP template change notification")

	// Extract template data from payload
	templateData, ok := payload.Data["template"].(map[string]interface{})
	if !ok {
		log.Warn().Msg("No template data in webhook payload, skipping incremental update")
		return
	}

	// Determine template type (monitoring or polling)
	templateType, _ := payload.Data["templateType"].(string)

	switch payload.Event {
	case "icmp.template.created", "icmp.template.updated":
		if templateType == "polling" {
			// Parse and add/update ICMP polling template
			jsonData, _ := json.Marshal(templateData)
			var template thothos.ICMPPollingTemplate
			if err := json.Unmarshal(jsonData, &template); err != nil {
				log.Error().Err(err).Msg("Failed to parse ICMP polling template from webhook")
				return
			}
			updateICMPPollingTemplate(template)
		} else {
			// Default to monitoring
			jsonData, _ := json.Marshal(templateData)
			var template thothos.ICMPMonitoringTemplate
			if err := json.Unmarshal(jsonData, &template); err != nil {
				log.Error().Err(err).Msg("Failed to parse ICMP monitoring template from webhook")
				return
			}
			updateICMPMonitoringTemplate(template)
		}

	case "icmp.template.deleted":
		templateID, _ := payload.Data["templateId"].(string)
		if templateID != "" {
			if templateType == "polling" {
				deleteICMPPollingTemplate(templateID)
			} else {
				deleteICMPMonitoringTemplate(templateID)
			}
		}
	}
}

// updateICMPMonitoringTemplate adds or updates an ICMP monitoring template in the cache
func updateICMPMonitoringTemplate(template thothos.ICMPMonitoringTemplate) {
	configCache.mu.Lock()
	defer configCache.mu.Unlock()

	found := false
	for i, t := range configCache.ICMPMonitoring {
		if t.ID == template.ID {
			configCache.ICMPMonitoring[i] = template
			found = true
			break
		}
	}
	if !found {
		configCache.ICMPMonitoring = append(configCache.ICMPMonitoring, template)
	}

	log.Info().
		Str("templateId", template.ID).
		Str("name", template.TemplateName).
		Bool("isNew", !found).
		Msg("Updated ICMP monitoring template in cache")
}

// updateICMPPollingTemplate adds or updates an ICMP polling template in the cache
func updateICMPPollingTemplate(template thothos.ICMPPollingTemplate) {
	configCache.mu.Lock()
	defer configCache.mu.Unlock()

	found := false
	for i, t := range configCache.ICMPPolling {
		if t.ID == template.ID {
			configCache.ICMPPolling[i] = template
			found = true
			break
		}
	}
	if !found {
		configCache.ICMPPolling = append(configCache.ICMPPolling, template)
	}

	log.Info().
		Str("templateId", template.ID).
		Str("name", template.Name).
		Bool("isNew", !found).
		Msg("Updated ICMP polling template in cache")
}

// deleteICMPMonitoringTemplate removes an ICMP monitoring template from the cache
func deleteICMPMonitoringTemplate(templateID string) {
	configCache.mu.Lock()
	defer configCache.mu.Unlock()

	for i, t := range configCache.ICMPMonitoring {
		if t.ID == templateID {
			configCache.ICMPMonitoring = append(configCache.ICMPMonitoring[:i], configCache.ICMPMonitoring[i+1:]...)
			log.Info().Str("templateId", templateID).Msg("Deleted ICMP monitoring template from cache")
			return
		}
	}
}

// deleteICMPPollingTemplate removes an ICMP polling template from the cache
func deleteICMPPollingTemplate(templateID string) {
	configCache.mu.Lock()
	defer configCache.mu.Unlock()

	for i, t := range configCache.ICMPPolling {
		if t.ID == templateID {
			configCache.ICMPPolling = append(configCache.ICMPPolling[:i], configCache.ICMPPolling[i+1:]...)
			log.Info().Str("templateId", templateID).Msg("Deleted ICMP polling template from cache")
			return
		}
	}
}

// RegisterWebhookRoutes registers the webhook routes
func RegisterWebhookRoutes(router *gin.RouterGroup, srv *server.Server) {
	webhooks := router.Group("/webhooks")
	{
		webhooks.POST("/config-update", handleWebhook(srv))
	}
}
