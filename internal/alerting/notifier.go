package alerting

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/smtp"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/rs/zerolog/log"
)

// Notifier is the interface for alert notification handlers.
type Notifier interface {
	Send(alert *models.Alert) error
}

// ============================================================================
// Email
// ============================================================================

// EmailNotifier sends alerts via email.
type EmailNotifier struct {
	SMTPHost string
	SMTPPort string
	Username string
	Password string
	From     string
	To       []string
	UseTLS   bool
}

// NewEmailNotifier builds an email notifier from env vars. Returns nil if
// required vars are missing — callers should treat nil as "email disabled".
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

	recipients := splitAndTrim(to, ",")
	if len(recipients) == 0 {
		return nil
	}

	return &EmailNotifier{
		SMTPHost: smtpHost,
		SMTPPort: smtpPort,
		Username: username,
		Password: password,
		From:     from,
		To:       recipients,
		UseTLS:   strings.EqualFold(os.Getenv("SMTP_USE_TLS"), "true") || smtpPort == "465" || smtpPort == "587",
	}
}

func splitAndTrim(s, sep string) []string {
	parts := strings.Split(s, sep)
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// Send sends an alert via email.
func (n *EmailNotifier) Send(alert *models.Alert) error {
	subject := fmt.Sprintf("[%s] %s", alert.Severity, alert.Title)
	body := n.formatEmailBody(alert)

	msg := []byte(
		"To: " + strings.Join(n.To, ", ") + "\r\n" +
			"From: " + n.From + "\r\n" +
			"Subject: " + subject + "\r\n" +
			"MIME-Version: 1.0\r\n" +
			"Content-Type: text/html; charset=UTF-8\r\n" +
			"\r\n" +
			body + "\r\n",
	)

	addr := net.JoinHostPort(n.SMTPHost, n.SMTPPort)

	var auth smtp.Auth
	if n.Username != "" && n.Password != "" {
		auth = smtp.PlainAuth("", n.Username, n.Password, n.SMTPHost)
	}

	if err := smtp.SendMail(addr, auth, n.From, n.To, msg); err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	log.Info().
		Str("alert_id", alert.ID).
		Strs("to", n.To).
		Msg("Email notification sent")
	return nil
}

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

	return fmt.Sprintf(`<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="background:%s;color:#fff;padding:15px;border-radius:5px 5px 0 0;">
<h2 style="margin:0;">Alert: %s</h2></div>
<div style="background:#f8f9fa;padding:20px;border:1px solid #dee2e6;border-top:none;border-radius:0 0 5px 5px;">
<p><strong>Message:</strong> %s</p>
<p><strong>Severity:</strong> %s</p>
<p><strong>Source:</strong> %s</p>
<p><strong>Metric:</strong> %s</p>
<p><strong>Current Value:</strong> %s</p>
<p><strong>Threshold:</strong> %s</p>
<p><strong>Triggered At:</strong> %s</p>
</div>
<p style="font-size:12px;color:#6c757d;margin-top:20px;">Network Monitor — Alert ID: %s</p>
</div></body></html>`,
		color,
		htmlEscape(alert.Title),
		htmlEscape(alert.Message),
		htmlEscape(alert.Severity),
		htmlEscape(alert.Source),
		htmlEscape(alert.Metric),
		htmlEscape(alert.Value),
		htmlEscape(alert.Threshold),
		alert.TriggeredAt.Format(time.RFC3339),
		htmlEscape(alert.ID),
	)
}

func htmlEscape(s string) string {
	r := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
		"'", "&#39;",
	)
	return r.Replace(s)
}

// ============================================================================
// Webhook (SSRF-hardened)
// ============================================================================

// WebhookNotifier sends alerts to a webhook URL.
//
// Outbound requests are restricted by an SSRF-aware HTTP client:
//   - URL must be http or https.
//   - All resolved destination IPs must be globally routable (no loopback,
//     private, link-local, multicast, or unspecified addresses) unless
//     AllowPrivate is explicitly set.
//   - Redirects are followed only if the new host passes the same checks.
type WebhookNotifier struct {
	URL          string
	Headers      map[string]string
	Timeout      time.Duration
	AllowPrivate bool

	client *http.Client
}

// NewWebhookNotifier creates a new webhook notifier. The URL is validated
// when Send is called.
func NewWebhookNotifier(rawURL string) *WebhookNotifier {
	n := &WebhookNotifier{
		URL:     rawURL,
		Headers: make(map[string]string),
		Timeout: 10 * time.Second,
	}
	n.client = newSafeHTTPClient(&n.AllowPrivate, n.Timeout)
	return n
}

// newSafeHTTPClient builds an HTTP client whose dialer refuses to connect to
// private/loopback/link-local/multicast IPs unless allowPrivate points at a
// true value. The pointer indirection lets callers flip AllowPrivate after
// construction (e.g. for tests).
func newSafeHTTPClient(allowPrivate *bool, timeout time.Duration) *http.Client {
	dialer := &net.Dialer{Timeout: timeout, KeepAlive: 30 * time.Second}

	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
			if err != nil {
				return nil, fmt.Errorf("lookup %s: %w", host, err)
			}
			for _, ip := range ips {
				if allowPrivate == nil || !*allowPrivate {
					if !isPublicIP(ip) {
						return nil, fmt.Errorf(
							"dial blocked: %s resolves to non-public address %s", host, ip)
					}
				}
				conn, dialErr := dialer.DialContext(
					ctx, network, net.JoinHostPort(ip.String(), port))
				if dialErr == nil {
					return conn, nil
				}
			}
			return nil, fmt.Errorf("all addresses for %s failed or were blocked", host)
		},
	}

	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return fmt.Errorf("too many redirects")
			}
			if req.URL.Scheme != "http" && req.URL.Scheme != "https" {
				return fmt.Errorf("redirect to disallowed scheme: %s", req.URL.Scheme)
			}
			return nil
		},
	}
}

// isPublicIP reports whether ip is a globally routable address.
func isPublicIP(ip net.IP) bool {
	if ip == nil {
		return false
	}
	if ip.IsUnspecified() || ip.IsLoopback() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsInterfaceLocalMulticast() ||
		ip.IsMulticast() {
		return false
	}
	// IPv4 private ranges + the cloud metadata service + carrier-grade NAT.
	if v4 := ip.To4(); v4 != nil {
		switch {
		case v4[0] == 10:
			return false
		case v4[0] == 172 && v4[1] >= 16 && v4[1] <= 31:
			return false
		case v4[0] == 192 && v4[1] == 168:
			return false
		case v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127: // 100.64.0.0/10
			return false
		case v4[0] == 169 && v4[1] == 254: // 169.254.0.0/16 (incl. AWS metadata)
			return false
		case v4[0] == 127: // 127.0.0.0/8
			return false
		case v4[0] == 0:
			return false
		case v4[0] >= 224: // 224.0.0.0/4 multicast, 240/4 reserved
			return false
		}
		return true
	}
	// IPv6 ULAs (fc00::/7) and documentation prefixes.
	if len(ip) == net.IPv6len {
		if ip[0]&0xfe == 0xfc {
			return false
		}
	}
	return true
}

// Send sends an alert to a webhook.
func (n *WebhookNotifier) Send(alert *models.Alert) error {
	if err := n.validateURL(n.URL); err != nil {
		return err
	}

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

	if n.client == nil {
		n.client = newSafeHTTPClient(&n.AllowPrivate, n.Timeout)
	}

	req, err := http.NewRequest(http.MethodPost, n.URL, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Network-Monitor/1.0")
	for key, value := range n.Headers {
		req.Header.Set(key, value)
	}

	resp, err := n.client.Do(req)
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

// validateURL verifies the URL is well-formed, uses http(s), and (unless
// AllowPrivate) does not point at a private/loopback host.
func (n *WebhookNotifier) validateURL(rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid webhook URL: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("webhook URL must be http or https, got %q", u.Scheme)
	}
	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("webhook URL missing host")
	}
	if n.AllowPrivate {
		return nil
	}
	if ip := net.ParseIP(host); ip != nil {
		if !isPublicIP(ip) {
			return fmt.Errorf("webhook URL host %s is not public", host)
		}
		return nil
	}
	// Resolve once at validate time; the dialer will re-check at connect time
	// to defend against DNS-rebinding.
	ips, err := net.LookupIP(host)
	if err != nil {
		return fmt.Errorf("webhook URL host %s did not resolve: %w", host, err)
	}
	for _, ip := range ips {
		if !isPublicIP(ip) {
			return fmt.Errorf("webhook URL host %s resolves to non-public %s", host, ip)
		}
	}
	return nil
}

// ============================================================================
// Console
// ============================================================================

// ConsoleNotifier logs alerts to console.
type ConsoleNotifier struct{}

// Send logs an alert to the console.
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

// ============================================================================
// Slack
// ============================================================================

// SlackNotifier sends alerts to Slack (webhook-based).
type SlackNotifier struct {
	WebhookURL string
	Channel    string
	Username   string

	client       *http.Client
	allowPrivate bool
}

// NewSlackNotifier creates a new Slack notifier.
func NewSlackNotifier(webhookURL string) *SlackNotifier {
	n := &SlackNotifier{
		WebhookURL: webhookURL,
		Username:   "Network Monitor",
	}
	n.client = newSafeHTTPClient(&n.allowPrivate, 10*time.Second)
	return n
}

// Send sends an alert to Slack.
func (n *SlackNotifier) Send(alert *models.Alert) error {
	colorMap := map[string]string{"critical": "danger", "warning": "warning", "info": "good"}
	color := colorMap[alert.Severity]
	if color == "" {
		color = "#808080"
	}

	payload := map[string]interface{}{
		"username": n.Username,
		"attachments": []map[string]interface{}{
			{
				"color":  color,
				"title":  alert.Title,
				"text":   alert.Message,
				"footer": "Network Monitor",
				"ts":     alert.TriggeredAt.Unix(),
				"fields": []map[string]interface{}{
					{"title": "Severity", "value": alert.Severity, "short": true},
					{"title": "Metric", "value": alert.Metric, "short": true},
					{"title": "Current Value", "value": alert.Value, "short": true},
					{"title": "Threshold", "value": alert.Threshold, "short": true},
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

	if n.client == nil {
		n.client = newSafeHTTPClient(&n.allowPrivate, 10*time.Second)
	}
	resp, err := n.client.Post(n.WebhookURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to send Slack notification: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("slack returned status %d", resp.StatusCode)
	}
	log.Info().Str("alert_id", alert.ID).Msg("Slack notification sent")
	return nil
}

// ============================================================================
// Microsoft Teams
// ============================================================================

// TeamsNotifier sends alerts to Microsoft Teams.
type TeamsNotifier struct {
	WebhookURL string

	client       *http.Client
	allowPrivate bool
}

// NewTeamsNotifier creates a new Teams notifier.
func NewTeamsNotifier(webhookURL string) *TeamsNotifier {
	n := &TeamsNotifier{WebhookURL: webhookURL}
	n.client = newSafeHTTPClient(&n.allowPrivate, 10*time.Second)
	return n
}

// Send sends an alert to Microsoft Teams.
func (n *TeamsNotifier) Send(alert *models.Alert) error {
	colorMap := map[string]string{"critical": "FF0000", "warning": "FFA500", "info": "0078D4"}
	themeColor := colorMap[alert.Severity]
	if themeColor == "" {
		themeColor = "808080"
	}
	payload := map[string]interface{}{
		"@type":      "MessageCard",
		"@context":   "https://schema.org/extensions",
		"summary":    alert.Title,
		"themeColor": themeColor,
		"title":      alert.Title,
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

	if n.client == nil {
		n.client = newSafeHTTPClient(&n.allowPrivate, 10*time.Second)
	}
	resp, err := n.client.Post(n.WebhookURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to send Teams notification: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("teams returned status %d", resp.StatusCode)
	}
	log.Info().Str("alert_id", alert.ID).Msg("Teams notification sent")
	return nil
}
