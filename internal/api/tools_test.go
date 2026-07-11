package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"runtime"
	"strings"
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
	"github.com/gosnmp/gosnmp"
)

// ─────────────────────────────────────────────────────────────────────────
// Test harness
// ─────────────────────────────────────────────────────────────────────────

func init() {
	gin.SetMode(gin.TestMode)
}

// newToolsRouter wires every tool handler onto a fresh engine with NO auth
// middleware so the handlers can be exercised directly. The tool handlers
// don't touch srv.DB, so an empty server is sufficient.
func newToolsRouter() *gin.Engine {
	r := gin.New()
	srv := &server.Server{}
	g := r.Group("/api/v1/tools")
	g.POST("/traceroute", traceroute(srv))
	g.POST("/dns-lookup", dnsLookup(srv))
	g.POST("/port-scan", portScan(srv))
	g.POST("/whois", whoisLookup(srv))
	g.POST("/bandwidth-test", bandwidthTest(srv))
	g.POST("/ping", ping(srv))
	g.GET("/common-ports", commonPorts(srv))
	g.POST("/snmp-query", snmpQuery(srv))
	g.POST("/mac-lookup", macLookup(srv))
	g.POST("/connection-test", connectionTest(srv))
	g.POST("/http-test", httpTest(srv))
	g.POST("/ssl-check", sslCheck(srv))
	g.GET("/arp-scan", arpScan(srv))
	g.POST("/mtu-discovery", mtuDiscovery(srv))
	return r
}

// doJSON issues a request against the router and returns the recorder and the
// decoded JSON body (as a generic map).
func doJSON(t *testing.T, r *gin.Engine, method, path string, body interface{}) (*httptest.ResponseRecorder, map[string]interface{}) {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
		reader = bytes.NewReader(b)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	out := map[string]interface{}{}
	if w.Body.Len() > 0 {
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatalf("decode response (%s): %v\nbody=%s", path, err, w.Body.String())
		}
	}
	return w, out
}

// ─────────────────────────────────────────────────────────────────────────
// Pure-logic table tests
// ─────────────────────────────────────────────────────────────────────────

func TestValidateTarget(t *testing.T) {
	cases := map[string]bool{
		"192.168.1.1":      true,
		"8.8.8.8":          true,
		"2001:4860:4860::8888": true,
		"example.com":      true,
		"sub.example.com":  true,
		"localhost":        true,
		"":                 false,
		"not a host":       false,
		"http://x.com":     false,
		"-bad.com":         false,
	}
	for in, want := range cases {
		if got := validateTarget(in); got != want {
			t.Errorf("validateTarget(%q)=%v want %v", in, got, want)
		}
	}
}

func TestValidateDomain(t *testing.T) {
	cases := map[string]bool{
		"example.com":     true,
		"a.b.c.example":   true,
		"example.com.":    true, // trailing dot trimmed
		"":                false,
		"bad_underscore":  true, // single label, still matches hostname charset? underscore not allowed
	}
	// underscore is NOT in the regex charset, so expect false
	cases["bad_underscore"] = false
	for in, want := range cases {
		if got := validateDomain(in); got != want {
			t.Errorf("validateDomain(%q)=%v want %v", in, got, want)
		}
	}
}

func TestValidateOID(t *testing.T) {
	cases := map[string]bool{
		"1.3.6.1.2.1.1.1.0":  true,
		".1.3.6.1":           true,
		"1":                  true,
		"":                   false,
		"1.3.x.1":            false,
		"abc":                false,
		"1..3":               false,
	}
	for in, want := range cases {
		if got := validateOID(in); got != want {
			t.Errorf("validateOID(%q)=%v want %v", in, got, want)
		}
	}
}

func TestNormalizeMACAddress(t *testing.T) {
	cases := map[string]string{
		"00:00:0c:11:22:33": "00000C112233",
		"00-00-0C-11-22-33": "00000C112233",
		"0000.0c11.2233":    "00000C112233",
		"00 00 0c 11 22 33": "00000C112233",
	}
	for in, want := range cases {
		if got := normalizeMACAddress(in); got != want {
			t.Errorf("normalizeMACAddress(%q)=%q want %q", in, got, want)
		}
	}
}

func TestCanonicalizeMAC(t *testing.T) {
	cases := map[string]string{
		"aa:bb:cc:dd:ee:ff": "AA:BB:CC:DD:EE:FF",
		"a:b:c:1:2:3":       "0A:0B:0C:01:02:03", // macOS unpadded form
		"00-00-0c-11-22-33": "00:00:0C:11:22:33",
		"":                  "",
		"aa:bb:cc:dd:ee":    "", // only 5 octets
		"gg:bb:cc:dd:ee:ff": "", // non-hex
		"aaa:bb:cc:dd:ee:ff": "", // octet too long
	}
	for in, want := range cases {
		if got := canonicalizeMAC(in); got != want {
			t.Errorf("canonicalizeMAC(%q)=%q want %q", in, got, want)
		}
	}
}

func TestParseUnixARPLine(t *testing.T) {
	// Linux format with vendor-resolvable OUI (00:00:0C = Cisco)
	if e := parseUnixARPLine("gateway (192.168.1.1) at 00:00:0c:11:22:33 [ether] on eth0"); e == nil {
		t.Fatal("linux line: got nil, want entry")
	} else {
		if e.IP != "192.168.1.1" || e.MAC != "00:00:0C:11:22:33" || e.Interface != "eth0" {
			t.Errorf("linux line parsed wrong: %+v", e)
		}
		if e.Vendor != "Cisco Systems" {
			t.Errorf("vendor=%q want Cisco Systems", e.Vendor)
		}
	}

	// macOS unpadded octets
	if e := parseUnixARPLine("? (10.0.0.5) at a:b:c:1:2:3 on en0 ifscope [ethernet]"); e == nil {
		t.Fatal("macos line: got nil, want entry")
	} else if e.MAC != "0A:0B:0C:01:02:03" || e.IP != "10.0.0.5" {
		t.Errorf("macos line parsed wrong: %+v", e)
	}

	// Things that must be rejected (return nil)
	reject := []string{
		"  192.168.1.1           aa-bb-cc-dd-ee-ff     dynamic", // windows table row
		"? (192.168.1.255) at ff:ff:ff:ff:ff:ff on en0",         // broadcast
		"? (224.0.0.251) at 01:00:5e:00:00:fb on en0",           // multicast
		"? (192.168.1.9) at <incomplete> on en0",                // incomplete
		"Interface: 192.168.1.100 --- 0x5",                      // header
	}
	for _, line := range reject {
		if e := parseUnixARPLine(line); e != nil {
			t.Errorf("parseUnixARPLine(%q) = %+v, want nil", line, e)
		}
	}
}

func TestSNMPProtocolMappers(t *testing.T) {
	if getSNMPVersion("v1") != gosnmp.Version1 ||
		getSNMPVersion("v2c") != gosnmp.Version2c ||
		getSNMPVersion("v3") != gosnmp.Version3 ||
		getSNMPVersion("garbage") != gosnmp.Version2c {
		t.Error("getSNMPVersion mapping wrong")
	}
	if getAuthProtocol("sha256") != gosnmp.SHA256 || getAuthProtocol("md5") != gosnmp.MD5 ||
		getAuthProtocol("") != gosnmp.NoAuth {
		t.Error("getAuthProtocol mapping wrong")
	}
	if getPrivProtocol("aes") != gosnmp.AES || getPrivProtocol("aes256") != gosnmp.AES256 ||
		getPrivProtocol("") != gosnmp.NoPriv {
		t.Error("getPrivProtocol mapping wrong")
	}
}

func TestConvertPDUToResult(t *testing.T) {
	// Printable octet string
	r := convertPDUToResult(gosnmp.SnmpPDU{Name: ".1.3", Type: gosnmp.OctetString, Value: []byte("hello")})
	if r.Value != "hello" || r.Type != "OCTET STRING" {
		t.Errorf("printable octet: %+v", r)
	}
	// Binary octet string -> hex
	r = convertPDUToResult(gosnmp.SnmpPDU{Name: ".1.3", Type: gosnmp.OctetString, Value: []byte{0x00, 0xff}})
	if r.HexValue != "00FF" {
		t.Errorf("binary octet hex=%q", r.HexValue)
	}
	// TimeTicks humanization
	r = convertPDUToResult(gosnmp.SnmpPDU{Name: ".1.3", Type: gosnmp.TimeTicks, Value: uint32(8640000)})
	if !strings.Contains(fmt.Sprintf("%v", r.Value), "day") {
		t.Errorf("timeticks=%v", r.Value)
	}
	// Integer passthrough
	r = convertPDUToResult(gosnmp.SnmpPDU{Name: ".1.3", Type: gosnmp.Integer, Value: 42})
	if r.Value != 42 {
		t.Errorf("integer=%v", r.Value)
	}
}

func TestIsPrintable(t *testing.T) {
	if !isPrintable([]byte("abc 123")) {
		t.Error("ascii should be printable")
	}
	if isPrintable([]byte{0x00, 0x01}) {
		t.Error("control bytes not printable")
	}
}

func TestPingCmdConstruction(t *testing.T) {
	reach := pingReachabilityCmd("1.2.3.4", 3)
	df := pingDontFragmentCmd("1.2.3.4", 1472, 2)
	joinReach := strings.Join(reach.Args, " ")
	joinDF := strings.Join(df.Args, " ")

	switch runtime.GOOS {
	case "windows":
		if !strings.Contains(joinReach, "-n 1") || !strings.Contains(joinReach, "-w 3000") {
			t.Errorf("windows reach args: %v", reach.Args)
		}
		if !strings.Contains(joinDF, "-f") || !strings.Contains(joinDF, "-l 1472") {
			t.Errorf("windows df args: %v", df.Args)
		}
	case "darwin":
		if !strings.Contains(joinReach, "-c 1") || !strings.Contains(joinReach, "-t 3") {
			t.Errorf("darwin reach args: %v", reach.Args)
		}
		if !strings.Contains(joinDF, "-D") || !strings.Contains(joinDF, "-s 1472") {
			t.Errorf("darwin df args: %v", df.Args)
		}
	default:
		if !strings.Contains(joinReach, "-c 1") || !strings.Contains(joinReach, "-W 3") {
			t.Errorf("linux reach args: %v", reach.Args)
		}
		if !strings.Contains(joinDF, "-M do") || !strings.Contains(joinDF, "-s 1472") {
			t.Errorf("linux df args: %v", df.Args)
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────
// Handler integration tests (real sockets, local servers)
// ─────────────────────────────────────────────────────────────────────────

func TestHTTPTestHandler(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTeapot)
		fmt.Fprint(w, `{"ok":true}`)
	}))
	defer ts.Close()

	r := newToolsRouter()
	w, body := doJSON(t, r, "POST", "/api/v1/tools/http-test", map[string]interface{}{
		"url":     ts.URL,
		"method":  "GET",
		"timeout": 5,
	})
	if w.Code != 200 {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if errStr, _ := body["error"].(string); errStr != "" {
		t.Fatalf("unexpected error: %s", errStr)
	}
	if int(body["status_code"].(float64)) != http.StatusTeapot {
		t.Errorf("status_code=%v want 418", body["status_code"])
	}
	if !strings.Contains(body["body"].(string), `"ok":true`) {
		t.Errorf("body not captured: %v", body["body"])
	}
}

func TestHTTPTestHandlerRejectsBadScheme(t *testing.T) {
	r := newToolsRouter()
	w, _ := doJSON(t, r, "POST", "/api/v1/tools/http-test", map[string]interface{}{
		"url": "ftp://example.com",
	})
	if w.Code != 400 {
		t.Errorf("bad scheme status=%d want 400", w.Code)
	}
}

func TestSSLCheckHandler(t *testing.T) {
	ts := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer ts.Close()

	host, port, err := net.SplitHostPort(strings.TrimPrefix(ts.URL, "https://"))
	if err != nil {
		t.Fatalf("split host: %v", err)
	}
	var portNum int
	fmt.Sscanf(port, "%d", &portNum)

	r := newToolsRouter()
	w, body := doJSON(t, r, "POST", "/api/v1/tools/ssl-check", map[string]interface{}{
		"target":  host,
		"port":    portNum,
		"timeout": 5,
	})
	if w.Code != 200 {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	// httptest uses a self-signed cert: connection succeeds, cert parses,
	// TLS version is reported, but is_valid is false (untrusted root).
	if body["certificate"] == nil {
		t.Fatalf("no certificate parsed: %s", w.Body.String())
	}
	if tv, _ := body["tls_version"].(string); !strings.HasPrefix(tv, "TLS") {
		t.Errorf("tls_version=%q", tv)
	}
	if cs, _ := body["cipher_suite"].(string); cs == "" {
		t.Error("cipher_suite empty")
	}
}

func TestConnectionTestHandler(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer ln.Close()
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			conn.Close()
		}
	}()
	port := ln.Addr().(*net.TCPAddr).Port

	r := newToolsRouter()

	// Open port → connected
	w, body := doJSON(t, r, "POST", "/api/v1/tools/connection-test", map[string]interface{}{
		"target": "127.0.0.1", "port": port, "protocol": "tcp", "timeout": 3,
	})
	if w.Code != 200 || body["connected"] != true {
		t.Errorf("open port: code=%d connected=%v", w.Code, body["connected"])
	}

	// Closed port (use a port nobody listens on) → not connected
	w, body = doJSON(t, r, "POST", "/api/v1/tools/connection-test", map[string]interface{}{
		"target": "127.0.0.1", "port": 1, "protocol": "tcp", "timeout": 2,
	})
	if w.Code != 200 || body["connected"] != false {
		t.Errorf("closed port: code=%d connected=%v", w.Code, body["connected"])
	}

	// Bad input → 400
	w, _ = doJSON(t, r, "POST", "/api/v1/tools/connection-test", map[string]interface{}{
		"target": "127.0.0.1", "port": 0,
	})
	if w.Code != 400 {
		t.Errorf("missing port should be 400, got %d", w.Code)
	}
}

func TestPortScanHandler(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer ln.Close()
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			conn.Close()
		}
	}()
	open := ln.Addr().(*net.TCPAddr).Port

	r := newToolsRouter()
	w, body := doJSON(t, r, "POST", "/api/v1/tools/port-scan", map[string]interface{}{
		"target":  "127.0.0.1",
		"ports":   fmt.Sprintf("%d", open),
		"timeout": 2,
	})
	if w.Code != 200 {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	ports, ok := body["ports"].([]interface{})
	if !ok || len(ports) != 1 {
		t.Fatalf("ports=%v", body["ports"])
	}
	first := ports[0].(map[string]interface{})
	if first["status"] != "open" {
		t.Errorf("expected open, got %v", first["status"])
	}
}

func TestDNSLookupHandler(t *testing.T) {
	r := newToolsRouter()
	w, body := doJSON(t, r, "POST", "/api/v1/tools/dns-lookup", map[string]interface{}{
		"domain":  "localhost",
		"type":    "a", // lowercase to verify case-normalization
		"timeout": 5,
	})
	if w.Code != 200 {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if body["domain"] != "localhost" {
		t.Errorf("domain echo=%v", body["domain"])
	}
	if body["type"] != "A" {
		t.Errorf("type should be normalized to A, got %v", body["type"])
	}
}

func TestDNSLookupHandlerRejectsBadDomain(t *testing.T) {
	r := newToolsRouter()
	w, _ := doJSON(t, r, "POST", "/api/v1/tools/dns-lookup", map[string]interface{}{
		"domain": "not a domain", "type": "A",
	})
	if w.Code != 400 {
		t.Errorf("bad domain status=%d want 400", w.Code)
	}
}

func TestPingHandler(t *testing.T) {
	// measureLatency probes ports 80/443/22 on the target via TCP. Stand up
	// a listener on one of those isn't possible without privilege, so we just
	// assert the handler returns a well-formed 200 with the target echoed.
	r := newToolsRouter()
	w, body := doJSON(t, r, "POST", "/api/v1/tools/ping", map[string]interface{}{
		"target": "127.0.0.1", "count": 2,
	})
	if w.Code != 200 {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if body["target"] != "127.0.0.1" {
		t.Errorf("target echo=%v", body["target"])
	}
}

func TestCommonPortsHandler(t *testing.T) {
	r := newToolsRouter()
	w, body := doJSON(t, r, "GET", "/api/v1/tools/common-ports", nil)
	if w.Code != 200 {
		t.Fatalf("status=%d", w.Code)
	}
	if ports, ok := body["ports"].([]interface{}); !ok || len(ports) == 0 {
		t.Errorf("ports=%v", body["ports"])
	}

	w, body = doJSON(t, r, "GET", "/api/v1/tools/common-ports?count=3", nil)
	if w.Code != 200 {
		t.Fatalf("count=3 status=%d", w.Code)
	}
	if ports, ok := body["ports"].([]interface{}); !ok || len(ports) != 3 {
		t.Errorf("count=3 ports=%v", body["ports"])
	}
}

func TestMACLookupHandler(t *testing.T) {
	r := newToolsRouter()
	w, body := doJSON(t, r, "POST", "/api/v1/tools/mac-lookup", map[string]interface{}{
		"mac": "00:00:0C:11:22:33",
	})
	if w.Code != 200 {
		t.Fatalf("status=%d", w.Code)
	}
	if body["is_valid"] != true {
		t.Errorf("is_valid=%v", body["is_valid"])
	}
	if body["vendor"] != "Cisco Systems" {
		t.Errorf("vendor=%v want Cisco Systems", body["vendor"])
	}

	// Invalid MAC still returns 200 but is_valid=false
	w, body = doJSON(t, r, "POST", "/api/v1/tools/mac-lookup", map[string]interface{}{
		"mac": "zz:zz",
	})
	if w.Code != 200 || body["is_valid"] != false {
		t.Errorf("invalid mac: code=%d is_valid=%v", w.Code, body["is_valid"])
	}
}

func TestSNMPQueryHandlerValidation(t *testing.T) {
	r := newToolsRouter()
	// Invalid target → 400
	w, _ := doJSON(t, r, "POST", "/api/v1/tools/snmp-query", map[string]interface{}{
		"target": "bad target", "oid": "1.3.6.1",
	})
	if w.Code != 400 {
		t.Errorf("bad target status=%d want 400", w.Code)
	}
	// Invalid OID → 400
	w, _ = doJSON(t, r, "POST", "/api/v1/tools/snmp-query", map[string]interface{}{
		"target": "127.0.0.1", "oid": "abc",
	})
	if w.Code != 400 {
		t.Errorf("bad oid status=%d want 400", w.Code)
	}
	// Out-of-range port → 400
	w, _ = doJSON(t, r, "POST", "/api/v1/tools/snmp-query", map[string]interface{}{
		"target": "127.0.0.1", "oid": "1.3.6.1", "port": 70000,
	})
	if w.Code != 400 {
		t.Errorf("bad port status=%d want 400", w.Code)
	}
}

func TestSNMPQueryHandlerNoAgent(t *testing.T) {
	// Nothing listens on this UDP port → the GET times out and the handler
	// returns 200 with an error field populated (not a crash / 500).
	r := newToolsRouter()
	w, body := doJSON(t, r, "POST", "/api/v1/tools/snmp-query", map[string]interface{}{
		"target": "127.0.0.1", "oid": "1.3.6.1.2.1.1.1.0", "port": 16100, "timeout": 1,
	})
	if w.Code != 200 {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if body["operation"] != "get" {
		t.Errorf("operation=%v", body["operation"])
	}
	if errStr, _ := body["error"].(string); errStr == "" {
		t.Error("expected timeout error to be reported")
	}
}

func TestARPScanHandler(t *testing.T) {
	// `arp -a` exists on Windows and Linux. Exercise the real command +
	// parser; assert structural integrity rather than specific entries.
	r := newToolsRouter()
	w, body := doJSON(t, r, "GET", "/api/v1/tools/arp-scan", nil)
	if w.Code != 200 {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if errStr, _ := body["error"].(string); errStr != "" {
		t.Skipf("arp command unavailable in this environment: %s", errStr)
	}
	entries, _ := body["entries"].([]interface{})
	if int(body["count"].(float64)) != len(entries) {
		t.Errorf("count=%v but entries len=%d", body["count"], len(entries))
	}
	// Every returned entry must have a valid IP and canonical MAC.
	for _, e := range entries {
		m := e.(map[string]interface{})
		if net.ParseIP(m["ip"].(string)) == nil {
			t.Errorf("entry has invalid ip: %v", m["ip"])
		}
		mac := m["mac"].(string)
		if canonicalizeMAC(mac) != mac {
			t.Errorf("entry mac not canonical: %q", mac)
		}
	}
}

func TestTracerouteHandlerValidation(t *testing.T) {
	// Raw ICMP needs privilege; we only assert input validation here so the
	// test is deterministic across environments.
	r := newToolsRouter()
	w, _ := doJSON(t, r, "POST", "/api/v1/tools/traceroute", map[string]interface{}{
		"target": "bad target",
	})
	if w.Code != 400 {
		t.Errorf("bad target status=%d want 400", w.Code)
	}
}

func TestMTUDiscoveryHandlerValidation(t *testing.T) {
	r := newToolsRouter()
	w, _ := doJSON(t, r, "POST", "/api/v1/tools/mtu-discovery", map[string]interface{}{
		"target": "bad target",
	})
	if w.Code != 400 {
		t.Errorf("bad target status=%d want 400", w.Code)
	}
}

func TestConnectionTestTLSDataExchange(t *testing.T) {
	// Confirms the data-send path of connection-test against a real TLS-less
	// echo server (sanity for the Write/Read branch).
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer ln.Close()
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		buf := make([]byte, 256)
		n, _ := conn.Read(buf)
		conn.Write(buf[:n]) // echo
	}()
	port := ln.Addr().(*net.TCPAddr).Port

	r := newToolsRouter()
	w, body := doJSON(t, r, "POST", "/api/v1/tools/connection-test", map[string]interface{}{
		"target": "127.0.0.1", "port": port, "protocol": "tcp", "timeout": 3, "data": "PING\n",
	})
	if w.Code != 200 || body["connected"] != true {
		t.Fatalf("code=%d connected=%v", w.Code, body["connected"])
	}
	if resp, _ := body["response"].(string); !strings.Contains(resp, "PING") {
		t.Errorf("echo response=%q", resp)
	}
}
