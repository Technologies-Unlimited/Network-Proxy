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

// GetSetting retrieves a setting value by key. Secret-keyed settings (see
// secretSettingKeys) are transparently decrypted.
func GetSetting(db *gorm.DB, key string) (string, error) {
	var setting Settings
	result := db.Where("key = ?", key).First(&setting)
	if result.Error != nil {
		return "", result.Error
	}
	if secretSettingKeys[key] {
		return DecryptField(setting.Value)
	}
	return setting.Value, nil
}

// SetSetting creates or updates a setting. Secret-keyed settings are
// transparently encrypted before persisting.
func SetSetting(db *gorm.DB, key, value string) error {
	storeValue := value
	if secretSettingKeys[key] {
		enc, err := EncryptField(value)
		if err != nil {
			return err
		}
		storeValue = enc
	}

	var setting Settings
	result := db.Where("key = ?", key).First(&setting)

	if result.Error == gorm.ErrRecordNotFound {
		setting = Settings{Key: key, Value: storeValue}
		return db.Create(&setting).Error
	}
	if result.Error != nil {
		return result.Error
	}
	setting.Value = storeValue
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

// ThothOS Configuration Settings Keys
const (
	SettingThothOSURL    = "thothos_url"
	SettingThothOSAPIKey = "thothos_api_key"
	SettingProxyName     = "proxy_name"
)

// secretSettingKeys lists settings whose Value column must be transparently
// encrypted at rest. Anything in this set is run through EncryptField on
// SetSetting and DecryptField on GetSetting.
var secretSettingKeys = map[string]bool{
	SettingThothOSAPIKey: true,
}

// ThothOSConfig represents the ThothOS connection settings
type ThothOSConfig struct {
	URL       string `json:"url"`
	APIKey    string `json:"apiKey"`
	ProxyName string `json:"proxyName"`
}

// GetThothOSConfig retrieves all ThothOS configuration from settings
func GetThothOSConfig(db *gorm.DB) (*ThothOSConfig, error) {
	config := &ThothOSConfig{}

	url, err := GetSetting(db, SettingThothOSURL)
	if err == nil {
		config.URL = url
	}

	apiKey, err := GetSetting(db, SettingThothOSAPIKey)
	if err == nil {
		config.APIKey = apiKey
	}

	proxyName, err := GetSetting(db, SettingProxyName)
	if err == nil {
		config.ProxyName = proxyName
	}

	return config, nil
}

// SetThothOSConfig saves all ThothOS configuration to settings
func SetThothOSConfig(db *gorm.DB, config *ThothOSConfig) error {
	if config.URL != "" {
		if err := SetSetting(db, SettingThothOSURL, config.URL); err != nil {
			return err
		}
	}

	if config.APIKey != "" {
		if err := SetSetting(db, SettingThothOSAPIKey, config.APIKey); err != nil {
			return err
		}
	}

	if config.ProxyName != "" {
		if err := SetSetting(db, SettingProxyName, config.ProxyName); err != nil {
			return err
		}
	}

	return nil
}

// GetThothOSURL retrieves the ThothOS URL setting
func GetThothOSURL(db *gorm.DB) string {
	url, err := GetSetting(db, SettingThothOSURL)
	if err != nil {
		return ""
	}
	return url
}

// SetThothOSURL sets the ThothOS URL setting
func SetThothOSURL(db *gorm.DB, url string) error {
	return SetSetting(db, SettingThothOSURL, url)
}

// GetThothOSAPIKey retrieves the ThothOS API key setting
func GetThothOSAPIKey(db *gorm.DB) string {
	apiKey, err := GetSetting(db, SettingThothOSAPIKey)
	if err != nil {
		return ""
	}
	return apiKey
}

// SetThothOSAPIKey sets the ThothOS API key setting
func SetThothOSAPIKey(db *gorm.DB, apiKey string) error {
	return SetSetting(db, SettingThothOSAPIKey, apiKey)
}

// GetProxyName retrieves the proxy name setting
func GetProxyName(db *gorm.DB) string {
	name, err := GetSetting(db, SettingProxyName)
	if err != nil {
		return ""
	}
	return name
}

// SetProxyName sets the proxy name setting
func SetProxyName(db *gorm.DB, name string) error {
	return SetSetting(db, SettingProxyName, name)
}

// ClearThothOSConfig removes all ThothOS configuration from settings
func ClearThothOSConfig(db *gorm.DB) error {
	keys := []string{SettingThothOSURL, SettingThothOSAPIKey, SettingProxyName}
	for _, key := range keys {
		db.Where("key = ?", key).Delete(&Settings{})
	}
	return nil
}

// HasThothOSConfig checks if ThothOS is configured in settings
func HasThothOSConfig(db *gorm.DB) bool {
	url := GetThothOSURL(db)
	apiKey := GetThothOSAPIKey(db)
	return url != "" && apiKey != ""
}
