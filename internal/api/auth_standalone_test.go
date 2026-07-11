package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/gin-gonic/gin"
)

// These tests pin the gate on POST /api/v1/auth/standalone. handleEnableStandalone
// flips the WHOLE API into auth-bypassed standalone mode, so — like handleLogout —
// it must be reachable only from loopback, and only with the matching
// NETWORK_MONITOR_BOOTSTRAP_TOKEN once a ProxyConfig exists. Both handlers share
// requireLocalOrBootstrap; handleLogout has auth_logout_test.go, and this file
// pins the OTHER consumer of that gate identically, so any change that weakens the
// gate fails a test on BOTH surfaces rather than only one. The body/message
// assertions also pin the exact shipped responses byte-for-byte.

// newStandaloneContext builds a gin context whose request targets the standalone
// endpoint with a controllable remote address and optional bootstrap token.
// isLoopbackRequest reads RemoteAddr directly, so setting it is what decides the
// loopback branch (mirrors newLogoutContext).
func newStandaloneContext(remoteAddr, bearer string) (*gin.Context, *httptest.ResponseRecorder) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/auth/standalone", nil)
	c.Request.RemoteAddr = remoteAddr
	if bearer != "" {
		c.Request.Header.Set("Authorization", "Bearer "+bearer)
	}
	return c, w
}

// standaloneBody is the JSON shape handleEnableStandalone returns on every path
// (success and both rejections). Decoding into it lets each test assert the
// exact shipped strings so the "byte-identical" claim is a real regression gate.
type standaloneBody struct {
	Success bool   `json:"success"`
	Error   string `json:"error"`
	Message string `json:"message"`
	Mode    string `json:"mode"`
}

func decodeStandaloneBody(t *testing.T, w *httptest.ResponseRecorder) standaloneBody {
	t.Helper()
	var body standaloneBody
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode standalone body %q: %v", w.Body.String(), err)
	}
	return body
}

// (a) A non-loopback caller must be rejected AND must not flip the process into
// auth-bypassed standalone mode — a remote attacker cannot disable auth.
func TestEnableStandaloneRejectsRemoteCaller(t *testing.T) {
	db := newTestDB(t)
	resetAuthState(t)
	seedLogoutProxyConfig(t, db)

	svc := NewAuthService(db)
	c, w := newStandaloneContext("203.0.113.9:5555", "") // TEST-NET-3, non-loopback
	svc.handleEnableStandalone(c)

	if w.Code != http.StatusForbidden {
		t.Fatalf("remote standalone: status=%d body=%s, want 403", w.Code, w.Body.String())
	}
	if middleware.IsStandaloneMode() {
		t.Fatalf("remote standalone enabled auth-bypass — a remote caller disabled auth")
	}
	body := decodeStandaloneBody(t, w)
	if body.Success {
		t.Fatalf("remote standalone body success=true, want false")
	}
	if body.Error != "standalone mode can only be enabled from a local loopback connection" {
		t.Fatalf("remote standalone error=%q (shipped message changed)", body.Error)
	}
}

// (b) A loopback caller is NOT enough once a config exists: the bootstrap token
// is required. No token and a wrong token are both rejected, and neither flips
// the process to standalone.
func TestEnableStandaloneLoopbackWithConfigRequiresToken(t *testing.T) {
	db := newTestDB(t)
	resetAuthState(t)
	seedLogoutProxyConfig(t, db)
	t.Setenv("NETWORK_MONITOR_BOOTSTRAP_TOKEN", "s3cret-boot")

	svc := NewAuthService(db)

	// Loopback, no token.
	c, w := newStandaloneContext("127.0.0.1:40000", "")
	svc.handleEnableStandalone(c)
	if w.Code != http.StatusForbidden {
		t.Fatalf("loopback standalone without token: status=%d body=%s, want 403", w.Code, w.Body.String())
	}
	if body := decodeStandaloneBody(t, w); body.Error != "ProxyConfig exists; standalone enable requires NETWORK_MONITOR_BOOTSTRAP_TOKEN" {
		t.Fatalf("no-token standalone error=%q (shipped message changed)", body.Error)
	}

	// Loopback, wrong token.
	c2, w2 := newStandaloneContext("127.0.0.1:40001", "wrong-token")
	svc.handleEnableStandalone(c2)
	if w2.Code != http.StatusForbidden {
		t.Fatalf("loopback standalone with wrong token: status=%d body=%s, want 403", w2.Code, w2.Body.String())
	}

	if middleware.IsStandaloneMode() {
		t.Fatalf("a rejected loopback standalone enabled auth-bypass")
	}
}

// (c) Loopback + the correct bootstrap token succeeds and actually flips the
// process into standalone mode, with the exact shipped success body.
func TestEnableStandaloneLoopbackWithTokenSucceeds(t *testing.T) {
	db := newTestDB(t)
	resetAuthState(t)
	seedLogoutProxyConfig(t, db)
	t.Setenv("NETWORK_MONITOR_BOOTSTRAP_TOKEN", "s3cret-boot")

	svc := NewAuthService(db)
	c, w := newStandaloneContext("127.0.0.1:40010", "s3cret-boot")
	svc.handleEnableStandalone(c)

	if w.Code != http.StatusOK {
		t.Fatalf("loopback standalone with token: status=%d body=%s, want 200", w.Code, w.Body.String())
	}
	if !middleware.IsStandaloneMode() {
		t.Fatalf("successful standalone did not flip the process to standalone")
	}
	body := decodeStandaloneBody(t, w)
	if !body.Success ||
		body.Message != "Standalone mode enabled - no authentication required" ||
		body.Mode != "standalone" {
		t.Fatalf("standalone success body changed: %+v", body)
	}
}

// (d) The legitimate local first-run flow: loopback with NO config present needs
// no token and succeeds, flipping the fresh box into standalone.
func TestEnableStandaloneLoopbackNoConfigSucceeds(t *testing.T) {
	db := newTestDB(t)
	resetAuthState(t)
	// No ProxyConfig, no bootstrap token — first-run bootstrap.

	svc := NewAuthService(db)
	c, w := newStandaloneContext("127.0.0.1:40020", "")
	svc.handleEnableStandalone(c)

	if w.Code != http.StatusOK {
		t.Fatalf("loopback standalone with no config: status=%d body=%s, want 200", w.Code, w.Body.String())
	}
	if !middleware.IsStandaloneMode() {
		t.Fatalf("first-run standalone did not flip the process to standalone")
	}
}
