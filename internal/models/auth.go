package models

import (
	"time"

	"gorm.io/gorm"
)

// ProxyConfig stores the ThothOS authentication configuration
// Only one record should exist - this is the proxy's identity
type ProxyConfig struct {
	ID                      uint   `gorm:"primaryKey"`
	ThothOSURL              string `gorm:"not null"`
	APIKey                  string `gorm:"not null"` // Encrypted API key from ThothOS
	APIKeyID                string `gorm:"not null"`
	CompanyID               string `gorm:"not null;index"`
	AdministrationCompanyID string `gorm:"index"`
	UserID                  string `gorm:"not null"`
	UserType                string `gorm:"not null"` // administrator or employee
	UserName                string
	ProxyID                 string // Set after registration with ThothOS
	ProxyName               string
	WebhookID               string // Webhook ID for config updates
	WebhookSecret           string // Secret for webhook signature verification

	// Status
	IsActive       bool `gorm:"default:true"`
	LastValidated  *time.Time
	LastHeartbeat  *time.Time
	LastConfigSync *time.Time

	CreatedAt time.Time      `gorm:"autoCreateTime"`
	UpdatedAt time.Time      `gorm:"autoUpdateTime"`
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

// TableName specifies the table name for ProxyConfig
func (ProxyConfig) TableName() string {
	return "proxy_config"
}
