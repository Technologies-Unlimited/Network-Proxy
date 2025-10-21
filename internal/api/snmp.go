package api

import (
	"net/http"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/gin-gonic/gin"
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

// createOID creates a new OID
func createOID(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var oid models.OID

		if err := c.ShouldBindJSON(&oid); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

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

// updateOID updates an existing OID
func updateOID(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var oid models.OID

		if err := srv.DB.First(&oid, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "OID not found"})
			return
		}

		if err := c.ShouldBindJSON(&oid); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if err := srv.DB.Save(&oid).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"oid": oid})
	}
}

// deleteOID deletes an OID
func deleteOID(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var oid models.OID

		if err := srv.DB.First(&oid, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "OID not found"})
			return
		}

		if err := srv.DB.Delete(&oid).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "OID deleted successfully"})
	}
}
