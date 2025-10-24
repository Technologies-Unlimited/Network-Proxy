package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Device represents a monitored network device
type Device struct {
	ID          string `gorm:"primaryKey"`
	Hostname    string `gorm:"not null;index"`
	IPAddress   string `gorm:"not null;uniqueIndex"`
	MACAddress  string
	Vendor      string
	DeviceType  string // router, switch, server, etc.
	Location    string
	Description string
	Status      string `gorm:"default:'unknown'"` // up, down, unknown
	LastSeen    *time.Time
	AgentID     string         `gorm:"index"`
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

// Agent represents a monitoring agent
type Agent struct {
	ID        string    `gorm:"primaryKey"`
	Name      string    `gorm:"not null;uniqueIndex"`
	Hostname  string    `gorm:"not null"`
	IPAddress string    `gorm:"not null"`
	Version   string
	Status    string `gorm:"default:'offline'"` // online, offline
	LastSeen  *time.Time
	CreatedAt time.Time      `gorm:"autoCreateTime"`
	UpdatedAt time.Time      `gorm:"autoUpdateTime"`
	DeletedAt gorm.DeletedAt `gorm:"index"`

	// Capabilities
	SupportsICMP      bool `gorm:"default:true"`
	SupportsSNMP      bool `gorm:"default:true"`
	SupportsDiscovery bool `gorm:"default:true"`

	// Relationships
	Devices []Device `gorm:"foreignKey:AgentID"`
}

// BeforeCreate generates UUID for new agents
func (a *Agent) BeforeCreate(tx *gorm.DB) error {
	if a.ID == "" {
		a.ID = uuid.New().String()
	}
	return nil
}
