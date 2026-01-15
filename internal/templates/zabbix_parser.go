package templates

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

// ZabbixExport represents the root of a Zabbix YAML template
type ZabbixExport struct {
	ZabbixExport ZabbixRoot `yaml:"zabbix_export"`
}

// ZabbixRoot contains the main template data
type ZabbixRoot struct {
	Version        string           `yaml:"version"`
	TemplateGroups []TemplateGroup  `yaml:"template_groups"`
	Templates      []ZabbixTemplate `yaml:"templates"`
}

// TemplateGroup represents a Zabbix template group
type TemplateGroup struct {
	UUID string `yaml:"uuid"`
	Name string `yaml:"name"`
}

// ZabbixTemplate represents a single Zabbix template
type ZabbixTemplate struct {
	UUID            string            `yaml:"uuid"`
	Template        string            `yaml:"template"`
	Name            string            `yaml:"name"`
	Description     string            `yaml:"description"`
	Vendor          VendorInfo        `yaml:"vendor"`
	Items           []ZabbixItem      `yaml:"items"`
	DiscoveryRules  []DiscoveryRule   `yaml:"discovery_rules"`
}

// VendorInfo contains template vendor information
type VendorInfo struct {
	Name    string `yaml:"name"`
	Version string `yaml:"version"`
}

// ZabbixItem represents an SNMP item to poll
type ZabbixItem struct {
	UUID        string            `yaml:"uuid"`
	Name        string            `yaml:"name"`
	Type        string            `yaml:"type"`
	SNMPOID     string            `yaml:"snmp_oid"`
	Key         string            `yaml:"key"`
	Description string            `yaml:"description"`
	Units       string            `yaml:"units"`
	ValueType   string            `yaml:"value_type"`
	Tags        []ZabbixTag       `yaml:"tags"`
}

// DiscoveryRule contains discovery rules with item prototypes
type DiscoveryRule struct {
	UUID           string              `yaml:"uuid"`
	Name           string              `yaml:"name"`
	Type           string              `yaml:"type"`
	SNMPOID        string              `yaml:"snmp_oid"`
	Key            string              `yaml:"key"`
	Description    string              `yaml:"description"`
	ItemPrototypes []ZabbixItem        `yaml:"item_prototypes"`
}

// ZabbixTag represents a tag on an item
type ZabbixTag struct {
	Tag   string `yaml:"tag"`
	Value string `yaml:"value"`
}

// ParsedOID represents an extracted OID ready for import
type ParsedOID struct {
	OID           string   `json:"oid"`
	Name          string   `json:"name"`
	Description   string   `json:"description"`
	Unit          string   `json:"unit"`
	DataType      string   `json:"dataType"`
	Vendor        string   `json:"vendor"`
	TemplateName  string   `json:"templateName"`
	Category      string   `json:"category"`      // e.g., "cpu", "memory", "interface"
	Tags          []string `json:"tags"`
}

// TemplateInfo represents info about a parsed template
type TemplateInfo struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Vendor      string      `json:"vendor"`
	FilePath    string      `json:"filePath"`
	OIDCount    int         `json:"oidCount"`
	OIDs        []ParsedOID `json:"oids"`
}

// OID extraction regex patterns
var (
	getOIDPattern  = regexp.MustCompile(`get\[([0-9.]+)\]`)
	walkOIDPattern = regexp.MustCompile(`walk\[([0-9.,\s]+)\]`)
	discoveryOIDPattern = regexp.MustCompile(`discovery\[([^\]]+)\]`)
)

// ParseZabbixTemplate parses a single Zabbix YAML template file
func ParseZabbixTemplate(filePath string) (*TemplateInfo, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	var export ZabbixExport
	if err := yaml.Unmarshal(data, &export); err != nil {
		return nil, fmt.Errorf("failed to parse YAML: %w", err)
	}

	if len(export.ZabbixExport.Templates) == 0 {
		return nil, fmt.Errorf("no templates found in file")
	}

	template := export.ZabbixExport.Templates[0]
	info := &TemplateInfo{
		Name:        template.Name,
		Description: template.Description,
		Vendor:      template.Vendor.Name,
		FilePath:    filePath,
		OIDs:        []ParsedOID{},
	}

	// Extract OIDs from items
	for _, item := range template.Items {
		if item.Type != "SNMP_AGENT" || item.SNMPOID == "" {
			continue
		}
		oids := extractOIDs(item, template.Name, info.Vendor)
		info.OIDs = append(info.OIDs, oids...)
	}

	// Extract OIDs from discovery rules
	for _, rule := range template.DiscoveryRules {
		// Discovery rule itself may have OIDs
		if rule.Type == "SNMP_AGENT" && rule.SNMPOID != "" {
			discoveryItem := ZabbixItem{
				Name:        rule.Name,
				Type:        rule.Type,
				SNMPOID:     rule.SNMPOID,
				Description: rule.Description,
			}
			oids := extractOIDs(discoveryItem, template.Name, info.Vendor)
			info.OIDs = append(info.OIDs, oids...)
		}

		// Extract from item prototypes
		for _, item := range rule.ItemPrototypes {
			if item.Type != "SNMP_AGENT" || item.SNMPOID == "" {
				continue
			}
			oids := extractOIDs(item, template.Name, info.Vendor)
			info.OIDs = append(info.OIDs, oids...)
		}
	}

	info.OIDCount = len(info.OIDs)
	return info, nil
}

// extractOIDs extracts individual OIDs from a Zabbix item
func extractOIDs(item ZabbixItem, templateName, vendor string) []ParsedOID {
	var results []ParsedOID

	// Determine category from tags
	category := ""
	var tags []string
	for _, tag := range item.Tags {
		tags = append(tags, tag.Value)
		if tag.Tag == "component" {
			category = tag.Value
		}
	}

	// Map Zabbix value types to our data types
	dataType := mapValueType(item.ValueType)

	// Extract single OID from get[]
	if matches := getOIDPattern.FindStringSubmatch(item.SNMPOID); len(matches) > 1 {
		oid := ParsedOID{
			OID:          matches[1],
			Name:         item.Name,
			Description:  cleanDescription(item.Description),
			Unit:         item.Units,
			DataType:     dataType,
			Vendor:       vendor,
			TemplateName: templateName,
			Category:     category,
			Tags:         tags,
		}
		results = append(results, oid)
	}

	// Extract multiple OIDs from walk[]
	if matches := walkOIDPattern.FindStringSubmatch(item.SNMPOID); len(matches) > 1 {
		oidList := strings.Split(matches[1], ",")
		for i, oidStr := range oidList {
			oidStr = strings.TrimSpace(oidStr)
			if oidStr == "" {
				continue
			}
			name := item.Name
			if len(oidList) > 1 {
				name = fmt.Sprintf("%s (OID %d)", item.Name, i+1)
			}
			oid := ParsedOID{
				OID:          oidStr,
				Name:         name,
				Description:  cleanDescription(item.Description),
				Unit:         item.Units,
				DataType:     dataType,
				Vendor:       vendor,
				TemplateName: templateName,
				Category:     category,
				Tags:         tags,
			}
			results = append(results, oid)
		}
	}

	// Extract OIDs from discovery[] patterns
	if matches := discoveryOIDPattern.FindStringSubmatch(item.SNMPOID); len(matches) > 1 {
		// Discovery patterns contain key-value pairs like {#SNMPVALUE},1.3.6.1.2.1.2.2.1.1
		parts := strings.Split(matches[1], ",")
		for _, part := range parts {
			part = strings.TrimSpace(part)
			// Skip macro placeholders
			if strings.HasPrefix(part, "{#") || part == "" {
				continue
			}
			// Check if it looks like an OID
			if regexp.MustCompile(`^[0-9.]+$`).MatchString(part) {
				oid := ParsedOID{
					OID:          part,
					Name:         item.Name,
					Description:  cleanDescription(item.Description),
					Unit:         item.Units,
					DataType:     dataType,
					Vendor:       vendor,
					TemplateName: templateName,
					Category:     category,
					Tags:         tags,
				}
				results = append(results, oid)
			}
		}
	}

	return results
}

// mapValueType converts Zabbix value types to our data types
func mapValueType(zabbixType string) string {
	switch strings.ToUpper(zabbixType) {
	case "FLOAT":
		return "gauge"
	case "UNSIGNED", "":
		return "counter"
	case "CHAR", "TEXT", "LOG":
		return "string"
	default:
		return "integer"
	}
}

// cleanDescription removes extra whitespace and formatting from descriptions
func cleanDescription(desc string) string {
	// Remove leading/trailing whitespace
	desc = strings.TrimSpace(desc)
	// Replace multiple newlines with single space
	desc = regexp.MustCompile(`\s+`).ReplaceAllString(desc, " ")
	// Truncate if too long
	if len(desc) > 500 {
		desc = desc[:497] + "..."
	}
	return desc
}

// ScanTemplatesDirectory scans a directory for Zabbix templates
func ScanTemplatesDirectory(dir string) ([]TemplateInfo, error) {
	var templates []TemplateInfo

	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Skip directories and non-YAML files
		if info.IsDir() {
			return nil
		}
		if !strings.HasSuffix(strings.ToLower(info.Name()), ".yaml") &&
			!strings.HasSuffix(strings.ToLower(info.Name()), ".yml") {
			return nil
		}

		// Parse the template
		templateInfo, err := ParseZabbixTemplate(path)
		if err != nil {
			// Log but continue - some files might not be valid templates
			fmt.Printf("Warning: failed to parse %s: %v\n", path, err)
			return nil
		}

		templates = append(templates, *templateInfo)
		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to scan directory: %w", err)
	}

	return templates, nil
}

// GetVendorTemplates returns templates grouped by vendor
func GetVendorTemplates(templates []TemplateInfo) map[string][]TemplateInfo {
	vendorMap := make(map[string][]TemplateInfo)
	for _, t := range templates {
		vendor := t.Vendor
		if vendor == "" {
			vendor = "Unknown"
		}
		vendorMap[vendor] = append(vendorMap[vendor], t)
	}
	return vendorMap
}

// DeduplicateOIDs removes duplicate OIDs from a list
func DeduplicateOIDs(oids []ParsedOID) []ParsedOID {
	seen := make(map[string]bool)
	var result []ParsedOID

	for _, oid := range oids {
		if !seen[oid.OID] {
			seen[oid.OID] = true
			result = append(result, oid)
		}
	}

	return result
}
