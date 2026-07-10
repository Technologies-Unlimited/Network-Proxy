package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// newMainTestDB builds an isolated, migrated SQLite database for package-main
// sweep tests.
func newMainTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := filepath.Join(t.TempDir(), "sweep.db")
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
	t.Cleanup(func() {
		if sqlDB, err := db.DB(); err == nil {
			sqlDB.Close()
		}
	})
	return db
}

// TestSweepDeletesStaleNodeAndCascadesScheduledTests proves a stale node is
// deleted along with ALL its dependent rows — including ScheduledTest, which the
// old cascade omitted (leaving schedules orphaned against a dead node ID).
func TestSweepDeletesStaleNodeAndCascadesScheduledTests(t *testing.T) {
	db := newMainTestDB(t)
	now := time.Now()
	old := now.Add(-nodeStaleTimeout - time.Minute) // safely past the 15-min cutoff

	node := &models.Node{CompanyID: "c1", Name: "stale", Hostname: "h", IPAddress: "10.0.0.1", Status: "online", LastSeen: &old}
	if err := db.Create(node).Error; err != nil {
		t.Fatal(err)
	}
	peer := &models.NodePeer{SourceNodeID: node.ID, TargetNodeID: node.ID}
	bt := &models.BandwidthTestResult{SourceNodeID: node.ID, TargetNodeID: node.ID, Status: "completed"}
	sched := &models.ScheduledTest{Name: "nightly", SourceNodeID: node.ID, TargetNodeID: node.ID, Duration: 5}
	if err := db.Create(peer).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(bt).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(sched).Error; err != nil {
		t.Fatal(err)
	}

	deleted, _ := sweepStaleNodes(db, now)
	if deleted != 1 {
		t.Fatalf("deleted=%d want 1", deleted)
	}

	assertGone := func(model interface{}, label string) {
		var count int64
		if err := db.Model(model).Where("source_node_id = ?", node.ID).Count(&count).Error; err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatalf("%s not cascaded: %d rows remain", label, count)
		}
	}
	assertGone(&models.NodePeer{}, "NodePeer")
	assertGone(&models.BandwidthTestResult{}, "BandwidthTestResult")
	assertGone(&models.ScheduledTest{}, "ScheduledTest")

	var nodeCount int64
	db.Model(&models.Node{}).Where("id = ?", node.ID).Count(&nodeCount)
	if nodeCount != 0 {
		t.Fatalf("stale node not deleted: %d rows remain", nodeCount)
	}
}

// TestSweepSparesNodeHeartbeatedDuringSweep is the race regression: a heartbeat
// that refreshes last_seen AFTER the sweep's Find but BEFORE its Delete must
// spare the live node (and its history). We inject the mid-sweep heartbeat with
// a one-shot GORM query callback that fires right after the stale-node Find.
//
// Against the old unconditional `db.Delete(&node)` (delete by primary key with
// no last_seen re-check) the node would be deleted and its history cascaded —
// so this test fails without the guarded DELETE.
func TestSweepSparesNodeHeartbeatedDuringSweep(t *testing.T) {
	db := newMainTestDB(t)
	now := time.Now()
	old := now.Add(-nodeStaleTimeout - time.Minute)

	node := &models.Node{CompanyID: "c1", Name: "racer", Hostname: "h", IPAddress: "10.0.0.9", Status: "online", LastSeen: &old}
	if err := db.Create(node).Error; err != nil {
		t.Fatal(err)
	}
	bt := &models.BandwidthTestResult{SourceNodeID: node.ID, TargetNodeID: node.ID, Status: "completed"}
	if err := db.Create(bt).Error; err != nil {
		t.Fatal(err)
	}

	// Simulate a heartbeat landing in the race window: the first time the
	// sweep's Find loads a []Node, refresh this node's last_seen to now via a
	// separate session (as nodeHeartbeat would).
	fired := false
	if err := db.Callback().Query().After("gorm:query").Register("test:race_heartbeat", func(tx *gorm.DB) {
		if fired {
			return
		}
		if _, ok := tx.Statement.Dest.(*[]models.Node); !ok {
			return
		}
		fired = true
		fresh := time.Now()
		db.Session(&gorm.Session{NewDB: true}).
			Model(&models.Node{}).Where("id = ?", node.ID).Update("last_seen", &fresh)
	}); err != nil {
		t.Fatal(err)
	}

	deleted, _ := sweepStaleNodes(db, now)
	if deleted != 0 {
		t.Fatalf("deleted=%d; a node heartbeated during the sweep must be spared (race not closed)", deleted)
	}

	var check models.Node
	if err := db.First(&check, "id = ?", node.ID).Error; err != nil {
		t.Fatalf("spared node was deleted: %v", err)
	}
	var btCount int64
	db.Model(&models.BandwidthTestResult{}).Where("source_node_id = ?", node.ID).Count(&btCount)
	if btCount != 1 {
		t.Fatalf("history cascaded for a spared node: count=%d want 1", btCount)
	}
}

// TestHeartbeat404TriggersReRegistration proves a node whose heartbeat 404s
// (server swept it, or the initial registration never landed) re-registers with
// the same identity instead of being orphaned forever. Against the old
// warn-and-continue loop, config.NodeID stays stale and no registration POST is
// made — so this fails.
func TestHeartbeat404TriggersReRegistration(t *testing.T) {
	var registrations int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/heartbeat"):
			w.WriteHeader(http.StatusNotFound)
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/api/v1/nodes"):
			atomic.AddInt32(&registrations, 1)
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(NodeResponse{Node: NodeData{ID: "reregistered-id"}})
		default:
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer srv.Close()

	config := &NodeConfig{
		NodeID:     "stale-id",
		NodeName:   "n1",
		GRPCPort:   50051,
		ServerAddr: srv.URL,
		CompanyID:  "c1",
		Hostname:   "h1",
		IPAddress:  "10.0.0.1",
	}

	sendNodeHeartbeat(config)

	if got := atomic.LoadInt32(&registrations); got != 1 {
		t.Fatalf("re-registration POSTs=%d want 1", got)
	}
	if config.NodeID != "reregistered-id" {
		t.Fatalf("config.NodeID=%q want reregistered-id (node must adopt the new ID)", config.NodeID)
	}
}
