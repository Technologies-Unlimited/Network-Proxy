package api

// Error-contract class gate (api-contract usability category).
//
// This is a CLASS gate, not a pin of today's specific bugs: it enumerates the
// LIVE gin route registry (engine.Routes(), the exact surface main.go serves)
// and holds every /api handler to one uniform error contract. A newly-added
// route is covered the moment it is registered — no per-route maintenance.
//
// Invariants enforced against every /api/* route:
//
//  1. NEVER PANIC on malformed input. The engine is built WITHOUT gin.Recovery
//     precisely so a handler panic propagates and fails the test instead of
//     being masked as a 500 (production runs gin.Default(), which recovers — but
//     a crash-on-ordinary-input is still a usability defect we must catch here).
//
//  2. UNIFORM ERROR ENVELOPE. Any response with status >= 400 whose body is JSON
//     MUST carry a non-empty "error" string field. This is the finding that the
//     discovery endpoints violated (they reported failures under "message" with
//     no "error" key, so a generic REST client saw a blank message). It also
//     rejects any future {"success":false,"message":...}-only shape.
//
//  3. NO INPUT-TRIGGERED 500. A syntactically-invalid JSON body must be a 4xx,
//     never a 500. To avoid false-flagging routes that 500 for an unrelated,
//     input-independent reason (e.g. an uninitialised dependency), the check is
//     differential: a malformed body is flagged ONLY when a syntactically-VALID
//     empty body ("{}") to the same route does NOT also 500.
//
// A companion test (TestErrorContract_UpdateHandlersRejectUnknownColumns) seeds
// real rows and drives the two map-binding update handlers with an unknown
// column key — the surface the enumeration cannot reach (a random :id 404s
// before the DB write) — proving a client typo yields a clean 400, never a 500
// that leaks a raw SQL error.

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// pathParamRe matches gin path params (":id", "*action") for substitution.
var pathParamRe = regexp.MustCompile(`[:*][A-Za-z0-9_]+`)

// contractParamValue is a fixed, syntactically-valid-but-nonexistent id used to
// fill path params. It must not collide with any seeded row.
const contractParamValue = "11111111-1111-4111-8111-111111111111"

// buildContractEngine constructs the FULL real route surface exactly as main.go
// does (RegisterRoutes), minus HTML templates and the prod-only middleware, so
// engine.Routes() is the live registry.
//
// Standalone mode bypasses RequireAuth so every gated route is reachable; a nil
// global auth context makes the ThothOS-dependent handlers report "not
// connected" (503) instead of dialing the network. gin.New() is used WITHOUT
// Recovery so a panic fails the test.
func buildContractEngine(t *testing.T, db *gorm.DB) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)

	prevStandalone := middleware.IsStandaloneMode()
	prevAuth := middleware.GetGlobalAuthContext()
	middleware.SetStandaloneMode(true)
	middleware.SetGlobalAuthContext(nil)
	t.Cleanup(func() {
		middleware.SetStandaloneMode(prevStandalone)
		middleware.SetGlobalAuthContext(prevAuth)
	})

	engine := gin.New()
	RegisterRoutes(engine, &server.Server{DB: db})
	return engine
}

// contractResult is the outcome of one guarded request.
type contractResult struct {
	status   int
	ctype    string
	body     []byte
	panicked bool
	timedOut bool
}

// serveGuarded issues one request under a recover() guard and a hard timeout, so
// a handler that panics OR hangs on malformed input is reported, never crashes
// or wedges the test run.
func serveGuarded(engine *gin.Engine, method, path string, body []byte) contractResult {
	ch := make(chan contractResult, 1)
	go func() {
		var res contractResult
		defer func() {
			if r := recover(); r != nil {
				res.panicked = true
			}
			ch <- res
		}()
		var req *http.Request
		if body != nil {
			req = httptest.NewRequest(method, path, bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
		} else {
			req = httptest.NewRequest(method, path, nil)
		}
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		res.status = w.Code
		res.ctype = w.Header().Get("Content-Type")
		res.body = w.Body.Bytes()
	}()
	select {
	case res := <-ch:
		return res
	case <-time.After(10 * time.Second):
		return contractResult{timedOut: true}
	}
}

// hasNonEmptyErrorField reports whether a JSON object body carries a non-empty
// "error" field. A body that is not a JSON object (array/scalar) returns true so
// it is not falsely flagged — the envelope contract is about error OBJECTS.
func hasNonEmptyErrorField(body []byte) bool {
	var env struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(body, &env); err != nil {
		return true
	}
	return strings.TrimSpace(env.Error) != ""
}

func truncateBody(body []byte) string {
	s := strings.TrimSpace(string(body))
	if len(s) > 200 {
		return s[:200] + "…"
	}
	return s
}

// TestErrorContract_AllAPIRoutes is the enumerating class gate. It fails, naming
// the exact "METHOD /path", for any /api route that panics on malformed input,
// returns a >=400 JSON body without a non-empty "error" field, or 500s
// specifically because the JSON was malformed.
func TestErrorContract_AllAPIRoutes(t *testing.T) {
	engine := buildContractEngine(t, newTestDB(t))

	type input struct {
		name string
		body []byte
	}

	routes := engine.Routes()
	tested := 0
	for _, r := range routes {
		if !strings.HasPrefix(r.Path, "/api/") {
			continue // web-UI HTML pages are an intentional 200+HTML surface, not the REST error contract
		}
		tested++
		path := pathParamRe.ReplaceAllString(r.Path, contractParamValue)
		route := r.Method + " " + r.Path

		var inputs []input
		hasBody := r.Method == http.MethodPost || r.Method == http.MethodPut || r.Method == http.MethodPatch
		if hasBody {
			inputs = []input{
				{"malformed-json", []byte("{not json")},
				{"valid-empty-object", []byte("{}")},
				{"json-null", []byte("null")},
			}
		} else {
			inputs = []input{{"no-body", nil}}
		}

		statusByInput := make(map[string]int, len(inputs))
		for _, in := range inputs {
			res := serveGuarded(engine, r.Method, path, in.body)
			if res.panicked {
				t.Errorf("%s PANICS on %s input — a malformed request must never crash a handler", route, in.name)
				continue
			}
			if res.timedOut {
				t.Errorf("%s did not respond within 10s to %s input — possible hang on malformed input", route, in.name)
				continue
			}
			statusByInput[in.name] = res.status

			if res.status >= 400 && strings.Contains(res.ctype, "application/json") {
				if !hasNonEmptyErrorField(res.body) {
					t.Errorf("%s -> HTTP %d JSON error body has no non-empty \"error\" field (envelope violation); body=%s",
						route, res.status, truncateBody(res.body))
				}
			}
		}

		if hasBody {
			if statusByInput["malformed-json"] == http.StatusInternalServerError &&
				statusByInput["valid-empty-object"] != http.StatusInternalServerError {
				t.Errorf("%s returns HTTP 500 specifically on malformed JSON — a syntactically-invalid body must be a 4xx, not a server error",
					route)
			}
		}
	}

	if tested == 0 {
		t.Fatal("no /api routes were enumerated — the engine wiring is broken, the gate would be vacuous")
	}
	t.Logf("error-contract gate exercised %d /api routes", tested)
}

// TestErrorContract_UpdateHandlersRejectUnknownColumns drives the two map-binding
// update handlers with a real id and an unknown column key — the exact input the
// route enumeration cannot reach. A client typo must yield a clean 400 with an
// error envelope, never a 500 that leaks the raw SQLite "no such column" error.
func TestErrorContract_UpdateHandlersRejectUnknownColumns(t *testing.T) {
	db := newTestDB(t)

	node := &models.Node{ID: "contract-node", CompanyID: "contract-co", Name: "n1", Hostname: "h1", IPAddress: "10.0.0.1"}
	if err := db.Create(node).Error; err != nil {
		t.Fatalf("seed node: %v", err)
	}
	st := &models.ScheduledTest{ID: "contract-st", SourceNodeID: node.ID, TargetNodeID: node.ID, Name: "s1"}
	if err := db.Create(st).Error; err != nil {
		t.Fatalf("seed scheduled test: %v", err)
	}

	engine := buildContractEngine(t, db)

	cases := []struct {
		name string
		path string
	}{
		{"updateNode", "/api/v1/nodes/" + node.ID},
		{"updateScheduledTest", "/api/v1/scheduled-tests/" + st.ID},
	}

	for _, tc := range cases {
		res := serveGuarded(engine, http.MethodPut, tc.path, []byte(`{"totally_not_a_column":1}`))
		if res.panicked || res.timedOut {
			t.Errorf("PUT %s (%s) panicked/hung on an unknown-field body", tc.path, tc.name)
			continue
		}
		if res.status == http.StatusInternalServerError {
			t.Errorf("PUT %s (%s): an unknown field returns HTTP 500 — a client typo must be a 400, not a server error; body=%s",
				tc.path, tc.name, truncateBody(res.body))
		}
		if res.status >= 400 && strings.Contains(res.ctype, "application/json") && !hasNonEmptyErrorField(res.body) {
			t.Errorf("PUT %s (%s): error response missing non-empty \"error\" field; body=%s",
				tc.path, tc.name, truncateBody(res.body))
		}
		if b := strings.ToLower(string(res.body)); strings.Contains(b, "no such column") || strings.Contains(b, "syntax error") {
			t.Errorf("PUT %s (%s): raw DB/SQL error leaked to the client; body=%s",
				tc.path, tc.name, truncateBody(res.body))
		}
	}
}
