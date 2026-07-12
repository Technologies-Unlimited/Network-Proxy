package api

import (
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// isJSONRequest reports whether the caller is a JSON/API client (Content-Type:
// application/json) rather than an htmx/browser form post.
//
// htmx forms submit application/x-www-form-urlencoded and swap the response
// straight into the DOM, so they need an HTML fragment back; API clients (and
// the JSON test suite) send/expect JSON. Handlers branch on this so ONE
// endpoint serves both without the silent-400 mismatch that broke every
// hx-post/hx-put form (a url-encoded body hitting ShouldBindJSON).
func isJSONRequest(c *gin.Context) bool {
	return strings.Contains(c.ContentType(), "application/json")
}

// formInt parses an HTML form field as an int, falling back to def when the
// field is absent or non-numeric (e.g. an empty optional number input).
func formInt(raw string, def int) int {
	if v, err := strconv.Atoi(strings.TrimSpace(raw)); err == nil {
		return v
	}
	return def
}
