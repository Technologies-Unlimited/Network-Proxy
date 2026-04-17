package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Device represents a monitored network device
type Device struct {
	ID          string `gorm:"primaryKey"`
	CompanyID   string `gorm:"not null;index"` // ThothOS company ID for multi-tenancy
	Hostname    string `gorm:"not null;index"`
	IPAddress   string `gorm:"not null;index"` // Changed from uniqueIndex to allow same IP across companies
	MACAddress  string
	Vendor      string
	DeviceType  string // router, switch, server, etc.
	Location    string
	Description string
	// Status is read every dashboard refresh ("devices up" / "devices down"
	// counters), so it gets its own index.
	Status      string `gorm:"default:'unknown';index"`
	LastSeen    *time.Time `gorm:"index"`
	NodeID      string         `gorm:"index"`
	CreatedAt   time.Time      `gorm:"autoCreateTime"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime"`
	DeletedAt   gorm.DeletedAt `gorm:"index"`

	// Monitoring settings
	ICMPEnabled    bool `gorm:"default:true"`
	ICMPInterval   int  `gorm:"default:60"` // seconds
	SNMPEnabled    bool `gorm:"default:false"`
	SNMPTemplateID *string
	SNMPTemplate   *SNMPTemplate `gorm:"foreignKey:SNMPTemplateID"`

	// Relationships
	Alerts []Alert `gorm:"foreignKey:DeviceID"`
}

// BeforeCreate generates UUID for new devices
func (d *Device) BeforeCreate(tx *gorm.DB) error {
	if d.ID == "" {
		d.ID = uuid.New().String()
	}
	return nil
}

