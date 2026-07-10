package api

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// newTestDB builds an isolated, migrated SQLite database in a temp dir.
func newTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := filepath.Join(t.TempDir(), "test.db")
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(
		&models.Device{}, &models.Node{}, &models.NodePeer{},
		&models.BandwidthTestResult{}, &models.ScheduledTest{},
		&models.SNMPTemplate{}, &models.OID{}, &models.Alert{},
		&models.AlertRule{}, &models.ProxyConfig{}, &models.Settings{},
	); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	// Close the SQLite handle before t.TempDir's RemoveAll runs (cleanups
	// fire LIFO, and this is registered after TempDir's), otherwise Windows
	// refuses to delete the still-open .db file.
	t.Cleanup(func() {
		if sqlDB, err := db.DB(); err == nil {
			sqlDB.Close()
		}
	})
	return db
}

func newDBRouter(db *gorm.DB) *gin.Engine {
	r := gin.New()
	// Inject tenant context from a test header so scopeByCompany has a
	// company to filter on (standalone mode is off by default).
	r.Use(func(c *gin.Context) {
		if cid := c.GetHeader("X-Test-Company"); cid != "" {
			c.Set("companyId", cid)
		}
		c.Next()
	})
	srv := &server.Server{DB: db}
	d := r.Group("/api/v1/devices")
	d.GET("", listDevices(srv))
	d.POST("", createDevice(srv))
	d.GET("/:id", getDevice(srv))
	d.PUT("/:id", updateDevice(srv))
	d.DELETE("/:id", deleteDevice(srv))

	bt := r.Group("/api/v1/bandwidth-tests")
	bt.POST("/start", startBandwidthTest(srv))
	return r
}

func TestDeviceCRUD(t *testing.T) {
	r := newDBRouter(newTestDB(t))

	// CREATE
	w, body := doJSON(t, r, "POST", "/api/v1/devices", map[string]interface{}{
		"CompanyID":  "c1",
		"Hostname":   "router1",
		"IPAddress":  "10.0.0.1",
		"DeviceType": "router",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", w.Code, w.Body.String())
	}
	dev := body["device"].(map[string]interface{})
	id, _ := dev["ID"].(string)
	if id == "" {
		// JSON uses Go field names; ID may serialize as "ID"
		id, _ = dev["id"].(string)
	}
	if id == "" {
		t.Fatalf("no device id in response: %v", dev)
	}

	// READ
	w, body = doJSON(t, r, "GET", "/api/v1/devices/"+id, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("get status=%d", w.Code)
	}
	got := body["device"].(map[string]interface{})
	if got["Hostname"] != "router1" {
		t.Errorf("hostname=%v want router1", got["Hostname"])
	}

	// UPDATE
	w, _ = doJSON(t, r, "PUT", "/api/v1/devices/"+id, map[string]interface{}{
		"Hostname":  "router1-renamed",
		"IPAddress": "10.0.0.1",
		"CompanyID": "c1",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("update status=%d body=%s", w.Code, w.Body.String())
	}

	// DELETE
	w, _ = doJSON(t, r, "DELETE", "/api/v1/devices/"+id, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("delete status=%d", w.Code)
	}

	// READ after delete → 404
	w, _ = doJSON(t, r, "GET", "/api/v1/devices/"+id, nil)
	if w.Code != http.StatusNotFound {
		t.Errorf("get after delete=%d want 404", w.Code)
	}
}

func TestDeviceListTenantScoping(t *testing.T) {
	db := newTestDB(t)
	// Seed one device per company directly.
	if err := db.Create(&models.Device{CompanyID: "c1", Hostname: "c1-host", IPAddress: "10.0.0.1", Status: "up"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&models.Device{CompanyID: "c2", Hostname: "c2-host", IPAddress: "10.0.0.2", Status: "up"}).Error; err != nil {
		t.Fatal(err)
	}
	r := newDBRouter(db)

	// Company c1 should see only its own device.
	req := httptest.NewRequest("GET", "/api/v1/devices", nil)
	req.Header.Set("X-Test-Company", "c1")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	html := w.Body.String()
	if !strings.Contains(html, "c1-host") {
		t.Errorf("c1 list missing own device: %s", html)
	}
	if strings.Contains(html, "c2-host") {
		t.Errorf("TENANT LEAK: c1 list contains c2's device")
	}
}

func TestBandwidthTestOrchestrationValidation(t *testing.T) {
	r := newDBRouter(newTestDB(t))

	// Nonexistent nodes → 400
	w, _ := doJSON(t, r, "POST", "/api/v1/bandwidth-tests/start", map[string]interface{}{
		"source_node_id": "nope-a", "target_node_id": "nope-b",
	})
	if w.Code != http.StatusBadRequest {
		t.Errorf("missing nodes status=%d want 400", w.Code)
	}

	// Invalid test mode → 400
	w, _ = doJSON(t, r, "POST", "/api/v1/bandwidth-tests/start", map[string]interface{}{
		"source_node_id": "a", "target_node_id": "b", "test_mode": "telepathy",
	})
	if w.Code != http.StatusBadRequest {
		t.Errorf("bad mode status=%d want 400", w.Code)
	}

	// Gateway mode without address → 400
	w, _ = doJSON(t, r, "POST", "/api/v1/bandwidth-tests/start", map[string]interface{}{
		"source_node_id": "a", "target_node_id": "b", "test_mode": "gateway",
	})
	if w.Code != http.StatusBadRequest {
		t.Errorf("gateway-no-addr status=%d want 400", w.Code)
	}
}

func TestBandwidthTestRejectsNonGRPCNode(t *testing.T) {
	db := newTestDB(t)
	// Source has gRPC disabled; target is fine. Expect a 400 before any
	// network goroutine is spawned.
	src := models.Node{CompanyID: "c1", Name: "src", Hostname: "src", IPAddress: "10.0.0.1"}
	dst := models.Node{CompanyID: "c1", Name: "dst", Hostname: "dst", IPAddress: "10.0.0.2", GRPCEnabled: true, GRPCPort: 50051}
	if err := db.Create(&src).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&dst).Error; err != nil {
		t.Fatal(err)
	}
	// GORM applies the `default:true` / `default:50051` column defaults for
	// zero-valued fields on insert, so force gRPC OFF on the source. Select
	// by struct-field name so we don't depend on the column naming strategy,
	// and so the zero values are actually written.
	if err := db.Model(&src).Select("GRPCEnabled", "GRPCPort").
		Updates(models.Node{GRPCEnabled: false, GRPCPort: 0}).Error; err != nil {
		t.Fatal(err)
	}
	r := newDBRouter(db)

	w, body := doJSON(t, r, "POST", "/api/v1/bandwidth-tests/start", map[string]interface{}{
		"source_node_id": src.ID, "target_node_id": dst.ID, "test_type": "upload", "duration": 5,
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("non-grpc source status=%d want 400 body=%s", w.Code, w.Body.String())
	}
	if msg, _ := body["error"].(string); !strings.Contains(msg, "gRPC") {
		t.Errorf("error=%q want mention of gRPC", msg)
	}
}
