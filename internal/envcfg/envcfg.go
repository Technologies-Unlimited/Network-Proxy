// Package envcfg standardises how this codebase reads boolean env vars.
//
// Several call sites previously did `os.Getenv("FOO") == "true"`, others did
// `strings.EqualFold(os.Getenv("FOO"), "true")`. The mismatch caused a real
// bug: setting `UPDATER_ALLOW_UNVERIFIED=True` silently disabled checksum
// verification (the enforcement used EqualFold) but suppressed the startup
// warning (the warning used `== "true"`). One helper, one rule:
//
//	envcfg.Bool("FOO") -> true for any case-insensitive "true"/"1"/"yes"/"on"
package envcfg

import (
	"os"
	"strings"
)

// Bool reports whether the named env var is set to a truthy value.
// Recognised: "true", "1", "yes", "on" (case-insensitive). Anything else,
// including unset, returns false.
func Bool(name string) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(name)))
	switch v {
	case "true", "1", "yes", "on":
		return true
	}
	return false
}
