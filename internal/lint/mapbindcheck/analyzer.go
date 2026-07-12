// Package mapbindcheck is a go/analysis Analyzer that catches an api-contract
// input-validation bug class: decoding an inbound HTTP request body straight
// into a Go map.
//
// The concrete defect this class produced (updateNode / updateScheduledTest):
//
//	var updates map[string]interface{}
//	c.ShouldBindJSON(&updates)          // client controls the KEYS
//	db.Model(&node).Updates(updates)    // keys become SQL column names
//
// A client typo — any key that is not a real column (e.g. "nickname",
// {"grpcPort":1} when the column is grpc_port) — is handed to GORM as a raw
// column name, builds invalid SQL, and the handler answers HTTP 500 with the
// raw SQLite "no such column: <key>" error, leaking the DB schema. An ordinary
// client mistake looks like a server crash. Even without a downstream
// .Updates(), a map destination silently ACCEPTS unknown keys, so a misspelled
// field is quietly dropped instead of rejected — the opposite of a typed struct
// with DisallowUnknownFields.
//
// The fix is always the same: bind into a TYPED struct (an explicit allowlist of
// editable fields), never a map. This analyzer makes the whole class impossible
// to reintroduce: it keys on the gin request-binding METHOD plus the RESOLVED
// TYPE of the destination argument (a map), so every current and FUTURE handler
// is covered with zero per-bug pinning. The runtime error-contract test can only
// pin the two known handlers (a random :id 404s before the buggy DB write is
// reached), so a newly-added map-binding handler would slip past it — this static
// gate closes that gap.
package mapbindcheck

import (
	"go/ast"
	"go/token"
	"go/types"
	"strings"

	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/analysis/passes/inspect"
	"golang.org/x/tools/go/ast/inspector"
)

// ginPkgPath is the import path of the gin package whose *Context exposes the
// request-body binding methods.
const ginPkgPath = "github.com/gin-gonic/gin"

// bindMethods are *gin.Context methods that decode the inbound REQUEST BODY into
// the caller-supplied destination. Binding any of these into a map means the
// client controls the key set. Query/header/uri binders are deliberately absent:
// this class is specifically about the request body flowing into a map that then
// becomes SQL column names or a silently-permissive partial update.
var bindMethods = map[string]bool{
	"ShouldBindJSON":     true,
	"BindJSON":           true,
	"ShouldBind":         true,
	"Bind":               true,
	"ShouldBindWith":     true,
	"BindWith":           true,
	"MustBindWith":       true,
	"ShouldBindBodyWith": true,
}

// Analyzer reports gin request-body binds whose destination is a map.
var Analyzer = &analysis.Analyzer{
	Name:     "mapbindcheck",
	Doc:      "reports an HTTP request body bound into a map instead of a typed struct (api-contract/input-validation class)",
	Requires: []*analysis.Analyzer{inspect.Analyzer},
	Run:      run,
}

func run(pass *analysis.Pass) (interface{}, error) {
	insp := pass.ResultOf[inspect.Analyzer].(*inspector.Inspector)

	insp.Preorder([]ast.Node{(*ast.CallExpr)(nil)}, func(n ast.Node) {
		call := n.(*ast.CallExpr)
		if isTestFile(pass, call.Pos()) {
			return
		}
		method, ok := ginBindCall(pass, call)
		if !ok {
			return
		}
		if len(call.Args) == 0 {
			return
		}
		if !destIsMap(pass, call.Args[0]) {
			return
		}
		pass.Reportf(call.Pos(),
			"request body bound via `.%s()` into a map — decode into a TYPED struct (an allowlist of editable fields); an unvalidated map lets a client typo become a raw SQL column name (HTTP 500 + schema leak) and silently accepts unknown keys (api-contract/input-validation class)",
			method)
	})

	return nil, nil
}

// ginBindCall reports whether call is one of the gin *Context request-body
// binding methods, returning the method name. Keying on the receiver type
// (*github.com/gin-gonic/gin.Context) — not just the method name — avoids
// false-positives on an unrelated type that happens to expose a Bind method.
func ginBindCall(pass *analysis.Pass, call *ast.CallExpr) (string, bool) {
	sel, ok := call.Fun.(*ast.SelectorExpr)
	if !ok {
		return "", false
	}
	name := sel.Sel.Name
	if !bindMethods[name] {
		return "", false
	}
	if !isGinContextPointer(pass.TypesInfo.TypeOf(sel.X)) {
		return "", false
	}
	return name, true
}

// destIsMap reports whether the binding destination expression resolves to a map
// (or a pointer to one — the usual `&m` form). A typed struct destination
// (`&payload`) is a *Struct underlying and is correctly NOT flagged.
func destIsMap(pass *analysis.Pass, arg ast.Expr) bool {
	t := pass.TypesInfo.TypeOf(arg)
	if t == nil {
		return false
	}
	t = types.Unalias(t)
	if ptr, ok := t.(*types.Pointer); ok {
		t = types.Unalias(ptr.Elem())
	}
	_, isMap := t.Underlying().(*types.Map)
	return isMap
}

// isGinContextPointer reports whether t is exactly *github.com/gin-gonic/gin.Context.
func isGinContextPointer(t types.Type) bool {
	if t == nil {
		return false
	}
	ptr, ok := types.Unalias(t).(*types.Pointer)
	if !ok {
		return false
	}
	named, ok := types.Unalias(ptr.Elem()).(*types.Named)
	if !ok {
		return false
	}
	obj := named.Obj()
	if obj == nil || obj.Pkg() == nil {
		return false
	}
	return obj.Pkg().Path() == ginPkgPath && obj.Name() == "Context"
}

// isTestFile reports whether pos lands in a _test.go file. The gate is scoped to
// production code, mirroring the sibling gormcheck analyzer: a map-bind in a test
// fixture is not a shipped handler defect.
func isTestFile(pass *analysis.Pass, pos token.Pos) bool {
	if f := pass.Fset.File(pos); f != nil {
		return strings.HasSuffix(f.Name(), "_test.go")
	}
	return false
}
