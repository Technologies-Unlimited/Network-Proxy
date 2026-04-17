package middleware

import (
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// SameOriginOnly is a defensive same-origin policy. By default it rejects
// any request whose Origin or Referer doesn't match the request's own host
// (the dashboard is served from the same Gin server it talks to, so this
// is the correct posture). Operators that need to allow specific external
// origins can set CORS_ALLOWED_ORIGINS to a comma-separated list, e.g.
//
//	CORS_ALLOWED_ORIGINS=https://internal.example.com,https://nm.example.com
//
// Requests from any of those origins will receive the appropriate
// Access-Control-Allow-Origin header and pass the policy.
func SameOriginOnly() gin.HandlerFunc {
	allowedRaw := os.Getenv("CORS_ALLOWED_ORIGINS")
	allowed := map[string]bool{}
	for _, o := range strings.Split(allowedRaw, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			allowed[o] = true
		}
	}

	return func(c *gin.Context) {
		// Preflight: respond directly when possible.
		origin := c.GetHeader("Origin")
		if origin == "" {
			// Same-origin GETs and HTMX swaps don't send Origin; allow.
			c.Next()
			return
		}

		// Build the canonical "self" origin for comparison.
		scheme := "http"
		if c.Request.TLS != nil {
			scheme = "https"
		}
		selfOrigin := scheme + "://" + c.Request.Host

		permitted := origin == selfOrigin || allowed[origin]
		if !permitted {
			// Last chance: maybe the configured allow-list contains the
			// Origin's host without scheme. Be lenient by parsing.
			if u, err := url.Parse(origin); err == nil && allowed[u.Host] {
				permitted = true
			}
		}

		if !permitted {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "cross-origin request blocked",
			})
			return
		}

		c.Header("Access-Control-Allow-Origin", origin)
		c.Header("Access-Control-Allow-Credentials", "true")
		c.Header("Vary", "Origin")
		if c.Request.Method == http.MethodOptions {
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Webhook-Signature, X-Webhook-Timestamp, X-Webhook-Id, HX-Request, HX-Target, HX-Trigger")
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
