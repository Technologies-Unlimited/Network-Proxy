package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/thothos"
	"github.com/gin-gonic/gin"
)

var gqlOpRE = regexp.MustCompile(`(?:query|mutation)\s+(\w+)`)

// fakeConfigThothOS stands up an in-process ThothOS that answers api-key
// validation and returns per-operation GraphQL data supplied by the test. Any
// list operation not explicitly set returns an empty array (so the real client
// parses it cleanly instead of erroring on missing data). This exercises the
// real thothos.Client + the real applyConfigFromClient end to end.
type fakeConfigThothOS struct {
	server *httptest.Server
	// ops maps a GraphQL operation name to the raw JSON value placed under
	// data[op]. Absent list ops default to "[]".
	ops map[string]string
}

func newFakeConfigThothOS(t *testing.T, ops map[string]string) *fakeConfigThothOS {
	t.Helper()
	f := &fakeConfigThothOS{ops: ops}
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasSuffix(r.URL.Path, "/api/auth/api-key/validate") {
			io.WriteString(w, `{"valid":true,"companyId":"c1","apiKeyId":"k1","permissions":["config:read","config:write"]}`)
			return
		}
		body, _ := io.ReadAll(r.Body)
		op := ""
		if m := gqlOpRE.FindStringSubmatch(string(body)); m != nil {
			op = m[1]
		}
		val, ok := f.ops[op]
		if !ok {
			val = "[]" // default: an empty list for any unstubbed query
		}
		io.WriteString(w, `{"data":{"`+op+`":`+val+`}}`)
	}))
	t.Cleanup(f.server.Close)
	return f
}

func (f *fakeConfigThothOS) client(t *testing.T) *thothos.Client {
	t.Helper()
	c := thothos.NewClient(f.server.URL, "tk_test")
	if _, err := c.ValidateAPIKey(); err != nil {
		t.Fatalf("validate api key: %v", err)
	}
	return c
}

// TestApplyConfigPersistsTemplateAndRetunesCollector proves the apply step both
// (a) lands a pulled SNMP template in SQLite and (b) retunes a live collector's
// interval from a pulled ICMP polling template. This is the regression test for
// audit P1 #2 ("config-driven monitoring does not exist" — pulls terminated in a
// discarded cache; no threshold/frequency ever reached the collectors).
func TestApplyConfigPersistsTemplateAndRetunesCollector(t *testing.T) {
	icmpC, _ := withLiveCollectors(t)
	db := newTestDB(t)

	fake := newFakeConfigThothOS(t, map[string]string{
		"getSNMPv2TemplatesForCompany": `[{"_id":"tpl-1","companyId":"c1","templateName":"cisco-core","description":"core switches"}]`,
		// pollingFrequency of 30s -> effective ICMP interval 30s (default is 60s).
		"getICMPPollingTemplatesForCompany": `[{"_id":"pt-1","companyId":"c1","name":"fast","frequency":45,"timeout":3,"pollingFrequency":{"seconds":30}}]`,
	})
	client := fake.client(t)

	if got := icmpC.GetInterval(); got != 60*time.Second {
		t.Fatalf("precondition: icmp interval=%s want 60s", got)
	}

	res := applyConfigFromClient(db, client)

	// (a) template persisted in SQLite, keyed by ThothOS id.
	var tmpl models.SNMPTemplate
	if err := db.Where(&models.SNMPTemplate{ThothOSID: "tpl-1"}).First(&tmpl).Error; err != nil {
		t.Fatalf("SNMP template was not persisted to SQLite: %v", err)
	}
	if tmpl.Name != "cisco-core" || tmpl.CompanyID != "c1" || tmpl.Version != "v2c" {
		t.Fatalf("persisted template wrong: %+v", tmpl)
	}
	if res.SNMPTemplatesPersisted != 1 {
		t.Errorf("SNMPTemplatesPersisted=%d want 1", res.SNMPTemplatesPersisted)
	}

	// (b) live collector interval retuned from the pulled polling template.
	if got := icmpC.GetInterval(); got != 30*time.Second {
		t.Fatalf("icmp collector interval not retuned: got=%s want 30s", got)
	}
	if res.ICMPIntervalSeconds != 30 {
		t.Errorf("ICMPIntervalSeconds=%d want 30", res.ICMPIntervalSeconds)
	}
	// The template's per-ping timeout (3s) must have reached the poller too.
	if res.PingTimeoutSeconds != 3 {
		t.Errorf("PingTimeoutSeconds=%d want 3", res.PingTimeoutSeconds)
	}

	// Re-apply is idempotent: still exactly one template row.
	applyConfigFromClient(db, client)
	var count int64
	db.Model(&models.SNMPTemplate{}).Where(&models.SNMPTemplate{ThothOSID: "tpl-1"}).Count(&count)
	if count != 1 {
		t.Fatalf("re-apply duplicated the template: count=%d", count)
	}
}

// TestApplyConfigAppliesLossThreshold proves the ThothOS ICMP monitoring
// template's icmpLossThreshold reaches the LIVE ICMP collector via the apply
// step — the enforcement point that made "packet loss is real data" possible.
// The most sensitive (smallest positive, in (0,100]) threshold across templates
// wins (earliest degradation detection); out-of-range values are ignored.
// Regression for the audit's "icmpLossThreshold field has no possible
// enforcement point even if templates were applied".
func TestApplyConfigAppliesLossThreshold(t *testing.T) {
	icmpC, _ := withLiveCollectors(t)
	db := newTestDB(t)

	// Precondition: collector keeps its default (100 = only total loss is down).
	if got := icmpC.LossThreshold(); got != 100 {
		t.Fatalf("precondition: loss threshold=%v want 100 default", got)
	}

	fake := newFakeConfigThothOS(t, map[string]string{
		// Two valid thresholds (40, 25) plus out-of-range noise (0, 150) that must
		// be ignored — the most sensitive valid one (25) wins.
		"getICMPMonitoringTemplatesForCompany": `[` +
			`{"_id":"m1","companyId":"c1","templateName":"lax","icmpLossThreshold":40},` +
			`{"_id":"m2","companyId":"c1","templateName":"strict","icmpLossThreshold":25},` +
			`{"_id":"m3","companyId":"c1","templateName":"zero","icmpLossThreshold":0},` +
			`{"_id":"m4","companyId":"c1","templateName":"over","icmpLossThreshold":150}]`,
	})
	client := fake.client(t)

	res := applyConfigFromClient(db, client)

	if got := icmpC.LossThreshold(); got != 25 {
		t.Errorf("live collector loss threshold=%v want 25 (most sensitive valid template)", got)
	}
	if res.ICMPLossThreshold != 25 {
		t.Errorf("ApplyResult.ICMPLossThreshold=%v want 25", res.ICMPLossThreshold)
	}

	// No templates / no valid threshold => collector default is left untouched
	// (a config blip must not silently loosen loss detection).
	icmpC2, _ := withLiveCollectors(t)
	fakeEmpty := newFakeConfigThothOS(t, nil) // every op defaults to "[]"
	resEmpty := applyConfigFromClient(newTestDB(t), fakeEmpty.client(t))
	if got := icmpC2.LossThreshold(); got != 100 {
		t.Errorf("empty templates changed loss threshold to %v want 100 default", got)
	}
	if resEmpty.ICMPLossThreshold != 0 {
		t.Errorf("ApplyResult.ICMPLossThreshold=%v want 0 (no template threshold found)", resEmpty.ICMPLossThreshold)
	}
}

// TestReconcileOIDsAdoptsInsteadOfDuplicating proves a local OID created with an
// empty ThothOSID is ADOPTED (its ThothOSID backfilled) when an upstream OID
// with the same oid-string arrives, instead of being duplicated. Regression for
// the "failed createOID push permanently orphans the row" / duplicate-on-sync
// audit findings.
func TestReconcileOIDsAdoptsInsteadOfDuplicating(t *testing.T) {
	db := newTestDB(t)

	// A locally-created OID (never pushed upstream: ThothOSID empty).
	local := models.OID{CompanyID: "c1", OID: "1.3.6.1.2.1.1.3.0", Name: "sysUpTimeLocal"}
	if err := db.Create(&local).Error; err != nil {
		t.Fatalf("seed local oid: %v", err)
	}

	fake := newFakeConfigThothOS(t, map[string]string{
		"getOIDsForCompany": `[{"_id":"oid-remote-1","companyId":"c1","oidName":"sysUpTime","oid":"1.3.6.1.2.1.1.3.0","description":"uptime"}]`,
	})
	client := fake.client(t)

	res := applyConfigFromClient(db, client)

	// Exactly one row — adopted, not duplicated.
	var count int64
	db.Model(&models.OID{}).Where(&models.OID{CompanyID: "c1"}).Count(&count)
	if count != 1 {
		t.Fatalf("OID was duplicated: count=%d want 1", count)
	}
	if res.OIDsAdopted != 1 || res.OIDsCreated != 0 {
		t.Fatalf("expected 1 adopted 0 created, got adopted=%d created=%d", res.OIDsAdopted, res.OIDsCreated)
	}

	// The existing row now carries the upstream id (and refreshed name).
	var got models.OID
	if err := db.First(&got, "id = ?", local.ID).Error; err != nil {
		t.Fatalf("reload local oid: %v", err)
	}
	if got.ThothOSID != "oid-remote-1" {
		t.Fatalf("local OID was not adopted: ThothOSID=%q want oid-remote-1", got.ThothOSID)
	}
	if got.Name != "sysUpTime" {
		t.Errorf("adopted OID name=%q want sysUpTime", got.Name)
	}

	// A second apply matches by ThothOSID now — no adopt, no create, no dup.
	res2 := applyConfigFromClient(db, client)
	db.Model(&models.OID{}).Where(&models.OID{CompanyID: "c1"}).Count(&count)
	if count != 1 {
		t.Fatalf("second apply changed OID count to %d", count)
	}
	if res2.OIDsAdopted != 0 || res2.OIDsCreated != 0 {
		t.Errorf("second apply should be a no-op: adopted=%d created=%d", res2.OIDsAdopted, res2.OIDsCreated)
	}

	// A brand-new upstream OID with no local match is DOWN-SYNCED (created).
	fake.ops["getOIDsForCompany"] = `[{"_id":"oid-remote-1","companyId":"c1","oidName":"sysUpTime","oid":"1.3.6.1.2.1.1.3.0","description":"uptime"},{"_id":"oid-remote-2","companyId":"c1","oidName":"ifInOctets","oid":"1.3.6.1.2.1.2.2.1.10","description":"in octets"}]`
	res3 := applyConfigFromClient(db, client)
	if res3.OIDsCreated != 1 {
		t.Errorf("new upstream OID not down-synced: created=%d want 1", res3.OIDsCreated)
	}
	db.Model(&models.OID{}).Where(&models.OID{CompanyID: "c1"}).Count(&count)
	if count != 2 {
		t.Fatalf("down-sync count=%d want 2", count)
	}
}

// TestMonitorSyncHandlerReportsHonestAppliedCounts proves POST /monitor/sync no
// longer fetches-and-discards while claiming "synced successfully": it runs the
// apply step and its response reflects what was actually persisted (a template
// row that also lands in SQLite), plus IPAM reported as fetched-not-persisted.
func TestMonitorSyncHandlerReportsHonestAppliedCounts(t *testing.T) {
	withLiveCollectors(t)
	db := newTestDB(t)

	fake := newFakeConfigThothOS(t, map[string]string{
		"getSNMPv2TemplatesForCompany": `[{"_id":"tpl-9","companyId":"c1","templateName":"edge","description":""}]`,
		"getSupernetsForCompany":       `[{"_id":"sn-1","companyId":"c1","name":"corp"}]`,
	})

	// getThothOSClient reads the persisted Settings config and re-validates it.
	if err := models.SetThothOSConfig(db, &models.ThothOSConfig{URL: fake.server.URL, APIKey: "tk_test"}); err != nil {
		t.Fatalf("seed settings config: %v", err)
	}

	// syncMonitoringData requires a live auth context (integrated mode).
	middleware.SetGlobalAuthContext(&middleware.AuthContext{CompanyID: "c1", APIKeyID: "k1"})
	t.Cleanup(func() { middleware.SetGlobalAuthContext(nil) })

	r := gin.New()
	srv := &server.Server{DB: db}
	r.POST("/api/v1/monitor/sync", syncMonitoringData(srv))

	w, body := doJSON(t, r, "POST", "/api/v1/monitor/sync", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("sync status=%d body=%s", w.Code, w.Body.String())
	}

	if msg, _ := body["message"].(string); strings.Contains(msg, "synced successfully") {
		t.Errorf("response still claims the old fetch-and-discard lie: %q", msg)
	}
	applied, ok := body["applied"].(map[string]interface{})
	if !ok {
		t.Fatalf("response has no 'applied' block: %v", body)
	}
	if got, _ := applied["snmpTemplatesPersisted"].(float64); got != 1 {
		t.Errorf("applied.snmpTemplatesPersisted=%v want 1", applied["snmpTemplatesPersisted"])
	}
	ipam, ok := body["ipamFetched"].(map[string]interface{})
	if !ok {
		t.Fatalf("response has no 'ipamFetched' block: %v", body)
	}
	if got, _ := ipam["supernets"].(float64); got != 1 {
		t.Errorf("ipamFetched.supernets=%v want 1", ipam["supernets"])
	}

	// The template really landed in SQLite (not just counted).
	var count int64
	db.Model(&models.SNMPTemplate{}).Where(&models.SNMPTemplate{ThothOSID: "tpl-9"}).Count(&count)
	if count != 1 {
		t.Fatalf("template not persisted to SQLite by the sync handler: count=%d", count)
	}
}
