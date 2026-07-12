package atomicconsistency_test

import (
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/lint/atomicconsistency"
	"golang.org/x/tools/go/analysis/analysistest"
)

// TestAnalyzer is the gate's own self-test: analysistest replays testdata/src/a
// and asserts the analyzer fires on EXACTLY the `// want`-marked lines (plain
// reads/writes of a field that is accessed atomically elsewhere) and nowhere else
// (the atomic accesses themselves, and a field that is never atomic). It fails RED
// if the detector stops catching the class OR starts a false positive.
func TestAnalyzer(t *testing.T) {
	analysistest.Run(t, analysistest.TestData(), atomicconsistency.Analyzer, "a")
}
