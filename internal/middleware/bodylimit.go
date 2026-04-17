package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// MaxBodyBytes caps the request body. Sized for the largest expected
// payload: a ThothOS config.sync webhook can carry several hundred SNMP /
// ICMP templates. 10 MiB is comfortable headroom; anything over that is
// almost certainly hostile or a configuration error.
const MaxBodyBytes = 10 << 20 // 10 MiB

// BodyLimit caps c.Request.Body at maxBytes. Reads beyond the cap return
// "http: request body too large" instead of allowing an attacker to stream
// arbitrary bytes through io.ReadAll.
func BodyLimit(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		}
		c.Next()
	}
}
