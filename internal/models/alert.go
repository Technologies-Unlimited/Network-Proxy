package models

import (
	"time"

	"gorm.io/gorm"
)

// Alert represents a monitoring alert
type Alert struct {
	ID          string         `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	DeviceID    string         `gorm:"type:uuid;not null;index"`
	Device      *Device        `gorm:"foreignKey:DeviceID"`
	Severity    string         `gorm:"not null"` // critical, warning, info
	Status      string         `gorm:"default:'active'"` // active, acknowledged, resolved
	Title       string         `gorm:"not null"`
	Message     string
	Source      string         // icmp, snmp, system
	Metric      string         // ping_latency, snmp_oid, etc.
	Value       string         // Current value
	Threshold   string         // Threshold that was exceeded
	TriggeredAt time.Time      `gorm:"not null"`
	AckedAt     *time.Time
	AckedBy     *string        `gorm:"type:uuid"`
	ResolvedAt  *time.Time
	CreatedAt   time.Time      `gorm:"autoCreateTime"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime"`
	DeletedAt   gorm.DeletedAt `gorm:"index"`
}

// AlertRule defines conditions for triggering alerts
type AlertRule struct {
	ID          string         `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	Name        string         `gorm:"not null;uniqueIndex"`
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
