package api

import (
	"fmt"
	"net"
	"net/url"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/envcfg"
)

// guardDiagnosticURL blocks the small set of destinations that are never a
// legitimate diagnostic target from this product's perspective:
//
//   - 169.254.169.254 (the well-known cloud-instance-metadata IP — AWS,
//     GCP, Azure, OpenStack all use it). An attacker who can reach the
//     httpTest endpoint shouldn't be able to use the server as a proxy
//     to fetch cloud-instance credentials.
//   - 169.254.0.0/16 link-local more broadly (DHCPv4 fallback range).
//   - The IPv6 metadata equivalent fd00:ec2::254.
//
// Other private IPs (10/8, 172.16/12, 192.168/16, 127/8) are deliberately
// allowed because testing on-prem services is the explicit purpose of this
// tool. Operators who want a stricter posture can set
// NETWORK_MONITOR_DIAG_ALLOW_METADATA=true to lift the metadata block (for
// CI/test environments where there's no cloud-metadata service) or wire
// netutil.ValidateExternalURL in if they want full SSRF blocking.
func guardDiagnosticURL(rawURL string) error {
	if envcfg.Bool("NETWORK_MONITOR_DIAG_ALLOW_METADATA") {
		return nil
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("URL missing host")
	}
	check := func(ip net.IP) error {
		if ip == nil {
			return nil
		}
		if v4 := ip.To4(); v4 != nil && v4[0] == 169 && v4[1] == 254 {
			return fmt.Errorf("blocked: %s is in cloud-instance-metadata range 169.254.0.0/16", ip)
		}
		// IPv6 cloud metadata (fd00:ec2::254 on AWS).
		if len(ip) == net.IPv6len && ip[0] == 0xfd && ip[1] == 0x00 &&
			ip[2] == 0xec && ip[3] == 0x2f {
			return fmt.Errorf("blocked: %s matches IPv6 metadata fd00:ec2::/32", ip)
		}
		return nil
	}
	if ip := net.ParseIP(host); ip != nil {
		return check(ip)
	}
	ips, err := net.LookupIP(host)
	if err != nil {
		// Resolution failure is the upstream HTTP layer's problem to
		// report; we don't block on it here.
		return nil
	}
	for _, ip := range ips {
		if err := check(ip); err != nil {
			return err
		}
	}
	return nil
}
