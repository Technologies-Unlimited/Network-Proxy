package netutil

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"time"
)

// IsPublicIP reports whether ip is a globally routable address. Blocks the
// usual SSRF pivot candidates: loopback, link-local (incl. the cloud
// metadata address 169.254.169.254), RFC1918 private ranges, CGNAT, IPv4
// multicast/reserved, IPv6 ULAs.
//
// Mirrors the check the alerting package's webhook notifier already uses;
// lifted here so the ThothOS client / auth handlers can share one policy.
func IsPublicIP(ip net.IP) bool {
	if ip == nil {
		return false
	}
	if ip.IsUnspecified() || ip.IsLoopback() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsInterfaceLocalMulticast() ||
		ip.IsMulticast() {
		return false
	}
	if v4 := ip.To4(); v4 != nil {
		switch {
		case v4[0] == 10:
			return false
		case v4[0] == 172 && v4[1] >= 16 && v4[1] <= 31:
			return false
		case v4[0] == 192 && v4[1] == 168:
			return false
		case v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127: // 100.64.0.0/10 (CGNAT)
			return false
		case v4[0] == 169 && v4[1] == 254: // 169.254.0.0/16 (incl. cloud metadata)
			return false
		case v4[0] == 127: // 127.0.0.0/8
			return false
		case v4[0] == 0:
			return false
		case v4[0] >= 224: // 224.0.0.0/4 multicast + 240/4 reserved
			return false
		}
		return true
	}
	if len(ip) == net.IPv6len && ip[0]&0xfe == 0xfc { // fc00::/7 ULA
		return false
	}
	return true
}

// ValidateExternalURL rejects URLs that could be used to SSRF into the
// server's internal network. Pass allowPrivate=true for configurations
// that legitimately point at on-prem services (most ThothOS deployments
// run on private IP space, so the auth handlers set this based on config).
func ValidateExternalURL(rawURL string, allowPrivate bool) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("URL must be http or https, got %q", u.Scheme)
	}
	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("URL missing host")
	}
	if allowPrivate {
		return nil
	}
	if ip := net.ParseIP(host); ip != nil {
		if !IsPublicIP(ip) {
			return fmt.Errorf("URL host %s is not public", host)
		}
		return nil
	}
	// Resolve once; the dialer re-checks at connect time (DNS-rebinding
	// defense).
	ips, err := net.LookupIP(host)
	if err != nil {
		return fmt.Errorf("URL host %s did not resolve: %w", host, err)
	}
	for _, ip := range ips {
		if !IsPublicIP(ip) {
			return fmt.Errorf("URL host %s resolves to non-public %s", host, ip)
		}
	}
	return nil
}

// SafeHTTPClient builds an http.Client whose dialer refuses to connect to
// non-public addresses unless allowPrivate is true. Also enforces a redirect
// limit and rejects non-http(s) redirects.
func SafeHTTPClient(timeout time.Duration, allowPrivate bool) *http.Client {
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
				if !allowPrivate && !IsPublicIP(ip) {
					return nil, fmt.Errorf(
						"dial blocked: %s resolves to non-public %s", host, ip)
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
