package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
)

// These tests pin the auth-adequacy of the settings "disconnect" endpoint
// (POST /api/v1/settings/thothos/disconnect). Like logout, disconnect runs
// teardownThothOSSession: it deletes BOTH persisted ThothOS fallbacks and flips
// the whole API into standalone (auth-bypassed) mode.
//
// Disconnect is registered behind RequireAuth, but RequireAuth in INTEGRATED
// mode only checks the process-global "is this proxy connected" flag — it does
// NOT verify any per-request credential (no cookie, bearer, or API key on the
// local API). So in integrated mode every remote caller passes RequireAuth and
// reaches the handler. That makes disconnect the SAME remote-unauthenticated
// destructive surface logout was, and it must apply the SAME gate:
// loopback-only, plus the bootstrap token once a ProxyConfig exists.
//
// (resetAuthState, stopSessionOnCleanup, seedLogoutProxyConfig and
// proxyConfigCount are shared helpers defined alongside the logout suite.)

// newDisconnectContext builds a gin context whose request targets the settings
// disconnect endpoint with a controllable remote address and optional bootstrap
// token. isLoopbackRequest reads RemoteAddr directly, so setting it is what
// decides the loopback branch.
func newDisconnectContext(remoteAddr, bearer string) (*gin.Context, *httptest.ResponseRecorder) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/settings/thothos/disconnect", nil)
	c.Request.RemoteAddr = remoteAddr
	if bearer != "" {
		c.Request.Header.Set("Authorization", "Bearer "+bearer)
	}
	return c, w
}

// (a) A non-loopback caller must be rejected AND must not tear anything down —
// the config survives and the process is not flipped into standalone (which
// would disable auth on the entire API).
func TestDisconnectRejectsRemoteCaller(t *testing.T) {
	db := newTestDB(t)
	resetAuthState(t)
	stopSessionOnCleanup(t)
	seedLogoutProxyConfig(t, db)

	srv := &server.Server{DB: db}
	c, w := newDisconnectContext("203.0.113.9:5555", "") // TEST-NET-3, non-loopback
	disconnectFromThothOS(srv)(c)

	if w.Code != http.StatusForbidden {
		t.Fatalf("remote disconnect: status=%d body=%s, want 403", w.Code, w.Body.String())
	}
	if got := proxyConfigCount(t, db); got == 0 {
		t.Fatalf("remote disconnect deleted the ProxyConfig — teardown ran despite rejection")
	}
	if middleware.IsStandaloneMode() {
		t.Fatalf("remote disconnect flipped the process to standalone — a remote caller bypassed auth")
	}
}

// (b) A loopback caller is NOT enough once a config exists: the bootstrap token
// is required. No token and a wrong token are both rejected, and neither tears
// the config down.
func TestDisconnectLoopbackWithConfigRequiresToken(t *testing.T) {
	db := newTestDB(t)
	resetAuthState(t)
	stopSessionOnCleanup(t)
	seedLogoutProxyConfig(t, db)
	t.Setenv("NETWORK_MONITOR_BOOTSTRAP_TOKEN", "s3cret-boot")

	srv := &server.Server{DB: db}

	// Loopback, no token.
	c, w := newDisconnectContext("127.0.0.1:40000", "")
	disconnectFromThothOS(srv)(c)
	if w.Code != http.StatusForbidden {
		t.Fatalf("loopback disconnect without token: status=%d body=%s, want 403", w.Code, w.Body.String())
	}

	// Loopback, wrong token.
	c2, w2 := newDisconnectContext("127.0.0.1:40001", "wrong-token")
	disconnectFromThothOS(srv)(c2)
	if w2.Code != http.StatusForbidden {
		t.Fatalf("loopback disconnect with wrong token: status=%d body=%s, want 403", w2.Code, w2.Body.String())
	}

	if got := proxyConfigCount(t, db); got == 0 {
		t.Fatalf("a rejected loopback disconnect still deleted the ProxyConfig")
	}
	if middleware.IsStandaloneMode() {
		t.Fatalf("a rejected loopback disconnect flipped the process to standalone")
	}
}

// (c1) Loopback + the correct bootstrap token succeeds and actually tears the
// session down: config cleared, standalone enabled.
func TestDisconnectLoopbackWithTokenSucceeds(t *testing.T) {
	db := newTestDB(t)
	resetAuthState(t)
	stopSessionOnCleanup(t)
	seedLogoutProxyConfig(t, db)
	t.Setenv("NETWORK_MONITOR_BOOTSTRAP_TOKEN", "s3cret-boot")

	srv := &server.Server{DB: db}
	c, w := newDisconnectContext("127.0.0.1:40010", "s3cret-boot")
	disconnectFromThothOS(srv)(c)

	if w.Code != http.StatusOK {
		t.Fatalf("loopback disconnect with token: status=%d body=%s, want 200", w.Code, w.Body.String())
	}
	if got := proxyConfigCount(t, db); got != 0 {
		t.Fatalf("successful disconnect did not clear the ProxyConfig (count=%d)", got)
	}
	if !middleware.IsStandaloneMode() {
		t.Fatalf("successful disconnect did not flip the process to standalone")
	}
}

// (c2) The legitimate local first-run flow: loopback with NO config present
// needs no token and succeeds (a local operator can always disconnect). This is
// also the settings-connect shape, whose config lives in the Settings table
// rather than a ProxyConfig row, so requireLocalOrBootstrap sees no ProxyConfig.
func TestDisconnectLoopbackNoConfigSucceeds(t *testing.T) {
	db := newTestDB(t)
	resetAuthState(t)
	stopSessionOnCleanup(t)
	// No ProxyConfig, no bootstrap token.

	srv := &server.Server{DB: db}
	c, w := newDisconnectContext("127.0.0.1:40020", "")
	disconnectFromThothOS(srv)(c)

	if w.Code != http.StatusOK {
		t.Fatalf("loopback disconnect with no config: status=%d body=%s, want 200", w.Code, w.Body.String())
	}
}

// (d) End-to-end reachability proof: build the REAL route wiring from routes.go
// (public settings, then RequireAuth, then the authed settings group that owns
// disconnect) and drive it in INTEGRATED mode (standalone off, a global auth
// context set — a connected proxy). A remote POST passes RequireAuth (which
// only checks the process-global connected flag, not the caller) and reaches
// the disconnect handler. The handler's own loopback/bootstrap gate is what
// must reject it: 403, config intact, still integrated. Without the gate this
// remote call would tear the session down and flip the box to auth-bypass.
func TestDisconnectRemoteReachesHandlerThroughRequireAuth(t *testing.T) {
	db := newTestDB(t)
	resetAuthState(t)
	stopSessionOnCleanup(t)
	seedLogoutProxyConfig(t, db)

	// Integrated mode: a connected proxy has a non-nil global auth context and
	// standalone is off, so RequireAuth admits the request to the handler.
	middleware.SetGlobalAuthContext(&middleware.AuthContext{CompanyID: "c1", APIKeyID: "k1"})

	srv := &server.Server{DB: db}
	router := gin.New()
	v1 := router.Group("/api/v1")
	RegisterPublicSettingsRoutes(v1, srv)
	v1.Use(middleware.RequireAuth())
	RegisterAuthedSettingsRoutes(v1, srv)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/thothos/disconnect", nil)
	req.RemoteAddr = "203.0.113.9:5555" // non-loopback
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("remote disconnect through RequireAuth: status=%d body=%s, want 403 (handler gate must reject)", w.Code, w.Body.String())
	}
	if got := proxyConfigCount(t, db); got == 0 {
		t.Fatalf("remote disconnect through RequireAuth tore down the session — RequireAuth did not gate and the handler did not either")
	}
	if middleware.IsStandaloneMode() {
		t.Fatalf("remote disconnect through RequireAuth flipped the box to standalone (auth bypass)")
	}
}
