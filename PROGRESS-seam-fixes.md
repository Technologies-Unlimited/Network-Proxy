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

### REMAINS for the orchestrator (owner/push actions this agent must NOT do)
- Push NM `production` (`git push origin production`, NO branch/PR).
- Tag `v1.1.0` on the shipped NM HEAD and push the tag.
- Cut the GitHub release for `v1.1.0` with a prebuilt binary built via
  `go build -ldflags "-X main.version=1.1.0 -X main.commitSHA=<sha> -X main.buildTime=<ts>"`
  (so the release zip's folder is `Network-Monitor-1.1.0`, matching the README link).
- Push the ai-native side (results ingest entity + IPAM pagination args + wizard pinning tag
  v1.1.0 + mark-stale-proxies cron), keeping the peer's uncommitted TryClient/try-classify/
  business-workspace-map files untouched.

### STILL OPEN (not in this campaign's scope — future work)
- OID down-sync (ThothOS→proxy) is still not wired; OID sync remains push-up-only (documented
  honestly in README/CLAUDE.md as "push-up").
