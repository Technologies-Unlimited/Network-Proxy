#!/usr/bin/env bash
#
# Class gate: ORPHANED DEFAULT-PROVIDER / BOOTSTRAP FUNCTIONS
#             (dead out-of-box-experience class).
#
# A "seed the defaults" / "bootstrap the install" function that is DEFINED but
# never CALLED from production code is a silent lie: the fresh-install path it
# was written to power never runs, so a brand-new install ships without the
# thing (default alert rules, default devices, …). This exact class shipped the
# alerting engine INERT — SeedDefaultAlertRules / CreateDefaultRules / the device
# seed all existed with ZERO callers, so a fresh DB had no rules and a "device
# down" never alerted.
#
# The class shape: a package-level func whose name matches
#   Seed<Name>  |  CreateDefault<Name>  |  <Name>Bootstrap
# is a default-provider. Every such func MUST be referenced from at least one
# NON-test, NON-definition .go line anywhere in the module (i.e. actually wired
# into a call path reachable from runServer) or it is dead. This enumerates the
# class and fails listing file:line for every orphan, so re-adding a default
# provider without wiring it into boot re-fails the gate — the whole class stays
# walled, not just today's instances.
#
# check.sh (and therefore CI) auto-runs every scripts/checks/*.sh.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Identifier regex for a default-provider / bootstrap function name.
name_re='(Seed[A-Za-z0-9_]+|CreateDefault[A-Za-z0-9_]+|[A-Za-z0-9_]+Bootstrap)'
# A Go func definition of such a name, with or without a receiver.
def_re="^func (\([^)]*\) )?${name_re}\("

# find_orphans <def-search-root> <ref-search-root>
#   Enumerate default-provider definitions under <def-search-root> and, for each,
#   look for a reference (non-test, non-comment, not the definition line itself)
#   anywhere under <ref-search-root>. Prints one line per orphan.
find_orphans() {
  local def_root="$1" ref_root="$2"
  local defline file afterfile lineno code name refs

  while IFS= read -r defline; do
    [ -z "$defline" ] && continue
    file="${defline%%:*}"
    afterfile="${defline#*:}"
    lineno="${afterfile%%:*}"
    code="${afterfile#*:}"
    name="$(printf '%s' "$code" | sed -E "s/^func (\([^)]*\) )?${name_re}\(.*/\2/")"
    [ -z "$name" ] && continue

    refs="$(grep -rnE "\\b${name}\\b" --include='*.go' "$ref_root" 2>/dev/null \
      | grep -v '_test.go' \
      | grep -vF "${file}:${lineno}:" \
      | grep -vE '^[^:]+:[0-9]+:[[:space:]]*//' \
      || true)"

    if [ -z "$refs" ]; then
      echo "${file}:${lineno}: ${name} is a default-provider/bootstrap function with NO production caller — the fresh-install path it powers is DEAD (wire it into runServer, or delete it)"
    fi
  done < <(grep -rnE "$def_re" --include='*.go' "$def_root" 2>/dev/null | grep -v '_test.go')
}

# --- self-test: prove the detector fires on a known-bad sample and stays quiet
#     on a wired one (so the gate can't rot into a no-op) ----------------------
if [ "${1:-}" = "--selftest" ]; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  mkdir -p "$tmp/bad"
  cat >"$tmp/bad/seed.go" <<'EOF'
package bad
func SeedDefaultWidgets() error { return nil }
EOF
  bad_out="$(find_orphans "$tmp/bad" "$tmp/bad")"
  if [ -z "$bad_out" ]; then
    echo "SELFTEST FAILED: detector did not flag an orphaned SeedDefaultWidgets"
    exit 1
  fi

  mkdir -p "$tmp/good"
  cat >"$tmp/good/seed.go" <<'EOF'
package good
func SeedDefaultWidgets() error { return nil }
EOF
  cat >"$tmp/good/boot.go" <<'EOF'
package good
func run() error { return SeedDefaultWidgets() }
EOF
  good_out="$(find_orphans "$tmp/good" "$tmp/good")"
  if [ -n "$good_out" ]; then
    echo "SELFTEST FAILED: detector wrongly flagged a wired SeedDefaultWidgets:"
    printf '%s\n' "$good_out"
    exit 1
  fi

  echo "OK: no-orphan-bootstrap self-test passed."
  exit 0
fi

# --- enumerate the class across the real tree --------------------------------
# Definitions are searched under internal/; references are searched across the
# whole module so a caller in main.go (runServer) counts.
echo "-- enumerating orphaned default-provider/bootstrap functions --"
findings="$(find_orphans "$REPO_ROOT/internal" "$REPO_ROOT")"

if [ -n "$findings" ]; then
  printf '%s\n' "$findings"
  count="$(printf '%s\n' "$findings" | grep -c 'default-provider')"
  echo "GATE FAILED: ${count} orphaned default-provider/bootstrap function(s) — a fresh install runs none of them."
  exit 1
fi

echo "OK: every default-provider/bootstrap function is wired into a production call path."
