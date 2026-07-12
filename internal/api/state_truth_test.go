package api

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strconv"
	"strings"
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// state_truth_test.go is the STATE-TRUTH gate for the lifecycle-config usability
// class: the persisted state an operator reads back (device up/down status, saved
// settings) must be TRUE — never a stale/impossible value the dashboard presents
// as live, never a "saved successfully" that silently dropped the change.
//
// It enumerates the real surface so future code is covered automatically:
//   - the device-status matrix is generated from the Device model's monitoring
//     flags (reflection completeness test forces a new *Enabled flag to be added
//     here, which means it must also get a status writer / reset);
//   - the settings round-trip drives the real PUT handler.

// newStateTruthRouter wires the real device, dashboard, and settings handlers
// against a test DB, with the same X-Test-Company tenant shim newDBRouter uses.
func newStateTruthRouter(db *gorm.DB) *gin.Engine {
	r := gin.New()
	r.Use(func(c *gin.Context) {
		if cid := c.GetHeader("X-Test-Company"); cid != "" {
			c.Set("companyId", cid)
		}
		c.Next()
	})
	srv := &server.Server{DB: db}

	d := r.Group("/api/v1/devices")
	d.POST("", createDevice(srv))
	d.PUT("/:id", updateDevice(srv))

	dash := r.Group("/api/v1/dashboard")
	dash.GET("/devices-up", getDashboardDevicesUp(srv))
	dash.GET("/devices-down", getDashboardDevicesDown(srv))

	s := r.Group("/api/v1/settings")
	s.PUT("/thothos", setThothOSConfig(srv))
	return r
}

// dashboardCount fetches a plain-text count tile and parses it. A non-numeric
// body (e.g. the "—" DB-error sentinel) fails the test loudly.
func dashboardCount(t *testing.T, r *gin.Engine, company, path string) int {
	t.Helper()
	req := httptest.NewRequest("GET", path, nil)
	req.Header.Set("X-Test-Company", company)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("%s status=%d", path, w.Code)
	}
	n, err := strconv.Atoi(strings.TrimSpace(w.Body.String()))
	if err != nil {
		t.Fatalf("%s returned non-numeric body %q: %v", path, w.Body.String(), err)
	}
	return n
}

// TestStateTruthDeviceMonitoringFlagsAreEnumerated is the completeness wall: the
// status matrix below must cover EVERY boolean monitoring flag on the Device
// model. Adding a new protocol flag (e.g. HTTPEnabled) without covering it here
// fails this test — which is the point, because a new monitoring protocol with
// no status writer would strand a stale/impossible Device.Status the dashboard
// counts as live (exactly the bug this gate exists for).
func TestStateTruthDeviceMonitoringFlagsAreEnumerated(t *testing.T) {
	// The set the matrix (TestStateTruthDeviceStatusMatrix) exercises.
	covered := map[string]bool{"ICMPEnabled": true, "SNMPEnabled": true}

	typ := reflect.TypeOf(models.Device{})
	seen := map[string]bool{}
	for i := 0; i < typ.NumField(); i++ {
		f := typ.Field(i)
		if f.Type.Kind() == reflect.Bool && strings.HasSuffix(f.Name, "Enabled") {
			seen[f.Name] = true
			if !covered[f.Name] {
				t.Fatalf("Device.%s is a monitoring flag the status-truth matrix does not cover. "+
					"Add it to TestStateTruthDeviceStatusMatrix AND ensure a collector writes Device.Status "+
					"for it — otherwise toggling it strands a stale/impossible status the dashboard counts as live.", f.Name)
			}
		}
	}
	for name := range covered {
		if !seen[name] {
			t.Fatalf("the status matrix expects Device.%s but the model no longer has it — update the matrix", name)
		}
	}
}

// TestStateTruthDeviceStatusMatrix drives the REAL device-update + dashboard
// handlers over every {ICMPEnabled, SNMPEnabled} combination and asserts the
// core state-truth invariant: a device that ends up with NO enabled collector
// must NOT keep a live ('up'/'down') status — nothing is polling it, so the
// dashboard "devices up" counter must stop counting it. A device that still has
// an enabled collector must NOT be force-reset off the board.
func TestStateTruthDeviceStatusMatrix(t *testing.T) {
	cases := []struct {
		icmp, snmp  bool
		wantUnknown bool // no enabled collector -> status must not stay live
		wantUpCount int  // expected getDashboardDevicesUp count for this one device
	}{
		{icmp: true, snmp: true, wantUnknown: false, wantUpCount: 1},
		{icmp: true, snmp: false, wantUnknown: false, wantUpCount: 1},
		{icmp: false, snmp: true, wantUnknown: false, wantUpCount: 1},
		{icmp: false, snmp: false, wantUnknown: true, wantUpCount: 0},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(fmt.Sprintf("icmp=%v_snmp=%v", tc.icmp, tc.snmp), func(t *testing.T) {
			db := newTestDB(t)
			r := newStateTruthRouter(db)

			// A prior ICMP poll marked this device UP.
			dev := models.Device{
				CompanyID: "c1", Hostname: "h1", IPAddress: "10.9.9.9",
				Status: "up", ICMPEnabled: true,
			}
			if err := db.Create(&dev).Error; err != nil {
				t.Fatalf("seed device: %v", err)
			}

			// The operator edits it into the target monitoring configuration.
			w, _ := doJSON(t, r, "PUT", "/api/v1/devices/"+dev.ID, map[string]interface{}{
				"CompanyID":   "c1",
				"Hostname":    "h1",
				"IPAddress":   "10.9.9.9",
				"ICMPEnabled": tc.icmp,
				"SNMPEnabled": tc.snmp,
			})
			if w.Code != http.StatusOK {
				t.Fatalf("update status=%d body=%s", w.Code, w.Body.String())
			}

			var got models.Device
			if err := db.First(&got, "id = ?", dev.ID).Error; err != nil {
				t.Fatalf("reload device: %v", err)
			}

			if tc.wantUnknown && (got.Status == "up" || got.Status == "down") {
				t.Errorf("device with NO enabled collector kept live status %q — nothing polls it, yet the dashboard counts it as live; want 'unknown'", got.Status)
			}
			if !tc.wantUnknown && got.Status == "unknown" {
				t.Errorf("device still has an enabled collector but was force-reset to 'unknown' on edit — a monitored device flickered off the board")
			}

			if n := dashboardCount(t, r, "c1", "/api/v1/dashboard/devices-up"); n != tc.wantUpCount {
				t.Errorf("devices-up count=%d want %d (icmp=%v snmp=%v status=%q)", n, tc.wantUpCount, tc.icmp, tc.snmp, got.Status)
			}
		})
	}
}

// TestStateTruthSettingsRoundTrip enumerates the whole settings surface
// (models.AllSettingKeys) and asserts each key both round-trips (write V -> read
// V) AND clears (write V, then write "" -> read ""). This is the standing wall
// for the settings-persistence class: a newly-registered setting is covered
// automatically, and any key whose SetSetting drops a value fails here.
func TestStateTruthSettingsRoundTrip(t *testing.T) {
	db := newTestDB(t)
	for _, key := range models.AllSettingKeys {
		key := key
		t.Run(key, func(t *testing.T) {
			if err := models.SetSetting(db, key, "value-1"); err != nil {
				t.Fatalf("set %q: %v", key, err)
			}
			if got, err := models.GetSetting(db, key); err != nil || got != "value-1" {
				t.Fatalf("round-trip %q = %q,%v want value-1", key, got, err)
			}
			// Clearing must persist an empty value, not silently keep the old one.
			if err := models.SetSetting(db, key, ""); err != nil {
				t.Fatalf("clear %q: %v", key, err)
			}
			if got, err := models.GetSetting(db, key); err != nil || got != "" {
				t.Fatalf("clear %q = %q,%v want empty", key, got, err)
			}
		})
	}
}

// TestStateTruthThothOSClearPersists closes the "Save reports success but
// silently drops a cleared field" bug: clearing the ThothOS URL (sent as an
// explicit empty value) must persist, while an OMITTED field (apiKey here) must
// be left unchanged — omit means "unchanged", empty-present means "clear".
func TestStateTruthThothOSClearPersists(t *testing.T) {
	db := newTestDB(t)
	r := newStateTruthRouter(db)

	if err := models.SetSetting(db, models.SettingThothOSURL, "https://old.example"); err != nil {
		t.Fatal(err)
	}
	if err := models.SetSetting(db, models.SettingThothOSAPIKey, "tk_secret"); err != nil {
		t.Fatal(err)
	}
	if err := models.SetSetting(db, models.SettingProxyName, "px"); err != nil {
		t.Fatal(err)
	}

	// Clear the URL explicitly; omit apiKey and proxyName.
	w, resp := doJSON(t, r, "PUT", "/api/v1/settings/thothos", map[string]interface{}{"url": ""})
	if w.Code != http.StatusOK {
		t.Fatalf("put status=%d body=%s", w.Code, w.Body.String())
	}
	if ok, _ := resp["success"].(bool); !ok {
		t.Fatalf("expected success:true, got %v", resp)
	}

	if got := models.GetThothOSURL(db); got != "" {
		t.Errorf("clearing the ThothOS URL did not persist: still %q — Save reported success but silently dropped the clear", got)
	}
	if got := models.GetThothOSAPIKey(db); got != "tk_secret" {
		t.Errorf("an OMITTED apiKey was wiped: got %q want tk_secret — omit must mean 'unchanged', not 'clear'", got)
	}
}

// TestStateTruthThothOSSaveSignalsApplyScope closes the "Save persists but never
// retunes the running session, yet reports unconditional success" bug: the PUT
// handler must tell the operator whether the change is live or needs a restart/
// reconnect to apply (the running heartbeat/config-pull loop captured its client
// once). With no active session, applying needs no restart.
func TestStateTruthThothOSSaveSignalsApplyScope(t *testing.T) {
	db := newTestDB(t)
	r := newStateTruthRouter(db)

	w, resp := doJSON(t, r, "PUT", "/api/v1/settings/thothos", map[string]interface{}{"proxyName": "px2"})
	if w.Code != http.StatusOK {
		t.Fatalf("put status=%d body=%s", w.Code, w.Body.String())
	}
	if _, ok := resp["restartRequired"]; !ok {
		t.Fatalf("PUT /settings/thothos omits restartRequired — a Save that changes URL/key does not retune the live session, yet the response gives no signal the change isn't applied")
	}
	if rr, _ := resp["restartRequired"].(bool); rr {
		t.Errorf("restartRequired=true with no active ThothOS session; a standalone Save takes effect on next connect/boot")
	}
}
