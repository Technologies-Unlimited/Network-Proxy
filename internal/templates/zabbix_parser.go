package templates

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/rs/zerolog/log"
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
	OID          string   `json:"oid"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Unit         string   `json:"unit"`
	DataType     string   `json:"dataType"`
	MIB          string   `json:"mib"`          // e.g., "TIMETRA-SYSTEM-MIB", "IF-MIB"
	Manufacturer string   `json:"manufacturer"` // e.g., "Cisco", "Fortinet"
	Model        string   `json:"model"`        // e.g., "Catalyst 3750", "FortiGate"
	TemplateName string   `json:"templateName"`
	Category     string   `json:"category"` // e.g., "cpu", "memory", "interface"
	Tags         []string `json:"tags"`
}

// TemplateInfo represents info about a parsed template
type TemplateInfo struct {
	Name         string      `json:"name"`
	Description  string      `json:"description"`
	Manufacturer string      `json:"manufacturer"` // e.g., "Cisco", "Fortinet"
	Model        string      `json:"model"`        // e.g., "Catalyst 3750", "FortiGate"
	FilePath     string      `json:"filePath"`
	OIDCount     int         `json:"oidCount"`
	OIDs         []ParsedOID `json:"oids"`
}

// OID extraction regex patterns
var (
	getOIDPattern       = regexp.MustCompile(`get\[([0-9.]+)\]`)
	walkOIDPattern      = regexp.MustCompile(`walk\[([0-9.,\s]+)\]`)
	discoveryOIDPattern = regexp.MustCompile(`discovery\[([^\]]+)\]`)
	mibPattern          = regexp.MustCompile(`(?i)^MIB:\s*([A-Za-z0-9_-]+)`)
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

	// Extract manufacturer and model from folder path
	// e.g., templates/snmp/cisco/cisco_catalyst_3750_24fs_snmp/... -> Manufacturer: "Cisco", Model: "Catalyst 3750 24FS"
	manufacturer, model := extractManufacturerAndModelFromPath(filePath)

	info := &TemplateInfo{
		Name:         template.Name,
		Description:  template.Description,
		Manufacturer: manufacturer,
		Model:        model,
		FilePath:     filePath,
		OIDs:         []ParsedOID{},
	}

	// Extract OIDs from items
	for _, item := range template.Items {
		if item.Type != "SNMP_AGENT" || item.SNMPOID == "" {
			continue
		}
		oids := extractOIDs(item, template.Name, manufacturer, model)
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
			oids := extractOIDs(discoveryItem, template.Name, manufacturer, model)
			info.OIDs = append(info.OIDs, oids...)
		}

		// Extract from item prototypes
		for _, item := range rule.ItemPrototypes {
			if item.Type != "SNMP_AGENT" || item.SNMPOID == "" {
				continue
			}
			oids := extractOIDs(item, template.Name, manufacturer, model)
			info.OIDs = append(info.OIDs, oids...)
		}
	}

	info.OIDCount = len(info.OIDs)
	return info, nil
}

// extractManufacturerAndModelFromPath extracts manufacturer and model from the template file path
// Handles two structures:
// 1. templates/snmp/{manufacturer}/{model}/template.yaml -> e.g., cisco/cisco_catalyst_3750_24fs_snmp/
// 2. templates/snmp/{manufacturer_model}/template.yaml -> e.g., alcatel_timetra_snmp/
func extractManufacturerAndModelFromPath(filePath string) (string, string) {
	// Normalize path separators
	normalizedPath := filepath.ToSlash(filePath)
	parts := strings.Split(normalizedPath, "/")

	log.Debug().
		Str("originalPath", filePath).
		Str("normalizedPath", normalizedPath).
		Int("numParts", len(parts)).
		Msg("Extracting manufacturer and model from path")

	manufacturer := "Unknown"
	model := "General"

	// Look for "snmp" folder
	for i, part := range parts {
		if part == "snmp" && i+1 < len(parts) {
			firstFolder := parts[i+1]

			// Check if this is a 2-level structure (manufacturer/model) or 1-level (combined)
			// If there's another non-file folder after the first one, it's 2-level
			if i+3 < len(parts) && !strings.HasSuffix(strings.ToLower(parts[i+2]), ".yaml") && !strings.HasSuffix(strings.ToLower(parts[i+2]), ".yml") {
				// 2-level structure: snmp/{manufacturer}/{model}/file.yaml
				manufacturer = formatManufacturerName(firstFolder)
				model = formatModelName(parts[i+2], firstFolder)
				log.Debug().
					Str("structure", "2-level").
					Str("manufacturerFolder", firstFolder).
					Str("modelFolder", parts[i+2]).
					Str("manufacturer", manufacturer).
					Str("model", model).
					Msg("Extracted from 2-level structure")
			} else {
				// 1-level structure: snmp/{manufacturer_model}/file.yaml
				// The folder name contains both manufacturer and model info
				manufacturer = formatManufacturerName(firstFolder)
				model = formatModelName(firstFolder, "")
				log.Debug().
					Str("structure", "1-level").
					Str("folder", firstFolder).
					Str("manufacturer", manufacturer).
					Str("model", model).
					Msg("Extracted from 1-level structure")
			}
			break
		}
	}

	if manufacturer == "Unknown" {
		log.Warn().
			Str("path", filePath).
			Str("normalizedPath", normalizedPath).
			Msg("Could not extract manufacturer from path - 'snmp' folder not found")
	}

	return manufacturer, model
}

// formatManufacturerName formats a folder name into a proper manufacturer name
func formatManufacturerName(name string) string {
	// Map of folder names to display names (exact matches)
	manufacturerMap := map[string]string{
		"cisco":                        "Cisco",
		"aruba":                        "Aruba",
		"arista_snmp":                  "Arista",
		"fortinet":                     "Fortinet",
		"juniper_snmp":                 "Juniper",
		"juniper_mx_snmp":              "Juniper",
		"juniper_mx_netconf":           "Juniper",
		"huawei_snmp":                  "Huawei",
		"mikrotik":                     "MikroTik",
		"paloalto":                     "Palo Alto",
		"f5_bigip_snmp":                "F5",
		"checkpoint":                   "Check Point",
		"dell_force_s_series_snmp":     "Dell",
		"dlink_des_snmp":               "D-Link",
		"dlink_des7200_snmp":           "D-Link",
		"extreme_snmp":                 "Extreme Networks",
		"hp_hh3c_snmp":                 "HPE/H3C",
		"hp_hpn_snmp":                  "HPE",
		"netgear_snmp":                 "Netgear",
		"ubiquiti_airos_snmp":          "Ubiquiti",
		"brocade_fc_sw_snmp":           "Brocade",
		"brocade_foundry_sw_snmp":      "Brocade",
		"alcatel_timetra_snmp":         "Alcatel-Lucent",
		"mellanox_snmp":                "Mellanox",
		"intel_qlogic_infiniband_snmp": "Intel/QLogic",
		"tplink_snmp":                  "TP-Link",
		"zyxel_snmp":                   "Zyxel",
		"qtech_snmp":                   "QTECH",
		"ciena":                        "Ciena",
		"ribbon":                       "Ribbon",
		"stormshield_sns":              "Stormshield",
		"morningstar":                  "Morningstar",
		"vyatta_virtual_router":        "Vyatta",
		"meraki_http":                  "Cisco Meraki",
		"velocloud_http":               "VMware SD-WAN",
		"generic_snmp":                 "Generic",
		"generic_snmp_snmp":            "Generic",
		"icmp_ping":                    "Generic",
	}

	// Check exact match first
	if displayName, ok := manufacturerMap[name]; ok {
		return displayName
	}

	// Map of prefixes to manufacturers (for partial matching)
	prefixMap := map[string]string{
		"cisco":      "Cisco",
		"aruba":      "Aruba",
		"arista":     "Arista",
		"fortinet":   "Fortinet",
		"fortigate":  "Fortinet",
		"juniper":    "Juniper",
		"huawei":     "Huawei",
		"mikrotik":   "MikroTik",
		"paloalto":   "Palo Alto",
		"palo":       "Palo Alto",
		"f5":         "F5",
		"checkpoint": "Check Point",
		"dell":       "Dell",
		"dlink":      "D-Link",
		"extreme":    "Extreme Networks",
		"hp":         "HPE",
		"netgear":    "Netgear",
		"ubiquiti":   "Ubiquiti",
		"brocade":    "Brocade",
		"alcatel":    "Alcatel-Lucent",
		"mellanox":   "Mellanox",
		"intel":      "Intel",
		"tplink":     "TP-Link",
		"zyxel":      "Zyxel",
		"qtech":      "QTECH",
		"ciena":      "Ciena",
		"ribbon":     "Ribbon",
		"stormshield":"Stormshield",
		"morningstar":"Morningstar",
		"vyatta":     "Vyatta",
		"meraki":     "Cisco Meraki",
		"velocloud":  "VMware SD-WAN",
		"generic":    "Generic",
	}

	// Try prefix matching - check if name starts with any known prefix
	lowerName := strings.ToLower(name)
	for prefix, displayName := range prefixMap {
		if strings.HasPrefix(lowerName, prefix) {
			return displayName
		}
	}

	// Fallback: take first word before underscore and capitalize it
	if idx := strings.Index(name, "_"); idx > 0 {
		firstWord := name[:idx]
		return strings.ToUpper(string(firstWord[0])) + strings.ToLower(firstWord[1:])
	}

	// Last resort: capitalize first letter of each word
	words := strings.Split(strings.ReplaceAll(name, "_", " "), " ")
	for i, word := range words {
		if len(word) > 0 {
			words[i] = strings.ToUpper(string(word[0])) + strings.ToLower(word[1:])
		}
	}
	return strings.Join(words, " ")
}

// formatModelName formats a model folder name into a readable model name
// e.g., "cisco_catalyst_3750_24fs_snmp" with manufacturer "cisco" -> "Catalyst 3750 24FS"
func formatModelName(modelFolder, manufacturerFolder string) string {
	// Remove common suffixes
	model := modelFolder
	model = strings.TrimSuffix(model, "_snmp")
	model = strings.TrimSuffix(model, "_snmpv2")
	model = strings.TrimSuffix(model, "_snmpv3")
	model = strings.TrimSuffix(model, "_http")
	model = strings.TrimSuffix(model, "_netconf")

	// Remove manufacturer prefix if present (exact folder match)
	model = strings.TrimPrefix(model, manufacturerFolder+"_")

	// Also strip common manufacturer name prefixes from the model
	// This handles cases like "f5_bigip" -> "bigip" when manufacturer is "F5"
	manufacturerPrefixes := []string{
		"cisco_", "aruba_", "arista_", "fortinet_", "fortigate_", "juniper_",
		"huawei_", "mikrotik_", "paloalto_", "palo_", "f5_", "checkpoint_",
		"dell_", "dlink_", "extreme_", "hp_", "hpe_", "netgear_", "ubiquiti_",
		"brocade_", "alcatel_", "mellanox_", "intel_", "tplink_", "zyxel_",
		"qtech_", "ciena_", "ribbon_", "stormshield_", "morningstar_", "vyatta_",
		"meraki_", "velocloud_", "generic_",
	}
	lowerModel := strings.ToLower(model)
	for _, prefix := range manufacturerPrefixes {
		if strings.HasPrefix(lowerModel, prefix) {
			model = model[len(prefix):]
			break
		}
	}

	// Handle special cases where model folder equals manufacturer folder
	if model == "" || model == manufacturerFolder {
		return "General"
	}

	// Replace underscores with spaces and capitalize words
	words := strings.Split(model, "_")
	for i, word := range words {
		if len(word) > 0 {
			// Keep certain acronyms uppercase
			upper := strings.ToUpper(word)
			if isAcronym(upper) {
				words[i] = upper
			} else {
				words[i] = strings.ToUpper(string(word[0])) + strings.ToLower(word[1:])
			}
		}
	}
	return strings.Join(words, " ")
}

// isAcronym checks if a word should remain uppercase
func isAcronym(word string) bool {
	acronyms := map[string]bool{
		"ASA": true, "ASAV": true, "FTD": true, "MX": true, "EX": true,
		"SRX": true, "QFX": true, "SD": true, "WAN": true, "VPN": true,
		"HA": true, "SDWAN": true, "HTTP": true, "SNMP": true, "IP": true,
		"CPU": true, "RAM": true, "SSD": true, "HDD": true, "NVMe": true,
		"FC": true, "SW": true, "AP": true, "WLC": true, "ISE": true,
		"DNA": true, "ACI": true, "UCS": true, "HCI": true, "VDI": true,
		"24FS": true, "24PS": true, "24TS": true, "48PS": true, "48TS": true,
		"48FS": true, "9000": true, "3750": true, "2960": true, "3850": true,
		"BIGIP": true, "LTM": true, "GTM": true, "APM": true, "AFM": true,
		"DES": true, "DES7200": true, "DGS": true, "DXS": true,
	}
	return acronyms[word]
}

// extractOIDs extracts individual OIDs from a Zabbix item
func extractOIDs(item ZabbixItem, templateName, manufacturer, model string) []ParsedOID {
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

	// Extract MIB from description (e.g., "MIB: TIMETRA-SYSTEM-MIB")
	mib := extractMIB(item.Description)

	// Extract single OID from get[]
	if matches := getOIDPattern.FindStringSubmatch(item.SNMPOID); len(matches) > 1 {
		oid := ParsedOID{
			OID:          matches[1],
			Name:         item.Name,
			Description:  cleanDescription(item.Description),
			Unit:         item.Units,
			DataType:     dataType,
			MIB:          mib,
			Manufacturer: manufacturer,
			Model:        model,
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
				MIB:          mib,
				Manufacturer: manufacturer,
				Model:        model,
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
					MIB:          mib,
					Manufacturer: manufacturer,
					Model:        model,
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

// extractMIB extracts the MIB name from description text
// e.g., "MIB: TIMETRA-SYSTEM-MIB\nThe value of..." -> "TIMETRA-SYSTEM-MIB"
func extractMIB(description string) string {
	// Split by newlines and check first line
	lines := strings.Split(strings.TrimSpace(description), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if matches := mibPattern.FindStringSubmatch(line); len(matches) > 1 {
			return matches[1]
		}
	}
	return ""
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

	// Remove "MIB: XXX" line since we display it separately
	lines := strings.Split(desc, "\n")
	var cleanedLines []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		// Skip lines that start with "MIB:"
		if !mibPattern.MatchString(trimmed) {
			cleanedLines = append(cleanedLines, line)
		}
	}
	desc = strings.Join(cleanedLines, "\n")

	// Remove leading/trailing whitespace again after removing MIB line
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

// GetVendorTemplates returns templates grouped by manufacturer (kept name for API compatibility)
func GetVendorTemplates(templates []TemplateInfo) map[string][]TemplateInfo {
	manufacturerMap := make(map[string][]TemplateInfo)
	for _, t := range templates {
		manufacturer := t.Manufacturer
		if manufacturer == "" {
			manufacturer = "Unknown"
		}
		manufacturerMap[manufacturer] = append(manufacturerMap[manufacturer], t)
	}
	return manufacturerMap
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
