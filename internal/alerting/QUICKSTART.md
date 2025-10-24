# Alerting Engine - Quick Start Guide

Get started with the Network Monitor alerting engine in 5 minutes.

## 1. Basic Setup

The alerting engine is automatically started when you run the application. No additional configuration required!

```bash
./network-monitor
```

You should see:
```
INFO Starting alerting engine
INFO Alert engine started interval=30s
```

## 2. Create Your First Alert Rule

### Via Database

```go
import (
    "github.com/Technologies-Unlimited/Network-Proxy/internal/models"
    "gorm.io/gorm"
)

func createAlertRule(db *gorm.DB) error {
    rule := &models.AlertRule{
        Name:        "Device Down",
        Description: "Alert when device is unreachable",
        Enabled:     true,
        Severity:    "critical",
        Source:      "icmp",
        Metric:      "device_status",
        Condition:   "eq",
        Threshold:   "down",
        Duration:    180, // 3 minutes
        NotifyEmail: true,
    }

    return db.Create(rule).Error
}
```

### Load Example Rules

Use the provided example rules:

```go
import "github.com/Technologies-Unlimited/Network-Proxy/internal/alerting"

// In your initialization code
engine := alerting.NewEngine(db)
err := alerting.CreateDefaultRules(engine)
```

## 3. Configure Notifications

### Email Notifications

Add to your `.env` file:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=alerts@yourcompany.com
ALERT_EMAIL_TO=admin@yourcompany.com
```

**Gmail Users**: Use an [App Password](https://support.google.com/accounts/answer/185833) instead of your regular password.

### Webhook Notifications

```go
webhook := alerting.NewWebhookNotifier("https://your-api.com/alerts")
webhook.Headers["Authorization"] = "Bearer YOUR-TOKEN"
engine.AddNotifier(webhook)
```

### Slack Notifications

```go
slack := alerting.NewSlackNotifier("https://hooks.slack.com/services/YOUR/WEBHOOK/URL")
slack.Channel = "#alerts"
engine.AddNotifier(slack)
```

Get your Slack webhook URL: https://api.slack.com/messaging/webhooks

## 4. Test Your Setup

### Create a Test Device

```go
device := &models.Device{
    Hostname:    "test-router",
    IPAddress:   "192.168.1.1",
    DeviceType:  "router",
    Status:      "up",
    ICMPEnabled: true,
}
db.Create(device)
```

### Trigger a Test Alert

Change device status to trigger an alert:

```go
db.Model(&device).Update("status", "down")

// Wait for alerting engine to evaluate (max 30 seconds)
// Then check for alerts
var alerts []models.Alert
db.Where("device_id = ? AND status = 'active'", device.ID).Find(&alerts)
```

### Check Logs

Look for alert messages in the logs:

```
WARN Alert triggered alert_id=abc123 severity=critical device=test-router
INFO Console notification sent alert_id=abc123
INFO Email notification sent alert_id=abc123
```

## 5. Common Alert Rules

### Device Unreachable

```go
&models.AlertRule{
    Name:      "Device Down",
    Severity:  "critical",
    Metric:    "device_status",
    Condition: "eq",
    Threshold: "down",
    Duration:  180, // Wait 3 minutes before alerting
}
```

### High Latency

```go
&models.AlertRule{
    Name:      "High Latency",
    Severity:  "warning",
    Metric:    "ping_latency",
    Condition: "gt",
    Threshold: "100", // 100ms
    Duration:  300,   // 5 minutes
}
```

### High CPU

```go
&models.AlertRule{
    Name:      "High CPU",
    Severity:  "warning",
    Metric:    "cpu_usage",
    Condition: "gt",
    Threshold: "80", // 80%
    Duration:  600,  // 10 minutes
}
```

## 6. Managing Alerts

### List Active Alerts

```go
alerts, err := engine.GetActiveAlerts()
for _, alert := range alerts {
    fmt.Printf("%s: %s\n", alert.Severity, alert.Title)
}
```

### Acknowledge Alert

```go
err := engine.AcknowledgeAlert(alertID, "admin@company.com")
```

### View Alert History

```go
var alerts []models.Alert
db.Where("device_id = ?", deviceID).
    Order("triggered_at DESC").
    Limit(10).
    Find(&alerts)
```

## 7. Customization

### Change Evaluation Interval

Default is 30 seconds. Adjust if needed:

```go
engine.SetInterval(60 * time.Second) // Check every minute
```

### Add Custom Notifier

Implement the `Notifier` interface:

```go
type MyNotifier struct {
    // your fields
}

func (n *MyNotifier) Send(alert *models.Alert) error {
    // your notification logic
    return nil
}

// Add to engine
engine.AddNotifier(&MyNotifier{})
```

## 8. Production Best Practices

### 1. Use Appropriate Durations

- **Critical Alerts**: 60-180 seconds (fast response)
- **Warning Alerts**: 300-600 seconds (avoid flapping)
- **Info Alerts**: 600+ seconds (informational only)

### 2. Configure Multiple Notification Channels

```go
// Critical alerts go everywhere
rule.NotifyEmail = true
rule.NotifyWebhook = true

// Add Slack for immediate visibility
slack := alerting.NewSlackNotifier(webhookURL)
engine.AddNotifier(slack)

// Add PagerDuty for on-call
webhook := alerting.NewWebhookNotifier("https://events.pagerduty.com/v2/enqueue")
webhook.Headers["Authorization"] = "Token token=YOUR-TOKEN"
engine.AddNotifier(webhook)
```

### 3. Monitor the Alerting Engine

Check logs regularly:

```bash
grep "Alert engine" /var/log/network-monitor.log
grep "Alert triggered" /var/log/network-monitor.log
grep "notification sent" /var/log/network-monitor.log
```

### 4. Set Up Alert Escalation

Create multiple rules with increasing severity:

```go
// Warning after 5 minutes
&models.AlertRule{
    Name: "High Latency Warning",
    Severity: "warning",
    Threshold: "100",
    Duration: 300,
}

// Critical after 15 minutes
&models.AlertRule{
    Name: "High Latency Critical",
    Severity: "critical",
    Threshold: "100",
    Duration: 900,
}
```

### 5. Test Notifications Regularly

```go
// Create a test alert
testAlert := &models.Alert{
    DeviceID:  "test",
    Severity:  "info",
    Title:     "Test Alert",
    Message:   "Testing notification system",
    Status:    "active",
    TriggeredAt: time.Now(),
}

// Send to all notifiers
for _, notifier := range engine.notifiers {
    notifier.Send(testAlert)
}
```

## 9. Troubleshooting

### Alerts Not Triggering

1. Check rule is enabled: `SELECT * FROM alert_rules WHERE enabled = true`
2. Verify devices are being monitored: Check collector logs
3. Confirm conditions are correct: Test with `EvaluateCondition()`
4. Check duration isn't too long

### Too Many Alerts

1. Increase duration to prevent flapping
2. Adjust thresholds to be less sensitive
3. Disable less critical rules
4. Group related alerts

### Notifications Not Sending

1. **Email**: Check SMTP credentials, test with telnet
2. **Webhook**: Verify URL is accessible, check authentication
3. **Slack**: Test webhook URL directly with curl
4. Check network connectivity and firewall rules

### Performance Issues

1. Reduce evaluation frequency: `engine.SetInterval(60 * time.Second)`
2. Disable unused rules
3. Optimize metric collection
4. Add database indexes

## 10. Next Steps

- [Full Documentation](README.md)
- [API Reference](../../docs/api.md)
- [Advanced Configuration](../../docs/alerting-advanced.md)
- [Integration Examples](../../docs/integrations/)

## Support

- GitHub Issues: https://github.com/Technologies-Unlimited/Network-Proxy/issues
- Documentation: https://docs.network-monitor.io
- Community: https://community.network-monitor.io

---

**Quick Reference Card**

| Task | Code |
|------|------|
| Create rule | `db.Create(&models.AlertRule{...})` |
| List alerts | `engine.GetActiveAlerts()` |
| Acknowledge | `engine.AcknowledgeAlert(id, user)` |
| Add email | Set `SMTP_*` environment variables |
| Add webhook | `engine.AddNotifier(NewWebhookNotifier(url))` |
| Test condition | `EvaluateCondition(cond, threshold, value)` |

**Condition Operators**: `gt` `lt` `eq` `ne` `ge` `le` `contains` `starts_with` `ends_with`

**Severities**: `critical` `warning` `info`

**Common Metrics**: `device_status` `ping_latency` `cpu_usage` `memory_usage` `disk_usage`
