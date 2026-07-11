package database

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/glebarez/sqlite"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Initialize sets up the database connection and runs migrations
func Initialize() (*gorm.DB, error) {
	// Get database file path from environment or use default
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./network-monitor.db"
	}
	// Resolve to absolute path so a misconfigured systemd unit, Docker
	// volume mount, or `cd somewhere && ./network-monitor server` is
	// obvious from the boot log instead of silently writing to whatever
	// the working directory happens to be.
	if abs, err := filepath.Abs(dbPath); err == nil {
		dbPath = abs
	}

	log.Info().Str("path", dbPath).Msg("Initializing SQLite database")

	// Configure GORM logger
	gormLogger := logger.New(
		&gormLogWriter{},
		logger.Config{
			SlowThreshold:             200 * time.Millisecond,
			LogLevel:                  logger.Warn,
			IgnoreRecordNotFoundError: true,
			Colorful:                  false,
		},
	)

	// Connect to SQLite database (using pure-Go driver)
	dsn := fmt.Sprintf("%s?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)", dbPath)
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger:                 gormLogger,
		SkipDefaultTransaction: true,
		PrepareStmt:            true,
	})

	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	// Configure connection pool
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("failed to get database instance: %w", err)
	}

	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetConnMaxLifetime(time.Hour)

	// Run migrations
	if err := runMigrations(db); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	log.Info().Msg("Database initialized successfully")
	return db, nil
}

// runMigrations runs all database migrations
func runMigrations(db *gorm.DB) error {
	log.Info().Msg("Running database migrations")

	// Auto-migrate all models
	models := []interface{}{
		&models.Device{},
		&models.Node{},
		&models.NodePeer{},
		&models.BandwidthTestResult{},
		&models.ScheduledTest{},
		&models.SNMPTemplate{},
		&models.OID{},
		&models.Alert{},
		&models.AlertRule{},
		&models.ProxyConfig{},
		&models.Settings{},
	}

	for _, model := range models {
		if err := db.AutoMigrate(model); err != nil {
			return fmt.Errorf("failed to migrate model: %w", err)
		}
	}

	// Enforce (company_id, name) node identity now that the columns exist.
	if err := migrateNodeIdentity(db); err != nil {
		return fmt.Errorf("failed to migrate node identity: %w", err)
	}

	log.Info().Msg("Database migrations completed")
	return nil
}

// migrateNodeIdentity enforces that a LIVE node is uniquely identified by
// (company_id, name).
//
// Registration keys on (company_id, name), so two companies may each own a
// "Node-Alpha" while a single company's name stays unique. Legacy databases
// predate company stamping and the name-only lookup and can hold several live
// rows sharing a (company_id, name); those are collapsed first (keeping the
// most-recently-seen) or the unique index can't be built.
//
// The index is PARTIAL (`WHERE deleted_at IS NULL`) on purpose: the stale
// sweep soft-deletes nodes, and a node re-registers under the same name. A
// plain unique index counts soft-deleted rows and would reject that
// re-registration; restricting the constraint to live rows lets re-registration
// work while still forbidding two live rows for the same identity. The pure-Go
// SQLite driver (glebarez/modernc) supports partial indexes.
func migrateNodeIdentity(db *gorm.DB) error {
	if err := dedupeLiveNodes(db); err != nil {
		return fmt.Errorf("dedupe live nodes: %w", err)
	}
	if err := db.Exec(
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_company_name_live ` +
			`ON nodes(company_id, name) WHERE deleted_at IS NULL`,
	).Error; err != nil {
		return fmt.Errorf("create partial unique index nodes(company_id,name): %w", err)
	}
	return nil
}

// dedupeLiveNodes soft-deletes all but the most-recently-seen LIVE node in each
// (company_id, name) group, cascading each removed node's peers, bandwidth
// results, and scheduled tests — the same cascade the runtime delete paths use.
// GORM's default scope restricts every query here to live rows (deleted_at IS
// NULL), matching the partial unique index built afterward.
func dedupeLiveNodes(db *gorm.DB) error {
	type group struct {
		CompanyID string
		Name      string
	}
	var groups []group
	if err := db.Model(&models.Node{}).
		Select("company_id, name").
		Group("company_id, name").
		Having("COUNT(*) > 1").
		Scan(&groups).Error; err != nil {
		return err
	}

	for _, g := range groups {
		var nodes []models.Node
		if err := db.Where("company_id = ? AND name = ?", g.CompanyID, g.Name).
			Order("last_seen DESC NULLS LAST").
			Find(&nodes).Error; err != nil {
			return err
		}
		// Keep nodes[0] (most recently seen); remove the rest with their
		// history. Each removal cascades ATOMICALLY and every child delete is
		// checked — previously the three child deletes were unchecked, so a
		// failed cascade could soft-delete the node while leaving orphaned
		// peers/results/schedules pointing at a now-absent node ID.
		for i := 1; i < len(nodes); i++ {
			id := nodes[i].ID
			if err := db.Transaction(func(tx *gorm.DB) error {
				if err := tx.Where("source_node_id = ? OR target_node_id = ?", id, id).Delete(&models.NodePeer{}).Error; err != nil {
					return err
				}
				if err := tx.Where("source_node_id = ? OR target_node_id = ?", id, id).Delete(&models.BandwidthTestResult{}).Error; err != nil {
					return err
				}
				if err := tx.Where("source_node_id = ? OR target_node_id = ?", id, id).Delete(&models.ScheduledTest{}).Error; err != nil {
					return err
				}
				return tx.Delete(&models.Node{}, "id = ?", id).Error
			}); err != nil {
				return err
			}
		}
	}
	return nil
}

// gormLogWriter adapts GORM logger to zerolog. GORM's logger emits at the
// `logger.Warn` level for slow queries / constraint violations; treating
// them as Warn (not Debug, which gets filtered in prod) preserves the
// signal operators rely on.
type gormLogWriter struct{}

func (w *gormLogWriter) Printf(format string, args ...interface{}) {
	log.Warn().Msgf(format, args...)
}
