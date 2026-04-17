package api

import (
	"strconv"

	"github.com/gin-gonic/gin"
)

// Pagination defaults. The previous code did `srv.DB.Find(&nodes)` with no
// limit, so a deployment with thousands of devices would render the whole
// table on every dashboard refresh and OOM the server.
const (
	defaultPageSize = 100
	maxPageSize     = 1000
)

// Page extracts (limit, offset) from `?page=` and `?page_size=` query
// params, applying defaults and clamping to a sensible upper bound.
//
// Always returns a valid (limit > 0, offset >= 0) pair so handlers can use
// the result directly with GORM `.Limit(...).Offset(...)`.
func Page(c *gin.Context) (limit int, offset int) {
	limit = defaultPageSize
	if v := c.Query("page_size"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > maxPageSize {
		limit = maxPageSize
	}

	page := 1
	if v := c.Query("page"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			page = n
		}
	}
	offset = (page - 1) * limit
	return limit, offset
}
