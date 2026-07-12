package api

import (
	"net/http"
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/icmp"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/snmp"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
)

// withLiveCollectors installs a pair of real collectors for the duration of a
// test and restores the previous registration on cleanup, so device-lifecycle
// tests can assert against GetDeviceCount without a global leak between tests.
func withLiveCollectors(t *testing.T) (*icmp.Collector, *snmp.Collector) {
	t.Helper()
	// Real collectors, nil metrics registry: the lifecycle methods
	// (AddDevice/RemoveDevice/GetDeviceCount) never touch the registry, and a
	// second metrics.NewRegistry() would panic on duplicate Prometheus
	// registration within one test binary.
	icmpC := icmp.NewCollector(nil, nil)
	snmpC := snmp.NewCollector(nil, nil)

	collectorsMu.Lock()
	prev := liveCollectors
	collectorsMu.Unlock()

	SetCollectors(icmpC, snmpC)
	t.Cleanup(func() {
		collectorsMu.Lock()
		liveCollectors = prev
		collectorsMu.Unlock()
	})
	return icmpC, snmpC
}

// TestCollectorHealthSurface proves the operator-facing /health monitoring block
// reports the ICMP raw-socket health honestly: healthy defaults when no collector
// is wired (pre-boot / unit context) and available with no error for a wired,
// healthy collector. This is the API side of fix 3 — an unprivileged install must
// surface a VISIBLE error here, and a healthy one must not false-alarm. (The
// unhealthy recording path is proven in the icmp package's
// TestCheckPrivilegeRecordsHealthError, whose HealthError() this block copies.)
func TestCollectorHealthSurface(t *testing.T) {
	// No collectors wired: healthy defaults (don't claim an ICMP fault).
	collectorsMu.Lock()
	prev := liveCollectors
	liveCollectors = nil
	collectorsMu.Unlock()
	t.Cleanup(func() {
		collectorsMu.Lock()
		liveCollectors = prev
		collectorsMu.Unlock()
	})

	if h := collectorHealth(); !h.ICMPRawSocketAvailable || h.ICMPHealthError != "" {
		t.Errorf("nil collectors health=%+v want available/no-error", h)
	}

	// A wired, healthy collector (no privilege fault recorded) reports available.
	SetCollectors(icmp.NewCollector(nil, nil), snmp.NewCollector(nil, nil))
	if h := collectorHealth(); !h.ICMPRawSocketAvailable || h.ICMPHealthError != "" {
		t.Errorf("healthy collector health=%+v want available/no-error", h)
	}
}

// TestCreateDeviceWiresCollector proves a device created via the API is polled
// immediately — it lands in the live ICMP collector without a process restart.
// This is the regression test for audit P1 #3 ("first-run path polls nothing").
func TestCreateDeviceWiresCollector(t *testing.T) {
	icmpC, snmpC := withLiveCollectors(t)
	r := newDBRouter(newTestDB(t))

	if icmpC.GetDeviceCount() != 0 {
		t.Fatalf("precondition: icmp collector already has %d devices", icmpC.GetDeviceCount())
	}

	w, body := doJSON(t, r, "POST", "/api/v1/devices", map[string]interface{}{
		"CompanyID":   "c1",
		"Hostname":    "router1",
		"IPAddress":   "10.0.0.1",
		"DeviceType":  "router",
		"ICMPEnabled": true,
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", w.Code, w.Body.String())
	}

	if icmpC.GetDeviceCount() != 1 {
		t.Fatalf("device create did not wire the ICMP collector: count=%d", icmpC.GetDeviceCount())
	}
	// ICMP-only device must not have been added to the SNMP collector.
	if snmpC.GetDeviceCount() != 0 {
		t.Fatalf("ICMP-only device leaked into the SNMP collector: count=%d", snmpC.GetDeviceCount())
	}

	// DELETE must remove it from the live collector too.
	dev := body["device"].(map[string]interface{})
	id, _ := dev["ID"].(string)
	if id == "" {
		id, _ = dev["id"].(string)
	}
	if id == "" {
		t.Fatalf("no device id in create response: %v", dev)
	}

	w, _ = doJSON(t, r, "DELETE", "/api/v1/devices/"+id, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("delete status=%d", w.Code)
	}
	if icmpC.GetDeviceCount() != 0 {
		t.Fatalf("device delete did not unwire the ICMP collector: count=%d", icmpC.GetDeviceCount())
	}
}

// TestCreateSNMPDeviceWiresBothCollectors proves an SNMP-enabled device with a
// template is added to the SNMP collector (its template loaded from the DB).
func TestCreateSNMPDeviceWiresBothCollectors(t *testing.T) {
	icmpC, snmpC := withLiveCollectors(t)
	db := newTestDB(t)
	r := newDBRouter(db)

	tmpl := models.SNMPTemplate{CompanyID: "c1", Name: "cisco", Version: "v2c", Community: "public"}
	if err := db.Create(&tmpl).Error; err != nil {
		t.Fatalf("seed template: %v", err)
	}

	w, _ := doJSON(t, r, "POST", "/api/v1/devices", map[string]interface{}{
		"CompanyID":      "c1",
		"Hostname":       "switch1",
		"IPAddress":      "10.0.0.5",
		"ICMPEnabled":    true,
		"SNMPEnabled":    true,
		"SNMPTemplateID": tmpl.ID,
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", w.Code, w.Body.String())
	}

	if icmpC.GetDeviceCount() != 1 {
		t.Fatalf("icmp count=%d want 1", icmpC.GetDeviceCount())
	}
	if snmpC.GetDeviceCount() != 1 {
		t.Fatalf("snmp count=%d want 1 (template should have loaded from DB)", snmpC.GetDeviceCount())
	}
}
