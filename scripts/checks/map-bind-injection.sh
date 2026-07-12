#!/usr/bin/env bash
#
# Class gate: HTTP REQUEST BODY BOUND INTO A MAP (api-contract/input-validation).
#
# Binding an inbound request body into a Go map (c.ShouldBindJSON(&someMap))
# lets the CLIENT control the key set. When that map is handed to GORM
# .Updates(), the keys become SQL column names: a client typo (any key that is
# not a real column) builds invalid SQL and the handler answers HTTP 500 with the
# raw "no such column: <key>" error, leaking the DB schema — an ordinary mistake
# looks like a server crash. Even without a downstream write, a map destination
# silently ACCEPTS unknown keys, so a misspelled field is quietly dropped instead
# of rejected. The fix is always a TYPED struct (an explicit allowlist).
#
# The runtime error-contract test (internal/api/error_contract_test.go) can only
# pin the two KNOWN handlers — a random :id 404s before the buggy DB write is
# reached, so a NEWLY-ADDED map-binding handler would slip past it. This static
# analyzer keys on the gin binding method + the resolved destination TYPE (a map),
# covering every current AND future handler with zero per-bug pinning.
#
# check.sh (and therefore CI) auto-runs every scripts/checks/*.sh. This gate:
#   1. runs the analyzer's OWN self-test (analysistest — proves it is RED on the
#      map-bind shape and silent on the typed-struct pattern), then
#   2. enumerates the class across ./... and FAILS if any instance is found.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT" || { echo "cannot cd to repo root $REPO_ROOT"; exit 1; }

# Windows-only: the go tool can fail to unlink a freshly-built temp binary when a
# scanner briefly locks the .exe, exiting non-zero even though the program/tests
# passed. That noise never appears on Linux CI. Mirrors scripts/check.sh.
win_cleanup_lock='unlinkat.*(being used by another process|Access is denied)|The process cannot access the file'

# --- 1. self-test: the gate must be RED on the known-bad sample ---------------
echo "-- mapbindcheck self-test (analysistest) --"
selftest_out="$(go test ./internal/lint/mapbindcheck/... 2>&1)"
selftest_rc=$?
printf '%s\n' "$selftest_out"
if [ "$selftest_rc" -ne 0 ]; then
  if printf '%s\n' "$selftest_out" | grep -Eq '^(--- FAIL|FAIL|panic:)'; then
    echo "GATE FAILED: mapbindcheck analyzer self-test failed — the detector is broken."
    exit 1
  elif printf '%s\n' "$selftest_out" | grep -Eiq "$win_cleanup_lock"; then
    echo "NOTICE: self-test exited $selftest_rc on a Windows test-binary cleanup lock, no FAIL marker — treating as PASS."
  else
    echo "GATE FAILED: mapbindcheck self-test exited $selftest_rc with no FAIL marker — inspect above."
    exit 1
  fi
fi

# --- 2. enumerate the class across the whole production tree -------------------
echo "-- enumerating request-body-into-map binds across ./... --"
enum_out="$(go run ./cmd/mapbindcheck ./... 2>&1)"
enum_rc=$?
findings="$(printf '%s\n' "$enum_out" | grep 'input-validation class' || true)"

if [ -n "$findings" ]; then
  printf '%s\n' "$findings"
  count="$(printf '%s\n' "$findings" | grep -c 'input-validation class')"
  echo "GATE FAILED: $count HTTP request body/bodies bound into a map — decode into a typed struct allowlist instead."
  exit 1
fi

# No findings. A non-zero exit with no findings is only tolerated for the Windows
# cleanup lock; anything else is a real analyzer/build error.
if [ "$enum_rc" -ne 0 ]; then
  if printf '%s\n' "$enum_out" | grep -Eiq "$win_cleanup_lock"; then
    echo "NOTICE: enumeration exited $enum_rc on a Windows temp-binary cleanup lock, no findings — treating as PASS."
  else
    printf '%s\n' "$enum_out"
    echo "GATE FAILED: mapbindcheck enumeration exited $enum_rc without findings — build/load error, inspect above."
    exit 1
  fi
fi

echo "OK: no request bodies bound into a map."
