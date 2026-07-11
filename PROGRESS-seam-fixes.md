# Seam-fix campaign — Network-Monitor ↔ ThothOS-ai-native (started 2026-07-09)

Spec: `AUDIT-thothos-integration.md` §4 (5 ranked fixes) + confirmed P2s. Operator instruction:
"do all of this and the other fixes needed use a workflow with opus".

## Plan (workflow `network-monitor-seam-fixes`, all agents on Opus)

NM chain (sequential — shared main.go/client.go):
1. baseline — go build/vet/test green at d0708d8 (save commit may not compile)
2. Fix 2: `startThothOSSession` from all 3 entry points; disconnect/logout real teardown
3. Fix 3: kill webhook channel; 60–120s re-pull ticker + APPLY step (SQLite + live collectors); honest /monitor/sync + /ipam/sync; delete ConfigCache; OID reconciliation/down-sync
4. Fix 5: companyId stamping (nodes/devices/alerts/discovery); sweep re-assert; 404 re-register; name uniqueness
5. P2 fidelity: packet-loss metric; never-polled ≠ DOWN; unprivileged-ICMP hard fail

AI chain (sequential, parallel to NM chain; branch `ai-native`):
1. Fix 2b: cron mark-stale-proxies + vercel.json; delete dead dispatchers (C3)
2. Fix 4a: results ingest (results entity, metrics:write, tenant-bound) + proxy-card surfacing → CONTRACT
3. IPAM pagination args on 5 getAll ops → CONTRACT
4. Fix 1c: wizard pins tag v1.1.0 (not moving branch)
5. P2: network-administration chat/agent data tools (demo+live parity)

Post-barrier NM: Fix 4b reporter (to AI contract) + IPAM client page-loop + docs/version 1.1.0.
Then: gate loop (go+bun, ≤3 repair rounds) → 7 P1 verifiers → I push NM production, tag v1.1.0,
gh release w/ binary, push ai-native.

## State
- 2026-07-09: audit committed (b52a44d), in-flight fixes saved (d0708d8), workflow launched.
- DO NOT TOUCH in ai-native (peer in-flight): src/app/website/try/TryClient.tsx,
  src/lib/public-site/try-classify.ts, src/lib/public-site/business-workspace-map.ts.

### SHIPPED (NM side, committed on production — all with go build/vet/test green)
- **Fix 2 — one connect routine, one liveness truth:** `StartThothOSSession` called from all
  three entry points (boot / login / settings) under a cancelable context; disconnect/logout
  cancel it. (4292544, 01f3b63, 90ed542, plus session-connect heartbeat test)
- **Fix 3 — killed the push channel, made pull operative:** removed the webhook receiver +
  the never-read in-memory ConfigCache; added a jittered 60-120s config pull + **apply** step
  (persists templates to SQLite AND retunes the live collectors via SetInterval/AddDevice);
  `/monitor/sync` + `/ipam/sync` now apply and report honest counts. (5538130, 1060593,
  778be23, 22033e2, 2440fc8, 88805bc)
- **Fix 4b — results-up channel:** a 30s results reporter goroutine batches per-device
  up/down status + latency + packet loss to ThothOS's `reportMonitoringResults` mutation
  (companyId injected server-side); IPAM client now page-walks (offset pagination, 1000/page)
  and surfaces IPAM partial failure. (3957930, 8bb236d, 3172c91)
- **Fix 5 — companyId stamping:** device/alert/discovery/engine/node create paths stamp the
  authenticated companyId; race-safe sweep; 404 heartbeat re-registration; (company,name)
  node identity. (f056ed5, 7609ed2, 3d3e31d)
- **P2 fidelity:** packet-loss metric (75%-loss ≠ "up"); never-polled ≠ DOWN; unprivileged
  ICMP hard-fails instead of marking everything down; loss-threshold apply + collector-health
  surface. (22033e2 area, 2f268ad, 51e2e72, 6b994bf)
- **Docs + version:** README + CLAUDE.md now describe the pull-ticker+apply architecture and
  the results reporter (not webhooks); scale claim corrected to the honest ~1,200-2,000
  devices/60s-cycle-per-proxy ceiling; synced-data table updated (webhook/callback rows gone,
  Monitoring Results + Heartbeat rows added, IPAM pagination noted); Quick Start download link
  repointed to the `refs/tags/v1.1.0.zip` tag (folder `Network-Monitor-1.1.0`). `main.version`
  default bumped to `1.1.0` so the release binary self-identifies (still overridable via
  `-ldflags "-X main.version=..."`). update.bat does NOT pin a branch (local copy-over
  self-updater) — nothing to change there.

### PUBLISHED (all orchestrator push/release actions DONE)
- NM `production` pushed (HEAD `1e8ff1a`). ai-native pushed (`06205b657`), peer's uncommitted
  files left untouched (scoped commits only).
- **v1.1.0** tag + release (prebuilt binary) — the ThothOS-integration-operational release.
- **v1.1.1** tag + release (Latest) — security + OID-bidirectional. Binary self-identifies 1.1.1,
  `govulncheck` 0 reachable. Supersedes v1.1.0 (whose binary predates the security fixes).
- ai-native wizard re-pinned v1.1.0 → **v1.1.1** so buyers build the secure release.

### SHIPPED (follow-up, post-campaign)
- **OID down-sync delete-propagation (audit §2 OID-bidirectional P2):** `reconcileOIDs` now
  deletes local rows that ThothOS owns (non-empty `ThothOSID`) but a SUCCESSFUL upstream pull
  no longer returns — an upstream OID delete no longer leaves a stale ghost row polling
  forever. Added `OIDsDeleted` to `ApplyResult` (logged + returned). Safety rails: locally-
  created rows (empty `ThothOSID`) are never deleted; a failed `GetOIDs` pull bails before any
  mutation (empty-but-successful `[]`/`nil` is distinguishable from failure `nil`/`err`), so a
  transient blip can't wipe the local table. Table test pins delete / no-delete-of-local /
  no-delete-on-error. OID sync is now fully bidirectional (push-up + down-sync
  create/adopt/update/delete); README + CLAUDE.md corrected. (dbc2f65)

### SHIPPED (follow-up #2 — security + hardening, v1.1.1)
- **All reachable vulns cleared** — `govulncheck` 11 → 0 reachable. Toolchain `go1.25.12`
  (8 stdlib advisories incl. crypto/tls), `golang.org/x/net` v0.53.0, `quic-go` v0.59.1.
  `go` language directive moved 1.24.0 → 1.25.0 (build-forced by x/net). (0f25156)
- **Logout hardened** — `handleLogout` now behind the loopback+bootstrap-token gate (shared
  `requireLocalOrBootstrap` helper, `handleEnableStandalone` byte-identical); closes the remote
  unauthenticated brick/auth-bypass. Local operator logout preserved. (70375b9)
- **README OID synced-data table** row corrected to Bidirectional (verifier-caught stale row). (4bdd760)

### SHIPPED (follow-up #3 — residuals closed, all Opus, all adversarially verified)
- **Dead-webhook cleanup** — removed the stale `registerWebhook` mock branch in `session_test.go`
  AND (recon-missed) the vestigial `X-Webhook-*` CORS allow-headers + a stale bodylimit comment. (d566c09)
- **`handleEnableStandalone` regression test** — 4 tests pinning the loopback+token gate. (5ab73f3)
- **Settings `disconnect` was a REAL remote-unauthenticated teardown surface** — `RequireAuth` only
  checks the process-global connected-flag, not a per-request credential, so any LAN/remote host in
  integrated mode reached `teardownThothOSSession`. Proven with a RED e2e test, then gated with
  `requireLocalOrBootstrap` (same as logout). (094bddd)
- **Stale-node sweep atomic** — node+peers+bandwidth+scheduled-tests cascade wrapped in one
  `db.Transaction`, race-safe `last_seen` re-assertion preserved inside. (e8ccf3a)
- **OID soft-delete reaping verified** — audited every `models.OID` consumer; none use
  `Unscoped()`/raw SQL, so a down-synced delete genuinely stops polling; pinned with a regression test. (3487aa1)
- **Non-reachable vulns 21 → 1** — safe within-major bumps (x/net v0.55.0, x/sys v0.45.0, x/crypto v0.52.0);
  reachable stayed 0. The one remaining (`GO-2026-5932` in x/crypto) has NO fix version available and is
  non-reachable — documented, not force-bumped. (8c666d0)
- **`MonitoringResultsInput` consistency (ai-native)** — investigation confirmed NO named GraphQL input
  types are defined anywhere in ThothOS (runtime-inert regex dispatch); the Go-side typed declarations are
  uniformly cosmetic, so this is not a defect — added a guard comment so no one false-fixes it.
- `CLAUDE.md` gitignore: intentional explicit `.gitignore` entry (`claude.md`, predates this work);
  version-controlled README carries the OID correction. Closed by acknowledgment — not force-added.

### STILL OPEN (out-of-band finding, queued 2026-07-11 — being fixed this pass)
- **SNMP polling walks ZERO OIDs (capability bug, surfaced by the OID-softdelete audit).**
  `SNMPTemplate.OIDs` is a `many2many` (models/snmp.go:29) needing explicit `Preload("OIDs")`. The
  collector load paths (`seed.go:104` `Preload("SNMPTemplate")` only; `collectors.go` wireDeviceIntoCollectors)
  don't preload the nested OIDs, so `walker.go:163` iterates an empty `template.OIDs` → SNMP connects but
  polls nothing. API handlers preload correctly (`snmp.go:18,57`), so the UI shows OIDs the poller never sees.
  Fix shape: nested `Preload("SNMPTemplate.OIDs")` on both collector-feeding loads; fail-first test asserting
  the collector's template has OIDs populated; T8 class-check for other iterated-but-unpreloaded associations.
