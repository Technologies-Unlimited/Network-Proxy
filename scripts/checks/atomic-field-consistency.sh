#!/usr/bin/env bash
#
# Class gate: MIXED ATOMIC / PLAIN FIELD ACCESS (concurrency data-race class).
#
# A struct field passed by address to sync/atomic in SOME accessors but read or
# written PLAINLY in others is a data race per the Go memory model. The Go race
# detector only catches it when a test forces the read/write windows to overlap —
# so a race can sit GREEN under `go test -race` for as long as no test drives the
# overlap (exactly what happened to internal/grpc/bandwidth.go's
# BandwidthTest.BytesSent / BytesReceived: the sole test read them after the stream
# closed). This deterministic, type-aware analyzer removes that timing dependence:
# it keys on the FIELD OBJECT ever passed to a sync/atomic function and flags every
# plain access of that same field, covering every current AND future struct with
# zero per-bug pinning. A companion -race concurrency test
# (internal/grpc/bandwidth_concurrency_test.go) is the runtime backstop for the
# sibling lock-inconsistency subclass (a field guarded by a mutex in some
# accessors but not others, e.g. BandwidthTest.State) that a static tool cannot
# see; it runs under the CI `go test -race` job.
#
# check.sh (and therefore CI) auto-runs every scripts/checks/*.sh. This gate:
#   1. runs the analyzer's OWN self-test (analysistest — proves it is RED on the
#      mixed-access shape and silent on the all-atomic / never-atomic patterns),
#      then
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
echo "-- atomicconsistency self-test (analysistest) --"
selftest_out="$(go test ./internal/lint/atomicconsistency/... 2>&1)"
selftest_rc=$?
printf '%s\n' "$selftest_out"
if [ "$selftest_rc" -ne 0 ]; then
  if printf '%s\n' "$selftest_out" | grep -Eq '^(--- FAIL|FAIL|panic:)'; then
    echo "GATE FAILED: atomicconsistency analyzer self-test failed — the detector is broken."
    exit 1
  elif printf '%s\n' "$selftest_out" | grep -Eiq "$win_cleanup_lock"; then
    echo "NOTICE: self-test exited $selftest_rc on a Windows test-binary cleanup lock, no FAIL marker — treating as PASS."
  else
    echo "GATE FAILED: atomicconsistency self-test exited $selftest_rc with no FAIL marker — inspect above."
    exit 1
  fi
fi

# --- 2. enumerate the class across the whole production tree -------------------
echo "-- enumerating mixed atomic/plain field accesses across ./... --"
enum_out="$(go run ./cmd/atomiccheck ./... 2>&1)"
enum_rc=$?
findings="$(printf '%s\n' "$enum_out" | grep 'atomic-consistency class' || true)"

if [ -n "$findings" ]; then
  printf '%s\n' "$findings"
  count="$(printf '%s\n' "$findings" | grep -c 'atomic-consistency class')"
  echo "GATE FAILED: $count mixed atomic/plain field access(es) — read atomic fields with atomic.Load* or guard every access with one mutex."
  exit 1
fi

# No findings. A non-zero exit with no findings is only tolerated for the Windows
# cleanup lock; anything else is a real analyzer/build error.
if [ "$enum_rc" -ne 0 ]; then
  if printf '%s\n' "$enum_out" | grep -Eiq "$win_cleanup_lock"; then
    echo "NOTICE: enumeration exited $enum_rc on a Windows temp-binary cleanup lock, no findings — treating as PASS."
  else
    printf '%s\n' "$enum_out"
    echo "GATE FAILED: atomiccheck enumeration exited $enum_rc without findings — build/load error, inspect above."
    exit 1
  fi
fi

echo "OK: no mixed atomic/plain field accesses."
