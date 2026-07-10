package database

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// openRawNodesDB migrates ONLY the tables migrateNodeIdentity touches, WITHOUT
// running migrateNodeIdentity itself, so a test can seed the pre-migration
// (duplicate) state the real migration must repair.
func openRawNodesDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := filepath.Join(t.TempDir(), "migrate.db")
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := db.AutoMigrate(
		&models.Node{}, &models.NodePeer{}, &models.BandwidthTestResult{}, &models.ScheduledTest{},
	); err != nil {
		t.Fatalf("automigrate: %v", err)
	}
	t.Cleanup(func() {
		if sqlDB, err := db.DB(); err == nil {
			sqlDB.Close()
		}
	})
	return db
}

// TestMigrateNodeIdentityDedupesAndConstrains proves migrateNodeIdentity (a)
// collapses pre-existing live duplicates keeping the most-recently-seen row and
// cascading the losers' history, and (b) installs a partial unique index that
// forbids a second LIVE (company_id, name) row afterward.
func TestMigrateNodeIdentityDedupesAndConstrains(t *testing.T) {
	db := openRawNodesDB(t)

	older := time.Now().Add(-time.Hour)
	newer := time.Now().Add(-time.Minute)

	// Two live rows share (c1, dup): the newer one must survive.
	loser := &models.Node{ID: "loser", CompanyID: "c1", Name: "dup", Hostname: "old", IPAddress: "10.0.0.1", LastSeen: &older}
	winner := &models.Node{ID: "winner", CompanyID: "c1", Name: "dup", Hostname: "new", IPAddress: "10.0.0.2", LastSeen: &newer}
	// A different company's same-named node must be untouched.
	other := &models.Node{ID: "other", CompanyID: "c2", Name: "dup", Hostname: "c2", IPAddress: "10.0.0.3", LastSeen: &newer}
	for _, n := range []*models.Node{loser, winner, other} {
		if err := db.Create(n).Error; err != nil {
			t.Fatal(err)
		}
	}
	// Loser has history that must be cascaded away.
	if err := db.Create(&models.BandwidthTestResult{SourceNodeID: "loser", TargetNodeID: "loser", Status: "completed"}).Error; err != nil {
		t.Fatal(err)
	}

	if err := migrateNodeIdentity(db); err != nil {
		t.Fatalf("migrateNodeIdentity: %v", err)
	}

	// Only the winner remains live for (c1, dup); c2's row is untouched.
	var c1Nodes []models.Node
	if err := db.Where("company_id = ? AND name = ?", "c1", "dup").Find(&c1Nodes).Error; err != nil {
		t.Fatal(err)
	}
	if len(c1Nodes) != 1 || c1Nodes[0].ID != "winner" {
		t.Fatalf("dedupe kept wrong rows: %+v (want only winner)", c1Nodes)
	}
	var c2Count int64
	db.Model(&models.Node{}).Where("company_id = ? AND name = ?", "c2", "dup").Count(&c2Count)
	if c2Count != 1 {
		t.Fatalf("cross-tenant row was disturbed: c2 count=%d want 1", c2Count)
	}
	// Loser's history was cascaded.
	var btCount int64
	db.Model(&models.BandwidthTestResult{}).Where("source_node_id = ?", "loser").Count(&btCount)
	if btCount != 0 {
		t.Fatalf("loser history not cascaded: %d rows remain", btCount)
	}

	// The partial unique index now forbids a second LIVE (c1, dup) row.
	err := db.Create(&models.Node{ID: "intruder", CompanyID: "c1", Name: "dup", Hostname: "x", IPAddress: "10.0.0.9"}).Error
	if err == nil {
		t.Fatal("expected unique-index violation inserting a duplicate live (company_id, name) row, got nil")
	}
}

// TestMigrateNodeIdentityAllowsReRegistrationAfterSoftDelete proves the index is
// PARTIAL (live rows only): a soft-deleted node does not block re-creating the
// same (company_id, name), which is exactly what node re-registration does after
// the stale sweep. A plain (non-partial) unique index would reject this.
func TestMigrateNodeIdentityAllowsReRegistrationAfterSoftDelete(t *testing.T) {
	db := openRawNodesDB(t)
	if err := migrateNodeIdentity(db); err != nil {
		t.Fatalf("migrateNodeIdentity: %v", err)
	}

	first := &models.Node{ID: "first", CompanyID: "c1", Name: "reappearing", Hostname: "h", IPAddress: "10.0.0.1"}
	if err := db.Create(first).Error; err != nil {
		t.Fatal(err)
	}
	// Sweep soft-deletes it.
	if err := db.Delete(first).Error; err != nil {
		t.Fatal(err)
	}
	// Node re-registers under the same identity → must succeed.
	second := &models.Node{ID: "second", CompanyID: "c1", Name: "reappearing", Hostname: "h2", IPAddress: "10.0.0.2"}
	if err := db.Create(second).Error; err != nil {
		t.Fatalf("re-registration after soft-delete was rejected (index not partial?): %v", err)
	}
}
