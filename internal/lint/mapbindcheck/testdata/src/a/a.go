package a

import "github.com/gin-gonic/gin"

// bad exercises every reported shape: a gin request body bound into a map. The
// analyzer MUST fire on each marked line; a future edit that weakens the gate
// fails these expectations (RED).
func bad(c *gin.Context) {
	var updates map[string]interface{}
	c.ShouldBindJSON(&updates) // want `request body bound via .+ into a map`

	var m2 map[string]any
	c.BindJSON(&m2) // want `request body bound via .+ into a map`

	var m3 map[string]string
	c.ShouldBind(&m3) // want `request body bound via .+ into a map`

	var m4 map[string]interface{}
	c.Bind(&m4) // want `request body bound via .+ into a map`

	var m5 map[string]interface{}
	c.MustBindWith(&m5, nil) // want `request body bound via .+ into a map`

	var m6 map[string]interface{}
	c.ShouldBindBodyWith(&m6, nil) // want `request body bound via .+ into a map`

	// a named map type still resolves to a *types.Map underlying.
	var m7 payloadMap
	c.ShouldBindJSON(&m7) // want `request body bound via .+ into a map`
}

// good is the CORRECT pattern. The analyzer MUST stay silent here, or the gate
// is a false-positive machine that developers will route around.
func good(c *gin.Context) {
	// typed struct destination — the required fix.
	var payload struct {
		Name     *string `json:"name"`
		Hostname *string `json:"hostname"`
	}
	c.ShouldBindJSON(&payload)

	// a typed request struct.
	var req updateRequest
	c.BindJSON(&req)

	// query binding into a map is out of class (not a request BODY / SQL vector).
	var q map[string]string
	c.ShouldBindQuery(&q)

	// a non-gin type with a Bind method must be ignored (keyed on receiver type).
	other := notAContext{}
	var m map[string]interface{}
	other.ShouldBindJSON(&m)
}

type payloadMap map[string]interface{}

type updateRequest struct {
	Name string `json:"name"`
}

type notAContext struct{}

func (notAContext) ShouldBindJSON(obj any) error { return nil }
