package alerting

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/smtp"
	"os"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/rs/zerolog/log"
)

// Notifier is the interface for alert notification handlers
type Notifier interface {
	Send(alert *models.Alert) error
}

// EmailNotifier sends alerts via email
type EmailNotifier struct {
	SMTPHost string
	SMTPPort string
	Username string
	Password string
	From     string
	To       []string
}

// NewEmailNotifier creates a new email notifier from environment variables
func NewEmailNotifier() *EmailNotifier {
	smtpHost := os.Getenv("SMTP_HOST")
	smtpPort := os.Getenv("SMTP_PORT")
	username := os.Getenv("SMTP_USERNAME")
	password := os.Getenv("SMTP_PASSWORD")
	from := os.Getenv("SMTP_FROM")
	to := os.Getenv("ALERT_EMAIL_TO")

	if smtpHost == "" || from == "" || to == "" {
		return nil
	}

	if smtpPort == "" {
		smtpPort = "587"
	}

	return &EmailNotifier{
		SMTPHost: smtpHost,
		SMTPPort: smtpPort,
		Username: username,
		Password: password,
		From:     from,
		To:       []string{to},
	}
}

// Send sends an alert via email
func (n *EmailNotifier) Send(alert *models.Alert) error {
	subject := fmt.Sprintf("[%s] %s", alert.Severity, alert.Title)
	body := n.formatEmailBody(alert)

	// Build email message
	msg := []byte(
		"To: " + n.To[0] + "\r\n" +
			"From: " + n.From + "\r\n" +
			"Subject: " + subject + "\r\n" +
			"Content-Type: text/html; charset=UTF-8\r\n" +
			"\r\n" +
			body + "\r\n",
	)

	// Connect and send
	addr := fmt.Sprintf("%s:%s", n.SMTPHost, n.SMTPPort)

	var auth smtp.Auth
	if n.Username != "" && n.Password != "" {
		auth = smtp.PlainAuth("", n.Username, n.Password, n.SMTPHost)
	}

	err := smtp.SendMail(addr, auth, n.From, n.To, msg)
	if err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	log.Info().
		Str("alert_id", alert.ID).
		Str("to", n.To[0]).
		Msg("Email notification sent")

	return nil
}

// formatEmailBody creates HTML email body
func (n *EmailNotifier) formatEmailBody(alert *models.Alert) string {
	severityColor := map[string]string{
		"critical": "#dc3545",
		"warning":  "#ffc107",
		"info":     "#17a2b8",
	}

	color := severityColor[alert.Severity]
	if color == "" {
		color = "#6c757d"
	}

	return fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: %s; color: white; padding: 15px; border-radius: 5px 5px 0 0; }
        .content { background-color: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 5px 5px; }
        .detail { margin: 10px 0; }
        .label { font-weight: bold; color: #495057; }
        .value { color: #212529; }
        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 12px; color: #6c757d; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2 style="margin: 0;">⚠️ Alert: %s</h2>
        </div>
        <div class="content">
            <div class="detail">
                <span class="label">Message:</span><br>
                <span class="value">%s</span>
            </div>
            <div class="detail">
                <span class="label">Severity:</span>
                <span class="value">%s</span>
            </div>
            <div class="detail">
                <span class="label">Source:</span>
                <span class="value">%s</span>
            </div>
            <div class="detail">
                <span class="label">Metric:</span>
                <span class="value">%s</span>
            </div>
            <div class="detail">
                <span class="label">Current Value:</span>
                <span class="value">%s</span>
            </div>
            <div class="detail">
                <span class="label">Threshold:</span>
                <span class="value">%s</span>
            </div>
            <div class="detail">
                <span class="label">Triggered At:</span>
                <span class="value">%s</span>
            </div>
        </div>
        <div class="footer">
            <p>This is an automated alert from Network Monitor.</p>
            <p>Alert ID: %s</p>
        </div>
    </div>
</body>
</html>
`,
		color,
		alert.Title,
		alert.Message,
		alert.Severity,
		alert.Source,
		alert.Metric,
		alert.Value,
		alert.Threshold,
		alert.TriggeredAt.Format(time.RFC3339),
		alert.ID,
	)
}

// WebhookNotifier sends alerts to a webhook URL
type WebhookNotifier struct {
	URL     string
	Headers map[string]string
	Timeout time.Duration
}

// NewWebhookNotifier creates a new webhook notifier
func NewWebhookNotifier(url string) *WebhookNotifier {
	return &WebhookNotifier{
		URL:     url,
		Headers: make(map[string]string),
		Timeout: 10 * time.Second,
	}
}

// Send sends an alert to a webhook
func (n *WebhookNotifier) Send(alert *models.Alert) error {
	// Prepare payload
	payload := map[string]interface{}{
		"alert_id":     alert.ID,
		"device_id":    alert.DeviceID,
		"severity":     alert.Severity,
		"status":       alert.Status,
		"title":        alert.Title,
		"message":      alert.Message,
		"source":       alert.Source,
		"metric":       alert.Metric,
		"value":        alert.Value,
		"threshold":    alert.Threshold,
		"triggered_at": alert.TriggeredAt.Format(time.RFC3339),
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	// Create HTTP client with timeout
	client := &http.Client{
		Timeout: n.Timeout,
	}

	// Create request
	req, err := http.NewRequest("POST", n.URL, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Network-Monitor/1.0")

	// Add custom headers
	for key, value := range n.Headers {
		req.Header.Set(key, value)
	}

	// Send request
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send webhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}

	log.Info().
		Str("alert_id", alert.ID).
		Str("url", n.URL).
		Int("status", resp.StatusCode).
		Msg("Webhook notification sent")

	return nil
}

// ConsoleNotifier logs alerts to console
type ConsoleNotifier struct{}

// Send logs an alert to the console
func (n *ConsoleNotifier) Send(alert *models.Alert) error {
	log.Warn().
		Str("alert_id", alert.ID).
		Str("severity", alert.Severity).
		Str("title", alert.Title).
		Str("message", alert.Message).
		Str("metric", alert.Metric).
		Str("value", alert.Value).
		Str("threshold", alert.Threshold).
		Time("triggered_at", alert.TriggeredAt).
		Msg("ALERT NOTIFICATION")

	return nil
}

// SlackNotifier sends alerts to Slack (webhook-based)
type SlackNotifier struct {
	WebhookURL string
	Channel    string
	Username   string
}

// NewSlackNotifier creates a new Slack notifier
func NewSlackNotifier(webhookURL string) *SlackNotifier {
	return &SlackNotifier{
		WebhookURL: webhookURL,
		Username:   "Network Monitor",
	}
}

// Send sends an alert to Slack
func (n *SlackNotifier) Send(alert *models.Alert) error {
	// Map severity to Slack color
	colorMap := map[string]string{
		"critical": "danger",
		"warning":  "warning",
		"info":     "good",
	}
	color := colorMap[alert.Severity]
	if color == "" {
		color = "#808080"
	}

	// Build Slack message
	payload := map[string]interface{}{
		"username": n.Username,
		"attachments": []map[string]interface{}{
			{
				"color":      color,
				"title":      alert.Title,
				"text":       alert.Message,
				"footer":     "Network Monitor",
				"footer_icon": "https://platform.slack-edge.com/img/default_application_icon.png",
				"ts":         alert.TriggeredAt.Unix(),
				"fields": []map[string]interface{}{
					{
						"title": "Severity",
						"value": alert.Severity,
						"short": true,
					},
					{
						"title": "Metric",
						"value": alert.Metric,
						"short": true,
					},
					{
						"title": "Current Value",
						"value": alert.Value,
						"short": true,
					},
					{
						"title": "Threshold",
						"value": alert.Threshold,
						"short": true,
					},
				},
			},
		},
	}

	if n.Channel != "" {
		payload["channel"] = n.Channel
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal Slack payload: %w", err)
	}

	// Send to Slack
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(n.WebhookURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to send Slack notification: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("slack returned status %d", resp.StatusCode)
	}

	log.Info().
		Str("alert_id", alert.ID).
		Msg("Slack notification sent")

	return nil
}

// TeamsNotifier sends alerts to Microsoft Teams
type TeamsNotifier struct {
	WebhookURL string
}

// NewTeamsNotifier creates a new Teams notifier
func NewTeamsNotifier(webhookURL string) *TeamsNotifier {
	return &TeamsNotifier{
		WebhookURL: webhookURL,
	}
}

// Send sends an alert to Microsoft Teams
func (n *TeamsNotifier) Send(alert *models.Alert) error {
	// Map severity to Teams theme color
	colorMap := map[string]string{
		"critical": "FF0000",
		"warning":  "FFA500",
		"info":     "0078D4",
	}
	themeColor := colorMap[alert.Severity]
	if themeColor == "" {
		themeColor = "808080"
	}

	// Build Teams message card
	payload := map[string]interface{}{
		"@type":      "MessageCard",
		"@context":   "https://schema.org/extensions",
		"summary":    alert.Title,
		"themeColor": themeColor,
		"title":      fmt.Sprintf("⚠️ %s", alert.Title),
		"sections": []map[string]interface{}{
			{
				"activityTitle":    "Alert Details",
				"activitySubtitle": alert.Message,
				"facts": []map[string]string{
					{"name": "Severity", "value": alert.Severity},
					{"name": "Source", "value": alert.Source},
					{"name": "Metric", "value": alert.Metric},
					{"name": "Current Value", "value": alert.Value},
					{"name": "Threshold", "value": alert.Threshold},
					{"name": "Triggered At", "value": alert.TriggeredAt.Format(time.RFC3339)},
				},
			},
		},
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal Teams payload: %w", err)
	}

	// Send to Teams
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(n.WebhookURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to send Teams notification: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("teams returned status %d", resp.StatusCode)
	}

	log.Info().
		Str("alert_id", alert.ID).
		Msg("Teams notification sent")

	return nil
}
