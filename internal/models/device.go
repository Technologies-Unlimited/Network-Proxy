package models

import (
	"time"

	"gorm.io/gorm"
)

// Device represents a monitored network device
type Device struct {
	ID          string `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	Hostname    string `gorm:"not null;index"`
	IPAddress   string `gorm:"not null;uniqueIndex"`
	MACAddress  string
	Vendor      string
	DeviceType  string // router, switch, server, etc.
	Location    string
	Description string
	Status      string `gorm:"default:'unknown'"` // up, down, unknown
	LastSeen    *time.Time
	AgentID     string         `gorm:"type:uuid;index"`
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

// Agent represents a monitoring agent
type Agent struct {
	ID        string    `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
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
