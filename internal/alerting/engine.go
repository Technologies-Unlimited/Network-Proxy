package alerting

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// Engine manages alert rule evaluation and notification
type Engine struct {
	db         *gorm.DB
	evaluators map[string]*RuleEvaluator
	notifiers  []Notifier
	mu         sync.RWMutex
	interval   time.Duration

	// Alert state tracking to prevent duplicate alerts
	alertStates map[string]*AlertState
	statesMu    sync.RWMutex
}

// AlertState tracks the state of an alert condition
type AlertState struct {
	RuleID       string
	DeviceID     string
	ConditionMet bool
	FirstSeen    time.Time
	LastChecked  time.Time
	AlertID      string // ID of active alert if triggered
	Value        string // Last measured value
}

// NewEngine creates a new alerting engine
func NewEngine(db *gorm.DB) *Engine {
	engine := &Engine{
		db:          db,
		evaluators:  make(map[string]*RuleEvaluator),
		notifiers:   make([]Notifier, 0),
		interval:    30 * time.Second, // Check rules every 30 seconds
		alertStates: make(map[string]*AlertState),
	}

	// Register default notifiers
	engine.AddNotifier(&ConsoleNotifier{})

	// Add email notifier if configured
	if emailConfig := getEmailConfig(); emailConfig != nil {
		engine.AddNotifier(emailConfig)
	}

	return engine
}

// AddNotifier adds a notification handler
func (e *Engine) AddNotifier(notifier Notifier) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.notifiers = append(e.notifiers, notifier)
	log.Info().Str("type", fmt.Sprintf("%T", notifier)).Msg("Added notifier")
}

// SetInterval sets the rule evaluation interval
func (e *Engine) SetInterval(interval time.Duration) {
	e.interval = interval
}

// Start begins the alert evaluation loop
func (e *Engine) Start(ctx context.Context) {
	ticker := time.NewTicker(e.interval)
	defer ticker.Stop()

	log.Info().Dur("interval", e.interval).Msg("Alert engine started")

	// Initial evaluation
	e.EvaluateRules()

	for {
		select {
		case <-ticker.C:
			e.EvaluateRules()
		case <-ctx.Done():
			log.Info().Msg("Alert engine stopped")
			return
		}
	}
}

// EvaluateRules evaluates all enabled alert rules
func (e *Engine) EvaluateRules() {
	// Fetch all enabled alert rules
	var rules []models.AlertRule
	if err := e.db.Where("enabled = ?", true).Find(&rules).Error; err != nil {
		log.Error().Err(err).Msg("Failed to fetch alert rules")
		return
	}

	if len(rules) == 0 {
		log.Debug().Msg("No enabled alert rules to evaluate")
		return
	}

	log.Debug().Int("count", len(rules)).Msg("Evaluating alert rules")

	// Fetch all devices
	var devices []models.Device
	if err := e.db.Find(&devices).Error; err != nil {
		log.Error().Err(err).Msg("Failed to fetch devices")
		return
	}

	// Evaluate each rule against each device
	var wg sync.WaitGroup
	for _, rule := range rules {
		for _, device := range devices {
			wg.Add(1)
			go func(r models.AlertRule, d models.Device) {
				defer wg.Done()
				e.evaluateRuleForDevice(&r, &d)
			}(rule, device)
		}
	}

	wg.Wait()
}

// evaluateRuleForDevice evaluates a single rule against a single device
func (e *Engine) evaluateRuleForDevice(rule *models.AlertRule, device *models.Device) {
	stateKey := fmt.Sprintf("%s:%s", rule.ID, device.ID)

	// Get or create alert state
	e.statesMu.Lock()
	state, exists := e.alertStates[stateKey]
	if !exists {
		state = &AlertState{
			RuleID:   rule.ID,
			DeviceID: device.ID,
		}
		e.alertStates[stateKey] = state
	}
	e.statesMu.Unlock()

	// Get current value based on metric type
	value, err := e.getMetricValue(rule.Metric, device)
	if err != nil {
		log.Debug().
			Err(err).
			Str("rule", rule.Name).
			Str("device", device.Hostname).
			Str("metric", rule.Metric).
			Msg("Failed to get metric value")
		return
	}

	// Evaluate condition
	conditionMet := EvaluateCondition(rule.Condition, rule.Threshold, value)

	state.LastChecked = time.Now()
	state.Value = value

	// Handle condition state changes
	if conditionMet && !state.ConditionMet {
		// Condition just became true
		state.ConditionMet = true
		state.FirstSeen = time.Now()
		log.Debug().
			Str("rule", rule.Name).
			Str("device", device.Hostname).
			Str("value", value).
			Str("threshold", rule.Threshold).
			Msg("Alert condition met")
	} else if !conditionMet && state.ConditionMet {
		// Condition just became false - resolve alert
		state.ConditionMet = false
		if state.AlertID != "" {
			e.resolveAlert(state.AlertID)
			state.AlertID = ""
		}
		log.Debug().
			Str("rule", rule.Name).
			Str("device", device.Hostname).
			Msg("Alert condition resolved")
	}

	// Check if condition has been true for required duration
	if state.ConditionMet && state.AlertID == "" {
		duration := time.Since(state.FirstSeen)
		requiredDuration := time.Duration(rule.Duration) * time.Second

		if duration >= requiredDuration {
			// Trigger alert
			alert := e.TriggerAlert(rule, device, value)
			if alert != nil {
				state.AlertID = alert.ID
			}
		} else {
			log.Debug().
				Str("rule", rule.Name).
				Str("device", device.Hostname).
				Dur("elapsed", duration).
				Dur("required", requiredDuration).
				Msg("Alert condition met but duration not satisfied")
		}
	}
}

// getMetricValue retrieves the current value for a metric
func (e *Engine) getMetricValue(metric string, device *models.Device) (string, error) {
	switch metric {
	case "device_status":
		// Return "1" for up, "0" for down
		if device.Status == "up" {
			return "1", nil
		}
		return "0", nil
	case "ping_latency":
		latency, err := CheckPingLatency(device.ID, e.db)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%.2f", latency), nil
	case "last_seen":
		// Return seconds since last seen
		if device.LastSeen == nil {
			return "999999", nil // Very high number if never seen
		}
		secondsSince := time.Since(*device.LastSeen).Seconds()
		return fmt.Sprintf("%.0f", secondsSince), nil
	case "packet_loss":
		// For now, return 0 as we don't track packet loss separately
		// This would come from the ping statistics in a real implementation
		if device.Status == "down" {
			return "100", nil // 100% packet loss if down
		}
		return "0", nil // 0% packet loss if up
	default:
		return "", fmt.Errorf("unsupported metric: %s", metric)
	}
}

// TriggerAlert creates and sends a new alert
func (e *Engine) TriggerAlert(rule *models.AlertRule, device *models.Device, value string) *models.Alert {
	// Check if there's already an active alert for this rule and device
	var existingAlert models.Alert
	err := e.db.Where("device_id = ? AND status = 'active' AND source = ? AND metric = ?",
		device.ID, rule.Source, rule.Metric).First(&existingAlert).Error

	if err == nil {
		// Alert already exists
		log.Debug().
			Str("rule", rule.Name).
			Str("device", device.Hostname).
			Str("alert_id", existingAlert.ID).
			Msg("Active alert already exists")
		return &existingAlert
	}

	// Create new alert
	alert := &models.Alert{
		DeviceID:    device.ID,
		Severity:    rule.Severity,
		Status:      "active",
		Title:       fmt.Sprintf("%s: %s", rule.Name, device.Hostname),
		Message:     e.formatAlertMessage(rule, device, value),
		Source:      rule.Source,
		Metric:      rule.Metric,
		Value:       value,
		Threshold:   rule.Threshold,
		TriggeredAt: time.Now(),
	}

	if err := e.db.Create(alert).Error; err != nil {
		log.Error().Err(err).Msg("Failed to create alert")
		return nil
	}

	log.Warn().
		Str("alert_id", alert.ID).
		Str("severity", alert.Severity).
		Str("device", device.Hostname).
		Str("rule", rule.Name).
		Str("value", value).
		Str("threshold", rule.Threshold).
		Msg("Alert triggered")

	// Send notifications
	e.sendNotifications(alert, rule)

	return alert
}

// formatAlertMessage creates a human-readable alert message
func (e *Engine) formatAlertMessage(rule *models.AlertRule, device *models.Device, value string) string {
	conditionText := map[string]string{
		"gt": "greater than",
		"lt": "less than",
		"eq": "equal to",
		"ne": "not equal to",
		"ge": "greater than or equal to",
		"le": "less than or equal to",
	}

	condition := conditionText[rule.Condition]
	if condition == "" {
		condition = rule.Condition
	}

	return fmt.Sprintf(
		"Device %s (%s): %s is %s (threshold: %s %s). Rule: %s",
		device.Hostname,
		device.IPAddress,
		rule.Metric,
		value,
		condition,
		rule.Threshold,
		rule.Name,
	)
}

// sendNotifications sends alert notifications via all configured notifiers
func (e *Engine) sendNotifications(alert *models.Alert, rule *models.AlertRule) {
	e.mu.RLock()
	notifiers := make([]Notifier, len(e.notifiers))
	copy(notifiers, e.notifiers)
	e.mu.RUnlock()

	for _, notifier := range notifiers {
		// Check if this notifier type is enabled for this rule
		switch notifier.(type) {
		case *EmailNotifier:
			if !rule.NotifyEmail {
				continue
			}
		case *WebhookNotifier:
			if !rule.NotifyWebhook {
				continue
			}
		}

		go func(n Notifier) {
			if err := n.Send(alert); err != nil {
				log.Error().
					Err(err).
					Str("notifier", fmt.Sprintf("%T", n)).
					Str("alert_id", alert.ID).
					Msg("Failed to send notification")
			}
		}(notifier)
	}
}

// resolveAlert marks an alert as resolved
func (e *Engine) resolveAlert(alertID string) {
	now := time.Now()
	if err := e.db.Model(&models.Alert{}).
		Where("id = ? AND status = 'active'", alertID).
		Updates(map[string]interface{}{
			"status":      "resolved",
			"resolved_at": &now,
		}).Error; err != nil {
		log.Error().Err(err).Str("alert_id", alertID).Msg("Failed to resolve alert")
		return
	}

	log.Info().Str("alert_id", alertID).Msg("Alert resolved")
}

// GetActiveAlerts returns all active alerts
func (e *Engine) GetActiveAlerts() ([]models.Alert, error) {
	var alerts []models.Alert
	err := e.db.Where("status = 'active'").
		Preload("Device").
		Order("triggered_at DESC").
		Find(&alerts).Error
	return alerts, err
}

// AcknowledgeAlert marks an alert as acknowledged
func (e *Engine) AcknowledgeAlert(alertID string, acknowledgedBy string) error {
	now := time.Now()
	return e.db.Model(&models.Alert{}).
		Where("id = ? AND status = 'active'", alertID).
		Updates(map[string]interface{}{
			"status":   "acknowledged",
			"acked_at": &now,
			"acked_by": &acknowledgedBy,
		}).Error
}

// getEmailConfig loads email configuration from environment
func getEmailConfig() *EmailNotifier {
	// This would load from environment variables
	// For now, return nil to disable email notifications
	return nil
}
