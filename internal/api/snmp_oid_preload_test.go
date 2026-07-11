package api

import (
	"net/http"
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
)

// TestWireDeviceIntoCollectorsLoadsTemplateOIDs proves the SNMP live-wire path
// (wireDeviceIntoCollectors — the UI/API/discovery path that adds a runtime
// device to the poller) hands the SNMP collector a template whose OIDs
// association is populated. The walker's pollDevice ranges over template.OIDs
// (walker.go), so an empty association means the device connects but polls
// ZERO metrics. wireDeviceIntoCollectors fetches the template from the DB when
// the device carries only an SNMPTemplateID (the real create/update path); that
// fetch MUST Preload("OIDs") or the collector gets an OID-less template.
func TestWireDeviceIntoCollectorsLoadsTemplateOIDs(t *testing.T) {
	_, snmpC := withLiveCollectors(t)
	db := newTestDB(t)

	// Seed a template with two OIDs joined via the many2many association.
	tmpl := models.SNMPTemplate{CompanyID: "c1", Name: "cisco-core", Version: "v2c", Community: "public"}
	if err := db.Create(&tmpl).Error; err != nil {
		t.Fatalf("seed template: %v", err)
	}
	oid1 := models.OID{CompanyID: "c1", OID: "1.3.6.1.2.1.1.3.0", Name: "sysUpTime"}
	oid2 := models.OID{CompanyID: "c1", OID: "1.3.6.1.2.1.2.2.1.10", Name: "ifInOctets"}
	if err := db.Create(&oid1).Error; err != nil {
		t.Fatalf("seed oid1: %v", err)
	}
	if err := db.Create(&oid2).Error; err != nil {
		t.Fatalf("seed oid2: %v", err)
	}
	if err := db.Model(&tmpl).Association("OIDs").Append(&oid1, &oid2); err != nil {
		t.Fatalf("associate oids: %v", err)
	}

	// A device that references the template by ID only (SNMPTemplate pointer
	// nil), mirroring what createDevice/updateDevice hold when they call
	// wireDeviceIntoCollectors.
	tmplID := tmpl.ID
	device := models.Device{
		ID:             "dev-snmp-1",
		CompanyID:      "c1",
		Hostname:       "switch1",
		IPAddress:      "10.0.0.5",
		SNMPEnabled:    true,
		SNMPTemplateID: &tmplID,
	}
	if err := db.Create(&device).Error; err != nil {
		t.Fatalf("seed device: %v", err)
	}
	// Reload without preloading the template so the SNMPTemplate pointer is nil,
	// forcing wireDeviceIntoCollectors down its DB-fetch branch (the real path).
	var fresh models.Device
	if err := db.First(&fresh, "id = ?", device.ID).Error; err != nil {
		t.Fatalf("reload device: %v", err)
	}
	if fresh.SNMPTemplate != nil {
		t.Fatalf("precondition: device.SNMPTemplate should be nil before wiring")
	}

	wireDeviceIntoCollectors(db, &fresh)

	if snmpC.GetDeviceCount() != 1 {
		t.Fatalf("device was not wired into the SNMP collector: count=%d", snmpC.GetDeviceCount())
	}

	got := snmpC.DeviceTemplate(fresh.ID)
	if got == nil {
		t.Fatalf("SNMP collector has no template for device %s", fresh.ID)
	}
	if len(got.OIDs) == 0 {
		t.Fatalf("template handed to SNMP collector has 0 OIDs — the poller would walk nothing (want 2)")
	}
	if len(got.OIDs) != 2 {
		t.Errorf("template.OIDs len=%d want 2", len(got.OIDs))
	}
}

// TestSNMPTemplateHandlerStillPreloadsOIDs is a light guard that the API
// template read path (which the UI uses) continues to preload OIDs, so the UI
// showing OIDs while the poller sees none can't silently reappear on that side.
func TestSNMPTemplateHandlerStillPreloadsOIDs(t *testing.T) {
	db := newTestDB(t)
	tmpl := models.SNMPTemplate{CompanyID: "c1", Name: "edge", Version: "v2c"}
	if err := db.Create(&tmpl).Error; err != nil {
		t.Fatalf("seed template: %v", err)
	}
	oid := models.OID{CompanyID: "c1", OID: "1.3.6.1.2.1.1.5.0", Name: "sysName"}
	if err := db.Create(&oid).Error; err != nil {
		t.Fatalf("seed oid: %v", err)
	}
	if err := db.Model(&tmpl).Association("OIDs").Append(&oid); err != nil {
		t.Fatalf("associate oid: %v", err)
	}

	r := newOIDReadRouter(db)
	w, body := doJSON(t, r, "GET", "/api/v1/snmp/templates/"+tmpl.ID, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("get template status=%d body=%s", w.Code, w.Body.String())
	}
	tmplBody, _ := body["template"].(map[string]interface{})
	oids, _ := tmplBody["OIDs"].([]interface{})
	if len(oids) != 1 {
		t.Errorf("API template.OIDs len=%d want 1", len(oids))
	}
}
