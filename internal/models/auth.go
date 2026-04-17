package models

import (
	"time"

	"gorm.io/gorm"
)

// ProxyConfig stores the ThothOS authentication configuration.
//
// APIKey and WebhookSecret are encrypted at rest via the Before*/After*
// hooks below. They are stored as plaintext in this struct in memory and
// transparently round-tripped through models.EncryptField/DecryptField on
// the way to and from SQLite. See internal/models/crypto.go.
type ProxyConfig struct {
	ID                      uint   `gorm:"primaryKey"`
	ThothOSURL              string `gorm:"not null"`
	APIKey                  string `gorm:"not null"`
	APIKeyID                string `gorm:"not null"`
	CompanyID               string `gorm:"not null;index"`
	AdministrationCompanyID string `gorm:"index"`
	UserID                  string `gorm:"not null"`
	UserType                string `gorm:"not null"`
	UserName                string
	ProxyID                 string
	ProxyName               string
	WebhookID               string
	WebhookSecret           string

	IsActive       bool `gorm:"default:true"`
	LastValidated  *time.Time
	LastHeartbeat  *time.Time
	LastConfigSync *time.Time

	CreatedAt time.Time      `gorm:"autoCreateTime"`
	UpdatedAt time.Time      `gorm:"autoUpdateTime"`
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

// TableName specifies the table name for ProxyConfig.
func (ProxyConfig) TableName() string {
	return "proxy_config"
}

// BeforeSave encrypts secret fields prior to persisting. Idempotent: a row
// loaded already-encrypted is detected by the envelope prefix and not
// re-encrypted.
func (p *ProxyConfig) BeforeSave(tx *gorm.DB) error {
	enc, err := EncryptField(p.APIKey)
	if err != nil {
		return err
	}
	p.APIKey = enc

	enc, err = EncryptField(p.WebhookSecret)
	if err != nil {
		return err
	}
	p.WebhookSecret = enc
	return nil
}

// AfterFind decrypts secret fields after loading.
func (p *ProxyConfig) AfterFind(tx *gorm.DB) error {
	plain, err := DecryptField(p.APIKey)
	if err != nil {
		return err
	}
	p.APIKey = plain

	plain, err = DecryptField(p.WebhookSecret)
	if err != nil {
		return err
	}
	p.WebhookSecret = plain
	return nil
}

// AfterSave restores plaintext values to the in-memory struct so the caller
// keeps using usable values after Create()/Save().
func (p *ProxyConfig) AfterSave(tx *gorm.DB) error {
	return p.AfterFind(tx)
}
