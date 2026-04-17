package api

import (
	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// scopeByCompany applies a `WHERE company_id = ?` filter to db when the
// request has an authenticated company context. In standalone mode (no
// auth context) it returns the query unchanged so single-tenant
// deployments still see everything — that's the point of standalone mode.
//
// This fixes the cross-tenant data leak in listAlerts/listDevices/listNodes
// where queries used to return *every* row regardless of which company the
// caller belonged to.
func scopeByCompany(c *gin.Context, db *gorm.DB) *gorm.DB {
	if middleware.IsStandaloneMode() {
		return db
	}
	companyID := middleware.GetCompanyID(c)
	if companyID == "" {
		// Authenticated but no company on the auth context — refuse to
		// match anything rather than silently returning all rows.
		return db.Where("1 = 0")
	}
	return db.Where("company_id = ?", companyID)
}

// scopeByNodeOwnership filters NodePeer / BandwidthTestResult / similar
// records to those whose source_node_id belongs to a node owned by the
// caller's company. Standalone mode is a no-op.
func scopeByNodeOwnership(c *gin.Context, db *gorm.DB) *gorm.DB {
	if middleware.IsStandaloneMode() {
		return db
	}
	companyID := middleware.GetCompanyID(c)
	if companyID == "" {
		return db.Where("1 = 0")
	}
	// nodes.company_id is the source of truth; a peer/test row is in
	// scope when EITHER the source or target node belongs to the caller.
	return db.Where(
		"source_node_id IN (SELECT id FROM nodes WHERE company_id = ?) OR "+
			"target_node_id IN (SELECT id FROM nodes WHERE company_id = ?)",
		companyID, companyID,
	)
}
