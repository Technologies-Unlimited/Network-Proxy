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
- 2026-07-09: audit committed (b52a44d), in-flight fixes saved (d0708d8), workflow launching.
- DO NOT TOUCH in ai-native (peer in-flight): src/app/website/try/TryClient.tsx,
  src/lib/public-site/try-classify.ts, src/lib/public-site/business-workspace-map.ts.
- Next step: workflow completion → push/tag/release.
