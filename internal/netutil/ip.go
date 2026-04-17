// Package netutil holds tiny network helpers that several packages used to
// duplicate. Centralising them prevents the four-copies-of-getOutboundIP
// drift that the audit caught.
package netutil

import (
	"net"
)

// OutboundIP returns the local IP that would be used to reach the public
// internet — or an empty string if no usable interface exists. Callers
// should treat "" as "unknown" rather than substituting 127.0.0.1, which
// turns every downstream measurement into a loopback test.
func OutboundIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return ""
	}
	defer conn.Close()

	if a, ok := conn.LocalAddr().(*net.UDPAddr); ok && a != nil {
		return a.IP.String()
	}
	return ""
}
