package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Alert represents a monitoring alert.
//
// Indexes are sized for the dashboard's hot queries:
//   * Status alone — `active` count badge.
//   * (Status, TriggeredAt) — paginated active alerts list.
//   * Source/Metric — engine de-dup lookup in TriggerAlert.
type Alert struct {
	ID          string         `gorm:"primaryKey"`
	CompanyID   string         `gorm:"not null;index"`
	DeviceID    string         `gorm:"not null;index"`
	Device      *Device        `gorm:"foreignKey:DeviceID"`
	Severity    string         `gorm:"not null;index"`
	Status      string         `gorm:"default:'active';index:idx_alert_status;index:idx_alert_status_triggered,priority:1"`
	Title       string         `gorm:"not null"`
	Message     string
	Source      string         `gorm:"index:idx_alert_dedup,priority:1"`
	Metric      string         `gorm:"index:idx_alert_dedup,priority:2"`
	Value       string
	Threshold   string
	TriggeredAt time.Time      `gorm:"not null;index:idx_alert_status_triggered,priority:2,sort:desc"`
	AckedAt     *time.Time
	AckedBy     *string
	ResolvedAt  *time.Time
	CreatedAt   time.Time      `gorm:"autoCreateTime"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime"`
	DeletedAt   gorm.DeletedAt `gorm:"index"`
}

// BeforeCreate generates UUID for new alerts
func (a *Alert) BeforeCreate(tx *gorm.DB) error {
	if a.ID == "" {
		a.ID = uuid.New().String()
	}
	return nil
}

// AlertRule defines conditions for triggering alerts
type AlertRule struct {
	ID          string         `gorm:"primaryKey"`
	CompanyID   string         `gorm:"not null;index"` // ThothOS company ID for multi-tenancy
	Name        string         `gorm:"not null;index"` // Changed from uniqueIndex to allow same name across companies
	Description string
	Enabled     bool           `gorm:"default:true"`
	Severity    string         `gorm:"not null"` // critical, warning, info
	Source      string         `gorm:"not null"` // icmp, snmp
	Metric      string         `gorm:"not null"` // ping_latency, device_status, snmp_oid
	Condition   string         `gorm:"not null"` // gt, lt, eq, ne (greater than, less than, etc.)
	Threshold   string         `gorm:"not null"` // Value to compare against
	Duration    int            `gorm:"default:300"` // Seconds condition must be true
	CreatedAt   time.Time      `gorm:"autoCreateTime"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime"`
	DeletedAt   gorm.DeletedAt `gorm:"index"`

	// Notification settings
	NotifyEmail   bool
	NotifyWebhook bool
	WebhookURL    string
}

// BeforeCreate generates UUID for new alert rules
func (r *AlertRule) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	return nil
}
