package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// newNodeTestRouter wires the node-registration route behind a middleware that
// injects the authenticated company from the X-Test-Company header — the same
// shape RequireAuth gives the real handler (standalone mode is off by default,
// so companyIDForWrite reads the injected companyId).
func newNodeTestRouter(db *gorm.DB) *gin.Engine {
	r := gin.New()
	r.Use(func(c *gin.Context) {
		if cid := c.GetHeader("X-Test-Company"); cid != "" {
			c.Set("companyId", cid)
		}
		c.Next()
	})
	srv := &server.Server{DB: db}
	r.POST("/api/v1/nodes", registerNode(srv))
	r.POST("/api/v1/scheduled-tests/:id/run", runScheduledTestNow(srv))
	return r
}

// doNodeJSON issues a JSON request with an authenticated-company header.
func doNodeJSON(t *testing.T, r *gin.Engine, method, path, company string, body interface{}) (*httptest.ResponseRecorder, map[string]interface{}) {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		reader = bytes.NewReader(b)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	if company != "" {
		req.Header.Set("X-Test-Company", company)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	out := map[string]interface{}{}
	if w.Body.Len() > 0 {
		_ = json.Unmarshal(w.Body.Bytes(), &out)
	}
	return w, out
}

// TestRegisterNodeStampsAuthCompanyIgnoringClientAssertion is the core Fix 5
// regression: a node registered in integrated mode must be stamped with the
// AUTHENTICATED company, not the client-asserted company_id in the body, so a
// created node is visible to the same company-scoped reads. Against the old
// handler (which persisted input.CompanyID verbatim) the stored company would
// be "attacker-controlled" and this fails.
func TestRegisterNodeStampsAuthCompanyIgnoringClientAssertion(t *testing.T) {
	db := newTestDB(t)
	r := newNodeTestRouter(db)

	w, _ := doNodeJSON(t, r, "POST", "/api/v1/nodes", "real-company", map[string]interface{}{
		"name":       "Node-Alpha",
		"hostname":   "alpha-host",
		"ip_address": "10.0.0.1",
		"company_id": "attacker-controlled",
		"grpc_port":  50051,
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("register status=%d want 201 body=%s", w.Code, w.Body.String())
	}

	var node models.Node
	if err := db.Where("name = ?", "Node-Alpha").First(&node).Error; err != nil {
		t.Fatalf("node not found: %v", err)
	}
	if node.CompanyID != "real-company" {
		t.Fatalf("node.CompanyID=%q want %q (client-asserted value must be ignored)", node.CompanyID, "real-company")
	}
}

// TestRegisterNodeRepairsEmptyCompanyOnReregistration proves the update path
// repairs a legacy row that was created before company stamping (empty
// company_id) instead of forking a duplicate.
func TestRegisterNodeRepairsEmptyCompanyOnReregistration(t *testing.T) {
	db := newTestDB(t)
	r := newNodeTestRouter(db)

	// Seed a legacy node with an empty company (pre-fix state).
	legacy := &models.Node{Name: "Node-Legacy", CompanyID: "", Hostname: "old", IPAddress: "10.0.0.9", GRPCPort: 50051, GRPCEnabled: true}
	if err := db.Create(legacy).Error; err != nil {
		t.Fatal(err)
	}

	w, _ := doNodeJSON(t, r, "POST", "/api/v1/nodes", "c1", map[string]interface{}{
		"name":       "Node-Legacy",
		"hostname":   "new",
		"ip_address": "10.0.0.9",
		"grpc_port":  50051,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("reregister status=%d want 200 (update) body=%s", w.Code, w.Body.String())
	}

	// Still exactly one live row, now repaired to c1.
	var nodes []models.Node
	if err := db.Where("name = ?", "Node-Legacy").Find(&nodes).Error; err != nil {
		t.Fatal(err)
	}
	if len(nodes) != 1 {
		t.Fatalf("got %d rows for Node-Legacy, want 1 (repair, not fork)", len(nodes))
	}
	if nodes[0].CompanyID != "c1" {
		t.Fatalf("company_id=%q want c1 (empty must be repaired)", nodes[0].CompanyID)
	}
	if nodes[0].Hostname != "new" {
		t.Fatalf("hostname=%q want new (connection info must update)", nodes[0].Hostname)
	}
}

// TestRegisterNodeSameNameDifferentCompaniesDoNotMerge proves identity is
// (company, name): two tenants each own a "Node-Alpha" as separate rows rather
// than the second silently overwriting the first (the old name-only lookup bug).
func TestRegisterNodeSameNameDifferentCompaniesDoNotMerge(t *testing.T) {
	db := newTestDB(t)
	r := newNodeTestRouter(db)

	w1, _ := doNodeJSON(t, r, "POST", "/api/v1/nodes", "company-a", map[string]interface{}{
		"name": "Node-Alpha", "hostname": "a", "ip_address": "10.0.0.1", "grpc_port": 50051,
	})
	if w1.Code != http.StatusCreated {
		t.Fatalf("company-a register status=%d want 201", w1.Code)
	}
	w2, _ := doNodeJSON(t, r, "POST", "/api/v1/nodes", "company-b", map[string]interface{}{
		"name": "Node-Alpha", "hostname": "b", "ip_address": "10.0.0.2", "grpc_port": 50051,
	})
	if w2.Code != http.StatusCreated {
		t.Fatalf("company-b register status=%d want 201 (must NOT merge into company-a's row)", w2.Code)
	}

	var count int64
	db.Model(&models.Node{}).Where("name = ?", "Node-Alpha").Count(&count)
	if count != 2 {
		t.Fatalf("Node-Alpha row count=%d want 2 (one per company)", count)
	}
	var a, b models.Node
	if err := db.Where("name = ? AND company_id = ?", "Node-Alpha", "company-a").First(&a).Error; err != nil {
		t.Fatalf("company-a's node missing: %v", err)
	}
	if err := db.Where("name = ? AND company_id = ?", "Node-Alpha", "company-b").First(&b).Error; err != nil {
		t.Fatalf("company-b's node missing: %v", err)
	}
	if a.IPAddress != "10.0.0.1" || b.IPAddress != "10.0.0.2" {
		t.Fatalf("cross-tenant clobber: a.ip=%q b.ip=%q", a.IPAddress, b.IPAddress)
	}
}

// TestRunScheduledTestNowRejectsOrphanedSchedule proves run-now no longer
// fabricates throughput: a schedule whose target node no longer exists returns
// an error instead of inventing an 80-120 Mbps "completed" result.
func TestRunScheduledTestNowRejectsOrphanedSchedule(t *testing.T) {
	db := newTestDB(t)
	r := newNodeTestRouter(db)

	// Source exists with gRPC; target ID points at a deleted/nonexistent node.
	src := &models.Node{Name: "src", CompanyID: "c1", Hostname: "s", IPAddress: "10.0.0.1", GRPCEnabled: true, GRPCPort: 50051}
	if err := db.Create(src).Error; err != nil {
		t.Fatal(err)
	}
	sched := &models.ScheduledTest{Name: "nightly", SourceNodeID: src.ID, TargetNodeID: "ghost-node", TestType: "bidirectional", Duration: 5}
	if err := db.Create(sched).Error; err != nil {
		t.Fatal(err)
	}

	w, _ := doNodeJSON(t, r, "POST", "/api/v1/scheduled-tests/"+sched.ID+"/run", "c1", nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("run-now on orphaned schedule status=%d want 400 (no fabricated result)", w.Code)
	}

	// No fabricated bandwidth result was persisted.
	var count int64
	db.Model(&models.BandwidthTestResult{}).Count(&count)
	if count != 0 {
		t.Fatalf("run-now created %d bandwidth results for an orphaned schedule; expected 0 (no fabrication)", count)
	}
}
