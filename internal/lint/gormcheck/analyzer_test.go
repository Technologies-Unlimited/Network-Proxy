package gormcheck_test

import (
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/lint/gormcheck"
	"golang.org/x/tools/go/analysis/analysistest"
)

// TestAnalyzer is the gate's own self-test: analysistest replays testdata/src/a
// and asserts the analyzer fires on EXACTLY the `// want`-marked lines (the bug
// shapes) and nowhere else (the correct `.Error`-checked pattern). It fails RED
// if the detector stops catching the class OR starts a false positive.
func TestAnalyzer(t *testing.T) {
	analysistest.Run(t, analysistest.TestData(), gormcheck.Analyzer, "a")
}
