package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// SNMPTemplate defines SNMP polling configuration
type SNMPTemplate struct {
	ID          string         `gorm:"primaryKey"`
	CompanyID   string         `gorm:"not null;index"` // ThothOS company ID for multi-tenancy
	ThothOSID   string         `gorm:"index"`          // ID from ThothOS for syncing
	Name        string         `gorm:"not null;index"` // Changed from uniqueIndex to allow same name across companies
	Description string
	Version     string         `gorm:"not null"` // v1, v2c, v3
	Community   string         // For v1/v2c
	Username    string         // For v3
	AuthProtocol string        // For v3: MD5, SHA, SHA224, SHA256, SHA384, SHA512
	AuthPassword string        // For v3
	PrivProtocol string        // For v3: DES, AES, AES192, AES256
	PrivPassword string        // For v3
	CreatedAt   time.Time      `gorm:"autoCreateTime"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime"`
	DeletedAt   gorm.DeletedAt `gorm:"index"`

	// Relationships
	OIDs    []OID    `gorm:"many2many:snmp_template_oids;"`
	Devices []Device `gorm:"foreignKey:SNMPTemplateID"`
}

// BeforeCreate generates UUID for new SNMP templates
func (s *SNMPTemplate) BeforeCreate(tx *gorm.DB) error {
	if s.ID == "" {
		s.ID = uuid.New().String()
	}
	return nil
}

// OID represents an SNMP Object Identifier to poll
type OID struct {
	ID          string         `gorm:"primaryKey"`
	CompanyID   string         `gorm:"not null;index"` // ThothOS company ID for multi-tenancy
	ThothOSID   string         `gorm:"index"`          // ID from ThothOS for syncing
	OID         string         `gorm:"not null;index"` // Changed from uniqueIndex to allow same OID across companies
	Name        string         `gorm:"not null"`
	Description string
	Unit        string         // Mbps, %, C, etc.
	DataType    string         // integer, string, counter, gauge
	CreatedAt   time.Time      `gorm:"autoCreateTime"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime"`
	DeletedAt   gorm.DeletedAt `gorm:"index"`

	// Relationships
	Templates []SNMPTemplate `gorm:"many2many:snmp_template_oids;"`
}

// BeforeCreate generates UUID for new OIDs
func (o *OID) BeforeCreate(tx *gorm.DB) error {
	if o.ID == "" {
		o.ID = uuid.New().String()
	}
	return nil
}
