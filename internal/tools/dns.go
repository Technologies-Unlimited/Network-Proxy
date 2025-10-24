package tools

import (
	"context"
	"fmt"
	"net"
	"strings"
	"time"
)

// DNSRecordType represents DNS record types
type DNSRecordType string

const (
	RecordTypeA     DNSRecordType = "A"
	RecordTypeAAAA  DNSRecordType = "AAAA"
	RecordTypeMX    DNSRecordType = "MX"
	RecordTypeNS    DNSRecordType = "NS"
	RecordTypeTXT   DNSRecordType = "TXT"
	RecordTypeCNAME DNSRecordType = "CNAME"
	RecordTypePTR   DNSRecordType = "PTR"
	RecordTypeSOA   DNSRecordType = "SOA"
	RecordTypeSRV   DNSRecordType = "SRV"
)

// DNSRecord represents a DNS record
type DNSRecord struct {
	Type     string `json:"type"`
	Value    string `json:"value"`
	Priority int    `json:"priority,omitempty"`
	TTL      uint32 `json:"ttl,omitempty"`
}

// DNSLookupResult contains the results of a DNS lookup
type DNSLookupResult struct {
	Domain   string      `json:"domain"`
	Type     string      `json:"type"`
	Records  []DNSRecord `json:"records"`
	Duration time.Duration `json:"duration"`
	Error    string      `json:"error,omitempty"`
}

// DNSLookupOptions configures DNS lookup behavior
type DNSLookupOptions struct {
	Timeout    time.Duration
	Nameserver string // Optional custom nameserver
}

// DefaultDNSLookupOptions returns default options
func DefaultDNSLookupOptions() DNSLookupOptions {
	return DNSLookupOptions{
		Timeout: 5 * time.Second,
	}
}

// DNSLookup performs a DNS lookup
func DNSLookup(ctx context.Context, domain string, recordType DNSRecordType, opts DNSLookupOptions) (*DNSLookupResult, error) {
	start := time.Now()

	result := &DNSLookupResult{
		Domain:   domain,
		Type:     string(recordType),
		Records:  make([]DNSRecord, 0),
		Duration: 0,
	}

	// Create resolver
	resolver := &net.Resolver{
		PreferGo: true,
	}

	if opts.Nameserver != "" {
		resolver.Dial = func(ctx context.Context, network, address string) (net.Conn, error) {
			d := net.Dialer{
				Timeout: opts.Timeout,
			}
			return d.DialContext(ctx, network, opts.Nameserver+":53")
		}
	}

	// Create context with timeout
	lookupCtx, cancel := context.WithTimeout(ctx, opts.Timeout)
	defer cancel()

	var err error

	switch recordType {
	case RecordTypeA:
		err = lookupA(lookupCtx, resolver, domain, result)
	case RecordTypeAAAA:
		err = lookupAAAA(lookupCtx, resolver, domain, result)
	case RecordTypeMX:
		err = lookupMX(lookupCtx, resolver, domain, result)
	case RecordTypeNS:
		err = lookupNS(lookupCtx, resolver, domain, result)
	case RecordTypeTXT:
		err = lookupTXT(lookupCtx, resolver, domain, result)
	case RecordTypeCNAME:
		err = lookupCNAME(lookupCtx, resolver, domain, result)
	case RecordTypePTR:
		err = lookupPTR(lookupCtx, resolver, domain, result)
	default:
		err = fmt.Errorf("unsupported record type: %s", recordType)
	}

	result.Duration = time.Since(start)

	if err != nil {
		result.Error = err.Error()
		return result, err
	}

	return result, nil
}

func lookupA(ctx context.Context, resolver *net.Resolver, domain string, result *DNSLookupResult) error {
	ips, err := resolver.LookupIP(ctx, "ip4", domain)
	if err != nil {
		return err
	}

	for _, ip := range ips {
		if ip.To4() != nil {
			result.Records = append(result.Records, DNSRecord{
				Type:  "A",
				Value: ip.String(),
			})
		}
	}

	return nil
}

func lookupAAAA(ctx context.Context, resolver *net.Resolver, domain string, result *DNSLookupResult) error {
	ips, err := resolver.LookupIP(ctx, "ip6", domain)
	if err != nil {
		return err
	}

	for _, ip := range ips {
		if ip.To4() == nil {
			result.Records = append(result.Records, DNSRecord{
				Type:  "AAAA",
				Value: ip.String(),
			})
		}
	}

	return nil
}

func lookupMX(ctx context.Context, resolver *net.Resolver, domain string, result *DNSLookupResult) error {
	mxRecords, err := resolver.LookupMX(ctx, domain)
	if err != nil {
		return err
	}

	for _, mx := range mxRecords {
		result.Records = append(result.Records, DNSRecord{
			Type:     "MX",
			Value:    mx.Host,
			Priority: int(mx.Pref),
		})
	}

	return nil
}

func lookupNS(ctx context.Context, resolver *net.Resolver, domain string, result *DNSLookupResult) error {
	nsRecords, err := resolver.LookupNS(ctx, domain)
	if err != nil {
		return err
	}

	for _, ns := range nsRecords {
		result.Records = append(result.Records, DNSRecord{
			Type:  "NS",
			Value: ns.Host,
		})
	}

	return nil
}

func lookupTXT(ctx context.Context, resolver *net.Resolver, domain string, result *DNSLookupResult) error {
	txtRecords, err := resolver.LookupTXT(ctx, domain)
	if err != nil {
		return err
	}

	for _, txt := range txtRecords {
		result.Records = append(result.Records, DNSRecord{
			Type:  "TXT",
			Value: txt,
		})
	}

	return nil
}

func lookupCNAME(ctx context.Context, resolver *net.Resolver, domain string, result *DNSLookupResult) error {
	cname, err := resolver.LookupCNAME(ctx, domain)
	if err != nil {
		return err
	}

	result.Records = append(result.Records, DNSRecord{
		Type:  "CNAME",
		Value: cname,
	})

	return nil
}

func lookupPTR(ctx context.Context, resolver *net.Resolver, domain string, result *DNSLookupResult) error {
	// For PTR lookups, domain should be an IP address
	// Convert to in-addr.arpa format if needed
	ip := net.ParseIP(domain)
	if ip == nil {
		// Assume it's already in PTR format
		names, err := resolver.LookupAddr(ctx, domain)
		if err != nil {
			return err
		}

		for _, name := range names {
			result.Records = append(result.Records, DNSRecord{
				Type:  "PTR",
				Value: name,
			})
		}
	} else {
		// Convert IP to PTR format
		names, err := resolver.LookupAddr(ctx, ip.String())
		if err != nil {
			return err
		}

		for _, name := range names {
			result.Records = append(result.Records, DNSRecord{
				Type:  "PTR",
				Value: name,
			})
		}
	}

	return nil
}

// ReverseDNSLookup performs a reverse DNS lookup
func ReverseDNSLookup(ctx context.Context, ip string, opts DNSLookupOptions) (*DNSLookupResult, error) {
	return DNSLookup(ctx, ip, RecordTypePTR, opts)
}

// AllRecords looks up all common DNS record types
func AllRecords(ctx context.Context, domain string, opts DNSLookupOptions) (map[string]*DNSLookupResult, error) {
	results := make(map[string]*DNSLookupResult)

	recordTypes := []DNSRecordType{
		RecordTypeA,
		RecordTypeAAAA,
		RecordTypeMX,
		RecordTypeNS,
		RecordTypeTXT,
		RecordTypeCNAME,
	}

	for _, recordType := range recordTypes {
		result, err := DNSLookup(ctx, domain, recordType, opts)
		if err != nil {
			// Some record types may not exist, that's okay
			if !strings.Contains(err.Error(), "no such host") {
				results[string(recordType)] = result
			}
		} else {
			results[string(recordType)] = result
		}
	}

	return results, nil
}
