#!/usr/bin/env bash
#
# Class gate: DISCARDED GORM TERMINAL-CALL ERRORS (silent-failure class).
#
# GORM's fluent API returns *gorm.DB (carrying .Error), NOT error, so errcheck
# CANNOT see a bare `db.Save(x)` / `db.Where(...).Delete(x)` whose failure is
# silently dropped. The type-aware analyzer in internal/lint/gormcheck catches
# the whole class by keying on the RESULT TYPE (*gorm.io/gorm.DB) of a discarded
# terminal call — so every current AND future handler/model is covered with no
# per-bug pinning. Scoped to production code (test files excluded, matching the
# repo's errcheck _test.go exclusion for the same class).
#
# check.sh (and therefore CI) auto-runs every scripts/checks/*.sh. This gate:
#   1. runs the analyzer's OWN self-test (proves it is RED on the bug shape and
#      silent on the correct `.Error`-checked pattern — the detector can't rot
#      into a no-op), then
#   2. enumerates the class across ./... and FAILS if any instance is found.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT" || { echo "cannot cd to repo root $REPO_ROOT"; exit 1; }

# Windows-only: the go tool can fail to unlink a freshly-built temp binary when
# a scanner briefly locks the .exe, exiting non-zero even though the program /
# tests passed. That noise never appears on Linux CI. This matches the tolerance
# in scripts/check.sh.
win_cleanup_lock='unlinkat.*(being used by another process|Access is denied)|The process cannot access the file'

# --- 1. self-test: the gate must be RED on the known-bad sample ---------------
echo "-- gormcheck self-test (analysistest) --"
selftest_out="$(go test ./internal/lint/gormcheck/... 2>&1)"
selftest_rc=$?
printf '%s\n' "$selftest_out"
if [ "$selftest_rc" -ne 0 ]; then
  if printf '%s\n' "$selftest_out" | grep -Eq '^(--- FAIL|FAIL|panic:)'; then
    echo "GATE FAILED: gormcheck analyzer self-test failed — the detector is broken."
    exit 1
  elif printf '%s\n' "$selftest_out" | grep -Eiq "$win_cleanup_lock"; then
    echo "NOTICE: self-test exited $selftest_rc on a Windows test-binary cleanup lock, no FAIL marker — treating as PASS."
  else
    echo "GATE FAILED: gormcheck self-test exited $selftest_rc with no FAIL marker — inspect above."
    exit 1
  fi
fi

# --- 2. enumerate the class across the whole production tree -------------------
echo "-- enumerating discarded GORM errors across ./... --"
enum_out="$(go run ./cmd/gormcheck ./... 2>&1)"
enum_rc=$?
findings="$(printf '%s\n' "$enum_out" | grep 'silent-failure class' || true)"

if [ -n "$findings" ]; then
  printf '%s\n' "$findings"
  count="$(printf '%s\n' "$findings" | grep -c 'silent-failure class')"
  echo "GATE FAILED: $count discarded GORM terminal-call error(s) — capture the *gorm.DB and check .Error."
  exit 1
fi

# No findings. A non-zero exit with no findings is only tolerated for the
# Windows cleanup lock; anything else is a real analyzer/build error.
if [ "$enum_rc" -ne 0 ]; then
  if printf '%s\n' "$enum_out" | grep -Eiq "$win_cleanup_lock"; then
    echo "NOTICE: enumeration exited $enum_rc on a Windows temp-binary cleanup lock, no findings — treating as PASS."
  else
    printf '%s\n' "$enum_out"
    echo "GATE FAILED: gormcheck enumeration exited $enum_rc without findings — build/load error, inspect above."
    exit 1
  fi
fi

echo "OK: no discarded GORM terminal-call errors."
