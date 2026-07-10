package api

import (
	"sync"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/thothos"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// minPollInterval floors any template-derived poll interval so a mis-typed
// (or zero-fractional) ThothOS polling template can never turn a collector into
// a busy-loop.
const minPollInterval = 5 * time.Second

// applyMu serializes the whole apply step so the periodic config-sync loop and
// a manual /monitor/sync (or /ipam/sync) can't run reconciliation concurrently
// and, e.g., both create the same OID because each read the local set before the
// other's write landed.
var applyMu sync.Mutex

// IPAMCounts is the number of IPAM records fetched from ThothOS. IPAM is served
// live (there is no local IPAM model in this stage), so these are "fetched",
// not "persisted".
type IPAMCounts struct {
	Supernets   int `json:"supernets"`
	Subnets     int `json:"subnets"`
	Pools       int `json:"pools"`
	IPAddresses int `json:"ipAddresses"`
	VLANs       int `json:"vlans"`
}

// ApplyResult is the honest, per-run accounting of a config pull+apply: what
// was actually persisted into SQLite and pushed into the live collectors (not
// merely fetched and discarded, which was the old "synced successfully" lie).
type ApplyResult struct {
	OIDsAdopted            int        `json:"oidsAdopted"`
	OIDsCreated            int        `json:"oidsCreated"`
	OIDsUpdated            int        `json:"oidsUpdated"`
	SNMPTemplatesPersisted int        `json:"snmpTemplatesPersisted"`
	ICMPIntervalSeconds    int        `json:"icmpIntervalSeconds"`
	SNMPIntervalSeconds    int        `json:"snmpIntervalSeconds"`
	PingTimeoutSeconds     int        `json:"pingTimeoutSeconds"`
	IPAMFetched            IPAMCounts `json:"ipamFetched"`
	Warnings               []string   `json:"warnings,omitempty"`
}

// applyConfigFromClient pulls the monitoring config from ThothOS and APPLIES it:
//   - OIDs are reconciled into the local SQLite oids table (adopt by oid-string,
//     down-sync missing, update changed) — see reconcileOIDs.
//   - SNMP templates are upserted by ThothOS id.
//   - polling-template frequencies retune the LIVE collectors via SetInterval.
//   - IPAM is fetched and counted honestly (served live, not mirrored locally).
//
// Merge semantic (documented per the audit's "pick the safer semantic"): this
// is UPSERT-ONLY. A local row whose upstream counterpart has disappeared is
// LEFT IN PLACE, never hard-deleted — a transient/partial pull must not be able
// to wipe live monitoring config out from under an on-prem proxy during a
// control-plane blip. Down-sync adds and updates; it never removes.
func applyConfigFromClient(db *gorm.DB, client *thothos.Client) ApplyResult {
	applyMu.Lock()
	defer applyMu.Unlock()

	res := ApplyResult{}

	companyID := client.GetCompanyID()
	if companyID == "" {
		// Without a tenant we can't safely stamp persisted rows; still apply the
		// collector intervals (they're global to this proxy).
		res.Warnings = append(res.Warnings, "no company id on client; skipping OID/template persistence")
	} else {
		adopted, created, updated, oidWarns := reconcileOIDs(db, client, companyID)
		res.OIDsAdopted, res.OIDsCreated, res.OIDsUpdated = adopted, created, updated
		res.Warnings = append(res.Warnings, oidWarns...)

		persisted, tmplWarns := persistSNMPTemplates(db, client, companyID)
		res.SNMPTemplatesPersisted = persisted
		res.Warnings = append(res.Warnings, tmplWarns...)
	}

	icmpSecs, snmpSecs, pingSecs, intervalWarns := applyPollingIntervals(client)
	res.ICMPIntervalSeconds = icmpSecs
	res.SNMPIntervalSeconds = snmpSecs
	res.PingTimeoutSeconds = pingSecs
	res.Warnings = append(res.Warnings, intervalWarns...)

	// IPAM: fetched but served live; no local IPAM model in this stage.
	if ipam, err := client.GetIPAMConfig(); err != nil {
		res.Warnings = append(res.Warnings, "IPAM fetch: "+err.Error())
	} else {
		res.IPAMFetched = IPAMCounts{
			Supernets:   len(ipam.Supernets),
			Subnets:     len(ipam.Subnets),
			Pools:       len(ipam.Pools),
			IPAddresses: len(ipam.IPAddresses),
			VLANs:       len(ipam.VLANs),
		}
	}

	stampLastConfigSync(db)
	return res
}

// reconcileOIDs down-syncs ThothOS OIDs into the local oids table, reconciling
// in memory to avoid duplicates:
//   - upstream matches a local row by ThothOS id  -> update changed fields.
//   - upstream matches a local row by oid-string with an empty ThothOSID
//     -> ADOPT it (backfill ThothOSID) instead of creating a duplicate.
//   - upstream present nowhere locally -> create it (down-sync).
//
// Locally-created OIDs (empty ThothOSID) that have no upstream match are left
// untouched — they are the proxy's own rows, not ThothOS-owned.
func reconcileOIDs(db *gorm.DB, client *thothos.Client, companyID string) (adopted, created, updated int, warnings []string) {
	upstream, err := client.GetOIDs()
	if err != nil {
		return 0, 0, 0, []string{"OID pull: " + err.Error()}
	}

	var local []models.OID
	if err := db.Where(&models.OID{CompanyID: companyID}).Find(&local).Error; err != nil {
		return 0, 0, 0, []string{"OID local read: " + err.Error()}
	}

	byThothOSID := make(map[string]*models.OID)
	byOIDString := make(map[string]*models.OID) // first empty-ThothOSID row per oid-string
	for i := range local {
		row := &local[i]
		if row.ThothOSID != "" {
			byThothOSID[row.ThothOSID] = row
		}
	}
	for i := range local {
		row := &local[i]
		if row.ThothOSID == "" {
			if _, seen := byOIDString[row.OID]; !seen {
				byOIDString[row.OID] = row
			}
		}
	}

	for _, up := range upstream {
		if existing, ok := byThothOSID[up.ID]; ok {
			changed := false
			if existing.Name != up.OIDName {
				existing.Name = up.OIDName
				changed = true
			}
			if existing.OID != up.OID {
				existing.OID = up.OID
				changed = true
			}
			if existing.Description != up.Description {
				existing.Description = up.Description
				changed = true
			}
			if changed {
				if err := db.Save(existing).Error; err != nil {
					warnings = append(warnings, "OID update "+up.ID+": "+err.Error())
					continue
				}
				updated++
			}
			continue
		}

		if adoptee, ok := byOIDString[up.OID]; ok {
			adoptee.ThothOSID = up.ID
			adoptee.Name = up.OIDName
			adoptee.Description = up.Description
			if err := db.Save(adoptee).Error; err != nil {
				warnings = append(warnings, "OID adopt "+up.OID+": "+err.Error())
				continue
			}
			byThothOSID[up.ID] = adoptee
			delete(byOIDString, up.OID)
			adopted++
			continue
		}

		newOID := models.OID{
			CompanyID:   companyID,
			ThothOSID:   up.ID,
			OID:         up.OID,
			Name:        up.OIDName,
			Description: up.Description,
		}
		if err := db.Create(&newOID).Error; err != nil {
			warnings = append(warnings, "OID create "+up.OID+": "+err.Error())
			continue
		}
		created++
	}

	return adopted, created, updated, warnings
}

// persistSNMPTemplates upserts ThothOS SNMPv2/v3 monitoring templates into the
// local snmp_templates table keyed by ThothOS id. Credentials are NOT
// down-synced (they live in the separate ThothOS SNMP community settings and on
// the operator side), so only identity/description/version are mirrored — enough
// to make the template addressable locally and survive a ThothOS outage.
func persistSNMPTemplates(db *gorm.DB, client *thothos.Client, companyID string) (persisted int, warnings []string) {
	if v2, err := client.GetSNMPv2Templates(); err != nil {
		warnings = append(warnings, "SNMPv2 templates pull: "+err.Error())
	} else {
		for _, t := range v2 {
			if upsertSNMPTemplate(db, companyID, t.ID, t.TemplateName, t.Description, "v2c") {
				persisted++
			} else {
				warnings = append(warnings, "SNMPv2 template persist "+t.ID+" failed")
			}
		}
	}

	if v3, err := client.GetSNMPv3Templates(); err != nil {
		warnings = append(warnings, "SNMPv3 templates pull: "+err.Error())
	} else {
		for _, t := range v3 {
			if upsertSNMPTemplate(db, companyID, t.ID, t.TemplateName, t.Description, "v3") {
				persisted++
			} else {
				warnings = append(warnings, "SNMPv3 template persist "+t.ID+" failed")
			}
		}
	}

	return persisted, warnings
}

// upsertSNMPTemplate creates or updates one local SNMP template by ThothOS id.
// Returns true if the row was successfully persisted (created or updated).
func upsertSNMPTemplate(db *gorm.DB, companyID, thothosID, name, description, version string) bool {
	if thothosID == "" {
		return false
	}
	var existing models.SNMPTemplate
	err := db.Where(&models.SNMPTemplate{ThothOSID: thothosID}).First(&existing).Error
	if err == nil {
		existing.Name = name
		existing.Description = description
		existing.Version = version
		if saveErr := db.Save(&existing).Error; saveErr != nil {
			log.Warn().Err(saveErr).Str("thothosId", thothosID).Msg("Failed to update local SNMP template")
			return false
		}
		return true
	}
	if err != gorm.ErrRecordNotFound {
		log.Warn().Err(err).Str("thothosId", thothosID).Msg("Failed to read local SNMP template")
		return false
	}

	tmpl := models.SNMPTemplate{
		CompanyID:   companyID,
		ThothOSID:   thothosID,
		Name:        name,
		Description: description,
		Version:     version,
	}
	if createErr := db.Create(&tmpl).Error; createErr != nil {
		log.Warn().Err(createErr).Str("thothosId", thothosID).Msg("Failed to create local SNMP template")
		return false
	}
	return true
}

// applyPollingIntervals pushes the effective polling cadence from ThothOS
// polling templates into the LIVE collectors. The MOST aggressive (smallest)
// interval across templates wins — freshest monitoring — floored at
// minPollInterval. Returns the applied seconds for honest reporting; a zero
// means "no template frequency found, collector default unchanged".
func applyPollingIntervals(client *thothos.Client) (icmpSecs, snmpSecs, pingTimeoutSecs int, warnings []string) {
	var icmpInterval, pingTimeout time.Duration
	if tmpls, err := client.GetICMPPollingTemplates(); err != nil {
		warnings = append(warnings, "ICMP polling templates: "+err.Error())
	} else {
		for _, t := range tmpls {
			d := icmpTemplateInterval(t)
			if d <= 0 {
				continue
			}
			if icmpInterval == 0 || d < icmpInterval {
				icmpInterval = d
				if t.Timeout > 0 {
					pingTimeout = time.Duration(t.Timeout) * time.Second
				}
			}
		}
	}

	var snmpInterval time.Duration
	consider := func(freq int, pf thothos.TimeInterval) {
		d := intervalToDuration(pf)
		if d <= 0 && freq > 0 {
			d = time.Duration(freq) * time.Second
		}
		if d <= 0 {
			return
		}
		if snmpInterval == 0 || d < snmpInterval {
			snmpInterval = d
		}
	}
	if tmpls, err := client.GetSNMPv2PollingTemplates(); err != nil {
		warnings = append(warnings, "SNMPv2 polling templates: "+err.Error())
	} else {
		for _, t := range tmpls {
			consider(t.Frequency, t.PollingFrequency)
		}
	}
	if tmpls, err := client.GetSNMPv3PollingTemplates(); err != nil {
		warnings = append(warnings, "SNMPv3 polling templates: "+err.Error())
	} else {
		for _, t := range tmpls {
			consider(t.Frequency, t.PollingFrequency)
		}
	}

	lc := GetCollectors()
	if icmpInterval > 0 {
		icmpInterval = clampInterval(icmpInterval)
		if lc != nil && lc.ICMP != nil {
			lc.ICMP.SetInterval(icmpInterval)
			if pingTimeout > 0 {
				lc.ICMP.SetPingParams(0, pingTimeout)
			}
		}
		icmpSecs = int(icmpInterval / time.Second)
	}
	if snmpInterval > 0 {
		snmpInterval = clampInterval(snmpInterval)
		if lc != nil && lc.SNMP != nil {
			lc.SNMP.SetInterval(snmpInterval)
		}
		snmpSecs = int(snmpInterval / time.Second)
	}
	if pingTimeout > 0 {
		pingTimeoutSecs = int(pingTimeout / time.Second)
	}
	return icmpSecs, snmpSecs, pingTimeoutSecs, warnings
}

// icmpTemplateInterval derives the poll interval from an ICMP polling template,
// preferring the structured pollingFrequency, then the flat frequency seconds.
func icmpTemplateInterval(t thothos.ICMPPollingTemplate) time.Duration {
	if d := intervalToDuration(t.PollingFrequency); d > 0 {
		return d
	}
	if t.Frequency > 0 {
		return time.Duration(t.Frequency) * time.Second
	}
	return 0
}

// intervalToDuration converts a ThothOS TimeInterval to a Duration.
func intervalToDuration(ti thothos.TimeInterval) time.Duration {
	return time.Duration(ti.Days)*24*time.Hour +
		time.Duration(ti.Hours)*time.Hour +
		time.Duration(ti.Minutes)*time.Minute +
		time.Duration(ti.Seconds)*time.Second
}

// clampInterval floors an interval at minPollInterval.
func clampInterval(d time.Duration) time.Duration {
	if d < minPollInterval {
		return minPollInterval
	}
	return d
}

// stampLastConfigSync best-effort records the last successful config apply on
// the persisted ProxyConfig row (MFA-login installs). No-op when no row exists.
func stampLastConfigSync(db *gorm.DB) {
	if db == nil {
		return
	}
	var config models.ProxyConfig
	if err := db.First(&config).Error; err != nil {
		return
	}
	if err := db.Model(&config).Update("last_config_sync", time.Now()).Error; err != nil {
		log.Debug().Err(err).Msg("Failed to stamp last config sync on ProxyConfig")
	}
}

// logApplyResult emits a single structured line summarising an apply run.
func logApplyResult(phase string, res ApplyResult) {
	log.Info().
		Str("phase", phase).
		Int("oidsAdopted", res.OIDsAdopted).
		Int("oidsCreated", res.OIDsCreated).
		Int("oidsUpdated", res.OIDsUpdated).
		Int("snmpTemplatesPersisted", res.SNMPTemplatesPersisted).
		Int("icmpIntervalSeconds", res.ICMPIntervalSeconds).
		Int("snmpIntervalSeconds", res.SNMPIntervalSeconds).
		Int("warnings", len(res.Warnings)).
		Msg("ThothOS config applied")
}
