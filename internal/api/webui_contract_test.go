package api

// Web-UI contract gate (usability class detector).
//
// This test enforces two usability invariants across the ENTIRE
// template x route surface, derived from the live artifacts (the real gin
// router + the real HTML templates) so future pages/routes are covered
// automatically rather than pinned to today's specific bugs.
//
// PASS 1 — no dead internal links: every app-internal URL referenced by a
//   template (hx-get/post/put/delete, href, <form action>, fetch(), and
//   setAttribute('hx-*', ...)) must resolve to a registered route. Catches a
//   renamed/typo'd/removed route the moment a template still points at it
//   (e.g. dashboard's "/agents" button after the route became "/nodes").
//
// PASS 2 — htmx write forms must accept a real submit and return HTML: htmx
//   1.9.10 submits <form hx-post/hx-put> as application/x-www-form-urlencoded
//   (verified: encodeParamsForBody url-encodes the body regardless of any
//   htmx:configRequest Content-Type override). A handler that binds JSON-only
//   (ShouldBindJSON -> 400 on a urlencoded body) or answers an htmx swap target
//   with JSON instead of an HTML fragment produces a SILENT failure in the UI.
//   This pass replays exactly what htmx sends and asserts the response is not
//   4xx/5xx AND is text/html.
//
// Both passes fail RED with the full list of offending URLs/forms. Wired into
// the gate by being an ordinary _test.go: scripts/check.sh and CI both run
// `go test ./...`.

import (
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
)

// templatesDirRel is the templates directory relative to this package dir.
const templatesDirRel = "../../web/templates"

var (
	reTmplInterp  = regexp.MustCompile(`\$\{[^}]*\}`)
	reHxAttr      = regexp.MustCompile(`hx-(get|post|put|delete)\s*=\s*"([^"]*)"`)
	reHref        = regexp.MustCompile(`href\s*=\s*"([^"]*)"`)
	reFormAction  = regexp.MustCompile(`(?is)<form\b[^>]*\saction\s*=\s*"([^"]*)"`)
	reFetch       = regexp.MustCompile("fetch\\(\\s*[\"'`]([^\"'`]*)")
	reSetAttrHx   = regexp.MustCompile("setAttribute\\(\\s*[\"']hx-(get|post|put|delete)[\"']\\s*,\\s*[\"'`]([^\"'`]*)")
	reFormBlock   = regexp.MustCompile(`(?is)<form\b.*?</form>`)
	reFormID      = regexp.MustCompile(`id\s*=\s*"([^"]*)"`)
	reSelectBlock = regexp.MustCompile(`(?is)<select\b.*?</select>`)
	reInputTag    = regexp.MustCompile(`(?is)<input\b[^>]*>`)
	reTextareaTag = regexp.MustCompile(`(?is)<textarea\b[^>]*>`)
	reNameAttr    = regexp.MustCompile(`name\s*=\s*"([^"]*)"`)
	reTypeAttr    = regexp.MustCompile(`type\s*=\s*"([^"]*)"`)
	reValueAttr   = regexp.MustCompile(`value\s*=\s*"([^"]*)"`)
	reChecked     = regexp.MustCompile(`(?i)\bchecked\b`)
	reOptionValue = regexp.MustCompile(`(?is)<option[^>]*\svalue\s*=\s*"([^"]*)"`)
)

// normPath canonicalizes a URL path for comparison: strips query/fragment,
// collapses ${...} template interpolations and gin :param/*wildcard segments to
// a single ":param" placeholder, and trims a trailing slash.
func normPath(raw string) string {
	p := raw
	if i := strings.IndexAny(p, "?#"); i >= 0 {
		p = p[:i]
	}
	p = reTmplInterp.ReplaceAllString(p, ":param")
	segs := strings.Split(p, "/")
	for i, s := range segs {
		if strings.HasPrefix(s, ":") || strings.HasPrefix(s, "*") {
			segs[i] = ":param"
		}
	}
	p = strings.Join(segs, "/")
	if len(p) > 1 {
		p = strings.TrimRight(p, "/")
	}
	return p
}

// isInternalURL reports whether u is an app-internal route reference we can
// assert against the router (absolute path, not external, not a static asset).
func isInternalURL(u string) bool {
	if u == "" || strings.HasPrefix(u, "#") {
		return false
	}
	if strings.Contains(u, "://") || strings.HasPrefix(u, "//") {
		return false
	}
	if !strings.HasPrefix(u, "/") { // relative, or a bare ${...} expression
		return false
	}
	if strings.HasPrefix(u, "/static") {
		return false
	}
	return true
}

func newFullRouter(t *testing.T) (*gin.Engine, *server.Server) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	srv := &server.Server{DB: newTestDB(t)}
	RegisterRoutes(r, srv)
	return r, srv
}

// routeSets returns the registered routes as a method+path set (for sources
// whose method is statically known) and a path-only set (for fetch(), whose
// method lives in an options object we do not parse).
func routeSets(r *gin.Engine) (methodPath map[string]bool, pathOnly map[string]bool) {
	methodPath = map[string]bool{}
	pathOnly = map[string]bool{}
	for _, ri := range r.Routes() {
		np := normPath(ri.Path)
		methodPath[ri.Method+" "+np] = true
		pathOnly[np] = true
	}
	return
}

func templateFiles(t *testing.T) []string {
	t.Helper()
	files, err := filepath.Glob(filepath.Join(templatesDirRel, "*.html"))
	if err != nil {
		t.Fatalf("glob templates: %v", err)
	}
	if len(files) == 0 {
		t.Fatalf("no templates found under %s", templatesDirRel)
	}
	return files
}

// TestWebUINoDeadInternalLinks is PASS 1: every internal URL a template points
// at must resolve to a registered route.
func TestWebUINoDeadInternalLinks(t *testing.T) {
	r, _ := newFullRouter(t)
	methodPath, pathOnly := routeSets(r)

	type ref struct {
		file, method, url, norm string
		methodAware             bool
	}
	var refs []ref
	add := func(file, method, u string, methodAware bool) {
		if !isInternalURL(u) {
			return
		}
		refs = append(refs, ref{file: file, method: method, url: u, norm: normPath(u), methodAware: methodAware})
	}

	for _, f := range templateFiles(t) {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		content := string(b)
		base := filepath.Base(f)

		for _, m := range reHxAttr.FindAllStringSubmatch(content, -1) {
			add(base, strings.ToUpper(m[1]), m[2], true)
		}
		for _, m := range reSetAttrHx.FindAllStringSubmatch(content, -1) {
			add(base, strings.ToUpper(m[1]), m[2], true)
		}
		for _, m := range reHref.FindAllStringSubmatch(content, -1) {
			add(base, "GET", m[1], true)
		}
		for _, m := range reFormAction.FindAllStringSubmatch(content, -1) {
			add(base, "GET", m[1], true)
		}
		for _, m := range reFetch.FindAllStringSubmatch(content, -1) {
			add(base, "", m[1], false) // method not statically known -> path-only
		}
	}

	var dead []string
	for _, rf := range refs {
		ok := false
		if rf.methodAware {
			ok = methodPath[rf.method+" "+rf.norm]
		} else {
			ok = pathOnly[rf.norm]
		}
		if !ok {
			label := rf.method
			if label == "" {
				label = "fetch"
			}
			dead = append(dead, rf.file+": "+label+" "+rf.url+"  (normalized "+rf.norm+") -> no registered route")
		}
	}
	if len(dead) > 0 {
		sort.Strings(dead)
		t.Fatalf("dead internal link(s) referenced by templates but not registered in the router:\n  %s",
			strings.Join(dead, "\n  "))
	}
}

type htmxFormCase struct {
	file   string
	method string
	rawURL string
	norm   string
	fields url.Values
}

// formFieldValues synthesizes the name=value pairs htmx would send for a form
// block: explicit value="" attributes win, else a type-appropriate placeholder;
// unchecked checkboxes are omitted (browsers do not submit them); selects use
// their first option value.
func formFieldValues(block string) url.Values {
	vals := url.Values{}

	for _, m := range reSelectBlock.FindAllString(block, -1) {
		nm := reNameAttr.FindStringSubmatch(m)
		if nm == nil {
			continue
		}
		v := ""
		if ov := reOptionValue.FindStringSubmatch(m); ov != nil {
			v = ov[1]
		}
		vals.Set(nm[1], v)
	}

	for _, tag := range reInputTag.FindAllString(block, -1) {
		nm := reNameAttr.FindStringSubmatch(tag)
		if nm == nil {
			continue
		}
		typ := ""
		if tm := reTypeAttr.FindStringSubmatch(tag); tm != nil {
			typ = strings.ToLower(tm[1])
		}
		switch typ {
		case "submit", "button", "reset":
			continue
		case "checkbox":
			if reChecked.MatchString(tag) {
				v := "on"
				if vm := reValueAttr.FindStringSubmatch(tag); vm != nil && vm[1] != "" {
					v = vm[1]
				}
				vals.Set(nm[1], v)
			}
			continue
		}
		v := "probe-value"
		if vm := reValueAttr.FindStringSubmatch(tag); vm != nil && vm[1] != "" {
			v = vm[1]
		} else if typ == "number" {
			v = "1"
		}
		vals.Set(nm[1], v)
	}

	for _, tag := range reTextareaTag.FindAllString(block, -1) {
		nm := reNameAttr.FindStringSubmatch(tag)
		if nm == nil {
			continue
		}
		vals.Set(nm[1], "probe-value")
	}

	return vals
}

// discoverHtmxWriteForms finds every <form> with an hx-post/hx-put endpoint,
// resolving edit forms whose hx-put is set dynamically in JS via
// getElementById('<formid>').setAttribute('hx-put', `...`).
func discoverHtmxWriteForms(t *testing.T) []htmxFormCase {
	var cases []htmxFormCase
	for _, f := range templateFiles(t) {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		content := string(b)
		base := filepath.Base(f)

		for _, block := range reFormBlock.FindAllString(content, -1) {
			gt := strings.Index(block, ">")
			if gt < 0 {
				continue
			}
			openTag := block[:gt+1]

			var method, u string
			for _, hm := range reHxAttr.FindAllStringSubmatch(openTag, -1) {
				verb := strings.ToUpper(hm[1])
				if verb == "POST" || verb == "PUT" {
					method, u = verb, hm[2]
				}
			}
			if method == "" {
				continue // not an htmx write form
			}

			if u == "" { // dynamic endpoint set from JS by form id
				if idm := reFormID.FindStringSubmatch(openTag); idm != nil {
					re := regexp.MustCompile("getElementById\\(\\s*[\"']" +
						regexp.QuoteMeta(idm[1]) +
						"[\"']\\s*\\)\\.setAttribute\\(\\s*[\"']hx-(get|post|put|delete)[\"']\\s*,\\s*[\"'`]([^\"'`]*)")
					if sm := re.FindStringSubmatch(content); sm != nil {
						method, u = strings.ToUpper(sm[1]), sm[2]
					}
				}
			}
			if !isInternalURL(u) {
				continue
			}
			cases = append(cases, htmxFormCase{
				file:   base,
				method: method,
				rawURL: u,
				norm:   normPath(u),
				fields: formFieldValues(block),
			})
		}
	}
	return cases
}

// TestWebUIHtmxFormsReturnHTML is PASS 2: replay each htmx write form exactly
// as htmx submits it (url-encoded body) and assert a non-4xx/5xx text/html
// response.
func TestWebUIHtmxFormsReturnHTML(t *testing.T) {
	prev := middleware.IsStandaloneMode()
	middleware.SetStandaloneMode(true)
	t.Cleanup(func() { middleware.SetStandaloneMode(prev) })

	r, srv := newFullRouter(t)

	// Seed one of each resource that an edit form targets so its :param URL
	// resolves to a real record (an unknown id would legitimately 404).
	dev := models.Device{Hostname: "seed-host", IPAddress: "10.0.0.9", DeviceType: "server", Status: "unknown"}
	if err := srv.DB.Create(&dev).Error; err != nil {
		t.Fatalf("seed device: %v", err)
	}
	rule := models.AlertRule{Name: "seed-rule", Severity: "warning", Source: "icmp", Metric: "device_status", Condition: "eq", Threshold: "1"}
	if err := srv.DB.Create(&rule).Error; err != nil {
		t.Fatalf("seed alert rule: %v", err)
	}
	seedByPrefix := map[string]string{
		"/api/v1/devices/":     dev.ID,
		"/api/v1/alert-rules/": rule.ID,
	}

	cases := discoverHtmxWriteForms(t)
	if len(cases) == 0 {
		t.Fatal("no htmx write forms discovered — the extractor is broken (there are hx-post/hx-put forms in the templates)")
	}

	for _, fc := range cases {
		replay := fc.rawURL
		if strings.Contains(fc.norm, ":param") {
			matched := false
			for pref, id := range seedByPrefix {
				if strings.HasPrefix(fc.norm, pref) {
					replay = pref + id
					matched = true
					break
				}
			}
			if !matched {
				t.Errorf("%s: htmx form endpoint %s has a path param but no seed mapping — add its collection to seedByPrefix in this test",
					fc.file, fc.norm)
				continue
			}
		}

		req := httptest.NewRequest(fc.method, replay, strings.NewReader(fc.fields.Encode()))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("HX-Request", "true") // htmx sets this on every request
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		body := w.Body.String()
		if len(body) > 200 {
			body = body[:200] + "..."
		}
		if w.Code >= 400 {
			t.Errorf("%s: htmx %s %s -> %d; an htmx form submit (url-encoded body) must not 4xx/5xx. "+
				"Handler likely uses ShouldBindJSON. body=%s", fc.file, fc.method, replay, w.Code, body)
			continue
		}
		if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
			t.Errorf("%s: htmx %s %s -> Content-Type %q; an htmx swap target must receive an HTML fragment, not JSON. body=%s",
				fc.file, fc.method, replay, ct, body)
		}
	}
}
