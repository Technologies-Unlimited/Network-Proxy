package tools

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"strings"
	"time"
)

// WhoisResult contains the results of a WHOIS lookup
type WhoisResult struct {
	Target   string        `json:"target"`
	Server   string        `json:"server"`
	Response string        `json:"response"`
	Duration time.Duration `json:"duration"`
	Error    string        `json:"error,omitempty"`
}

// WhoisOptions configures WHOIS lookup behavior
type WhoisOptions struct {
	Timeout time.Duration
	Server  string // Optional custom WHOIS server
}

// DefaultWhoisOptions returns default options
func DefaultWhoisOptions() WhoisOptions {
	return WhoisOptions{
		Timeout: 10 * time.Second,
	}
}

// Whois performs a WHOIS lookup
func Whois(ctx context.Context, target string, opts WhoisOptions) (*WhoisResult, error) {
	start := time.Now()

	result := &WhoisResult{
		Target: target,
	}

	// Determine WHOIS server
	server := opts.Server
	if server == "" {
		server = determineWhoisServer(target)
	}
	result.Server = server

	// Connect to WHOIS server
	dialer := &net.Dialer{
		Timeout: opts.Timeout,
	}

	conn, err := dialer.DialContext(ctx, "tcp", server+":43")
	if err != nil {
		result.Error = err.Error()
		return result, fmt.Errorf("failed to connect to WHOIS server: %w", err)
	}
	defer conn.Close()

	// Set deadline
	conn.SetDeadline(time.Now().Add(opts.Timeout))

	// Send query
	_, err = fmt.Fprintf(conn, "%s\r\n", target)
	if err != nil {
		result.Error = err.Error()
		return result, fmt.Errorf("failed to send WHOIS query: %w", err)
	}

	// Read response
	var response strings.Builder
	scanner := bufio.NewScanner(conn)
	for scanner.Scan() {
		response.WriteString(scanner.Text())
		response.WriteString("\n")
	}

	if err := scanner.Err(); err != nil {
		result.Error = err.Error()
		return result, fmt.Errorf("failed to read WHOIS response: %w", err)
	}

	result.Response = response.String()
	result.Duration = time.Since(start)

	// Check for referral to another WHOIS server
	referralServer := extractReferralServer(result.Response)
	if referralServer != "" && referralServer != server {
		// Follow the referral
		opts.Server = referralServer
		return Whois(ctx, target, opts)
	}

	return result, nil
}

// determineWhoisServer determines the appropriate WHOIS server for the target
func determineWhoisServer(target string) string {
	// Check if target is an IP address
	ip := net.ParseIP(target)
	if ip != nil {
		return determineIPWhoisServer(ip)
	}

	// Target is a domain name
	return determineDomainWhoisServer(target)
}

// determineIPWhoisServer determines the WHOIS server for an IP address
func determineIPWhoisServer(ip net.IP) string {
	// Use ARIN for default, it will refer to the correct RIR
	if ip.To4() != nil {
		// IPv4
		return "whois.arin.net"
	}
	// IPv6
	return "whois.arin.net"
}

// determineDomainWhoisServer determines the WHOIS server for a domain
func determineDomainWhoisServer(domain string) string {
	// Extract TLD
	parts := strings.Split(domain, ".")
	if len(parts) < 2 {
		return "whois.internic.net" // Default
	}

	tld := parts[len(parts)-1]

	// Common TLD WHOIS servers
	tldServers := map[string]string{
		"com":    "whois.verisign-grs.com",
		"net":    "whois.verisign-grs.com",
		"org":    "whois.pir.org",
		"info":   "whois.afilias.net",
		"biz":    "whois.biz",
		"us":     "whois.nic.us",
		"uk":     "whois.nic.uk",
		"ca":     "whois.cira.ca",
		"de":     "whois.denic.de",
		"fr":     "whois.afnic.fr",
		"it":     "whois.nic.it",
		"nl":     "whois.domain-registry.nl",
		"au":     "whois.aunic.net",
		"jp":     "whois.jprs.jp",
		"cn":     "whois.cnnic.cn",
		"ru":     "whois.tcinet.ru",
		"br":     "whois.registro.br",
		"in":     "whois.inregistry.net",
		"io":     "whois.nic.io",
		"co":     "whois.nic.co",
		"me":     "whois.nic.me",
		"tv":     "whois.nic.tv",
		"cc":     "whois.nic.cc",
		"ws":     "whois.website.ws",
		"mobi":   "whois.dotmobiregistry.net",
		"name":   "whois.nic.name",
		"asia":   "whois.nic.asia",
		"tel":    "whois.nic.tel",
		"travel": "whois.nic.travel",
		"pro":    "whois.registrypro.pro",
		"xxx":    "whois.nic.xxx",
	}

	if server, ok := tldServers[strings.ToLower(tld)]; ok {
		return server
	}

	// Default to IANA WHOIS
	return "whois.iana.org"
}

// extractReferralServer extracts a referral WHOIS server from the response
func extractReferralServer(response string) string {
	lines := strings.Split(response, "\n")

	referralPatterns := []string{
		"ReferralServer: whois://",
		"Registrar WHOIS Server: ",
		"whois: ",
		"refer: ",
	}

	for _, line := range lines {
		for _, pattern := range referralPatterns {
			if strings.Contains(line, pattern) {
				server := strings.TrimSpace(strings.TrimPrefix(line, pattern))
				server = strings.TrimPrefix(server, "whois://")
				server = strings.TrimSuffix(server, "/")
				server = strings.TrimSpace(server)
				if server != "" {
					return server
				}
			}
		}
	}

	return ""
}

// ParseWhoisResponse parses common fields from a WHOIS response
func ParseWhoisResponse(response string) map[string]string {
	result := make(map[string]string)
	lines := strings.Split(response, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "%") || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])

		// Normalize key
		key = strings.ToLower(key)
		key = strings.ReplaceAll(key, " ", "_")

		result[key] = value
	}

	return result
}

// ExtractField extracts a specific field from WHOIS response
func ExtractField(response string, fieldName string) string {
	parsed := ParseWhoisResponse(response)

	// Try exact match
	if value, ok := parsed[strings.ToLower(fieldName)]; ok {
		return value
	}

	// Try partial match
	fieldName = strings.ToLower(fieldName)
	for key, value := range parsed {
		if strings.Contains(key, fieldName) {
			return value
		}
	}

	return ""
}

// ExtractEmails extracts email addresses from WHOIS response
func ExtractEmails(response string) []string {
	emails := make([]string, 0)
	seen := make(map[string]bool)

	lines := strings.Split(response, "\n")
	for _, line := range lines {
		// Simple email regex pattern
		words := strings.Fields(line)
		for _, word := range words {
			if strings.Contains(word, "@") && strings.Contains(word, ".") {
				email := strings.Trim(word, ",:;()[]<>")
				if !seen[email] && isValidEmail(email) {
					emails = append(emails, email)
					seen[email] = true
				}
			}
		}
	}

	return emails
}

// isValidEmail performs basic email validation
func isValidEmail(email string) bool {
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return false
	}

	if parts[0] == "" || parts[1] == "" {
		return false
	}

	if !strings.Contains(parts[1], ".") {
		return false
	}

	return true
}
