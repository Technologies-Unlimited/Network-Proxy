#!/usr/bin/env bash
#
# Class gate: FABRICATED OPERATOR-FACING METRICS (data-correctness class).
#
# A network monitor's whole value is that the numbers it shows are REAL. This
# gate enumerates the operator-facing DATA-PRODUCING surface — the metric/report
# API handlers, the report generator, and the dashboard templates/JS that render
# them — and FAILS if any of them ships INVENTED monitoring data: a hand-rolled
# latency/throughput curve, a hardcoded uptime/latency constant, or a fabricated
# "sample"/"demonstration" outage. Real values must come from metrics.Registry /
# the DB, or the endpoint must return an explicit empty / "no data yet" result.
#
# It catches the WHOLE class (not just today's offenders): in this codebase every
# fabricated value carries either an explanatory tell-comment (mock / sample /
# "in production this would query" / realistic / for demonstration) OR a
# hardcoded plausible metric literal assigned to a metric field/var. Any NEW
# handler or template that invents data trips one of those the moment it lands,
# and the only way to green is to source a real value or return an honest empty —
# exactly the correct fix. Ships with a --selftest so the detector cannot rot
# into a no-op.
#
# check.sh (and therefore CI) auto-runs every scripts/checks/*.sh.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT" || { echo "cannot cd to repo root $REPO_ROOT"; exit 1; }

# Group 1 — the fabrication "tell": comments/identifiers that this codebase used
# to explain away invented data. Deliberately does NOT include:
#   - the bare word "placeholder" (a legitimate HTML input attribute), nor
#   - the word "fabricat" (it only ever appears in HONEST anti-fabrication
#     comments here, e.g. "do NOT emit a fabricated all-healthy snapshot").
# The real class is fully covered by mock / sample / "in production" / realistic /
# generateMock / baseLatency plus the hardcoded-literal group below.
MARKER_RE='mock|for demonstration|demonstration only|sample data|sample metric|sample performance|create sample|generate sample|generate some|realistic|replace with actual|in a real implementation|in production|would query|generateMock|baseLatency'

# Group 2 — a hardcoded NON-ZERO literal assigned to a metric field/variable
# (uptime %, latency, check counts, perf values). A literal 0 / 0.0 is the honest
# "empty / no data" value and is intentionally NOT matched; a plausible non-zero
# constant returned as a measurement is the fabrication we ban.
LITERAL_RE='(UptimePercent|uptimePercentage|uptimePercent|AvgLatency|MinLatency|MaxLatency|MetricValue|MinValue|MaxValue|AvgValue|TotalChecks)[[:space:]]*[:=][[:space:]]*[1-9]'

# The operator-facing surface. Fixed core list + any future web/static JS so a
# new dashboard script is auto-covered.
SURFACE=(
  internal/api/metrics.go
  internal/api/reports.go
  internal/reporting/generator.go
  web/templates/visualize.html
  web/templates/reports.html
)
while IFS= read -r f; do
  SURFACE+=("${f#"$REPO_ROOT"/}")
done < <(find "$REPO_ROOT/web/static" -name '*.js' 2>/dev/null)

# run_detect FILE...  — prints every offending "file:line: text" line to stdout,
# returns 0 (success) if ANY offender was found, 1 if the files are clean.
run_detect() {
  local found=1 f out
  for f in "$@"; do
    [ -f "$f" ] || continue
    out="$(grep -HniE "$MARKER_RE" "$f"; grep -HnE "$LITERAL_RE" "$f")"
    if [ -n "$out" ]; then
      printf '%s\n' "$out"
      found=0
    fi
  done
  return $found
}

# --- self-test: the detector must be RED on a known-fabricated line and SILENT
#     on an honest one, so it can never quietly degrade into a no-op. -----------
selftest() {
  local dir bad good rc=0
  dir="$(mktemp -d)"
  bad="$dir/bad.go"
  good="$dir/good.go"
  printf 'uptimePercentage = 99.9 // in production this would query prometheus\n' > "$bad"
  printf 'latency := q.PingLatency(id, ip) // real current sample from the registry\nStdDeviation: 0,\n' > "$good"

  if ! run_detect "$bad" >/dev/null; then
    echo "SELFTEST FAILED: detector did not flag a known-fabricated line"
    rc=1
  fi
  if run_detect "$good" >/dev/null; then
    echo "SELFTEST FAILED: detector flagged an honest line (real registry read / literal-0 std-dev)"
    rc=1
  fi
  rm -rf "$dir"
  return $rc
}

echo "-- no-fabricated-metrics self-test --"
if ! selftest; then
  echo "GATE FAILED: no-fabricated-metrics detector self-test failed."
  exit 1
fi
echo "selftest OK"

echo "-- scanning operator-facing metric surface --"
if run_detect "${SURFACE[@]}"; then
  echo ""
  echo "GATE FAILED: fabricated / hardcoded metric data on an operator-facing surface (above)."
  echo "Fix: read the real value from metrics.Registry / the DB, or return an explicit"
  echo "empty / 'no data yet' result. Never ship an invented latency/uptime/throughput/outage."
  exit 1
fi

echo "OK: no fabricated operator-facing metrics."
