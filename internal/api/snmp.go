package api

import (
	"net/http"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/thothos"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// listSNMPTemplates returns all SNMP templates
func listSNMPTemplates(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var templates []models.SNMPTemplate
		result := srv.DB.Preload("OIDs").Find(&templates)

		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"templates": templates,
			"count":     len(templates),
		})
	}
}

// createSNMPTemplate creates a new SNMP template
func createSNMPTemplate(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var template models.SNMPTemplate

		if err := c.ShouldBindJSON(&template); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if err := srv.DB.Create(&template).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"template": template})
	}
}

// getSNMPTemplate returns a single SNMP template
func getSNMPTemplate(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var template models.SNMPTemplate

		result := srv.DB.Preload("OIDs").First(&template, "id = ?", id)

		if result.Error != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Template not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"template": template})
	}
}

// updateSNMPTemplate updates an existing SNMP template
func updateSNMPTemplate(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var template models.SNMPTemplate

		if err := srv.DB.First(&template, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Template not found"})
			return
		}

		if err := c.ShouldBindJSON(&template); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if err := srv.DB.Save(&template).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"template": template})
	}
}

// deleteSNMPTemplate deletes an SNMP template
func deleteSNMPTemplate(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var template models.SNMPTemplate

		if err := srv.DB.First(&template, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Template not found"})
			return
		}

		if err := srv.DB.Delete(&template).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Template deleted successfully"})
	}
}

// listOIDs returns all OIDs
func listOIDs(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var oids []models.OID
		result := srv.DB.Find(&oids)

		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"oids":  oids,
			"count": len(oids),
		})
	}
}

// createOID creates a new OID and syncs to ThothOS
func createOID(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var oid models.OID

		if err := c.ShouldBindJSON(&oid); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Set CompanyID from auth context for multi-tenancy
		companyID := middleware.GetCompanyID(c)
		if companyID == "" {
			companyID = "default" // Fallback for standalone mode
		}
		oid.CompanyID = companyID

		// Try to sync to ThothOS first if connected
		thothosClient, err := getThothOSClient(srv)
		if err == nil && thothosClient != nil && companyID != "default" {
			// Create in ThothOS
			input := thothos.OIDInput{
				OIDName:     oid.Name,
				OID:         oid.OID,
				Description: oid.Description,
			}

			thothosOID, err := thothosClient.CreateOID(input)
			if err != nil {
				log.Warn().Err(err).Msg("Failed to sync OID to ThothOS, saving locally only")
			} else {
				// Store the ThothOS ID for future syncing
				oid.ThothOSID = thothosOID.ID
				log.Info().
					Str("thothosId", thothosOID.ID).
					Str("oid", oid.OID).
					Msg("OID synced to ThothOS")
			}
		}

		// Save to local database
		if err := srv.DB.Create(&oid).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"oid": oid})
	}
}

// getOID returns a single OID
func getOID(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var oid models.OID

		if err := srv.DB.First(&oid, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "OID not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"oid": oid})
	}
}

// updateOID updates an existing OID and syncs to ThothOS
func updateOID(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var oid models.OID

		if err := srv.DB.First(&oid, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "OID not found"})
			return
		}

		// Store ThothOS ID before binding
		thothosID := oid.ThothOSID
		companyID := oid.CompanyID

		if err := c.ShouldBindJSON(&oid); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Preserve IDs
		oid.ThothOSID = thothosID
		oid.CompanyID = companyID

		// Sync to ThothOS if we have a ThothOS ID
		if thothosID != "" && companyID != "default" {
			thothosClient, err := getThothOSClient(srv)
			if err == nil && thothosClient != nil {
				input := thothos.OIDInput{
					OIDName:     oid.Name,
					OID:         oid.OID,
					Description: oid.Description,
				}

				_, err := thothosClient.UpdateOID(thothosID, input)
				if err != nil {
					log.Warn().Err(err).Str("thothosId", thothosID).Msg("Failed to sync OID update to ThothOS")
				} else {
					log.Info().Str("thothosId", thothosID).Msg("OID update synced to ThothOS")
				}
			}
		}

		if err := srv.DB.Save(&oid).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"oid": oid})
	}
}

// deleteOID deletes an OID and syncs to ThothOS
func deleteOID(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var oid models.OID

		if err := srv.DB.First(&oid, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "OID not found"})
			return
		}

		// Sync deletion to ThothOS if we have a ThothOS ID
		if oid.ThothOSID != "" && oid.CompanyID != "default" {
			thothosClient, err := getThothOSClient(srv)
			if err == nil && thothosClient != nil {
				deleted, err := thothosClient.DeleteOID(oid.ThothOSID)
				if err != nil {
					log.Warn().Err(err).Str("thothosId", oid.ThothOSID).Msg("Failed to sync OID deletion to ThothOS")
				} else if deleted {
					log.Info().Str("thothosId", oid.ThothOSID).Msg("OID deletion synced to ThothOS")
				}
			}
		}

		if err := srv.DB.Delete(&oid).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "OID deleted successfully"})
	}
}
