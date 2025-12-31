package models

import (
	"time"

	"gorm.io/gorm"
)

// Settings represents application settings stored in the database
type Settings struct {
	ID        uint           `gorm:"primaryKey"`
	Key       string         `gorm:"uniqueIndex;not null"`
	Value     string         `gorm:"not null"`
	CreatedAt time.Time      `gorm:"autoCreateTime"`
	UpdatedAt time.Time      `gorm:"autoUpdateTime"`
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

// ThemeType represents available themes
type ThemeType string

const (
	ThemeDark   ThemeType = "dark"
	ThemeLight  ThemeType = "light"
	ThemeSacred ThemeType = "sacred"
)

// GetSetting retrieves a setting value by key
func GetSetting(db *gorm.DB, key string) (string, error) {
	var setting Settings
	result := db.Where("key = ?", key).First(&setting)
	if result.Error != nil {
		return "", result.Error
	}
	return setting.Value, nil
}

// SetSetting creates or updates a setting
func SetSetting(db *gorm.DB, key, value string) error {
	var setting Settings
	result := db.Where("key = ?", key).First(&setting)

	if result.Error == gorm.ErrRecordNotFound {
		// Create new setting
		setting = Settings{Key: key, Value: value}
		return db.Create(&setting).Error
	}

	if result.Error != nil {
		return result.Error
	}

	// Update existing setting
	setting.Value = value
	return db.Save(&setting).Error
}

// GetTheme retrieves the current theme setting
func GetTheme(db *gorm.DB) ThemeType {
	theme, err := GetSetting(db, "theme")
	if err != nil {
		return ThemeDark // Default to dark
	}

	switch ThemeType(theme) {
	case ThemeDark, ThemeLight, ThemeSacred:
		return ThemeType(theme)
	default:
		return ThemeDark
	}
}

// SetTheme sets the theme setting
func SetTheme(db *gorm.DB, theme ThemeType) error {
	return SetSetting(db, "theme", string(theme))
}
