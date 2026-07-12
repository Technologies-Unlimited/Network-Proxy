// Package atomicconsistency is a go/analysis Analyzer that catches a concurrency
// data-race class the Go race detector only sees when a test happens to force the
// read/write windows to overlap: a struct field that is accessed through
// sync/atomic in SOME places but read or written PLAINLY in others.
//
// The concrete defect this class produced (internal/grpc/bandwidth.go
// BandwidthTest.BytesSent / BytesReceived):
//
//	atomic.AddInt64(&test.BytesSent, n)          // writer (streaming RPC handler)
//	...
//	uploadMbps = float64(test.BytesSent*8) / ...  // reader (GetTestStatus): PLAIN read
//
// A non-atomic read concurrent with an atomic write is undefined behavior per the
// Go memory model. On the node's bandwidth server the writer runs in the
// streaming handler while finishTest / GetTestStatus / GetTestResults read the
// same counter plainly from other goroutines — the operator can see a torn or
// stale Mbps/bytes readout, and `go test -race` flags it the moment a test drives
// the overlap. The existing test does NOT drive that overlap (it reads the
// counters after the stream closes), so -race was green despite the bug: a
// false-safety gap. This static analyzer closes it deterministically.
//
// The fix is always the same: make every access consistent — read the field with
// atomic.LoadInt64 (matching the atomic writer), or drop atomics and guard every
// access with the same mutex. This analyzer keys on the FIELD OBJECT (a
// *types.Var) that is ever passed by address to a sync/atomic function, then
// reports every plain selector access of that same field object, so every current
// AND future struct is covered with zero per-bug pinning. Cross-package coverage
// is provided via an exported object fact, so a field used atomically in its
// defining package and read plainly by an importer is caught too.
package atomicconsistency

import (
	"go/ast"
	"go/token"
	"go/types"
	"strings"

	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/analysis/passes/inspect"
	"golang.org/x/tools/go/ast/inspector"
)

// atomicPkgPath is the standard-library package whose functions perform atomic
// memory operations on the pointed-to word.
const atomicPkgPath = "sync/atomic"

// atomicFieldFact marks a struct field (a *types.Var) that is accessed through
// sync/atomic somewhere. Exporting it as an object fact lets an importing package
// know the field must only be touched atomically, so cross-package mixed access
// is caught, not just same-package.
type atomicFieldFact struct{}

func (*atomicFieldFact) AFact() {}

func (*atomicFieldFact) String() string { return "atomic-accessed field" }

// Analyzer reports struct fields that are accessed both atomically (via
// sync/atomic) and non-atomically, which is a data race.
var Analyzer = &analysis.Analyzer{
	Name:      "atomicconsistency",
	Doc:       "reports a struct field accessed via sync/atomic in some places but plainly in others (a data race — atomic-consistency class)",
	Requires:  []*analysis.Analyzer{inspect.Analyzer},
	FactTypes: []analysis.Fact{(*atomicFieldFact)(nil)},
	Run:       run,
}

func run(pass *analysis.Pass) (interface{}, error) {
	insp := pass.ResultOf[inspect.Analyzer].(*inspector.Inspector)

	// atomicSels are the selector nodes that ARE the &x.Field argument of an
	// atomic call — those are the legitimate atomic accesses and must never be
	// flagged as "plain".
	atomicSels := map[*ast.SelectorExpr]bool{}
	// localAtomicFields is the set of field objects accessed atomically in THIS
	// package. Combined with imported facts, it is the full "must be atomic" set.
	localAtomicFields := map[types.Object]bool{}

	// Pass 1: collect every field passed by address to a sync/atomic function.
	insp.Preorder([]ast.Node{(*ast.CallExpr)(nil)}, func(n ast.Node) {
		call := n.(*ast.CallExpr)
		if !isAtomicCall(pass, call) {
			return
		}
		for _, arg := range call.Args {
			sel := addrSelector(arg)
			if sel == nil {
				continue
			}
			obj := fieldObject(pass, sel)
			if obj == nil {
				continue
			}
			atomicSels[sel] = true
			localAtomicFields[obj] = true
			// Only the defining package may export a fact about the object.
			if obj.Pkg() != nil && obj.Pkg() == pass.Pkg {
				pass.ExportObjectFact(obj, &atomicFieldFact{})
			}
		}
	})

	// Pass 2: flag every PLAIN selector access of a field that is (locally or via
	// an imported fact) known to be accessed atomically.
	insp.Preorder([]ast.Node{(*ast.SelectorExpr)(nil)}, func(n ast.Node) {
		sel := n.(*ast.SelectorExpr)
		if isTestFile(pass, sel.Pos()) {
			return
		}
		if atomicSels[sel] {
			return // this selector IS the atomic access — allowed
		}
		obj := fieldObject(pass, sel)
		if obj == nil {
			return
		}
		if !isAtomicField(pass, obj, localAtomicFields) {
			return
		}
		pass.Reportf(sel.Pos(),
			"field %s is accessed via sync/atomic elsewhere but accessed non-atomically here — read it with atomic.Load* (matching the atomic writer) or guard every access with the same mutex; a mixed atomic/plain access is a data race (atomic-consistency class)",
			obj.Name())
	})

	return nil, nil
}

// isAtomicCall reports whether call invokes a function from sync/atomic. Keying
// on the resolved function's package (not the bare name) avoids matching a local
// helper that happens to be named AddInt64.
func isAtomicCall(pass *analysis.Pass, call *ast.CallExpr) bool {
	sel, ok := call.Fun.(*ast.SelectorExpr)
	if !ok {
		return false
	}
	fn, ok := pass.TypesInfo.Uses[sel.Sel].(*types.Func)
	if !ok {
		return false
	}
	pkg := fn.Pkg()
	return pkg != nil && pkg.Path() == atomicPkgPath
}

// addrSelector returns the selector inside an &x.Field expression, or nil. Atomic
// functions take a pointer to the word (e.g. atomic.AddInt64(&x.Field, n)), so the
// atomic access always appears as the address of a field selector.
func addrSelector(arg ast.Expr) *ast.SelectorExpr {
	unary, ok := arg.(*ast.UnaryExpr)
	if !ok || unary.Op != token.AND {
		return nil
	}
	sel, ok := unary.X.(*ast.SelectorExpr)
	if !ok {
		return nil
	}
	return sel
}

// fieldObject resolves sel to the STRUCT FIELD it selects, or nil if the selector
// is not a field (a method, a package member, etc.). Keying on the field object —
// not the field name — is what makes the gate precise: two structs may each have a
// field named "State" and only the atomically-accessed one is constrained.
func fieldObject(pass *analysis.Pass, sel *ast.SelectorExpr) types.Object {
	obj := pass.TypesInfo.ObjectOf(sel.Sel)
	if obj == nil {
		return nil
	}
	if v, ok := obj.(*types.Var); ok && v.IsField() {
		return v
	}
	return nil
}

// isAtomicField reports whether obj is constrained to atomic-only access, either
// because this package accessed it atomically (local set) or because its defining
// package exported that fact.
func isAtomicField(pass *analysis.Pass, obj types.Object, local map[types.Object]bool) bool {
	if local[obj] {
		return true
	}
	var fact atomicFieldFact
	return pass.ImportObjectFact(obj, &fact)
}

// isTestFile reports whether pos lands in a _test.go file. Reporting is scoped to
// production code, matching the sibling gormcheck/mapbindcheck gates: a mixed
// access in a test fixture is not a shipped defect. Atomic USAGE is still
// collected everywhere, so a test that touches a production field atomically does
// not hide a plain production access.
func isTestFile(pass *analysis.Pass, pos token.Pos) bool {
	if f := pass.Fset.File(pos); f != nil {
		return strings.HasSuffix(f.Name(), "_test.go")
	}
	return false
}
