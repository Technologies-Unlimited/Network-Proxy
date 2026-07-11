package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// These tests pin the security fix for the audit "logout is an unauthenticated
// bypass" finding: POST /api/v1/auth/logout runs teardownThothOSSession, which
// deletes the persisted ThothOS config and flips the whole API into standalone
// (auth-bypassed) mode. Left ungated, any host that can reach the server can
// brick/bypass an integrated proxy with a single POST. handleLogout must apply
// the SAME gate handleEnableStandalone already applies: loopback-only, and when
// a ProxyConfig exists, a matching NETWORK_MONITOR_BOOTSTRAP_TOKEN.

// newLogoutContext builds a gin context whose request targets the logout
// endpoint with a controllable remote address and optional bootstrap token.
// isLoopbackRequest reads RemoteAddr directly, so setting it is what decides the
// loopback branch.
func newLogoutContext(remoteAddr, bearer string) (*gin.Context, *httptest.ResponseRecorder) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
	c.Request.RemoteAddr = remoteAddr
	if bearer != "" {
		c.Request.Header.Set("Authorization", "Bearer "+bearer)
	}
	return c, w
}

// resetAuthState pins the process-global middleware auth flags to a known state
// for the duration of the test and restores whatever they were afterwards, so a
// logout that flips standalone mode can't leak into sibling tests.
func resetAuthState(t *testing.T) {
	t.Helper()
	prevStandalone := middleware.IsStandaloneMode()
	prevCtx := middleware.GetGlobalAuthContext()
	middleware.SetStandaloneMode(false)
	middleware.SetGlobalAuthContext(nil)
	t.Cleanup(func() {
		middleware.SetStandaloneMode(prevStandalone)
		middleware.SetGlobalAuthContext(prevCtx)
	})
}

// seedLogoutProxyConfig persists a ProxyConfig row so the "config present" gate
// branch is exercised (mirrors an operator who has already connected).
func seedLogoutProxyConfig(t *testing.T, db *gorm.DB) {
	t.Helper()
	if err := db.Create(&models.ProxyConfig{
		ThothOSURL: "https://thoth.example.com",
		APIKey:     "tk_test",
		APIKeyID:   "k1",
		CompanyID:  "c1",
		ProxyName:  "test-proxy",
		IsActive:   true,
	}).Error; err != nil {
		t.Fatalf("seed ProxyConfig: %v", err)
	}
}

func proxyConfigCount(t *testing.T, db *gorm.DB) int64 {
	t.Helper()
	var count int64
	if err := db.Model(&models.ProxyConfig{}).Count(&count).Error; err != nil {
		t.Fatalf("count ProxyConfig: %v", err)
	}
	return count
}

// (a) A non-loopback caller must be rejected AND must not tear anything down —
// the config survives and the process is not flipped to standalone.
func TestLogoutRejectsRemoteCaller(t *testing.T) {
	db := newTestDB(t)
	resetAuthState(t)
	stopSessionOnCleanup(t)
	seedLogoutProxyConfig(t, db)

	svc := NewAuthService(db)
	c, w := newLogoutContext("203.0.113.9:5555", "") // TEST-NET-3, non-loopback
	svc.handleLogout(c)

	if w.Code != http.StatusForbidden {
		t.Fatalf("remote logout: status=%d body=%s, want 403", w.Code, w.Body.String())
	}
	if got := proxyConfigCount(t, db); got == 0 {
		t.Fatalf("remote logout deleted the ProxyConfig — teardown ran despite rejection")
	}
	if middleware.IsStandaloneMode() {
		t.Fatalf("remote logout flipped the process to standalone — a remote caller bypassed auth")
	}
}

// (b) A loopback caller is NOT enough once a config exists: the bootstrap token
// is required. No token and a wrong token are both rejected, and neither tears
// the config down.
func TestLogoutLoopbackWithConfigRequiresToken(t *testing.T) {
	db := newTestDB(t)
	resetAuthState(t)
	stopSessionOnCleanup(t)
	seedLogoutProxyConfig(t, db)
	t.Setenv("NETWORK_MONITOR_BOOTSTRAP_TOKEN", "s3cret-boot")

	svc := NewAuthService(db)

	// Loopback, no token.
	c, w := newLogoutContext("127.0.0.1:40000", "")
	svc.handleLogout(c)
	if w.Code != http.StatusForbidden {
		t.Fatalf("loopback logout without token: status=%d body=%s, want 403", w.Code, w.Body.String())
	}

	// Loopback, wrong token.
	c2, w2 := newLogoutContext("127.0.0.1:40001", "wrong-token")
	svc.handleLogout(c2)
	if w2.Code != http.StatusForbidden {
		t.Fatalf("loopback logout with wrong token: status=%d body=%s, want 403", w2.Code, w2.Body.String())
	}

	if got := proxyConfigCount(t, db); got == 0 {
		t.Fatalf("a rejected loopback logout still deleted the ProxyConfig")
	}
	if middleware.IsStandaloneMode() {
		t.Fatalf("a rejected loopback logout flipped the process to standalone")
	}
}

// (c1) Loopback + the correct bootstrap token succeeds and actually tears the
// session down: config cleared, standalone enabled.
func TestLogoutLoopbackWithTokenSucceeds(t *testing.T) {
	db := newTestDB(t)
	resetAuthState(t)
	stopSessionOnCleanup(t)
	seedLogoutProxyConfig(t, db)
	t.Setenv("NETWORK_MONITOR_BOOTSTRAP_TOKEN", "s3cret-boot")

	svc := NewAuthService(db)
	c, w := newLogoutContext("127.0.0.1:40010", "s3cret-boot")
	svc.handleLogout(c)

	if w.Code != http.StatusOK {
		t.Fatalf("loopback logout with token: status=%d body=%s, want 200", w.Code, w.Body.String())
	}
	if got := proxyConfigCount(t, db); got != 0 {
		t.Fatalf("successful logout did not clear the ProxyConfig (count=%d)", got)
	}
	if !middleware.IsStandaloneMode() {
		t.Fatalf("successful logout did not flip the process to standalone")
	}
}

// (c2) The legitimate local first-run flow: loopback with NO config present
// needs no token and succeeds (a local operator can always log out / disconnect).
func TestLogoutLoopbackNoConfigSucceeds(t *testing.T) {
	db := newTestDB(t)
	resetAuthState(t)
	stopSessionOnCleanup(t)
	// No ProxyConfig, no bootstrap token.

	svc := NewAuthService(db)
	c, w := newLogoutContext("127.0.0.1:40020", "")
	svc.handleLogout(c)

	if w.Code != http.StatusOK {
		t.Fatalf("loopback logout with no config: status=%d body=%s, want 200", w.Code, w.Body.String())
	}
}
