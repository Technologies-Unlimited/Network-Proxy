package api

import (
	"net/http"
	"path/filepath"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/templates"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/thothos"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// RegisterTemplateRoutes registers template-related API routes
func RegisterTemplateRoutes(router *gin.RouterGroup, srv *server.Server) {
	templateGroup := router.Group("/zabbix-templates")
	{
		templateGroup.GET("", listTemplates(srv))
		templateGroup.GET("/:vendor", listVendorTemplates(srv))
		templateGroup.GET("/:vendor/:template", getTemplateOIDs(srv))
		templateGroup.POST("/import", importTemplateOIDs(srv))
		templateGroup.POST("/import-all", importAllTemplateOIDs(srv))
	}
}

// listTemplates returns all available Zabbix templates
func listTemplates(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		templatesDir := filepath.Join(".", "templates", "snmp")

		templateList, err := templates.ScanTemplatesDirectory(templatesDir)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to scan templates directory: " + err.Error(),
			})
			return
		}

		// Group by vendor
		vendorMap := templates.GetVendorTemplates(templateList)

		// Build summary response
		type VendorSummary struct {
			Name          string `json:"name"`
			TemplateCount int    `json:"templateCount"`
			TotalOIDs     int    `json:"totalOids"`
		}

		var vendors []VendorSummary
		totalOIDs := 0
		totalTemplates := 0

		for vendor, tmpls := range vendorMap {
			oidCount := 0
			for _, t := range tmpls {
				oidCount += t.OIDCount
			}
			vendors = append(vendors, VendorSummary{
				Name:          vendor,
				TemplateCount: len(tmpls),
				TotalOIDs:     oidCount,
			})
			totalOIDs += oidCount
			totalTemplates += len(tmpls)
		}

		c.JSON(http.StatusOK, gin.H{
			"vendors":        vendors,
			"totalTemplates": totalTemplates,
			"totalOids":      totalOIDs,
		})
	}
}

// listVendorTemplates returns templates for a specific vendor
func listVendorTemplates(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		vendor := c.Param("vendor")
		templatesDir := filepath.Join(".", "templates", "snmp")

		templateList, err := templates.ScanTemplatesDirectory(templatesDir)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to scan templates directory: " + err.Error(),
			})
			return
		}

		// Filter by vendor (case-insensitive partial match)
		var vendorTemplates []templates.TemplateInfo
		for _, t := range templateList {
			if containsIgnoreCase(t.Name, vendor) ||
			   containsIgnoreCase(t.Vendor, vendor) ||
			   containsIgnoreCase(t.FilePath, vendor) {
				vendorTemplates = append(vendorTemplates, t)
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"vendor":    vendor,
			"templates": vendorTemplates,
			"count":     len(vendorTemplates),
		})
	}
}

// getTemplateOIDs returns all OIDs from a specific template
func getTemplateOIDs(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		vendor := c.Param("vendor")
		templateName := c.Param("template")
		templatesDir := filepath.Join(".", "templates", "snmp")

		templateList, err := templates.ScanTemplatesDirectory(templatesDir)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to scan templates directory: " + err.Error(),
			})
			return
		}

		// Find matching template
		for _, t := range templateList {
			if (containsIgnoreCase(t.Name, vendor) || containsIgnoreCase(t.FilePath, vendor)) &&
			   containsIgnoreCase(t.Name, templateName) {
				c.JSON(http.StatusOK, gin.H{
					"template": t.Name,
					"vendor":   t.Vendor,
					"oids":     t.OIDs,
					"count":    t.OIDCount,
				})
				return
			}
		}

		c.JSON(http.StatusNotFound, gin.H{
			"error": "Template not found",
		})
	}
}

// ImportRequest represents an OID import request
type ImportRequest struct {
	OIDs []templates.ParsedOID `json:"oids"`
}

// importTemplateOIDs imports selected OIDs into the database
func importTemplateOIDs(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req ImportRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid request body: " + err.Error(),
			})
			return
		}

		if len(req.OIDs) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "No OIDs provided",
			})
			return
		}

		// Get company ID from context
		companyID := middleware.GetCompanyID(c)
		if companyID == "" {
			companyID = "default"
		}

		// Get ThothOS client for syncing
		var thothosClient *thothos.Client
		if companyID != "default" {
			client, err := getThothOSClient(srv)
			if err != nil {
				log.Warn().Err(err).Msg("Failed to create ThothOS client for OID sync")
			} else {
				thothosClient = client
			}
		}

		imported := 0
		skipped := 0
		errors := []string{}

		for _, parsedOID := range req.OIDs {
			// Check if OID already exists
			var existing models.OID
			result := srv.DB.Where("oid = ? AND company_id = ?", parsedOID.OID, companyID).First(&existing)
			if result.Error == nil {
				// OID exists, skip
				skipped++
				continue
			}

			// Create new OID
			oid := models.OID{
				CompanyID:   companyID,
				OID:         parsedOID.OID,
				Name:        parsedOID.Name,
				Description: buildDescription(parsedOID),
				Unit:        parsedOID.Unit,
				DataType:    parsedOID.DataType,
			}

			// Sync to ThothOS first if connected
			if thothosClient != nil {
				input := thothos.OIDInput{
					OIDName:     oid.Name,
					OID:         oid.OID,
					Description: oid.Description,
				}
				thothosOID, err := thothosClient.CreateOID(input)
				if err != nil {
					log.Warn().Err(err).Str("oid", oid.OID).Msg("Failed to sync OID to ThothOS")
				} else {
					oid.ThothOSID = thothosOID.ID
				}
			}

			// Save to local database
			if err := srv.DB.Create(&oid).Error; err != nil {
				errors = append(errors, "Failed to create OID "+parsedOID.OID+": "+err.Error())
				continue
			}

			imported++
		}

		c.JSON(http.StatusOK, gin.H{
			"imported": imported,
			"skipped":  skipped,
			"errors":   errors,
			"total":    len(req.OIDs),
		})
	}
}

// importAllTemplateOIDs imports all OIDs from all templates
func importAllTemplateOIDs(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		templatesDir := filepath.Join(".", "templates", "snmp")

		templateList, err := templates.ScanTemplatesDirectory(templatesDir)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to scan templates directory: " + err.Error(),
			})
			return
		}

		// Collect all unique OIDs
		var allOIDs []templates.ParsedOID
		for _, t := range templateList {
			allOIDs = append(allOIDs, t.OIDs...)
		}

		// Deduplicate
		allOIDs = templates.DeduplicateOIDs(allOIDs)

		// Get company ID from context
		companyID := middleware.GetCompanyID(c)
		if companyID == "" {
			companyID = "default"
		}

		// Get ThothOS client for syncing
		var thothosClient *thothos.Client
		if companyID != "default" {
			client, err := getThothOSClient(srv)
			if err != nil {
				log.Warn().Err(err).Msg("Failed to create ThothOS client for OID sync")
			} else {
				thothosClient = client
			}
		}

		imported := 0
		skipped := 0

		for _, parsedOID := range allOIDs {
			// Check if OID already exists
			var existing models.OID
			result := srv.DB.Where("oid = ? AND company_id = ?", parsedOID.OID, companyID).First(&existing)
			if result.Error == nil {
				skipped++
				continue
			}

			// Create new OID
			oid := models.OID{
				CompanyID:   companyID,
				OID:         parsedOID.OID,
				Name:        parsedOID.Name,
				Description: buildDescription(parsedOID),
				Unit:        parsedOID.Unit,
				DataType:    parsedOID.DataType,
			}

			// Sync to ThothOS first if connected
			if thothosClient != nil {
				input := thothos.OIDInput{
					OIDName:     oid.Name,
					OID:         oid.OID,
					Description: oid.Description,
				}
				thothosOID, err := thothosClient.CreateOID(input)
				if err != nil {
					log.Warn().Err(err).Str("oid", oid.OID).Msg("Failed to sync OID to ThothOS")
				} else {
					oid.ThothOSID = thothosOID.ID
				}
			}

			// Save to local database
			if err := srv.DB.Create(&oid).Error; err != nil {
				continue
			}

			imported++
		}

		c.JSON(http.StatusOK, gin.H{
			"imported":       imported,
			"skipped":        skipped,
			"totalProcessed": len(allOIDs),
			"totalTemplates": len(templateList),
		})
	}
}

// buildDescription creates a rich description from parsed OID data
func buildDescription(oid templates.ParsedOID) string {
	desc := oid.Description
	if oid.Vendor != "" || oid.TemplateName != "" {
		if desc != "" {
			desc += " | "
		}
		if oid.Vendor != "" {
			desc += "Vendor: " + oid.Vendor
		}
		if oid.TemplateName != "" {
			if oid.Vendor != "" {
				desc += ", "
			}
			desc += "Template: " + oid.TemplateName
		}
	}
	return desc
}

// containsIgnoreCase checks if s contains substr (case-insensitive)
func containsIgnoreCase(s, substr string) bool {
	return len(s) >= len(substr) &&
		   (s == substr ||
		    len(substr) == 0 ||
		    (len(s) > 0 && len(substr) > 0 &&
		     contains(toLower(s), toLower(substr))))
}

func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func toLower(s string) string {
	b := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			c += 'a' - 'A'
		}
		b[i] = c
	}
	return string(b)
}
