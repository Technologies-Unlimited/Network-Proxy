package tools

import (
	"context"
	"fmt"
	"net"
	"time"

	"golang.org/x/net/icmp"
	"golang.org/x/net/ipv4"
	"golang.org/x/net/ipv6"
)

// TracerouteHop represents a single hop in the traceroute
type TracerouteHop struct {
	Hop      int           `json:"hop"`
	IP       string        `json:"ip"`
	Hostname string        `json:"hostname,omitempty"`
	RTT      time.Duration `json:"rtt"`
	Timeout  bool          `json:"timeout"`
}

// TracerouteResult contains the results of a traceroute
type TracerouteResult struct {
	Target string          `json:"target"`
	Hops   []TracerouteHop `json:"hops"`
	Error  string          `json:"error,omitempty"`
}

// TracerouteOptions configures traceroute behavior
type TracerouteOptions struct {
	MaxHops     int
	Timeout     time.Duration
	PacketSize  int
	Retries     int
	UseICMP     bool
	ResolveAddr bool
}

// DefaultTracerouteOptions returns default options
func DefaultTracerouteOptions() TracerouteOptions {
	return TracerouteOptions{
		MaxHops:     30,
		Timeout:     3 * time.Second,
		PacketSize:  52,
		Retries:     3,
		UseICMP:     true,
		ResolveAddr: true,
	}
}

// Traceroute performs a traceroute to the target
func Traceroute(ctx context.Context, target string, opts TracerouteOptions) (*TracerouteResult, error) {
	result := &TracerouteResult{
		Target: target,
		Hops:   make([]TracerouteHop, 0),
	}

	// Resolve target
	ips, err := net.LookupIP(target)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve target: %w", err)
	}
	if len(ips) == 0 {
		return nil, fmt.Errorf("no IP addresses found for target")
	}

	targetIP := ips[0]

	// Determine IP version
	isIPv6 := targetIP.To4() == nil

	if isIPv6 {
		return tracerouteIPv6(ctx, targetIP, opts, result)
	}
	return tracerouteIPv4(ctx, targetIP, opts, result)
}

func tracerouteIPv4(ctx context.Context, targetIP net.IP, opts TracerouteOptions, result *TracerouteResult) (*TracerouteResult, error) {
	// Create ICMP listener
	conn, err := icmp.ListenPacket("ip4:icmp", "0.0.0.0")
	if err != nil {
		return nil, fmt.Errorf("failed to create ICMP listener: %w", err)
	}
	defer conn.Close()

	p := ipv4.NewPacketConn(conn)

	for ttl := 1; ttl <= opts.MaxHops; ttl++ {
		select {
		case <-ctx.Done():
			return result, ctx.Err()
		default:
		}

		if err := p.SetTTL(ttl); err != nil {
			return nil, fmt.Errorf("failed to set TTL: %w", err)
		}

		hop := TracerouteHop{
			Hop:     ttl,
			Timeout: true,
		}

		// Try multiple times
		for retry := 0; retry < opts.Retries; retry++ {
			start := time.Now()

			// Send ICMP Echo Request
			msg := icmp.Message{
				Type: ipv4.ICMPTypeEcho,
				Code: 0,
				Body: &icmp.Echo{
					ID:   1234,
					Seq:  ttl,
					Data: make([]byte, opts.PacketSize),
				},
			}

			msgBytes, err := msg.Marshal(nil)
			if err != nil {
				continue
			}

			_, err = conn.WriteTo(msgBytes, &net.IPAddr{IP: targetIP})
			if err != nil {
				continue
			}

			// Set read deadline
			conn.SetReadDeadline(time.Now().Add(opts.Timeout))

			// Read response
			reply := make([]byte, 1500)
			n, peer, err := conn.ReadFrom(reply)
			if err != nil {
				continue
			}

			rtt := time.Since(start)

			// Parse ICMP message
			_, err = icmp.ParseMessage(1, reply[:n])
			if err != nil {
				continue
			}

			// Get peer IP
			peerIP := peer.(*net.IPAddr).IP

			hop.IP = peerIP.String()
			hop.RTT = rtt
			hop.Timeout = false

			// Resolve hostname if requested
			if opts.ResolveAddr {
				names, err := net.LookupAddr(peerIP.String())
				if err == nil && len(names) > 0 {
					hop.Hostname = names[0]
				}
			}

			break
		}

		result.Hops = append(result.Hops, hop)

		// Check if we reached the target
		if !hop.Timeout && hop.IP == targetIP.String() {
			break
		}
	}

	return result, nil
}

func tracerouteIPv6(ctx context.Context, targetIP net.IP, opts TracerouteOptions, result *TracerouteResult) (*TracerouteResult, error) {
	// Create ICMPv6 listener
	conn, err := icmp.ListenPacket("ip6:ipv6-icmp", "::")
	if err != nil {
		return nil, fmt.Errorf("failed to create ICMPv6 listener: %w", err)
	}
	defer conn.Close()

	p := ipv6.NewPacketConn(conn)

	for ttl := 1; ttl <= opts.MaxHops; ttl++ {
		select {
		case <-ctx.Done():
			return result, ctx.Err()
		default:
		}

		if err := p.SetHopLimit(ttl); err != nil {
			return nil, fmt.Errorf("failed to set hop limit: %w", err)
		}

		hop := TracerouteHop{
			Hop:     ttl,
			Timeout: true,
		}

		// Try multiple times
		for retry := 0; retry < opts.Retries; retry++ {
			start := time.Now()

			// Send ICMPv6 Echo Request
			msg := icmp.Message{
				Type: ipv6.ICMPTypeEchoRequest,
				Code: 0,
				Body: &icmp.Echo{
					ID:   1234,
					Seq:  ttl,
					Data: make([]byte, opts.PacketSize),
				},
			}

			msgBytes, err := msg.Marshal(nil)
			if err != nil {
				continue
			}

			_, err = conn.WriteTo(msgBytes, &net.IPAddr{IP: targetIP})
			if err != nil {
				continue
			}

			// Set read deadline
			conn.SetReadDeadline(time.Now().Add(opts.Timeout))

			// Read response
			reply := make([]byte, 1500)
			n, peer, err := conn.ReadFrom(reply)
			if err != nil {
				continue
			}

			rtt := time.Since(start)

			// Parse ICMPv6 message
			_, err = icmp.ParseMessage(58, reply[:n])
			if err != nil {
				continue
			}

			// Get peer IP
			peerIP := peer.(*net.IPAddr).IP

			hop.IP = peerIP.String()
			hop.RTT = rtt
			hop.Timeout = false

			// Resolve hostname if requested
			if opts.ResolveAddr {
				names, err := net.LookupAddr(peerIP.String())
				if err == nil && len(names) > 0 {
					hop.Hostname = names[0]
				}
			}

			break
		}

		result.Hops = append(result.Hops, hop)

		// Check if we reached the target
		if !hop.Timeout && hop.IP == targetIP.String() {
			break
		}
	}

	return result, nil
}
