#!/usr/bin/env bash
#
# Class gate: LINT-BASELINE RATCHET (a real, linter-detected bug parked behind a
# config exclude must SHRINK to zero, never silently accumulate).
#
# The gate is only honest if `.golangci.yml` / `staticcheck.conf` excludes stay
# green for a REASON. Some of them mask a genuine bug that a later stage will fix;
# each such exclude is tagged `TODO(gate-burndown)`. Without a wall, the easy way
# to make a new linter finding "pass" is to add one more tagged exclude — and the
# baseline grows forever, which is exactly how a gate rots into decoration.
#
# This gate counts the tagged baselines and asserts the total is <= CEILING, a
# constant committed in THIS script. The ceiling may only ever be LOWERED, and
# only in the same commit that burns a baseline down. So:
#   - add a NEW gate-burndown exclude without fixing one  -> count > CEILING -> RED
#   - burn one down (fix the bug, delete the exclude)      -> lower CEILING here too
# The baseline is therefore a one-way ratchet toward zero. When CEILING hits 0 this
# gate has served its purpose (delete it, or leave it as a permanent "no baselines"
# assertion).
#
# check.sh (and therefore CI) auto-runs every scripts/checks/*.sh.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT" || { echo "cannot cd to repo root $REPO_ROOT"; exit 1; }

# ---------------------------------------------------------------------------
# CEILING — the maximum number of TODO(gate-burndown) baselines allowed.
#
# Burn-down history (each drop is one real bug fixed + its exclude deleted):
#   3  foundation: SA9003 bandwidth.GetTestResults, updater errcheck, SA1019 scanner
#   1  staticcheck-triage: fixed SA9003 (frozen EndTime) + swapped go-ping->pro-bing
#   0  usability-close (2026-07-12): fixed the updater fs-error swallows (rollback
#      renames log loudly; MkdirAll/Sscanf propagate; deferred cleanups explicit).
# TERMINAL: ceiling is 0 — any NEW gate-burndown baseline is now rejected outright.
# LOWER this (never raise it) as each remaining baseline is fixed.
# ---------------------------------------------------------------------------
CEILING=0

# The config files that may legitimately carry a burndown exclude. Scoped tightly
# so docs/READMEs mentioning the tag, and this script's own comments, are NOT
# counted — only the actual lint config.
config_files=(".golangci.yml")
while IFS= read -r conf; do
  config_files+=("${conf#./}")
done < <(find . -type f -name 'staticcheck.conf' 2>/dev/null | sort)

# The canonical tag every burndown exclude carries. Both spellings in the tree
# (`TODO(gate-burndown)` in .golangci.yml, `gate-burndown TODO` in staticcheck.conf)
# share this literal substring, so counting it catches every baseline regardless
# of comment phrasing.
MARKER='gate-burndown'

echo "-- lint-baseline ratchet: counting '$MARKER' excludes --"
count=0
for cf in "${config_files[@]}"; do
  [ -f "$cf" ] || continue
  # -F: literal match (the marker is a fixed string, not a regex).
  n="$(grep -Fc "$MARKER" "$cf" 2>/dev/null || true)"
  n="${n:-0}"
  if [ "$n" -gt 0 ]; then
    printf '  %s: %s baseline(s)\n' "$cf" "$n"
    grep -Fn "$MARKER" "$cf" | sed 's/^/    /'
  fi
  count=$((count + n))
done

echo "-- total gate-burndown baselines: $count (ceiling $CEILING) --"

if [ "$count" -gt "$CEILING" ]; then
  echo ""
  echo "GATE FAILED: $count lint baselines exceed the ceiling of $CEILING."
  echo "A NEW gate-burndown exclude was added without burning an existing one down,"
  echo "OR you fixed a bug but did not lower CEILING in scripts/checks/lint-baseline-ratchet.sh."
  echo "Baselines must ratchet toward zero: fix the bug, delete its exclude, lower CEILING."
  exit 1
fi

if [ "$count" -lt "$CEILING" ]; then
  echo ""
  echo "GATE FAILED: only $count baseline(s) remain but CEILING is still $CEILING."
  echo "A baseline was burned down without tightening the ratchet. LOWER CEILING to $count"
  echo "in scripts/checks/lint-baseline-ratchet.sh so the ceiling can never drift back up."
  exit 1
fi

echo "OK: $count gate-burndown baseline(s), exactly at the ratchet ceiling."
