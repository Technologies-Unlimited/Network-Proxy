package api

import (
	"net/http"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
)

// RegisterSettingsRoutes registers the settings API routes
func RegisterSettingsRoutes(router *gin.RouterGroup, srv *server.Server) {
	settings := router.Group("/settings")
	{
		settings.GET("", getSettings(srv))
		settings.GET("/theme", getTheme(srv))
		settings.PUT("/theme", setTheme(srv))
	}
}

// getSettings returns all settings
func getSettings(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		theme := models.GetTheme(srv.DB)

		c.JSON(http.StatusOK, gin.H{
			"theme": theme,
		})
	}
}

// getTheme returns the current theme
func getTheme(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		theme := models.GetTheme(srv.DB)
		c.JSON(http.StatusOK, gin.H{"theme": theme})
	}
}

// setTheme updates the theme setting
func setTheme(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Theme string `json:"theme" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Theme is required"})
			return
		}

		// Validate theme
		theme := models.ThemeType(req.Theme)
		switch theme {
		case models.ThemeDark, models.ThemeLight, models.ThemeSacred:
			// Valid theme
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid theme. Must be 'dark', 'light', or 'sacred'"})
			return
		}

		if err := models.SetTheme(srv.DB, theme); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save theme"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"theme":   theme,
			"message": "Theme updated successfully",
		})
	}
}

// settingsPage renders the settings page
func settingsPage(c *gin.Context) {
	c.HTML(http.StatusOK, "settings.html", gin.H{
		"title": "Settings - Network Monitor",
	})
}
