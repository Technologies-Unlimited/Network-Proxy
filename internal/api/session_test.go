package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/thothos"
	"github.com/gin-gonic/gin"
)

// fakeThothOS stands up a minimal in-process ThothOS that answers the exact
// endpoints the Go client hits during a connect: api-key validation, the
// registerProxy / proxyHeartbeat / registerWebhook GraphQL mutations, and the
// config-pull queries. It records every proxyHeartbeat so a test can prove the
// heartbeat loop actually started. This exercises the real thothos.Client and
// the real session lifecycle end-to-end — only the ThothOS server is a local
// double (the T5 "hit the full stack, don't mock a layer" analog for Go).
type fakeThothOS struct {
	server     *httptest.Server
	registers  int32
	heartbeats int32
	beat       chan struct{}
}

func newFakeThothOS(t *testing.T) *fakeThothOS {
	t.Helper()
	f := &fakeThothOS{beat: make(chan struct{}, 64)}
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		payload := string(body)
		w.Header().Set("Content-Type", "application/json")

		switch {
		case strings.HasSuffix(r.URL.Path, "/api/auth/api-key/validate"):
			io.WriteString(w, `{"valid":true,"companyId":"c1","apiKeyId":"k1","permissions":["config:read","config:write"]}`)
		case strings.Contains(payload, "proxyHeartbeat"):
			atomic.AddInt32(&f.heartbeats, 1)
			select {
			case f.beat <- struct{}{}:
			default:
			}
			io.WriteString(w, `{"data":{"proxyHeartbeat":{"_id":"p1","proxyStatus":"online","agentCount":0,"deviceCount":0}}}`)
		case strings.Contains(payload, "registerProxy"):
			atomic.AddInt32(&f.registers, 1)
			io.WriteString(w, `{"data":{"registerProxy":{"_id":"p1","proxyName":"test-proxy","proxyStatus":"online"}}}`)
		case strings.Contains(payload, "registerWebhook"):
			io.WriteString(w, `{"data":{"registerWebhook":{"_id":"wh1","secret":"whsecret","isActive":true}}}`)
		default:
			// Config-pull queries etc. — return empty data; the client logs a
			// warning per missing key and moves on (never fatal, never retried).
			io.WriteString(w, `{"data":{}}`)
		}
	}))
	t.Cleanup(f.server.Close)
	return f
}

// waitForBeat blocks until the fake server has received a heartbeat or the
// timeout elapses; returns true on a beat.
func (f *fakeThothOS) waitForBeat(timeout time.Duration) bool {
	select {
	case <-f.beat:
		return true
	case <-time.After(timeout):
		return false
	}
}

// shrinkHeartbeatInterval makes the session loop tick fast enough to observe
// within a test, restoring the production value on cleanup.
func shrinkHeartbeatInterval(t *testing.T, d time.Duration) {
	t.Helper()
	prev := defaultHeartbeatInterval
	defaultHeartbeatInterval = d
	t.Cleanup(func() { defaultHeartbeatInterval = prev })
}

// stopSessionOnCleanup guarantees the singleton session loop is cancelled and
// fully drained before the test's DB/server are torn down, so no straggler
// heartbeat races a closing resource and no loop leaks into the next test.
func stopSessionOnCleanup(t *testing.T) {
	t.Helper()
	t.Cleanup(func() {
		StopThothOSSession()
		sessionManager.waitStopped(2 * time.Second)
	})
}

// TestSettingsConnectStartsHeartbeat proves the fix for the P2 finding that the
// settings-connect flow registered the proxy but never started the heartbeat
// loop (only the boot path did), so the dashboard showed a frozen "online"
// proxy until a restart. registerProxyWithThothOS is the exact worker the
// settings /thothos/connect handler launches.
func TestSettingsConnectStartsHeartbeat(t *testing.T) {
	fake := newFakeThothOS(t)
	shrinkHeartbeatInterval(t, 25*time.Millisecond)

	db := newTestDB(t)
	srv := &server.Server{DB: db}
	// Register the session-stop cleanup AFTER newTestDB so it runs BEFORE the
	// DB is closed (t.Cleanup is LIFO): the loop is drained before its DB goes
	// away, so no straggler heartbeat races a closed handle.
	stopSessionOnCleanup(t)

	client := thothos.NewClient(fake.server.URL, "tk_test")
	if _, err := client.ValidateAPIKey(); err != nil {
		t.Fatalf("validate api key: %v", err)
	}

	// Run the settings-connect worker synchronously (the handler runs it as a
	// goroutine; behaviour is identical).
	registerProxyWithThothOS(client, &models.ThothOSConfig{
		URL:       fake.server.URL,
		APIKey:    "tk_test",
		ProxyName: "test-proxy",
	}, srv)

	if atomic.LoadInt32(&fake.registers) == 0 {
		t.Fatalf("registerProxy was never called by the settings-connect path")
	}
	if !ThothOSSessionActive() {
		t.Fatalf("session not active after settings-connect")
	}

	if !fake.waitForBeat(3 * time.Second) {
		t.Fatalf("no heartbeat received: settings-connect path did not start the heartbeat loop")
	}
}

// TestDisconnectCancelsHeartbeatAndClearsFallback proves the fix for the
// cosmetic-disconnect / mode-incoherence findings: disconnect must (1) cancel
// the live heartbeat loop and (2) delete the persisted fallbacks so a simulated
// restart cannot silently reconnect.
func TestDisconnectCancelsHeartbeatAndClearsFallback(t *testing.T) {
	fake := newFakeThothOS(t)
	shrinkHeartbeatInterval(t, 25*time.Millisecond)

	db := newTestDB(t)
	srv := &server.Server{DB: db}
	// Register session-stop AFTER newTestDB (LIFO) so the loop drains before
	// the DB closes.
	stopSessionOnCleanup(t)

	// Seed BOTH persisted fallbacks a restart's boot would use to auto-connect:
	// the MFA-login ProxyConfig row AND the settings-connect Settings config.
	if err := db.Create(&models.ProxyConfig{
		ThothOSURL: fake.server.URL,
		APIKey:     "tk_test",
		APIKeyID:   "k1",
		CompanyID:  "c1",
		UserID:     "u1",
		UserType:   "employee",
		ProxyName:  "test-proxy",
		IsActive:   true,
	}).Error; err != nil {
		t.Fatalf("seed ProxyConfig: %v", err)
	}
	if err := models.SetThothOSConfig(db, &models.ThothOSConfig{
		URL:       fake.server.URL,
		APIKey:    "tk_test",
		ProxyName: "test-proxy",
	}); err != nil {
		t.Fatalf("seed Settings config: %v", err)
	}

	client := thothos.NewClient(fake.server.URL, "tk_test")
	if _, err := client.ValidateAPIKey(); err != nil {
		t.Fatalf("validate api key: %v", err)
	}
	registerProxyWithThothOS(client, &models.ThothOSConfig{
		URL:       fake.server.URL,
		APIKey:    "tk_test",
		ProxyName: "test-proxy",
	}, srv)

	// The loop must actually be beating before we test that disconnect stops it.
	if !fake.waitForBeat(3 * time.Second) {
		t.Fatalf("no heartbeat before disconnect; cannot verify cancellation")
	}
	if !ThothOSSessionActive() {
		t.Fatalf("session not active after connect")
	}

	// Disconnect via the real handler.
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/settings/thothos/disconnect", nil)
	disconnectFromThothOS(srv)(c)
	if w.Code != http.StatusOK {
		t.Fatalf("disconnect status=%d body=%s", w.Code, w.Body.String())
	}

	// (1) Session cancelled.
	if ThothOSSessionActive() {
		t.Fatalf("session still active after disconnect")
	}
	// Wait for the loop goroutine to fully exit, then prove no further beats.
	sessionManager.waitStopped(2 * time.Second)
	before := atomic.LoadInt32(&fake.heartbeats)
	time.Sleep(150 * time.Millisecond) // several 25ms intervals; loop is gone → must stay flat
	if after := atomic.LoadInt32(&fake.heartbeats); after != before {
		t.Fatalf("heartbeats continued after disconnect: before=%d after=%d", before, after)
	}

	// (2) Simulated restart: boot config resolution must find NOTHING to
	// reconnect with. main.go reads GetThothOSConfig (Settings) then falls back
	// to LoadConfigOnStartup (ProxyConfig); both must be gone.
	if cfg, _ := LoadConfigOnStartup(db); cfg != nil {
		t.Fatalf("ProxyConfig fallback survived disconnect; a restart would silently reconnect")
	}
	if models.HasThothOSConfig(db) {
		t.Fatalf("Settings ThothOS config survived disconnect; a restart would silently reconnect")
	}

	// Mode coherence: disconnect leaves the box in standalone.
	if !middleware.IsStandaloneMode() {
		t.Fatalf("disconnect did not flip the process to standalone mode")
	}
}
