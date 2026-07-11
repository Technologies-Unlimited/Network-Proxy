// Command gormcheck runs the gormcheck analyzer over the packages named on the
// command line, exiting non-zero if any discarded-GORM-error is found.
//
// Usage (as wired into scripts/checks/gorm-error.sh and therefore CI):
//
//	go run ./cmd/gormcheck ./...
package main

import (
	"github.com/Technologies-Unlimited/Network-Proxy/internal/lint/gormcheck"
	"golang.org/x/tools/go/analysis/singlechecker"
)

func main() {
	singlechecker.Main(gormcheck.Analyzer)
}
