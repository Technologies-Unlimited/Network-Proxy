package api

import (
	"net/http"
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// newOIDReadRouter wires the REAL production OID/template read handlers so the
// soft-delete guard below exercises the exact query paths that feed the /api/v1
// OID list and the SNMP-template (polling) OID association — not a
// re-implemented query. If a future edit adds .Unscoped() (or a raw scan) to any
// of these callsites, a soft-deleted OID would leak back into polling / the API
// and this router's assertions fail.
func newOIDReadRouter(db *gorm.DB) *gin.Engine {
	r := gin.New()
	srv := &server.Server{DB: db}
	r.GET("/api/v1/snmp/oids", listOIDs(srv))
	r.GET("/api/v1/snmp/templates", listSNMPTemplates(srv))
	r.GET("/api/v1/snmp/templates/:id", getSNMPTemplate(srv))
	return r
}

// assertNoOIDNamed fails if a JSON OID list (Go field names, gin marshals with
// no json tags) contains an OID with the given Name.
func assertNoOIDNamed(t *testing.T, raw interface{}, name, where string) {
	t.Helper()
	list, _ := raw.([]interface{})
	for _, item := range list {
		m, _ := item.(map[string]interface{})
		if m == nil {
			continue
		}
		if m["Name"] == name || m["name"] == name {
			t.Errorf("%s returned soft-deleted OID %q", where, name)
		}
	}
}

// TestSoftDeletedOIDIsNotResurrectedIntoPollingOrList pins the invariant that a
// soft-deleted OID (models.OID carries gorm.DeletedAt, and reconcileOIDs relies
// on gorm soft-delete to REAP upstream-removed rows) is EXCLUDED from every read
// path that would otherwise put it back into SNMP polling or an API list/push-up:
//
//   - the /api/v1 OID list (listOIDs -> db.Find),
//   - the SNMP-template OID association the walker polls
//     (getSNMPTemplate / listSNMPTemplates -> db.Preload("OIDs")),
//   - the reconcileOIDs local read (db.Where(&OID{CompanyID}).Find).
//
// The delete-propagation fix (dbc2f65) is only REAL while every consumer honours
// the soft-delete: a soft-deleted OID leaves its many2many join-table row in
// place, so any Unscoped()/raw read at these callsites would resurrect the ghost
// into polling. This test asserts the current correct behaviour and fails the
// moment a resurrection vector is introduced — the regression wall RESIDUAL F
// asked for.
func TestSoftDeletedOIDIsNotResurrectedIntoPollingOrList(t *testing.T) {
	db := newTestDB(t)

	// Seed a template with two OIDs associated via the many2many join table.
	tmpl := models.SNMPTemplate{CompanyID: "c1", Name: "core", Version: "v2c"}
	if err := db.Create(&tmpl).Error; err != nil {
		t.Fatalf("seed template: %v", err)
	}
	live := models.OID{CompanyID: "c1", OID: "1.3.6.1.2.1.1.3.0", Name: "liveOID"}
	ghost := models.OID{CompanyID: "c1", ThothOSID: "oid-ghost", OID: "1.3.6.1.2.1.2.2.1.10", Name: "ghostOID"}
	if err := db.Create(&live).Error; err != nil {
		t.Fatalf("seed live oid: %v", err)
	}
	if err := db.Create(&ghost).Error; err != nil {
		t.Fatalf("seed ghost oid: %v", err)
	}
	if err := db.Model(&tmpl).Association("OIDs").Append(&live, &ghost); err != nil {
		t.Fatalf("associate oids with template: %v", err)
	}

	// Soft-delete the ghost. models.OID has gorm.DeletedAt, so this sets
	// deleted_at and MUST hide the row from every normal query — while the
	// join-table row survives, which is exactly what makes an Unscoped()
	// association load able to bring the ghost back.
	if err := db.Delete(&ghost).Error; err != nil {
		t.Fatalf("soft-delete ghost oid: %v", err)
	}

	r := newOIDReadRouter(db)

	// (1) /api/v1 OID list must not surface the soft-deleted OID.
	w, body := doJSON(t, r, "GET", "/api/v1/snmp/oids", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("list oids status=%d body=%s", w.Code, w.Body.String())
	}
	if got := body["count"]; got != float64(1) {
		t.Errorf("listOIDs count=%v want 1 (soft-deleted OID must not be listed)", got)
	}
	assertNoOIDNamed(t, body["oids"], "ghostOID", "listOIDs")

	// (2) SNMP-template OID association (the set the walker iterates in pollDevice)
	// must exclude the soft-deleted OID, or a down-synced delete never stops the
	// poll.
	w, body = doJSON(t, r, "GET", "/api/v1/snmp/templates/"+tmpl.ID, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("get template status=%d body=%s", w.Code, w.Body.String())
	}
	tmplBody, _ := body["template"].(map[string]interface{})
	if tmplBody == nil {
		t.Fatalf("no template in response: %v", body)
	}
	oids, _ := tmplBody["OIDs"].([]interface{})
	if len(oids) != 1 {
		t.Errorf("template.OIDs len=%d want 1 (soft-deleted OID must not be polled)", len(oids))
	}
	assertNoOIDNamed(t, tmplBody["OIDs"], "ghostOID", "getSNMPTemplate")

	// (3) reconcileOIDs local read must not see the soft-deleted row either — a
	// normal Find(&OID{CompanyID}) is what decides adopt/update/delete and would
	// feed any push-up. This mirrors the exact production query in reconcileOIDs.
	var local []models.OID
	if err := db.Where(&models.OID{CompanyID: "c1"}).Find(&local).Error; err != nil {
		t.Fatalf("reconcile local read: %v", err)
	}
	for _, o := range local {
		if o.ThothOSID == "oid-ghost" || o.Name == "ghostOID" {
			t.Errorf("reconcile local read resurrected soft-deleted OID: %+v", o)
		}
	}
	if len(local) != 1 {
		t.Errorf("reconcile local read len=%d want 1 (only the live OID survives)", len(local))
	}
}
