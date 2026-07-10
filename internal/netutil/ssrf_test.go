package netutil

import (
	"net"
	"testing"
)

func TestIsPublicIP(t *testing.T) {
	cases := map[string]bool{
		"8.8.8.8":         true,
		"1.1.1.1":         true,
		"10.0.0.1":        false, // RFC1918
		"172.16.5.4":      false, // RFC1918
		"172.32.0.1":      true,  // just outside 172.16/12
		"192.168.1.1":     false, // RFC1918
		"127.0.0.1":       false, // loopback
		"169.254.169.254": false, // cloud metadata
		"100.64.0.1":      false, // CGNAT
		"0.0.0.0":         false, // unspecified
		"224.0.0.1":       false, // multicast
		"fd00::1":         false, // IPv6 ULA
		"2606:4700:4700::1111": true, // public IPv6 (Cloudflare)
	}
	for ipStr, want := range cases {
		ip := net.ParseIP(ipStr)
		if ip == nil {
			t.Fatalf("bad test IP %q", ipStr)
		}
		if got := IsPublicIP(ip); got != want {
			t.Errorf("IsPublicIP(%s)=%v want %v", ipStr, got, want)
		}
	}
	if IsPublicIP(nil) {
		t.Error("nil IP must not be public")
	}
}

func TestValidateExternalURL(t *testing.T) {
	// Public host with allowPrivate=false → ok
	if err := ValidateExternalURL("https://8.8.8.8/path", false); err != nil {
		t.Errorf("public IP should be allowed: %v", err)
	}
	// Private host with allowPrivate=false → blocked
	if err := ValidateExternalURL("http://10.0.0.5/x", false); err == nil {
		t.Error("private IP should be blocked when allowPrivate=false")
	}
	// Private host with allowPrivate=true → ok
	if err := ValidateExternalURL("http://10.0.0.5/x", true); err != nil {
		t.Errorf("private IP should be allowed when allowPrivate=true: %v", err)
	}
	// Metadata IP blocked
	if err := ValidateExternalURL("http://169.254.169.254/latest/meta-data/", false); err == nil {
		t.Error("cloud metadata IP must be blocked")
	}
	// Bad scheme rejected
	if err := ValidateExternalURL("ftp://example.com", true); err == nil {
		t.Error("non-http scheme must be rejected")
	}
	// Missing host rejected
	if err := ValidateExternalURL("http://", true); err == nil {
		t.Error("missing host must be rejected")
	}
}

func TestSafeHTTPClientBuilds(t *testing.T) {
	c := SafeHTTPClient(5e9, false)
	if c == nil || c.Transport == nil || c.CheckRedirect == nil {
		t.Fatal("SafeHTTPClient returned an incomplete client")
	}
}
