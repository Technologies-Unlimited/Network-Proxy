package api

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net"
	"net/http"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/tools"
	"github.com/gin-gonic/gin"
	"github.com/gosnmp/gosnmp"
)

// validateTarget validates that a target is a valid IP address or hostname
func validateTarget(target string) bool {
	// Check if it's a valid IP address
	if ip := net.ParseIP(target); ip != nil {
		return true
	}

	// Check if it's a valid hostname/domain
	// Basic validation: alphanumeric, dots, hyphens, max 253 chars
	if len(target) > 253 || len(target) == 0 {
		return false
	}

	// Hostname regex pattern
	hostnameRegex := regexp.MustCompile(`^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$`)
	return hostnameRegex.MatchString(target)
}

// validateDomain validates that a domain name is properly formatted
func validateDomain(domain string) bool {
	// Remove trailing dot if present
	domain = strings.TrimSuffix(domain, ".")

	if len(domain) > 253 || len(domain) == 0 {
		return false
	}

	// Domain regex pattern
	domainRegex := regexp.MustCompile(`^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$`)
	return domainRegex.MatchString(domain)
}

// toolsPage renders the network tools page
func toolsPage(c *gin.Context) {
	c.HTML(http.StatusOK, "tools.html", gin.H{
		"title": "Network Tools - Network Monitor",
	})
}

// TracerouteRequest represents a traceroute request
type TracerouteRequest struct {
	Target      string `json:"target" binding:"required"`
	MaxHops     int    `json:"max_hops,omitempty"`
	Timeout     int    `json:"timeout,omitempty"`
	ResolveAddr bool   `json:"resolve_addr,omitempty"`
}

// traceroute handles traceroute requests
func traceroute(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req TracerouteRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate target to prevent SSRF
		if !validateTarget(req.Target) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid target format"})
			return
		}

		// Set default options
		opts := tools.DefaultTracerouteOptions()
		if req.MaxHops > 0 {
			opts.MaxHops = req.MaxHops
		}
		if req.Timeout > 0 {
			opts.Timeout = time.Duration(req.Timeout) * time.Second
		}
		opts.ResolveAddr = req.ResolveAddr

		// Perform traceroute
		result, err := tools.Traceroute(c.Request.Context(), req.Target, opts)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, result)
	}
}

// DNSLookupRequest represents a DNS lookup request
type DNSLookupRequest struct {
	Domain     string `json:"domain" binding:"required"`
	Type       string `json:"type" binding:"required"`
	Nameserver string `json:"nameserver,omitempty"`
	Timeout    int    `json:"timeout,omitempty"`
}

// dnsLookup handles DNS lookup requests
func dnsLookup(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req DNSLookupRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate domain to prevent injection
		if !validateDomain(req.Domain) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid domain format"})
			return
		}

		// Set default options
		opts := tools.DefaultDNSLookupOptions()
		if req.Nameserver != "" {
			opts.Nameserver = req.Nameserver
		}
		if req.Timeout > 0 {
			opts.Timeout = time.Duration(req.Timeout) * time.Second
		}

		// Perform DNS lookup
		result, err := tools.DNSLookup(c.Request.Context(), req.Domain, tools.DNSRecordType(req.Type), opts)
		if err != nil {
			// Return result even with error for partial results
			c.JSON(http.StatusOK, result)
			return
		}

		c.JSON(http.StatusOK, result)
	}
}

// PortScanRequest represents a port scan request
type PortScanRequest struct {
	Target      string `json:"target" binding:"required"`
	Ports       string `json:"ports" binding:"required"`
	Timeout     int    `json:"timeout,omitempty"`
	Concurrency int    `json:"concurrency,omitempty"`
	GrabBanner  bool   `json:"grab_banner,omitempty"`
}

// portScan handles port scan requests
func portScan(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req PortScanRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate target to prevent SSRF
		if !validateTarget(req.Target) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid target format"})
			return
		}

		// Parse port range
		ports, err := tools.ParsePortRange(req.Ports)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Set default options
		opts := tools.DefaultPortScanOptions()
		if req.Timeout > 0 {
			opts.Timeout = time.Duration(req.Timeout) * time.Second
		}
		if req.Concurrency > 0 {
			opts.Concurrency = req.Concurrency
		}
		opts.GrabBanner = req.GrabBanner

		// Perform port scan
		result, err := tools.PortScan(c.Request.Context(), req.Target, ports, opts)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, result)
	}
}

// WhoisRequest represents a WHOIS request
type WhoisRequest struct {
	Target  string `json:"target" binding:"required"`
	Server  string `json:"server,omitempty"`
	Timeout int    `json:"timeout,omitempty"`
}

// whoisLookup handles WHOIS lookup requests
func whoisLookup(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req WhoisRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate target (can be domain or IP)
		if !validateTarget(req.Target) && !validateDomain(req.Target) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid target format"})
			return
		}

		// Set default options
		opts := tools.DefaultWhoisOptions()
		if req.Server != "" {
			opts.Server = req.Server
		}
		if req.Timeout > 0 {
			opts.Timeout = time.Duration(req.Timeout) * time.Second
		}

		// Perform WHOIS lookup
		result, err := tools.Whois(c.Request.Context(), req.Target, opts)
		if err != nil {
			// Return result even with error for partial results
			c.JSON(http.StatusOK, result)
			return
		}

		c.JSON(http.StatusOK, result)
	}
}

// BandwidthTestRequest represents a bandwidth test request
type BandwidthTestRequest struct {
	Target   string `json:"target" binding:"required"`
	Duration int    `json:"duration,omitempty"`
	Port     int    `json:"port,omitempty"`
}

// bandwidthTest handles bandwidth test requests
func bandwidthTest(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req BandwidthTestRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate target
		if !validateTarget(req.Target) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid target format"})
			return
		}

		// Set duration (default 10 seconds)
		duration := 10 * time.Second
		if req.Duration > 0 {
			duration = time.Duration(req.Duration) * time.Second
		}

		// For simple bandwidth test, we'll use the SimpleBandwidthTest function
		result, err := tools.SimpleBandwidthTest(c.Request.Context(), req.Target, duration)
		if err != nil {
			// Return result even with error for partial results
			c.JSON(http.StatusOK, result)
			return
		}

		c.JSON(http.StatusOK, result)
	}
}

// PingRequest represents a ping request
type PingRequest struct {
	Target string `json:"target" binding:"required"`
	Count  int    `json:"count,omitempty"`
}

// ping handles ping requests
func ping(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req PingRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate target
		if !validateTarget(req.Target) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid target format"})
			return
		}

		// Set count (default 4)
		count := 4
		if req.Count > 0 {
			count = req.Count
		}

		// Perform ping
		result, err := tools.Ping(c.Request.Context(), req.Target, count)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, result)
	}
}

// CommonPortsRequest represents a request for common ports
type CommonPortsRequest struct {
	Count int `form:"count"`
}

// commonPorts returns common ports for scanning
func commonPorts(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		countStr := c.Query("count")

		if countStr != "" {
			count, err := strconv.Atoi(countStr)
			if err == nil && count > 0 {
				ports := tools.TopPorts(count)
				c.JSON(http.StatusOK, gin.H{"ports": ports})
				return
			}
		}

		ports := tools.CommonPorts()
		c.JSON(http.StatusOK, gin.H{"ports": ports})
	}
}

// SNMPQueryRequest represents an SNMP query request for the MIB browser
type SNMPQueryRequest struct {
	Target       string `json:"target" binding:"required"`
	OID          string `json:"oid" binding:"required"`
	Community    string `json:"community"`
	Version      string `json:"version"`
	Port         int    `json:"port"`
	Timeout      int    `json:"timeout"`
	Operation    string `json:"operation"` // get, getnext, walk
	Username     string `json:"username"`
	AuthProtocol string `json:"auth_protocol"`
	AuthPassword string `json:"auth_password"`
	PrivProtocol string `json:"priv_protocol"`
	PrivPassword string `json:"priv_password"`
}

// SNMPResult represents a single SNMP result
type SNMPResult struct {
	OID      string      `json:"oid"`
	Name     string      `json:"name,omitempty"`
	Type     string      `json:"type"`
	Value    interface{} `json:"value"`
	RawType  int         `json:"raw_type"`
	HexValue string      `json:"hex_value,omitempty"`
}

// SNMPQueryResponse represents the response from an SNMP query
type SNMPQueryResponse struct {
	Target    string       `json:"target"`
	OID       string       `json:"oid"`
	Operation string       `json:"operation"`
	Results   []SNMPResult `json:"results"`
	Duration  int64        `json:"duration"`
	Error     string       `json:"error,omitempty"`
}

// snmpQuery handles SNMP query requests for the MIB browser
func snmpQuery(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req SNMPQueryRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate target
		if !validateTarget(req.Target) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid target format"})
			return
		}

		// Validate OID format (basic check)
		if !validateOID(req.OID) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid OID format"})
			return
		}

		// Set defaults
		if req.Community == "" {
			req.Community = "public"
		}
		if req.Version == "" {
			req.Version = "v2c"
		}
		if req.Port == 0 {
			req.Port = 161
		}
		if req.Timeout == 0 {
			req.Timeout = 5
		}
		if req.Operation == "" {
			req.Operation = "get"
		}

		startTime := time.Now()

		// Create SNMP client
		snmpClient := &gosnmp.GoSNMP{
			Target:    req.Target,
			Port:      uint16(req.Port),
			Community: req.Community,
			Version:   getSNMPVersion(req.Version),
			Timeout:   time.Duration(req.Timeout) * time.Second,
			Retries:   1,
		}

		// Configure SNMPv3 if needed
		if req.Version == "v3" {
			configureSNMPv3Client(snmpClient, req)
		}

		// Connect
		err := snmpClient.Connect()
		if err != nil {
			c.JSON(http.StatusOK, SNMPQueryResponse{
				Target:    req.Target,
				OID:       req.OID,
				Operation: req.Operation,
				Results:   []SNMPResult{},
				Duration:  time.Since(startTime).Nanoseconds(),
				Error:     fmt.Sprintf("connection failed: %v", err),
			})
			return
		}
		defer snmpClient.Conn.Close()

		var results []SNMPResult
		var queryErr error

		switch req.Operation {
		case "get":
			results, queryErr = performSNMPGet(snmpClient, req.OID)
		case "getnext":
			results, queryErr = performSNMPGetNext(snmpClient, req.OID)
		case "walk":
			results, queryErr = performSNMPWalk(snmpClient, req.OID)
		default:
			results, queryErr = performSNMPGet(snmpClient, req.OID)
		}

		response := SNMPQueryResponse{
			Target:    req.Target,
			OID:       req.OID,
			Operation: req.Operation,
			Results:   results,
			Duration:  time.Since(startTime).Nanoseconds(),
		}

		if queryErr != nil {
			response.Error = queryErr.Error()
		}

		c.JSON(http.StatusOK, response)
	}
}

// validateOID validates that an OID is properly formatted
func validateOID(oid string) bool {
	// OID should start with . or a number and contain only dots and numbers
	if len(oid) == 0 {
		return false
	}

	// Remove leading dot if present
	if oid[0] == '.' {
		oid = oid[1:]
	}

	// Check format: should be numbers separated by dots
	oidRegex := regexp.MustCompile(`^[0-9]+(\.[0-9]+)*$`)
	return oidRegex.MatchString(oid)
}

// getSNMPVersion converts string version to gosnmp version
func getSNMPVersion(version string) gosnmp.SnmpVersion {
	switch version {
	case "v1":
		return gosnmp.Version1
	case "v2c":
		return gosnmp.Version2c
	case "v3":
		return gosnmp.Version3
	default:
		return gosnmp.Version2c
	}
}

// configureSNMPv3Client sets up SNMPv3 parameters for the client
func configureSNMPv3Client(client *gosnmp.GoSNMP, req SNMPQueryRequest) {
	client.SecurityModel = gosnmp.UserSecurityModel

	// Determine message flags based on what's configured
	if req.AuthPassword != "" && req.PrivPassword != "" {
		client.MsgFlags = gosnmp.AuthPriv
	} else if req.AuthPassword != "" {
		client.MsgFlags = gosnmp.AuthNoPriv
	} else {
		client.MsgFlags = gosnmp.NoAuthNoPriv
	}

	client.SecurityParameters = &gosnmp.UsmSecurityParameters{
		UserName:                 req.Username,
		AuthenticationProtocol:   getAuthProtocol(req.AuthProtocol),
		AuthenticationPassphrase: req.AuthPassword,
		PrivacyProtocol:          getPrivProtocol(req.PrivProtocol),
		PrivacyPassphrase:        req.PrivPassword,
	}
}

// getAuthProtocol converts string to gosnmp auth protocol
func getAuthProtocol(protocol string) gosnmp.SnmpV3AuthProtocol {
	switch strings.ToUpper(protocol) {
	case "MD5":
		return gosnmp.MD5
	case "SHA":
		return gosnmp.SHA
	case "SHA224":
		return gosnmp.SHA224
	case "SHA256":
		return gosnmp.SHA256
	case "SHA384":
		return gosnmp.SHA384
	case "SHA512":
		return gosnmp.SHA512
	default:
		return gosnmp.NoAuth
	}
}

// getPrivProtocol converts string to gosnmp privacy protocol
func getPrivProtocol(protocol string) gosnmp.SnmpV3PrivProtocol {
	switch strings.ToUpper(protocol) {
	case "DES":
		return gosnmp.DES
	case "AES", "AES128":
		return gosnmp.AES
	case "AES192":
		return gosnmp.AES192
	case "AES256":
		return gosnmp.AES256
	case "AES192C":
		return gosnmp.AES192C
	case "AES256C":
		return gosnmp.AES256C
	default:
		return gosnmp.NoPriv
	}
}

// performSNMPGet performs an SNMP GET operation
func performSNMPGet(client *gosnmp.GoSNMP, oid string) ([]SNMPResult, error) {
	// Ensure OID starts with a dot
	if !strings.HasPrefix(oid, ".") {
		oid = "." + oid
	}

	result, err := client.Get([]string{oid})
	if err != nil {
		return nil, err
	}

	return convertPDUsToResults(result.Variables), nil
}

// performSNMPGetNext performs an SNMP GETNEXT operation
func performSNMPGetNext(client *gosnmp.GoSNMP, oid string) ([]SNMPResult, error) {
	// Ensure OID starts with a dot
	if !strings.HasPrefix(oid, ".") {
		oid = "." + oid
	}

	result, err := client.GetNext([]string{oid})
	if err != nil {
		return nil, err
	}

	return convertPDUsToResults(result.Variables), nil
}

// performSNMPWalk performs an SNMP WALK operation
func performSNMPWalk(client *gosnmp.GoSNMP, oid string) ([]SNMPResult, error) {
	// Ensure OID starts with a dot
	if !strings.HasPrefix(oid, ".") {
		oid = "." + oid
	}

	var results []SNMPResult

	// Use BulkWalk for v2c/v3, Walk for v1
	var err error
	if client.Version == gosnmp.Version1 {
		err = client.Walk(oid, func(pdu gosnmp.SnmpPDU) error {
			results = append(results, convertPDUToResult(pdu))
			return nil
		})
	} else {
		err = client.BulkWalk(oid, func(pdu gosnmp.SnmpPDU) error {
			results = append(results, convertPDUToResult(pdu))
			return nil
		})
	}

	if err != nil {
		// Return partial results if we got some
		if len(results) > 0 {
			return results, nil
		}
		return nil, err
	}

	return results, nil
}

// convertPDUsToResults converts SNMP PDUs to our result format
func convertPDUsToResults(pdus []gosnmp.SnmpPDU) []SNMPResult {
	results := make([]SNMPResult, 0, len(pdus))
	for _, pdu := range pdus {
		results = append(results, convertPDUToResult(pdu))
	}
	return results
}

// convertPDUToResult converts a single SNMP PDU to our result format
func convertPDUToResult(pdu gosnmp.SnmpPDU) SNMPResult {
	result := SNMPResult{
		OID:     pdu.Name,
		Type:    getTypeName(pdu.Type),
		RawType: int(pdu.Type),
	}

	switch pdu.Type {
	case gosnmp.OctetString:
		bytes := pdu.Value.([]byte)
		// Check if it's printable ASCII
		if isPrintable(bytes) {
			result.Value = string(bytes)
		} else {
			result.Value = fmt.Sprintf("0x%X", bytes)
			result.HexValue = fmt.Sprintf("%X", bytes)
		}
	case gosnmp.Integer:
		result.Value = pdu.Value
	case gosnmp.Counter32, gosnmp.Counter64, gosnmp.Gauge32, gosnmp.Uinteger32:
		result.Value = pdu.Value
	case gosnmp.TimeTicks:
		ticks := pdu.Value.(uint32)
		// Convert to human-readable format
		seconds := ticks / 100
		days := seconds / 86400
		hours := (seconds % 86400) / 3600
		minutes := (seconds % 3600) / 60
		secs := seconds % 60
		result.Value = fmt.Sprintf("%d days, %d:%02d:%02d (%d ticks)", days, hours, minutes, secs, ticks)
	case gosnmp.IPAddress:
		result.Value = pdu.Value
	case gosnmp.ObjectIdentifier:
		result.Value = pdu.Value
	case gosnmp.Null:
		result.Value = nil
	case gosnmp.NoSuchObject:
		result.Value = "No Such Object"
	case gosnmp.NoSuchInstance:
		result.Value = "No Such Instance"
	case gosnmp.EndOfMibView:
		result.Value = "End of MIB View"
	default:
		result.Value = fmt.Sprintf("%v", pdu.Value)
	}

	return result
}

// getTypeName returns a human-readable name for SNMP types
func getTypeName(t gosnmp.Asn1BER) string {
	switch t {
	case gosnmp.Integer:
		return "INTEGER"
	case gosnmp.OctetString:
		return "OCTET STRING"
	case gosnmp.Null:
		return "NULL"
	case gosnmp.ObjectIdentifier:
		return "OBJECT IDENTIFIER"
	case gosnmp.IPAddress:
		return "IpAddress"
	case gosnmp.Counter32:
		return "Counter32"
	case gosnmp.Gauge32:
		return "Gauge32"
	case gosnmp.TimeTicks:
		return "TimeTicks"
	case gosnmp.Opaque:
		return "Opaque"
	case gosnmp.Counter64:
		return "Counter64"
	case gosnmp.Uinteger32:
		return "Uinteger32"
	case gosnmp.NoSuchObject:
		return "noSuchObject"
	case gosnmp.NoSuchInstance:
		return "noSuchInstance"
	case gosnmp.EndOfMibView:
		return "endOfMibView"
	default:
		return fmt.Sprintf("Unknown(%d)", t)
	}
}

// isPrintable checks if a byte slice contains printable ASCII characters
func isPrintable(bytes []byte) bool {
	for _, b := range bytes {
		if b < 32 || b > 126 {
			// Allow newlines and tabs
			if b != 9 && b != 10 && b != 13 {
				return false
			}
		}
	}
	return true
}

// ============================================================================
// MAC Vendor Lookup Tool
// ============================================================================

// MACLookupRequest represents a MAC address lookup request
type MACLookupRequest struct {
	MAC string `json:"mac" binding:"required"`
}

// MACLookupResponse represents the response from a MAC lookup
type MACLookupResponse struct {
	MAC        string `json:"mac"`
	Normalized string `json:"normalized"`
	Vendor     string `json:"vendor"`
	OUI        string `json:"oui"`
	IsValid    bool   `json:"is_valid"`
	Error      string `json:"error,omitempty"`
}

// Common OUI vendors (subset of IEEE OUI database)
var ouiDatabase = map[string]string{
	"000000": "Xerox Corporation",
	"000001": "Xerox Corporation",
	"000002": "Xerox Corporation",
	"00000C": "Cisco Systems",
	"000010": "Sytek",
	"00001A": "AMD",
	"00001B": "Novell",
	"00001D": "Cabletron Systems",
	"000020": "DIAB",
	"000022": "Visual Technology",
	"000029": "IMC Networks",
	"00002A": "TRW",
	"000030": "VG Laboratory Systems",
	"00003D": "AT&T",
	"000049": "Apricot Computers",
	"00004F": "Logicraft",
	"000051": "Hob Electronic",
	"000052": "ODS",
	"000055": "AT&T",
	"00005A": "S & Koch",
	"00005E": "IANA",
	"000061": "Gateway Communications",
	"000062": "Honeywell",
	"000063": "Hewlett-Packard",
	"000064": "Yokogawa Digital Computer",
	"000065": "Network General",
	"000066": "Talaris Systems",
	"000069": "Concord Communications",
	"00006B": "MIPS Computer Systems",
	"00006D": "Case",
	"00006E": "Artisoft",
	"00006F": "Madge Networks",
	"000077": "Interphase",
	"000078": "Labtam",
	"000079": "Networth",
	"00007A": "Ardent Computer",
	"00007B": "Research Machines",
	"00007D": "Cray Research",
	"00007E": "NetFRAME Systems",
	"00007F": "Linotype-Hell",
	"000080": "Cray Communications",
	"000081": "Bay Networks",
	"000083": "Tadpole Technology",
	"000084": "Aquila",
	"000086": "Gateway Communications",
	"000087": "Hitachi",
	"000089": "Cayman Systems",
	"00008A": "Datahouse Information Systems",
	"00008E": "Solbourne Computer",
	"000093": "Proteon",
	"000094": "Asante Technologies",
	"000095": "Sony Corporation",
	"000097": "EMC Corporation",
	"000098": "CrossComm",
	"000099": "MTX",
	"00009F": "Ameristar Technologies",
	"0000A2": "Wellfleet Communications",
	"0000A3": "Network Application Technology",
	"0000A4": "Acorn Computers",
	"0000A5": "Compatible Systems",
	"0000A6": "Network General",
	"0000A7": "Network Computing Devices",
	"0000A8": "Stratus Computer",
	"0000A9": "Network Systems",
	"0000AA": "Xerox Corporation",
	"0000AC": "Conware Computer Consulting",
	"0000AE": "Dassault Electronique",
	"0000AF": "Nuclear Data Instrumentation",
	"0000B0": "RND",
	"0000B3": "CIMLinc",
	"0000B4": "Edimax Technology",
	"0000B5": "Datability Software Systems",
	"0000B6": "Micro-Matic Research",
	"0000B7": "Dove Computer",
	"0000BC": "Allen-Bradley",
	"0000C0": "Western Digital",
	"0000C5": "Farallon Computing",
	"0000C6": "HP Intelligent Networks",
	"0000C8": "Altos Computer Systems",
	"0000C9": "Emulex",
	"0000D0": "Develcon Electronics",
	"0000D1": "Adaptec",
	"0000D7": "Dartmouth College",
	"0000D8": "Novell",
	"0000DD": "Gould",
	"0000DE": "Unigraph",
	"0000E2": "Acer Technologies",
	"0000E8": "Accton Technology",
	"0000EF": "Alantec",
	"0000F0": "Samsung Electronics",
	"0000F2": "Spider Communications",
	"0000F4": "Allied Telesis",
	"0000F6": "A.M.C.",
	"0000F8": "DEC",
	"0000FB": "Rechner zur Kommunikation",
	"0000FD": "High Level Hardware",
	"000102": "3Com Corporation",
	"000103": "3Com Corporation",
	"0001C8": "Thomas Conrad",
	"000347": "Intel Corporate",
	"000393": "Apple",
	"000502": "Apple",
	"000A27": "Apple",
	"000A95": "Apple",
	"000D93": "Apple",
	"0010FA": "Apple",
	"001124": "Apple",
	"0014A5": "Gemtek Technology",
	"0014BF": "Cisco-Linksys",
	"0016B6": "Cisco-Linksys",
	"0017F2": "Apple",
	"001856": "Cisco-Linksys",
	"0019E3": "Apple",
	"001B63": "Apple",
	"001CB3": "Apple",
	"001D4F": "Apple",
	"001E52": "Apple",
	"001EC2": "Apple",
	"001F5B": "Apple",
	"001FF3": "Apple",
	"0021E9": "Apple",
	"002241": "Apple",
	"002312": "Apple",
	"002332": "Apple",
	"002436": "Apple",
	"00254B": "Apple",
	"002608": "Apple",
	"00264A": "Apple",
	"002719": "Tp-Link Technologies",
	"0050BA": "D-Link",
	"0050F2": "Microsoft",
	"006008": "3Com",
	"0060B0": "Hewlett-Packard",
	"0080C8": "D-Link",
	"00E018": "Asustek Computer",
	"00E04C": "Realtek Semiconductor",
	"080006": "Siemens AG",
	"080009": "Hewlett-Packard",
	"08000B": "Unisys Corporation",
	"080014": "Excelan",
	"080017": "National Semiconductor",
	"08001A": "Data General",
	"08001B": "Data General",
	"080020": "Sun Microsystems",
	"08002B": "DEC",
	"080036": "Intergraph",
	"080037": "Fuji Xerox",
	"080038": "Bull",
	"080039": "Spider Systems",
	"080041": "DCA",
	"080045": "Xylogics",
	"080046": "Sony Corporation",
	"080047": "Sequent Computer Systems",
	"080049": "Univation",
	"08004C": "Encore Computer",
	"08004E": "3Com Europe",
	"080056": "Stanford University",
	"080057": "Evans & Sutherland",
	"080058": "Systems Concepts",
	"080067": "Comdesign",
	"080068": "Ridge Computers",
	"080069": "Silicon Graphics",
	"08006A": "AT&T",
	"08006E": "Excelan",
	"080074": "Casio Computer",
	"080075": "DDE",
	"080077": "TSL",
	"080079": "Silicon Graphics",
	"08007C": "Vitalink Communications",
	"080080": "XIOS Systems",
	"080086": "Imagen",
	"080087": "Xyplex",
	"080089": "Kinetics",
	"08008B": "Pyramid Technology",
	"08008D": "XyVision",
	"08008E": "Tandem Computers",
	"08008F": "Chipcom",
	"080090": "Retix",
	"1040F3": "Apple",
	"109ADD": "Apple",
	"10DDB1": "Apple",
	"141AA3": "Apple",
	"14109F": "Apple",
	"1C1AC0": "Apple",
	"20768F": "Apple",
	"244B03": "Apple",
	"24A074": "Apple",
	"28E02C": "Apple",
	"28E7CF": "Apple",
	"2C200B": "Apple",
	"34159E": "Apple",
	"34363B": "Apple",
	"3C0754": "Apple",
	"3C15C2": "Apple",
	"3CD0F8": "Apple",
	"403004": "Apple",
	"442A60": "Apple",
	"44D884": "Apple",
	"48437C": "Apple",
	"48D705": "Apple",
	"4C74BF": "Apple",
	"503237": "Apple",
	"542696": "Apple",
	"5855CA": "Apple",
	"5C5948": "Apple",
	"5C969D": "Apple",
	"5CADCF": "Apple",
	"60334B": "Apple",
	"609217": "Apple",
	"6C709F": "Apple",
	"70CD60": "Apple",
	"7831C1": "Apple",
	"78CA39": "Apple",
	"7C6D62": "Apple",
	"7CC537": "Apple",
	"7CF05F": "Apple",
	"80E650": "Apple",
	"842999": "Apple",
	"848506": "Apple",
	"848E0C": "Apple",
	"88C663": "Apple",
	"8C7B9D": "Apple",
	"90840D": "Apple",
	"9803D8": "Apple",
	"98D6BB": "Apple",
	"9C207B": "Apple",
	"9C35EB": "Apple",
	"A03BE3": "Apple",
	"A43135": "Apple",
	"A45E60": "Apple",
	"A4B197": "Apple",
	"A4D18C": "Apple",
	"A82066": "Apple",
	"A85B78": "Apple",
	"A860B6": "Apple",
	"A88808": "Apple",
	"AC293A": "Apple",
	"ACFDEC": "Apple",
	"B03495": "Apple",
	"B8C75D": "Apple",
	"B8E856": "Apple",
	"B8F6B1": "Apple",
	"BCEC5D": "Apple",
	"C01ADA": "Apple",
	"C0CECD": "Apple",
	"C82A14": "Apple",
	"CC08E0": "Apple",
	"CC29F5": "Apple",
	"D023DB": "Apple",
	"D02598": "Apple",
	"D0A637": "Apple",
	"D4619D": "Apple",
	"D49A20": "Apple",
	"D83062": "Apple",
	"D89695": "Apple",
	"DC2B2A": "Apple",
	"DC86D8": "Apple",
	"DCA904": "Apple",
	"E06678": "Apple",
	"E0ACCB": "Apple",
	"E0B9BA": "Apple",
	"E0F5C6": "Apple",
	"E48B7F": "Apple",
	"E80688": "Apple",
	"F0989D": "Apple",
	"F0B479": "Apple",
	"F0C1F1": "Apple",
	"F0D1A9": "Apple",
	"F0DBE2": "Apple",
	"F40F24": "Apple",
	"F45C89": "Apple",
	"F4F15A": "Apple",
	"F4F951": "Apple",
	"F81EDF": "Apple",
	"FC253F": "Apple",
	"FCFC48": "Apple",
	"000C29": "VMware",
	"000569": "VMware",
	"001C14": "VMware",
	"005056": "VMware",
	"080027": "Oracle VirtualBox",
	"0003FF": "Microsoft",
	"00125A": "Microsoft",
	"0015C5": "Dell",
	"0018FE": "Hewlett-Packard",
	"001A4B": "Hewlett-Packard",
	"001CC4": "Hewlett-Packard",
	"001E0B": "Hewlett-Packard",
	"001F29": "Hewlett-Packard",
	"002128": "Dell",
	"002170": "Dell",
	"00219B": "Dell",
	"0022B0": "D-Link",
	"0024E8": "Dell",
	"0025B3": "Hewlett-Packard",
	"002655": "Hewlett-Packard",
	"00268F": "Cisco",
	"001A6B": "Universal Global Scientific",
	"00E04F": "Cisco",
	"1803FA": "Apple",
}

// macLookup handles MAC address vendor lookup requests
func macLookup(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req MACLookupRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		response := MACLookupResponse{
			MAC: req.MAC,
		}

		// Normalize MAC address (remove separators, uppercase)
		normalized := normalizeMACAddress(req.MAC)
		response.Normalized = normalized

		// Validate MAC address format
		if len(normalized) != 12 {
			response.IsValid = false
			response.Error = "Invalid MAC address format"
			c.JSON(http.StatusOK, response)
			return
		}

		// Check if all characters are hex
		for _, char := range normalized {
			if !((char >= '0' && char <= '9') || (char >= 'A' && char <= 'F')) {
				response.IsValid = false
				response.Error = "Invalid MAC address format: non-hexadecimal characters"
				c.JSON(http.StatusOK, response)
				return
			}
		}

		response.IsValid = true
		response.OUI = normalized[:6]

		// Look up vendor
		if vendor, ok := ouiDatabase[normalized[:6]]; ok {
			response.Vendor = vendor
		} else {
			response.Vendor = "Unknown"
		}

		c.JSON(http.StatusOK, response)
	}
}

// normalizeMACAddress removes separators and converts to uppercase
func normalizeMACAddress(mac string) string {
	// Remove common separators
	mac = strings.ReplaceAll(mac, ":", "")
	mac = strings.ReplaceAll(mac, "-", "")
	mac = strings.ReplaceAll(mac, ".", "")
	mac = strings.ReplaceAll(mac, " ", "")
	return strings.ToUpper(mac)
}

// ConnectionTestRequest represents a TCP/UDP connection test request
type ConnectionTestRequest struct {
	Target   string `json:"target" binding:"required"`
	Port     int    `json:"port" binding:"required"`
	Protocol string `json:"protocol"` // "tcp" or "udp", defaults to tcp
	Timeout  int    `json:"timeout"`  // seconds, defaults to 5
	Data     string `json:"data"`     // optional data to send
}

// ConnectionTestResponse represents a TCP/UDP connection test response
type ConnectionTestResponse struct {
	Target    string `json:"target"`
	Port      int    `json:"port"`
	Protocol  string `json:"protocol"`
	Connected bool   `json:"connected"`
	Latency   int64  `json:"latency"` // nanoseconds
	Response  string `json:"response,omitempty"`
	Error     string `json:"error,omitempty"`
}

// connectionTest handles the TCP/UDP connection test endpoint
func connectionTest(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req ConnectionTestRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate target
		if !validateTarget(req.Target) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid target address"})
			return
		}

		// Validate port
		if req.Port < 1 || req.Port > 65535 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Port must be between 1 and 65535"})
			return
		}

		// Set defaults
		if req.Protocol == "" {
			req.Protocol = "tcp"
		}
		if req.Protocol != "tcp" && req.Protocol != "udp" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Protocol must be 'tcp' or 'udp'"})
			return
		}
		if req.Timeout <= 0 {
			req.Timeout = 5
		}
		if req.Timeout > 30 {
			req.Timeout = 30
		}

		response := ConnectionTestResponse{
			Target:   req.Target,
			Port:     req.Port,
			Protocol: req.Protocol,
		}

		// Format address properly for IPv6 (wrap in brackets)
		var address string
		if ip := net.ParseIP(req.Target); ip != nil && ip.To4() == nil {
			// IPv6 address - wrap in brackets
			address = fmt.Sprintf("[%s]:%d", req.Target, req.Port)
		} else {
			// IPv4 or hostname
			address = fmt.Sprintf("%s:%d", req.Target, req.Port)
		}
		timeout := time.Duration(req.Timeout) * time.Second

		startTime := time.Now()

		if req.Protocol == "tcp" {
			// TCP connection test
			conn, err := net.DialTimeout("tcp", address, timeout)
			if err != nil {
				response.Connected = false
				response.Error = err.Error()
				response.Latency = time.Since(startTime).Nanoseconds()
				c.JSON(http.StatusOK, response)
				return
			}
			defer conn.Close()

			response.Connected = true
			response.Latency = time.Since(startTime).Nanoseconds()

			// If data was provided, send it and try to read a response
			if req.Data != "" {
				conn.SetDeadline(time.Now().Add(timeout))
				_, err := conn.Write([]byte(req.Data))
				if err != nil {
					response.Error = "Connected but failed to send data: " + err.Error()
				} else {
					// Try to read response
					buffer := make([]byte, 4096)
					n, err := conn.Read(buffer)
					if err != nil {
						if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
							response.Response = "(no response received within timeout)"
						}
					} else if n > 0 {
						response.Response = string(buffer[:n])
					}
				}
			}
		} else {
			// UDP connection test
			conn, err := net.DialTimeout("udp", address, timeout)
			if err != nil {
				response.Connected = false
				response.Error = err.Error()
				response.Latency = time.Since(startTime).Nanoseconds()
				c.JSON(http.StatusOK, response)
				return
			}
			defer conn.Close()

			// UDP is connectionless, so "connected" just means we could create the socket
			response.Connected = true
			response.Latency = time.Since(startTime).Nanoseconds()

			// If data was provided, send it and try to read a response
			if req.Data != "" {
				conn.SetDeadline(time.Now().Add(timeout))
				_, err := conn.Write([]byte(req.Data))
				if err != nil {
					response.Error = "Failed to send data: " + err.Error()
				} else {
					// Try to read response
					buffer := make([]byte, 4096)
					n, err := conn.Read(buffer)
					if err != nil {
						if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
							response.Response = "(no response received - this is normal for UDP)"
						}
					} else if n > 0 {
						response.Response = string(buffer[:n])
					}
				}
			} else {
				response.Response = "(UDP socket created - send data to test connectivity)"
			}
		}

		c.JSON(http.StatusOK, response)
	}
}

// HTTPTestRequest represents an HTTP/HTTPS test request
type HTTPTestRequest struct {
	URL             string            `json:"url" binding:"required"`
	Method          string            `json:"method"`           // GET, POST, HEAD, etc.
	Headers         map[string]string `json:"headers"`          // Custom headers
	Body            string            `json:"body"`             // Request body
	Timeout         int               `json:"timeout"`          // seconds
	FollowRedirects bool              `json:"follow_redirects"` // whether to follow redirects
	VerifySSL       bool              `json:"verify_ssl"`       // whether to verify SSL certificates
}

// HTTPTestResponse represents an HTTP/HTTPS test response
type HTTPTestResponse struct {
	URL         string            `json:"url"`
	FinalURL    string            `json:"final_url,omitempty"`
	Method      string            `json:"method"`
	StatusCode  int               `json:"status_code"`
	StatusText  string            `json:"status_text"`
	Headers     map[string]string `json:"headers"`
	Body        string            `json:"body"`
	BodySize    int               `json:"body_size"`
	ContentType string            `json:"content_type"`
	Latency     int64             `json:"latency"` // nanoseconds
	Redirects   []string          `json:"redirects,omitempty"`
	Error       string            `json:"error,omitempty"`
}

// httpTest handles the HTTP/HTTPS test endpoint
func httpTest(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req HTTPTestRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate URL
		if !strings.HasPrefix(req.URL, "http://") && !strings.HasPrefix(req.URL, "https://") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "URL must start with http:// or https://"})
			return
		}

		// Set defaults
		if req.Method == "" {
			req.Method = "GET"
		}
		req.Method = strings.ToUpper(req.Method)
		validMethods := map[string]bool{"GET": true, "POST": true, "HEAD": true, "PUT": true, "DELETE": true, "PATCH": true, "OPTIONS": true}
		if !validMethods[req.Method] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid HTTP method"})
			return
		}
		if req.Timeout <= 0 {
			req.Timeout = 10
		}
		if req.Timeout > 60 {
			req.Timeout = 60
		}

		response := HTTPTestResponse{
			URL:    req.URL,
			Method: req.Method,
		}

		// Build HTTP client
		transport := &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: !req.VerifySSL},
		}

		var redirects []string
		client := &http.Client{
			Transport: transport,
			Timeout:   time.Duration(req.Timeout) * time.Second,
		}

		if !req.FollowRedirects {
			client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			}
		} else {
			client.CheckRedirect = func(r *http.Request, via []*http.Request) error {
				if len(via) >= 10 {
					return fmt.Errorf("too many redirects")
				}
				redirects = append(redirects, r.URL.String())
				return nil
			}
		}

		// Build request
		var bodyReader *strings.Reader
		if req.Body != "" {
			bodyReader = strings.NewReader(req.Body)
		}

		var httpReq *http.Request
		var err error
		if bodyReader != nil {
			httpReq, err = http.NewRequest(req.Method, req.URL, bodyReader)
		} else {
			httpReq, err = http.NewRequest(req.Method, req.URL, nil)
		}
		if err != nil {
			response.Error = err.Error()
			c.JSON(http.StatusOK, response)
			return
		}

		// Add custom headers
		for key, value := range req.Headers {
			httpReq.Header.Set(key, value)
		}

		// Set default User-Agent if not provided
		if httpReq.Header.Get("User-Agent") == "" {
			httpReq.Header.Set("User-Agent", "Network-Monitor/1.0")
		}

		startTime := time.Now()
		resp, err := client.Do(httpReq)
		response.Latency = time.Since(startTime).Nanoseconds()

		if err != nil {
			response.Error = err.Error()
			c.JSON(http.StatusOK, response)
			return
		}
		defer resp.Body.Close()

		response.StatusCode = resp.StatusCode
		response.StatusText = resp.Status
		response.FinalURL = resp.Request.URL.String()
		response.ContentType = resp.Header.Get("Content-Type")
		response.Redirects = redirects

		// Copy response headers
		response.Headers = make(map[string]string)
		for key, values := range resp.Header {
			if len(values) > 0 {
				response.Headers[key] = values[0]
			}
		}

		// Read body (limit to 100KB)
		body := make([]byte, 102400)
		n, _ := resp.Body.Read(body)
		response.BodySize = n

		// Try to determine actual content length from header
		if cl := resp.Header.Get("Content-Length"); cl != "" {
			if size, err := strconv.Atoi(cl); err == nil {
				response.BodySize = size
			}
		}

		// Only include body for text content types (to avoid binary garbage)
		contentType := strings.ToLower(response.ContentType)
		isTextContent := strings.Contains(contentType, "text") ||
			strings.Contains(contentType, "json") ||
			strings.Contains(contentType, "xml") ||
			strings.Contains(contentType, "javascript")

		if isTextContent && n > 0 {
			response.Body = string(body[:n])
			// Truncate if too long
			if len(response.Body) > 10000 {
				response.Body = response.Body[:10000] + "\n... (truncated)"
			}
		} else if n > 0 {
			response.Body = fmt.Sprintf("(Binary content: %d bytes)", n)
		}

		c.JSON(http.StatusOK, response)
	}
}

// SSLCheckRequest represents an SSL/TLS certificate check request
type SSLCheckRequest struct {
	Target  string `json:"target" binding:"required"`
	Port    int    `json:"port"`    // Default 443
	Timeout int    `json:"timeout"` // seconds
}

// CertificateInfo represents information about a single certificate
type CertificateInfo struct {
	Subject      string   `json:"subject"`
	Issuer       string   `json:"issuer"`
	NotBefore    string   `json:"not_before"`
	NotAfter     string   `json:"not_after"`
	SerialNumber string   `json:"serial_number"`
	SANs         []string `json:"sans"`
	SignatureAlg string   `json:"signature_algorithm"`
}

// SSLCheckResponse represents an SSL/TLS certificate check response
type SSLCheckResponse struct {
	Target       string            `json:"target"`
	Port         int               `json:"port"`
	Certificate  *CertificateInfo  `json:"certificate"`
	Chain        []CertificateInfo `json:"chain"`
	IsValid      bool              `json:"is_valid"`
	DaysUntilExp int               `json:"days_until_expiry"`
	TLSVersion   string            `json:"tls_version"`
	CipherSuite  string            `json:"cipher_suite"`
	Duration     int64             `json:"duration"` // nanoseconds
	Error        string            `json:"error,omitempty"`
}

// sslCheck handles the SSL/TLS certificate check endpoint
func sslCheck(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req SSLCheckRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate target
		if !validateTarget(req.Target) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid target address"})
			return
		}

		// Set defaults
		if req.Port <= 0 {
			req.Port = 443
		}
		if req.Port > 65535 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Port must be between 1 and 65535"})
			return
		}
		if req.Timeout <= 0 {
			req.Timeout = 10
		}
		if req.Timeout > 30 {
			req.Timeout = 30
		}

		response := SSLCheckResponse{
			Target: req.Target,
			Port:   req.Port,
		}

		// Build address (handle IPv6)
		var address string
		if ip := net.ParseIP(req.Target); ip != nil && ip.To4() == nil {
			address = fmt.Sprintf("[%s]:%d", req.Target, req.Port)
		} else {
			address = fmt.Sprintf("%s:%d", req.Target, req.Port)
		}

		startTime := time.Now()

		// Configure TLS
		tlsConfig := &tls.Config{
			InsecureSkipVerify: true, // We want to check the cert ourselves
			ServerName:         req.Target,
		}

		// Create connection with timeout
		dialer := &net.Dialer{
			Timeout: time.Duration(req.Timeout) * time.Second,
		}

		conn, err := tls.DialWithDialer(dialer, "tcp", address, tlsConfig)
		response.Duration = time.Since(startTime).Nanoseconds()

		if err != nil {
			response.Error = err.Error()
			c.JSON(http.StatusOK, response)
			return
		}
		defer conn.Close()

		// Get connection state
		state := conn.ConnectionState()

		// TLS version
		switch state.Version {
		case tls.VersionTLS10:
			response.TLSVersion = "TLS 1.0"
		case tls.VersionTLS11:
			response.TLSVersion = "TLS 1.1"
		case tls.VersionTLS12:
			response.TLSVersion = "TLS 1.2"
		case tls.VersionTLS13:
			response.TLSVersion = "TLS 1.3"
		default:
			response.TLSVersion = fmt.Sprintf("Unknown (0x%04x)", state.Version)
		}

		// Cipher suite
		response.CipherSuite = tls.CipherSuiteName(state.CipherSuite)

		// Process certificates
		if len(state.PeerCertificates) > 0 {
			cert := state.PeerCertificates[0]

			// Main certificate info
			response.Certificate = &CertificateInfo{
				Subject:      cert.Subject.String(),
				Issuer:       cert.Issuer.String(),
				NotBefore:    cert.NotBefore.Format(time.RFC3339),
				NotAfter:     cert.NotAfter.Format(time.RFC3339),
				SerialNumber: cert.SerialNumber.String(),
				SANs:         cert.DNSNames,
				SignatureAlg: cert.SignatureAlgorithm.String(),
			}

			// Add IP SANs
			for _, ip := range cert.IPAddresses {
				response.Certificate.SANs = append(response.Certificate.SANs, ip.String())
			}

			// Calculate days until expiry
			now := time.Now()
			if cert.NotAfter.After(now) {
				response.DaysUntilExp = int(cert.NotAfter.Sub(now).Hours() / 24)
			} else {
				response.DaysUntilExp = -int(now.Sub(cert.NotAfter).Hours() / 24)
			}

			// Check validity
			response.IsValid = now.After(cert.NotBefore) && now.Before(cert.NotAfter)

			// Verify certificate against system roots
			opts := x509.VerifyOptions{
				DNSName: req.Target,
			}
			if _, err := cert.Verify(opts); err != nil {
				response.IsValid = false
				if response.Error == "" {
					response.Error = "Certificate verification failed: " + err.Error()
				}
			}

			// Certificate chain
			if len(state.PeerCertificates) > 1 {
				for _, chainCert := range state.PeerCertificates[1:] {
					chainInfo := CertificateInfo{
						Subject:      chainCert.Subject.String(),
						Issuer:       chainCert.Issuer.String(),
						NotBefore:    chainCert.NotBefore.Format(time.RFC3339),
						NotAfter:     chainCert.NotAfter.Format(time.RFC3339),
						SerialNumber: chainCert.SerialNumber.String(),
						SignatureAlg: chainCert.SignatureAlgorithm.String(),
					}
					response.Chain = append(response.Chain, chainInfo)
				}
			}
		}

		c.JSON(http.StatusOK, response)
	}
}

// ARPEntry represents a single ARP table entry
type ARPEntry struct {
	IP        string `json:"ip"`
	MAC       string `json:"mac"`
	Vendor    string `json:"vendor,omitempty"`
	Type      string `json:"type,omitempty"`
	Interface string `json:"interface,omitempty"`
}

// ARPScanResponse represents the ARP table scan response
type ARPScanResponse struct {
	Entries  []ARPEntry `json:"entries"`
	Count    int        `json:"count"`
	Duration int64      `json:"duration"` // nanoseconds
	Error    string     `json:"error,omitempty"`
}

// arpScan handles the ARP table scan endpoint
func arpScan(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		startTime := time.Now()

		response := ARPScanResponse{
			Entries: []ARPEntry{},
		}

		// Execute arp -a command
		cmd := exec.Command("arp", "-a")
		output, err := cmd.Output()
		response.Duration = time.Since(startTime).Nanoseconds()

		if err != nil {
			response.Error = "Failed to execute arp command: " + err.Error()
			c.JSON(http.StatusOK, response)
			return
		}

		// Parse ARP output (Windows format)
		// Example Windows output:
		// Interface: 192.168.1.100 --- 0x5
		//   Internet Address      Physical Address      Type
		//   192.168.1.1           aa-bb-cc-dd-ee-ff     dynamic
		//   192.168.1.254         11-22-33-44-55-66     static

		lines := strings.Split(string(output), "\n")
		currentInterface := ""

		for _, line := range lines {
			line = strings.TrimSpace(line)

			// Skip empty lines
			if line == "" {
				continue
			}

			// Check for interface line
			if strings.HasPrefix(line, "Interface:") {
				parts := strings.Fields(line)
				if len(parts) >= 2 {
					currentInterface = parts[1]
				}
				continue
			}

			// Skip header line
			if strings.Contains(line, "Internet Address") || strings.Contains(line, "Physical Address") {
				continue
			}

			// Parse entry line
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				ip := fields[0]
				mac := ""
				entryType := ""

				// Check if this looks like an IP address
				if net.ParseIP(ip) == nil {
					continue
				}

				if len(fields) >= 2 {
					mac = strings.ToUpper(fields[1])
				}
				if len(fields) >= 3 {
					entryType = fields[2]
				}

				// Skip incomplete entries (broadcast, multicast)
				if mac == "" || mac == "FF-FF-FF-FF-FF-FF" || strings.HasPrefix(mac, "01-00-5E") || strings.HasPrefix(mac, "33-33") {
					continue
				}

				// Normalize MAC address format
				mac = strings.ReplaceAll(mac, "-", ":")

				entry := ARPEntry{
					IP:        ip,
					MAC:       mac,
					Type:      entryType,
					Interface: currentInterface,
				}

				// Look up vendor
				normalizedMAC := normalizeMACAddress(mac)
				if len(normalizedMAC) >= 6 {
					if vendor, ok := ouiDatabase[normalizedMAC[:6]]; ok {
						entry.Vendor = vendor
					}
				}

				response.Entries = append(response.Entries, entry)
			}
		}

		response.Count = len(response.Entries)
		c.JSON(http.StatusOK, response)
	}
}

// MTUDiscoveryRequest represents an MTU discovery request
type MTUDiscoveryRequest struct {
	Target  string `json:"target" binding:"required"`
	MaxMTU  int    `json:"max_mtu"`  // Default 1500
	MinMTU  int    `json:"min_mtu"`  // Default 68
	Timeout int    `json:"timeout"`  // seconds per ping
}

// MTUDiscoveryResponse represents an MTU discovery response
type MTUDiscoveryResponse struct {
	Target      string `json:"target"`
	PathMTU     int    `json:"path_mtu"`
	TestedRange string `json:"tested_range"`
	Duration    int64  `json:"duration"` // nanoseconds
	Error       string `json:"error,omitempty"`
}

// mtuDiscovery handles the MTU discovery endpoint
func mtuDiscovery(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req MTUDiscoveryRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate target
		if !validateTarget(req.Target) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid target address"})
			return
		}

		// Set defaults
		if req.MaxMTU <= 0 {
			req.MaxMTU = 1500
		}
		if req.MaxMTU > 9000 {
			req.MaxMTU = 9000
		}
		if req.MinMTU <= 0 {
			req.MinMTU = 68
		}
		if req.MinMTU < 28 {
			req.MinMTU = 28 // Minimum IP + ICMP header
		}
		if req.Timeout <= 0 {
			req.Timeout = 2
		}
		if req.Timeout > 10 {
			req.Timeout = 10
		}

		response := MTUDiscoveryResponse{
			Target:      req.Target,
			TestedRange: fmt.Sprintf("%d-%d bytes", req.MinMTU, req.MaxMTU),
		}

		startTime := time.Now()

		// Binary search for MTU
		// On Windows, ping -f -l <size> sets DF bit
		// Size is payload size (total packet = size + 28 for IP + ICMP headers)
		low := req.MinMTU - 28  // Convert to payload size
		high := req.MaxMTU - 28 // Convert to payload size
		if low < 0 {
			low = 0
		}

		lastSuccess := low

		// Test if target is reachable at all
		testCmd := exec.Command("ping", "-n", "1", "-w", fmt.Sprintf("%d", req.Timeout*1000), req.Target)
		if err := testCmd.Run(); err != nil {
			response.Duration = time.Since(startTime).Nanoseconds()
			response.Error = "Target is not reachable"
			c.JSON(http.StatusOK, response)
			return
		}

		// Binary search
		for low <= high {
			mid := (low + high) / 2

			// Windows ping: -f = don't fragment, -l = size, -n = count, -w = timeout in ms
			cmd := exec.Command("ping", "-f", "-l", fmt.Sprintf("%d", mid), "-n", "1", "-w", fmt.Sprintf("%d", req.Timeout*1000), req.Target)
			err := cmd.Run()

			if err == nil {
				// Success - try larger
				lastSuccess = mid
				low = mid + 1
			} else {
				// Failed - try smaller
				high = mid - 1
			}
		}

		response.Duration = time.Since(startTime).Nanoseconds()
		response.PathMTU = lastSuccess + 28 // Add headers back

		c.JSON(http.StatusOK, response)
	}
}
