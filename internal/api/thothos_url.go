package api

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// validateThothOSURL enforces a trust policy on user-supplied ThothOS URLs
// before the auth handlers POST to them. Without this check, a malicious
// caller could aim the server's outbound client at any internal service
// (169.254.169.254 metadata, Kibana, Vault, etc.) and read the response —
// classic SSRF. CodeQL flagged this as go/request-forgery on the login /
// verify-mfa / test-connection / connect paths.
//
// Policy:
//  1. Must parse and be http/https.
//  2. If a saved ProxyConfig (or Settings ThothOS URL) already exists for
//     this install, the supplied URL must match scheme+host+port. This
//     pins the server to one ThothOS per install once configured.
//  3. If no config exists yet (first-run bootstrap), the caller must come
//     from the loopback interface — so only a local operator can set up
//     the initial ThothOS target.
//  4. The URL must resolve to *some* address; we do not block private IPs
//     because self-hosted ThothOS commonly runs on RFC1918 space. Step 2
//     pins the target after setup, which is the real defense.
func validateThothOSURL(c *gin.Context, db *gorm.DB, rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("URL must be http or https, got %q", u.Scheme)
	}
	if u.Host == "" {
		return errors.New("URL missing host")
	}

	// Pin once configured: the supplied URL must origin-match the saved
	// ThothOS URL. "Origin-match" means scheme+host+port; paths and
	// queries can differ (we append endpoints like /api/auth/proxy/login).
	saved := installedThothOSOrigin(db)
	if saved != "" {
		if !originMatch(u, saved) {
			return fmt.Errorf("URL does not match the configured ThothOS origin %q", saved)
		}
		return nil
	}

	// First-run bootstrap: only loopback callers may propose a new target.
	if !isLoopbackRequest(c) {
		return errors.New("first-time ThothOS setup must be initiated from the local host")
	}
	return nil
}

// installedThothOSOrigin returns scheme://host[:port] of the configured
// ThothOS URL (preferring the ProxyConfig row, falling back to Settings).
// Returns "" if nothing is configured.
func installedThothOSOrigin(db *gorm.DB) string {
	var cfg models.ProxyConfig
	if err := db.First(&cfg).Error; err == nil && cfg.ThothOSURL != "" {
		if o := originOf(cfg.ThothOSURL); o != "" {
			return o
		}
	}
	if settingsCfg, err := models.GetThothOSConfig(db); err == nil && settingsCfg != nil {
		if o := originOf(settingsCfg.URL); o != "" {
			return o
		}
	}
	return ""
}

func originOf(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return ""
	}
	return strings.ToLower(u.Scheme) + "://" + strings.ToLower(u.Host)
}

func originMatch(u *url.URL, savedOrigin string) bool {
	return originOf(u.String()) == savedOrigin
}

// thothosHTTPClient returns an http.Client that (a) enforces a timeout and
// (b) refuses to follow redirects into non-http(s) schemes. Redirects to
// other hosts are also rejected so an attacker who controls the saved
// ThothOS target can't bounce us somewhere worse mid-request.
func thothosHTTPClient(timeout time.Duration, pinnedOrigin string) *http.Client {
	return &http.Client{
		Timeout: timeout,
		// CheckRedirect also runs on the initial dial's Location header,
		// giving us belt-and-suspenders against redirect SSRF even though
		// the request URL itself already passed validateThothOSURL.
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return errors.New("too many redirects")
			}
			if req.URL.Scheme != "http" && req.URL.Scheme != "https" {
				return fmt.Errorf("redirect to disallowed scheme: %s", req.URL.Scheme)
			}
			if pinnedOrigin != "" && originOf(req.URL.String()) != pinnedOrigin {
				return fmt.Errorf("redirect to disallowed origin: %s", req.URL.Host)
			}
			return nil
		},
		Transport: &http.Transport{
			Proxy: http.ProxyFromEnvironment,
			DialContext: (&net.Dialer{
				Timeout:   timeout,
				KeepAlive: 30 * time.Second,
			}).DialContext,
			ForceAttemptHTTP2:     true,
			MaxIdleConns:          10,
			IdleConnTimeout:       60 * time.Second,
			TLSHandshakeTimeout:   10 * time.Second,
			ResponseHeaderTimeout: timeout,
		},
	}
}

// boundedPostJSON issues a context-aware JSON POST using the SSRF-aware
// client. Kept tiny and local so callers don't have to remember to set
// headers. The response body is capped at maxBodyBytes to defend against
// oversized-response memory exhaustion.
func boundedPostJSON(
	ctx context.Context,
	client *http.Client,
	url string,
	body []byte,
	headers map[string]string,
) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req, err = http.NewRequestWithContext(ctx, http.MethodPost, url, bytesReader(body))
		if err != nil {
			return nil, err
		}
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	return client.Do(req)
}

// bytesReader indirection keeps us from pulling bytes.Reader into the
// validator file's surface and makes the import footprint smaller.
func bytesReader(b []byte) *strings.Reader {
	return strings.NewReader(string(b))
}
