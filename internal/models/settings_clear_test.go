package models

import (
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func openSettingsTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := filepath.Join(t.TempDir(), "settings.db")
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := db.AutoMigrate(&Settings{}); err != nil {
		t.Fatalf("automigrate: %v", err)
	}
	return db
}

// TestClearThothOSConfig_DeletesRowsAndReturnsNil is the happy path: with a
// healthy DB the saved ThothOS credentials are actually removed and the call
// reports success.
func TestClearThothOSConfig_DeletesRowsAndReturnsNil(t *testing.T) {
	db := openSettingsTestDB(t)
	t.Cleanup(func() {
		if sqlDB, err := db.DB(); err == nil {
			sqlDB.Close()
		}
	})

	if err := SetThothOSURL(db, "https://thothos.example.com"); err != nil {
		t.Fatalf("seed url: %v", err)
	}
	if err := SetThothOSAPIKey(db, "secret-key"); err != nil {
		t.Fatalf("seed api key: %v", err)
	}

	if err := ClearThothOSConfig(db); err != nil {
		t.Fatalf("ClearThothOSConfig returned error on a healthy DB: %v", err)
	}

	// The saved credentials must be gone — otherwise a "disconnect" leaves them
	// on disk to auto-reconnect on the next boot.
	if got := GetThothOSURL(db); got != "" {
		t.Fatalf("thothos_url survived clear: %q", got)
	}
	if got := GetThothOSAPIKey(db); got != "" {
		t.Fatalf("thothos_api_key survived clear: %q", got)
	}
}

// TestClearThothOSConfig_ReturnsErrorWhenDeleteFails is the regression pin for
// the P2 disconnect-lie finding. The pre-fix code discarded every
// db.Where(...).Delete(...).Error and hard-returned nil, so teardown's
// `if err := ClearThothOSConfig(db); err != nil` was dead code and the
// disconnect/logout handler reported a clean "standalone mode" even when the
// saved URL+API key could not be deleted and would silently reconnect on
// reboot. Against a DB whose connection is closed, ClearThothOSConfig MUST now
// return a non-nil error (fixed code) rather than nil (buggy code).
func TestClearThothOSConfig_ReturnsErrorWhenDeleteFails(t *testing.T) {
	db := openSettingsTestDB(t)

	// Close the underlying connection so every Delete fails.
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("get sql.DB: %v", err)
	}
	if err := sqlDB.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	if err := ClearThothOSConfig(db); err == nil {
		t.Fatal("ClearThothOSConfig returned nil on a closed DB — a failed delete is being swallowed; the disconnect handler would falsely report standalone mode while saved credentials survive")
	}
}
