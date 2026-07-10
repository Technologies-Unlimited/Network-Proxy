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

// MetricSource is the interface the engine uses to retrieve current metric
// values for a device. The default implementation reads from the database;
// callers (e.g. the API server) can inject one backed by Prometheus, an
// in-memory registry, or both.
type MetricSource interface {
	Get(metric string, device *models.Device) (string, error)
}

// Engine manages alert rule evaluation and notification.
type Engine struct {
	db        *gorm.DB
	notifiers []Notifier
	notifyMu  sync.RWMutex
	interval  time.Duration

	metrics MetricSource

	// Alert state tracking. The state map and the AlertState fields are both
	// guarded by statesMu — taking the lock for the whole evaluate-then-mutate
	// section keeps GetActiveAlerts() and concurrent rule-evaluations safe.
	alertStates map[string]*AlertState
	statesMu    sync.Mutex
}

// AlertState tracks the state of an alert condition.
type AlertState struct {
	RuleID       string
	DeviceID     string
	ConditionMet bool
	FirstSeen    time.Time
	LastChecked  time.Time
	AlertID      string
	Value        string
}

// NewEngine creates a new alerting engine.
func NewEngine(db *gorm.DB) *Engine {
	engine := &Engine{
		db:          db,
		notifiers:   make([]Notifier, 0),
		interval:    30 * time.Second,
		alertStates: make(map[string]*AlertState),
		metrics:     &DBMetricSource{db: db},
	}

	engine.AddNotifier(&ConsoleNotifier{})

	if email := NewEmailNotifier(); email != nil {
		engine.AddNotifier(email)
	}

	return engine
}

// SetMetricSource replaces the metric source. Useful when the host wants to
// wire in a Prometheus-backed implementation after construction.
func (e *Engine) SetMetricSource(src MetricSource) {
	if src == nil {
		return
	}
	e.metrics = src
}

// AddNotifier adds a notification handler.
func (e *Engine) AddNotifier(notifier Notifier) {
	e.notifyMu.Lock()
	defer e.notifyMu.Unlock()
	e.notifiers = append(e.notifiers, notifier)
	log.Info().Str("type", fmt.Sprintf("%T", notifier)).Msg("Added notifier")
}

// SetInterval sets the rule evaluation interval.
func (e *Engine) SetInterval(interval time.Duration) {
	if interval <= 0 {
		return
	}
	e.interval = interval
}

// Start begins the alert evaluation loop.
func (e *Engine) Start(ctx context.Context) {
	ticker := time.NewTicker(e.interval)
	defer ticker.Stop()

	log.Info().Dur("interval", e.interval).Msg("Alert engine started")

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

// EvaluateRules evaluates all enabled alert rules.
func (e *Engine) EvaluateRules() {
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

	var devices []models.Device
	if err := e.db.Find(&devices).Error; err != nil {
		log.Error().Err(err).Msg("Failed to fetch devices")
		return
	}

	var wg sync.WaitGroup
	for i := range rules {
		for j := range devices {
			wg.Add(1)
			go func(r *models.AlertRule, d *models.Device) {
				defer wg.Done()
				e.evaluateRuleForDevice(r, d)
			}(&rules[i], &devices[j])
		}
	}

	wg.Wait()
}

// evaluateRuleForDevice evaluates a single rule against a single device.
//
// The whole state read/mutate sequence runs under statesMu so that
// GetActiveAlerts() and any concurrent evaluation of (rule, device) sees a
// consistent snapshot.
func (e *Engine) evaluateRuleForDevice(rule *models.AlertRule, device *models.Device) {
	value, err := e.metrics.Get(rule.Metric, device)
	if err != nil {
		log.Debug().
			Err(err).
			Str("rule", rule.Name).
			Str("device", device.Hostname).
			Str("metric", rule.Metric).
			Msg("Failed to get metric value")
		return
	}

	conditionMet := EvaluateCondition(rule.Condition, rule.Threshold, value)

	stateKey := fmt.Sprintf("%s:%s", rule.ID, device.ID)

	e.statesMu.Lock()
	state, exists := e.alertStates[stateKey]
	if !exists {
		state = &AlertState{RuleID: rule.ID, DeviceID: device.ID}
		e.alertStates[stateKey] = state
	}

	state.LastChecked = time.Now()
	state.Value = value

	var (
		shouldTrigger bool
		alertIDToClear string
	)

	if conditionMet && !state.ConditionMet {
		state.ConditionMet = true
		state.FirstSeen = time.Now()
	} else if !conditionMet && state.ConditionMet {
		state.ConditionMet = false
		alertIDToClear = state.AlertID
		state.AlertID = ""
	}

	if state.ConditionMet && state.AlertID == "" {
		duration := time.Since(state.FirstSeen)
		requiredDuration := time.Duration(rule.Duration) * time.Second
		if duration >= requiredDuration {
			shouldTrigger = true
		}
	}
	e.statesMu.Unlock()

	if alertIDToClear != "" {
		e.resolveAlert(alertIDToClear)
		log.Debug().
			Str("rule", rule.Name).
			Str("device", device.Hostname).
			Msg("Alert condition resolved")
	}

	if shouldTrigger {
		alert := e.TriggerAlert(rule, device, value)
		if alert != nil {
			e.statesMu.Lock()
			if s := e.alertStates[stateKey]; s != nil {
				s.AlertID = alert.ID
			}
			e.statesMu.Unlock()
		}
	}
}

// TriggerAlert creates and sends a new alert.
func (e *Engine) TriggerAlert(rule *models.AlertRule, device *models.Device, value string) *models.Alert {
	var existingAlert models.Alert
	err := e.db.Where("device_id = ? AND status = 'active' AND source = ? AND metric = ?",
		device.ID, rule.Source, rule.Metric).First(&existingAlert).Error
	if err == nil {
		return &existingAlert
	}

	alert := &models.Alert{
		// The alert belongs to the same tenant as the device it fired for —
		// this is the honest source of the company (the engine runs in a
		// background loop with no request/auth context). Without it, alerts
		// persist company_id='' and are invisible to company-scoped reads.
		CompanyID:   device.CompanyID,
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

	e.sendNotifications(alert, rule)

	return alert
}

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
		device.Hostname, device.IPAddress, rule.Metric, value,
		condition, rule.Threshold, rule.Name,
	)
}

func (e *Engine) sendNotifications(alert *models.Alert, rule *models.AlertRule) {
	e.notifyMu.RLock()
	notifiers := make([]Notifier, len(e.notifiers))
	copy(notifiers, e.notifiers)
	e.notifyMu.RUnlock()

	for _, notifier := range notifiers {
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

// GetActiveAlerts returns all active alerts.
func (e *Engine) GetActiveAlerts() ([]models.Alert, error) {
	var alerts []models.Alert
	err := e.db.Where("status = 'active'").
		Preload("Device").
		Order("triggered_at DESC").
		Find(&alerts).Error
	return alerts, err
}

// GetAlertStateSnapshot returns a deep copy of the in-memory alert state map.
// Safe to call concurrently with rule evaluation.
func (e *Engine) GetAlertStateSnapshot() map[string]AlertState {
	e.statesMu.Lock()
	defer e.statesMu.Unlock()
	snapshot := make(map[string]AlertState, len(e.alertStates))
	for k, v := range e.alertStates {
		snapshot[k] = *v
	}
	return snapshot
}

// AcknowledgeAlert marks an alert as acknowledged.
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
