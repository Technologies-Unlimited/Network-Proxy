package database

import (
	"fmt"
	"os"
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

	log.Info().Msg("Database migrations completed")
	return nil
}

// gormLogWriter adapts GORM logger to zerolog
type gormLogWriter struct{}

func (w *gormLogWriter) Printf(format string, args ...interface{}) {
	log.Debug().Msgf(format, args...)
}
