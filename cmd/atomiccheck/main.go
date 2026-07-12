// Command atomiccheck runs the atomicconsistency analyzer over the packages named
// on the command line, exiting non-zero if any struct field is accessed via
// sync/atomic in some places but plainly in others (a data race —
// atomic-consistency class).
//
// Usage (as wired into scripts/checks/atomic-field-consistency.sh and CI):
//
//	go run ./cmd/atomiccheck ./...
package main

import (
	"github.com/Technologies-Unlimited/Network-Proxy/internal/lint/atomicconsistency"
	"golang.org/x/tools/go/analysis/singlechecker"
)

func main() {
	singlechecker.Main(atomicconsistency.Analyzer)
}
