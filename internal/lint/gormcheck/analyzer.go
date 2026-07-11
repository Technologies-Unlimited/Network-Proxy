// Package gormcheck is a go/analysis Analyzer that catches a silent-failure
// bug class that errcheck STRUCTURALLY CANNOT see: a discarded GORM terminal
// call.
//
// GORM's fluent API returns *gorm.DB (which carries the operation's .Error),
// NOT an error value. So a bare statement like
//
//	db.Save(&x)              // the returned *gorm.DB (and its .Error) is thrown away
//	db.Where(...).Delete(&x) // ditto — a failed delete is silently ignored
//
// is invisible to errcheck (nothing of type error is discarded), yet the write
// can fail and no one ever learns. This analyzer keys on the RESULT TYPE of the
// call (`*gorm.io/gorm.DB`) plus the terminal/finisher method name, so it
// auto-covers every current and future handler/service/model with zero
// per-bug pinning. It also flags `_ = db.Save(x)` so the class cannot be
// silenced by assigning to the blank identifier (mirrors the repo's no-`_ = err`
// rule).
package gormcheck

import (
	"go/ast"
	"go/types"

	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/analysis/passes/inspect"
	"golang.org/x/tools/go/ast/inspector"
)

// gormPkgPath is the import path of the GORM package whose *DB carries .Error.
const gormPkgPath = "gorm.io/gorm"

// finishers are GORM methods that RETURN *gorm.DB carrying the executed
// statement's .Error. Calling one as a bare statement — or assigning its result
// to _ — throws that *gorm.DB away, so the .Error is unreachable and a failed
// read/write is silent. Chain-builder methods (Where, Model, Order, Preload,
// Session, ...) are deliberately NOT here: they never execute, so discarding
// one is a different (dead-chain) class, not a swallowed DB error.
var finishers = map[string]bool{
	// writes
	"Create": true, "CreateInBatches": true, "Save": true,
	"Update": true, "Updates": true, "UpdateColumn": true, "UpdateColumns": true,
	"Delete": true, "Exec": true,
	// reads
	"First": true, "Take": true, "Last": true, "Find": true,
	"FindInBatches": true, "Scan": true, "Pluck": true, "Count": true,
	// read-or-write
	"FirstOrCreate": true, "FirstOrInit": true,
}

// Analyzer reports discarded *gorm.DB finisher results whose .Error is never
// checked.
var Analyzer = &analysis.Analyzer{
	Name:     "gormcheck",
	Doc:      "reports discarded *gorm.DB finisher results whose .Error is never checked (silent-failure class)",
	Requires: []*analysis.Analyzer{inspect.Analyzer},
	Run:      run,
}

func run(pass *analysis.Pass) (interface{}, error) {
	insp := pass.ResultOf[inspect.Analyzer].(*inspector.Inspector)

	// 1. Bare call statement: `db.Save(x)` — the whole *gorm.DB is dropped.
	insp.Preorder([]ast.Node{(*ast.ExprStmt)(nil)}, func(n ast.Node) {
		stmt := n.(*ast.ExprStmt)
		call, ok := stmt.X.(*ast.CallExpr)
		if !ok {
			return
		}
		if name, ok := gormFinisher(pass, call); ok {
			pass.Reportf(call.Pos(),
				"result of GORM `.%s()` is discarded; assign it and check .Error (silent-failure class)", name)
		}
	})

	// 2. Blank-assignment: `_ = db.Save(x)` — .Error is silenced, not checked.
	insp.Preorder([]ast.Node{(*ast.AssignStmt)(nil)}, func(n ast.Node) {
		assign := n.(*ast.AssignStmt)
		if len(assign.Rhs) != 1 {
			return
		}
		call, ok := assign.Rhs[0].(*ast.CallExpr)
		if !ok {
			return
		}
		for _, lhs := range assign.Lhs {
			id, ok := lhs.(*ast.Ident)
			if !ok || id.Name != "_" {
				return // a real binding — the caller can still check .Error
			}
		}
		if name, ok := gormFinisher(pass, call); ok {
			pass.Reportf(call.Pos(),
				"GORM `.%s()` result assigned to _ — .Error is silenced, not checked (silent-failure class)", name)
		}
	})

	return nil, nil
}

// gormFinisher reports whether call is a terminal GORM method whose result type
// is *gorm.io/gorm.DB (so its .Error would be discarded), returning the method
// name.
func gormFinisher(pass *analysis.Pass, call *ast.CallExpr) (string, bool) {
	sel, ok := call.Fun.(*ast.SelectorExpr)
	if !ok {
		return "", false
	}
	name := sel.Sel.Name
	if !finishers[name] {
		return "", false
	}
	if !isGormDBPointer(pass.TypesInfo.TypeOf(call)) {
		return "", false
	}
	return name, true
}

// isGormDBPointer reports whether t is exactly *gorm.io/gorm.DB. Keying on the
// type (not a variable name) is what makes the gate future-proof: any handle,
// however named, that resolves to *gorm.DB is covered.
func isGormDBPointer(t types.Type) bool {
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
	return obj.Pkg().Path() == gormPkgPath && obj.Name() == "DB"
}
