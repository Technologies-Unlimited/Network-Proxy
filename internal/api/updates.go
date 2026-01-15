package api

import (
	"net/http"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/updater"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

var globalUpdater *updater.Updater

var currentVersionInfo struct {
	Version   string
	CommitSHA string
}

// InitUpdater initializes the global updater instance
func InitUpdater(version, commitSHA string) {
	globalUpdater = updater.New(version, commitSHA)
	currentVersionInfo.Version = version
	currentVersionInfo.CommitSHA = commitSHA
}

// GetUpdater returns the global updater instance
func GetUpdater() *updater.Updater {
	return globalUpdater
}

// RegisterUpdateRoutes registers the update API routes
func RegisterUpdateRoutes(router *gin.RouterGroup, srv *server.Server) {
	updates := router.Group("/updates")
	{
		updates.GET("/check", checkForUpdates())
		updates.GET("/status", getUpdateStatus())
		updates.POST("/download", downloadUpdate())
		updates.POST("/apply", applyUpdate())
		updates.GET("/version", getVersionInfo())
	}
}

// getVersionInfo returns the current version information
func getVersionInfo() gin.HandlerFunc {
	return func(c *gin.Context) {
		if globalUpdater == nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Updater not initialized",
			})
			return
		}

		lastCheck := globalUpdater.GetLastCheck()
		status := globalUpdater.GetUpdateStatus()

		response := gin.H{
			"currentVersion": currentVersionInfo.Version,
			"commitSHA":      currentVersionInfo.CommitSHA,
			"updateStatus":   status,
		}

		if lastCheck != nil {
			response["lastCheck"] = lastCheck
		}

		c.JSON(http.StatusOK, response)
	}
}

// checkForUpdates checks GitHub for available updates
func checkForUpdates() gin.HandlerFunc {
	return func(c *gin.Context) {
		if globalUpdater == nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Updater not initialized",
			})
			return
		}

		info, err := globalUpdater.CheckForUpdates()
		if err != nil {
			log.Error().Err(err).Msg("Failed to check for updates")
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success":         true,
			"currentVersion":  info.CurrentVersion,
			"latestCommitSHA": info.LatestCommitSHA,
			"latestCommitDate": info.LatestCommitDate,
			"latestCommitMsg": info.LatestCommitMsg,
			"updateAvailable": info.UpdateAvailable,
			"lastChecked":     info.LastChecked,
		})
	}
}

// getUpdateStatus returns the current update operation status
func getUpdateStatus() gin.HandlerFunc {
	return func(c *gin.Context) {
		if globalUpdater == nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Updater not initialized",
			})
			return
		}

		status := globalUpdater.GetUpdateStatus()
		c.JSON(http.StatusOK, status)
	}
}

// downloadUpdate initiates the update download and build process
func downloadUpdate() gin.HandlerFunc {
	return func(c *gin.Context) {
		if globalUpdater == nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Updater not initialized",
			})
			return
		}

		// Check current status
		status := globalUpdater.GetUpdateStatus()
		if status.Status == "downloading" || status.Status == "extracting" || status.Status == "building" {
			c.JSON(http.StatusConflict, gin.H{
				"success": false,
				"error":   "Update already in progress",
				"status":  status,
			})
			return
		}

		// Start the update in a goroutine
		go func() {
			if err := globalUpdater.DownloadAndUpdate(); err != nil {
				log.Error().Err(err).Msg("Update failed")
			}
		}()

		c.JSON(http.StatusAccepted, gin.H{
			"success": true,
			"message": "Update started. Check /api/v1/updates/status for progress.",
		})
	}
}

// applyUpdate applies a downloaded update (restarts the application)
func applyUpdate() gin.HandlerFunc {
	return func(c *gin.Context) {
		if globalUpdater == nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Updater not initialized",
			})
			return
		}

		// Check if update is ready
		status := globalUpdater.GetUpdateStatus()
		if status.Status != "complete" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "No update ready to apply",
				"status":  status,
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Applying update. The application will restart.",
		})

		// Apply the update (this will exit the application on Windows)
		go func() {
			if err := globalUpdater.ApplyUpdate(); err != nil {
				log.Error().Err(err).Msg("Failed to apply update")
			}
		}()
	}
}
