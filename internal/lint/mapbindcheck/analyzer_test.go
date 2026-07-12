package mapbindcheck_test

import (
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/lint/mapbindcheck"
	"golang.org/x/tools/go/analysis/analysistest"
)

// TestAnalyzer is the gate's own self-test: analysistest replays testdata/src/a
// and asserts the analyzer fires on EXACTLY the `// want`-marked lines (request
// bodies bound into a map) and nowhere else (typed-struct binds, non-gin Bind
// methods, and query binders). It fails RED if the detector stops catching the
// class OR starts a false positive.
func TestAnalyzer(t *testing.T) {
	analysistest.Run(t, analysistest.TestData(), mapbindcheck.Analyzer, "a")
}
