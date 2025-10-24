# Alerting Engine

A comprehensive, high-performance alerting engine for network monitoring with support for multiple notification channels and flexible rule evaluation.

## Features

- **Flexible Rule Evaluation**: Support for multiple condition types (gt, lt, eq, ne, ge, le, contains, etc.)
- **Multiple Metrics**: Device status, ping latency, SNMP OID values, and more
- **Duration-based Triggering**: Prevents alert flapping by requiring conditions to persist for a configurable duration
- **Alert State Management**: Tracks alert lifecycle (active, acknowledged, resolved)
- **Multi-channel Notifications**: Email, Webhook, Slack, Microsoft Teams, Console
- **Automatic Alert Resolution**: Resolves alerts when conditions return to normal
- **Duplicate Prevention**: Prevents multiple active alerts for the same condition
- **Concurrent Evaluation**: Evaluates rules in parallel for high performance

## Architecture

### Core Components

1. **Engine** (`engine.go`): Main alert evaluation engine
   - Manages rule evaluation loop
   - Tracks alert states
   - Triggers notifications
   - Handles alert lifecycle

2. **Evaluator** (`evaluator.go`): Rule condition evaluation logic
   - Numeric and string comparisons
   - Threshold parsing with units (ms, %, GB, etc.)
   - Multi-condition evaluation (AND/OR logic)
   - Metric value retrieval

3. **Notifier** (`notifier.go`): Notification interface and implementations
   - Email (SMTP)
   - Webhook (Generic HTTP)
   - Slack
   - Microsoft Teams
   - Console logging

## Usage

### Starting the Engine

The alerting engine is automatically started when the application starts:

```go
import "github.com/Technologies-Unlimited/Network-Proxy/internal/alerting"

// Initialize engine
engine := alerting.NewEngine(db)

// Start evaluation loop
go engine.Start(ctx)
```

### Creating Alert Rules

Alert rules are stored in the database and can be managed via the API:

```go
rule := &models.AlertRule{
    Name:        "High Ping Latency",
    Description: "Alert when ping latency exceeds 100ms",
    Enabled:     true,
    Severity:    "warning",
    Source:      "icmp",
    Metric:      "ping_latency",
    Condition:   "gt",
    Threshold:   "100",
    Duration:    300, // 5 minutes
    NotifyEmail: true,
}

db.Create(&rule)
```

### Condition Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `gt` | Greater than | `value > 100` |
| `lt` | Less than | `value < 50` |
| `eq` | Equal to | `value == "down"` |
| `ne` | Not equal to | `value != "up"` |
| `ge` | Greater or equal | `value >= 100` |
| `le` | Less or equal | `value <= 50` |
| `contains` | String contains | `"error" in value` |
| `starts_with` | String starts with | `value.startswith("error")` |
| `ends_with` | String ends with | `value.endswith("failed")` |

### Supported Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `device_status` | String | Device connectivity (up/down/unknown) |
| `ping_latency` | Float | ICMP round-trip time in ms |
| `snmp_oid` | Mixed | SNMP OID value |
| `packet_loss` | Float | Packet loss percentage |
| `bandwidth` | Float | Network bandwidth utilization |
| `cpu_usage` | Float | CPU utilization percentage |
| `memory_usage` | Float | Memory utilization percentage |
| `disk_usage` | Float | Disk space utilization percentage |

### Severity Levels

- **critical**: System down, immediate attention required
- **warning**: Performance degradation, action recommended
- **info**: Informational events

## Notification Configuration

### Email Notifications

Configure via environment variables:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=alerts@example.com
SMTP_PASSWORD=your-password
SMTP_FROM=alerts@example.com
ALERT_EMAIL_TO=admin@example.com
```

Enable email notifications on alert rules:

```go
rule.NotifyEmail = true
```

### Webhook Notifications

Add webhook notifier to engine:

```go
webhook := alerting.NewWebhookNotifier("https://api.example.com/alerts")
webhook.Headers["Authorization"] = "Bearer token123"
engine.AddNotifier(webhook)
```

Enable webhook on alert rules:

```go
rule.NotifyWebhook = true
rule.WebhookURL = "https://api.example.com/alerts"
```

### Slack Notifications

```go
slack := alerting.NewSlackNotifier("https://hooks.slack.com/services/YOUR/WEBHOOK/URL")
slack.Channel = "#alerts"
engine.AddNotifier(slack)
```

### Microsoft Teams Notifications

```go
teams := alerting.NewTeamsNotifier("https://outlook.office.com/webhook/YOUR-WEBHOOK-URL")
engine.AddNotifier(teams)
```

## Alert Lifecycle

1. **Condition Met**: Alert condition evaluates to true
2. **Duration Check**: System waits for configured duration to prevent flapping
3. **Alert Triggered**: Alert created with status "active", notifications sent
4. **Acknowledgment** (optional): User acknowledges alert, status → "acknowledged"
5. **Resolution**: Condition returns to normal, status → "resolved"

### State Transitions

```
[Condition False] → [Condition True] → [Duration Met] → [Active]
                                                           ↓
                                                    [Acknowledged]
                                                           ↓
[Condition False] ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← [Resolved]
```

## Alert State Management

The engine tracks alert states to prevent duplicate alerts:

```go
type AlertState struct {
    RuleID       string
    DeviceID     string
    ConditionMet bool
    FirstSeen    time.Time
    LastChecked  time.Time
    AlertID      string
    Value        string
}
```

## API Integration

### Get Active Alerts

```go
alerts, err := engine.GetActiveAlerts()
```

### Acknowledge Alert

```go
err := engine.AcknowledgeAlert(alertID, "admin@example.com")
```

## Configuration

### Evaluation Interval

Set how often rules are evaluated (default: 30 seconds):

```go
engine.SetInterval(60 * time.Second) // Check every minute
```

### Alert Duration

Configure minimum duration before triggering (prevents flapping):

```go
rule.Duration = 300 // 5 minutes in seconds
```

## Performance

- **Concurrent Evaluation**: Rules are evaluated in parallel
- **Efficient State Tracking**: In-memory state tracking with minimal database queries
- **Batched Notifications**: Notifications sent asynchronously
- **Database Indexing**: Optimized queries with proper indexes

### Benchmarks

```
BenchmarkEvaluateCondition-8         10000000    150 ns/op
BenchmarkEvaluateConditionString-8    5000000    280 ns/op
```

## Example Alert Rules

### Device Down Alert

```go
&models.AlertRule{
    Name:        "Device Unreachable",
    Severity:    "critical",
    Source:      "icmp",
    Metric:      "device_status",
    Condition:   "eq",
    Threshold:   "down",
    Duration:    180, // 3 minutes
    NotifyEmail: true,
}
```

### High Latency Warning

```go
&models.AlertRule{
    Name:        "High Latency",
    Severity:    "warning",
    Source:      "icmp",
    Metric:      "ping_latency",
    Condition:   "gt",
    Threshold:   "100", // milliseconds
    Duration:    300,   // 5 minutes
    NotifyEmail: true,
}
```

### CPU Usage Alert

```go
&models.AlertRule{
    Name:        "High CPU Usage",
    Severity:    "warning",
    Source:      "snmp",
    Metric:      "cpu_usage",
    Condition:   "gt",
    Threshold:   "80%",
    Duration:    600, // 10 minutes
    NotifyWebhook: true,
}
```

## Testing

Run tests:

```bash
go test ./internal/alerting/...
```

Run with coverage:

```bash
go test -cover ./internal/alerting/...
```

Run benchmarks:

```bash
go test -bench=. ./internal/alerting/...
```

## Troubleshooting

### Alerts Not Triggering

1. Check rule is enabled: `rule.Enabled = true`
2. Verify condition syntax is correct
3. Check duration requirement is met
4. Review logs for evaluation errors

### Duplicate Alerts

The engine automatically prevents duplicates. If you see duplicates:

1. Check different rules aren't configured for the same condition
2. Verify alert resolution is working correctly

### Notification Failures

1. Check notification configuration (SMTP, webhook URLs)
2. Review network connectivity
3. Check authentication credentials
4. Enable debug logging for detailed error messages

## Future Enhancements

- [ ] Alert templates for custom messages
- [ ] Alert grouping and correlation
- [ ] Maintenance windows (suppress alerts during maintenance)
- [ ] Alert escalation policies
- [ ] Time-based rule scheduling
- [ ] Machine learning for anomaly detection
- [ ] Integration with PagerDuty, Opsgenie
- [ ] SMS notifications
- [ ] Voice call notifications

## License

Copyright © 2024 Technologies Unlimited
