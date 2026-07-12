// Package gin is a minimal stub of github.com/gin-gonic/gin for analysistest:
// just enough of *Context's request-body binding surface for the analyzer's
// type check to fire exactly as it does against the real dependency.
package gin

// Context mirrors gin.Context. Only the request-body binding methods the
// analyzer keys on are present; each takes the caller's destination as `any`,
// exactly like the real signatures, so the analyzer resolves the argument type.
type Context struct{}

func (c *Context) ShouldBindJSON(obj any) error              { return nil }
func (c *Context) BindJSON(obj any) error                    { return nil }
func (c *Context) ShouldBind(obj any) error                  { return nil }
func (c *Context) Bind(obj any) error                        { return nil }
func (c *Context) ShouldBindWith(obj any, b any) error       { return nil }
func (c *Context) BindWith(obj any, b any) error             { return nil }
func (c *Context) MustBindWith(obj any, b any) error         { return nil }
func (c *Context) ShouldBindBodyWith(obj any, bb any) error  { return nil }

// ShouldBindQuery is a NON-body binder — the analyzer must ignore it even with a
// map destination (query strings are flat and not a SQL-column-injection vector
// via .Updates()).
func (c *Context) ShouldBindQuery(obj any) error { return nil }
