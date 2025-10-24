# Alerting Engine Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Network Monitor Application                │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │   ICMP       │  │   SNMP       │  │   Alerting Engine    │ │
│  │   Collector  │  │   Collector  │  │                      │ │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘ │
│         │                 │                     │               │
│         └─────────────────┴─────────────────────┘               │
│                           │                                     │
│                    ┌──────▼──────┐                              │
│                    │   Database  │                              │
│                    │   (SQLite)  │                              │
│                    └─────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Alerting Engine                            │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Engine (engine.go)                        │  │
│  │  - Start/Stop lifecycle management                           │  │
│  │  - Rule evaluation loop (every 30s)                          │  │
│  │  - Alert state tracking                                      │  │
│  │  - Notification orchestration                                │  │
│  └────┬──────────────────────────────────────────────┬──────────┘  │
│       │                                              │              │
│  ┌────▼────────────────────┐          ┌──────────────▼──────────┐  │
│  │  Evaluator (evaluator.go)         │  Notifier (notifier.go) │  │
│  │                         │          │                         │  │
│  │  - Condition evaluation │          │  - Email (SMTP)         │  │
│  │  - Numeric comparisons  │          │  - Webhook (HTTP)       │  │
│  │  - String comparisons   │          │  - Slack                │  │
│  │  - Threshold parsing    │          │  - Microsoft Teams      │  │
│  │  - Metric retrieval     │          │  - Console              │  │
│  └─────────────────────────┘          └─────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Rule Evaluation Flow

```
┌─────────┐
│  Timer  │ Every 30 seconds
│ Trigger │
└────┬────┘
     │
     ▼
┌─────────────────────┐
│ Fetch Enabled Rules │ FROM alert_rules WHERE enabled = true
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Fetch All Devices  │ FROM devices
└─────────┬───────────┘
          │
          ▼
┌──────────────────────────────────────────┐
│  For each Rule × Device combination:     │
│                                          │
│  1. Get or create AlertState             │
│  2. Retrieve current metric value        │
│  3. Evaluate condition                   │
│  4. Update state                         │
│  5. Check duration requirement           │
│  6. Trigger alert if needed              │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────┐
│  Create Alert Record │ IF duration satisfied
│  in Database         │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Send Notifications  │ Email, Webhook, Slack, etc.
└──────────────────────┘
```

### 2. Alert State Lifecycle

```
┌────────────────┐
│ Initial State  │ ConditionMet = false
└───────┬────────┘
        │
        │ Condition becomes TRUE
        ▼
┌────────────────┐
│ Condition Met  │ ConditionMet = true
│                │ FirstSeen = now
│                │ Duration timer starts
└───────┬────────┘
        │
        │ Wait for Duration
        ▼
┌────────────────┐
│ Alert Triggered│ Create alert in DB
│                │ AlertID assigned
│                │ Send notifications
└───────┬────────┘
        │
        │ Condition becomes FALSE
        ▼
┌────────────────┐
│ Alert Resolved │ Update alert status
│                │ Reset state
└────────────────┘
```

### 3. Notification Flow

```
┌──────────────────┐
│  Alert Triggered │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────┐
│ Check Rule Notification      │
│ Settings:                    │
│  - NotifyEmail               │
│  - NotifyWebhook             │
└────────┬─────────────────────┘
         │
         ├─────────────────────┬─────────────────┬─────────────────┐
         │                     │                 │                 │
         ▼                     ▼                 ▼                 ▼
┌─────────────────┐  ┌─────────────┐  ┌──────────────┐  ┌────────────┐
│ Email Notifier  │  │   Webhook   │  │    Slack     │  │  Console   │
│                 │  │  Notifier   │  │   Notifier   │  │  Notifier  │
│ - Format HTML   │  │ - Build     │  │ - Format     │  │ - Log to   │
│ - Connect SMTP  │  │   JSON      │  │   message    │  │   console  │
│ - Send email    │  │ - HTTP POST │  │ - POST to    │  │            │
│                 │  │             │  │   webhook    │  │            │
└─────────────────┘  └─────────────┘  └──────────────┘  └────────────┘
         │                     │                 │                 │
         └─────────────────────┴─────────────────┴─────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Log Success/Failure │
                    └─────────────────────┘
```

## Database Schema

### AlertRule Table

```sql
CREATE TABLE alert_rules (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    enabled     BOOLEAN DEFAULT true,
    severity    TEXT NOT NULL,      -- 'critical', 'warning', 'info'
    source      TEXT NOT NULL,      -- 'icmp', 'snmp'
    metric      TEXT NOT NULL,      -- 'device_status', 'ping_latency', etc.
    condition   TEXT NOT NULL,      -- 'gt', 'lt', 'eq', 'ne', etc.
    threshold   TEXT NOT NULL,      -- '100', '80%', 'down', etc.
    duration    INTEGER DEFAULT 300, -- seconds

    notify_email   BOOLEAN,
    notify_webhook BOOLEAN,
    webhook_url    TEXT,

    created_at  TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP
);

CREATE INDEX idx_alert_rules_enabled ON alert_rules(enabled);
```

### Alert Table

```sql
CREATE TABLE alerts (
    id           TEXT PRIMARY KEY,
    device_id    TEXT NOT NULL,
    severity     TEXT NOT NULL,
    status       TEXT DEFAULT 'active', -- 'active', 'acknowledged', 'resolved'
    title        TEXT NOT NULL,
    message      TEXT,
    source       TEXT,
    metric       TEXT,
    value        TEXT,
    threshold    TEXT,
    triggered_at TIMESTAMP NOT NULL,
    acked_at     TIMESTAMP,
    acked_by     TEXT,
    resolved_at  TIMESTAMP,
    created_at   TIMESTAMP,
    updated_at   TIMESTAMP,
    deleted_at   TIMESTAMP,

    FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE INDEX idx_alerts_device_id ON alerts(device_id);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_triggered_at ON alerts(triggered_at);
```

## In-Memory State Management

### AlertState Structure

```go
type AlertState struct {
    RuleID       string    // Which rule is being evaluated
    DeviceID     string    // Which device is being monitored
    ConditionMet bool      // Is condition currently true?
    FirstSeen    time.Time // When did condition first become true?
    LastChecked  time.Time // Last evaluation time
    AlertID      string    // ID of active alert (if triggered)
    Value        string    // Last measured value
}
```

### State Map

```
Key Format: "ruleID:deviceID"

Example:
{
    "rule-123:device-abc": {
        RuleID: "rule-123",
        DeviceID: "device-abc",
        ConditionMet: true,
        FirstSeen: 2024-10-20T22:00:00Z,
        LastChecked: 2024-10-20T22:05:00Z,
        AlertID: "alert-xyz",
        Value: "150"
    },
    "rule-456:device-def": {
        RuleID: "rule-456",
        DeviceID: "device-def",
        ConditionMet: false,
        FirstSeen: 0,
        LastChecked: 2024-10-20T22:05:00Z,
        AlertID: "",
        Value: "50"
    }
}
```

## Concurrency Model

### Engine Goroutine

```go
main()
  ├─ Start HTTP Server (goroutine)
  ├─ Start Metrics Server (goroutine)
  ├─ Start ICMP Collector (goroutine)
  ├─ Start SNMP Collector (goroutine)
  └─ Start Alerting Engine (goroutine)
       │
       └─ Evaluation Loop
            ├─ Timer (30s interval)
            └─ For each rule evaluation
                 └─ Parallel goroutines (one per device)
```

### Thread Safety

- **Engine.alertStates**: Protected by `sync.RWMutex` (statesMu)
- **Engine.notifiers**: Protected by `sync.RWMutex` (mu)
- **Database access**: GORM provides connection pooling
- **Notification sending**: Async goroutines per notifier

## Performance Characteristics

### Time Complexity

- **Rule Evaluation**: O(R × D) where R = rules, D = devices
- **Condition Evaluation**: O(1) for numeric, O(n) for string (n = string length)
- **State Lookup**: O(1) with map
- **Alert Creation**: O(1) database insert

### Space Complexity

- **Alert States**: O(R × D) in memory
- **Active Alerts**: O(A) in database (A = active alerts)
- **Notification Queue**: O(N) where N = notifiers

### Scalability

#### Current Limits
- Rules: 1,000+ (limited by evaluation time)
- Devices: 10,000+ (limited by evaluation time)
- Total States: 1M+ (limited by memory)
- Evaluation Time: ~30-60s for 10K devices × 10 rules

#### Optimization Strategies
1. **Horizontal Scaling**: Shard devices across multiple engines
2. **Caching**: Cache metric values to reduce database queries
3. **Incremental Evaluation**: Only evaluate changed metrics
4. **Rule Prioritization**: Evaluate critical rules first

## Error Handling

### Evaluation Errors

```go
// Metric retrieval fails
if err := getMetricValue(); err != nil {
    log.Debug().Err(err).Msg("Failed to get metric")
    return // Skip this evaluation, try again next cycle
}
```

### Notification Errors

```go
// Continue on notification failure
if err := notifier.Send(alert); err != nil {
    log.Error().Err(err).Msg("Notification failed")
    // Alert still created in database
    // Retry on next notification cycle
}
```

### Database Errors

```go
// Critical errors stop evaluation
if err := db.Find(&rules).Error; err != nil {
    log.Error().Err(err).Msg("Failed to fetch rules")
    return // Abort this cycle, retry on next timer tick
}
```

## Configuration

### Environment Variables

```bash
# Email Notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=alerts@example.com
SMTP_PASSWORD=app-password
SMTP_FROM=alerts@example.com
ALERT_EMAIL_TO=admin@example.com

# Database
DB_PATH=./network-monitor.db

# Engine Settings (code-level)
ALERT_EVALUATION_INTERVAL=30s  # Not implemented, hardcoded in engine
```

### Code Configuration

```go
// Change evaluation interval
engine.SetInterval(60 * time.Second)

// Add custom notifier
engine.AddNotifier(&CustomNotifier{})

// Disable default notifiers
// (requires modifying NewEngine())
```

## Monitoring the Alerting Engine

### Metrics to Track

1. **Rule Evaluation Time**: How long does each evaluation cycle take?
2. **Active Alerts**: How many alerts are currently active?
3. **Notification Success Rate**: Percentage of successful notifications
4. **Alert Flapping**: How often do alerts toggle on/off?
5. **State Memory Usage**: Memory consumed by alert states

### Log Events

```bash
# Engine lifecycle
"Alert engine started"
"Alert engine stopped"

# Evaluation
"Evaluating alert rules count=X"
"Alert condition met"
"Alert condition resolved"

# Triggering
"Alert triggered alert_id=X severity=Y"

# Notifications
"Email notification sent"
"Webhook notification sent"
"Failed to send notification"
```

## Future Enhancements

### Planned Features

1. **Alert Grouping**: Group related alerts
2. **Maintenance Windows**: Suppress alerts during maintenance
3. **Escalation**: Auto-escalate unacknowledged alerts
4. **Templates**: Customizable alert message templates
5. **Deduplication**: Prevent duplicate alerts across rules
6. **Rate Limiting**: Limit notifications per time period
7. **Alert Dependencies**: Only alert if dependency is up

### Architecture Changes

1. **Message Queue**: Use RabbitMQ/Kafka for notifications
2. **Time-Series DB**: Store metrics in Prometheus/InfluxDB
3. **Distributed Engine**: Run multiple engine instances
4. **Webhook Retries**: Implement exponential backoff
5. **Alert Analytics**: Track MTTR, MTTA, flapping rate

## Testing Strategy

### Unit Tests
- Condition evaluation (`evaluator_test.go`)
- Threshold parsing
- String/numeric comparisons

### Integration Tests
- Database interactions
- Full rule evaluation cycle
- Notification sending

### Performance Tests
- Large-scale rule evaluation
- Memory usage under load
- Concurrent notification sending

### End-to-End Tests
- Complete alert lifecycle
- Multi-notifier scenarios
- Error recovery

---

**Version**: 1.0.0
**Last Updated**: October 2024
**Maintainer**: Technologies Unlimited
