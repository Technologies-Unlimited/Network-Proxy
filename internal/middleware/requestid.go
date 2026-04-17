package middleware

import (
	"crypto/rand"
	"encoding/hex"

	"github.com/gin-gonic/gin"
)

// requestIDHeader is the canonical header name we read and write.
const requestIDHeader = "X-Request-ID"

// RequestID injects an X-Request-ID into every request (preserving any
// inbound value), echoes it on the response, and stores it in the gin
// context so downstream loggers can pick it up. Without this, correlating
// a slow handler with the DB call it spawned is guesswork.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader(requestIDHeader)
		if id == "" {
			id = newRequestID()
		}
		c.Set("requestID", id)
		c.Writer.Header().Set(requestIDHeader, id)
		c.Next()
	}
}

// GetRequestID extracts the request ID from the gin context; "" if unset.
func GetRequestID(c *gin.Context) string {
	if v, ok := c.Get("requestID"); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func newRequestID() string {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "req-?"
	}
	return hex.EncodeToString(b[:])
}
