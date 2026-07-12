// Command mapbindcheck runs the mapbindcheck analyzer over the packages named on
// the command line, exiting non-zero if any HTTP request body is bound into a
// map (api-contract/input-validation class).
//
// Usage (as wired into scripts/checks/map-bind-injection.sh and therefore CI):
//
//	go run ./cmd/mapbindcheck ./...
package main

import (
	"github.com/Technologies-Unlimited/Network-Proxy/internal/lint/mapbindcheck"
	"golang.org/x/tools/go/analysis/singlechecker"
)

func main() {
	singlechecker.Main(mapbindcheck.Analyzer)
}
