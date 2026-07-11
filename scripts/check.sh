#!/usr/bin/env bash
#
# Network-Monitor local quality gate.
#
# Runs the same correctness/usability gates CI enforces (.github/workflows/ci.yml),
# in order, stopping at the FIRST hard failure. Designed to run in Git Bash on
# Windows AND on Linux CI. Invoke from anywhere:
#
#     bash scripts/check.sh
#
# The race detector (go test -race) needs cgo + a C compiler. This box (Windows,
# no gcc) skips -race with a NOTICE rather than failing; Linux CI runs it.
#
# Gates, in order:
#   1. go build ./...
#   2. go vet ./...
#   3. staticcheck ./...        (skips with a notice if not installed)
#   4. golangci-lint run        (skips with a notice if not installed)
#   5. go test ./...            (adds -race automatically when a C compiler exists)
#   6. scripts/checks/*.sh      (custom class-detection gates; later stages add these)
#
set -uo pipefail

# --- resolve repo root (the dir with go.mod), independent of the caller's CWD ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT" || { echo "cannot cd to repo root $REPO_ROOT"; exit 1; }

step()   { printf '\n==> %s\n' "$1"; }
notice() { printf 'NOTICE: %s\n' "$1"; }
warn()   { printf 'WARNING: %s\n' "$1"; }
fail()   { printf '\nGATE FAILED: %s\n' "$1"; exit 1; }

# ---------------------------------------------------------------------------
# 1. build — nothing else matters if it does not compile
# ---------------------------------------------------------------------------
step "go build ./..."
go build ./... || fail "go build"

# ---------------------------------------------------------------------------
# 2. vet — go's built-in correctness checks
# ---------------------------------------------------------------------------
step "go vet ./..."
go vet ./... || fail "go vet"

# ---------------------------------------------------------------------------
# 3. staticcheck — SA/ST/S/U bug, dead-code and simplification checks
#    (installed here; skip-with-notice keeps a fresh clone unblocked, CI enforces)
# ---------------------------------------------------------------------------
step "staticcheck ./..."
if command -v staticcheck >/dev/null 2>&1; then
  staticcheck ./... || fail "staticcheck"
else
  notice "staticcheck not installed — skipping. Install: go install honnef.co/go/tools/cmd/staticcheck@latest"
fi

# ---------------------------------------------------------------------------
# 4. golangci-lint — curated usability/correctness linters (see .golangci.yml).
#    Skip GRACEFULLY when the binary is absent so Windows/offline devs are not
#    blocked; CI installs and enforces it.
# ---------------------------------------------------------------------------
step "golangci-lint run"
if command -v golangci-lint >/dev/null 2>&1; then
  golangci-lint run || fail "golangci-lint"
elif [ -x "$HOME/go/bin/golangci-lint" ] || [ -x "$HOME/go/bin/golangci-lint.exe" ]; then
  "$HOME/go/bin/golangci-lint" run || fail "golangci-lint"
else
  notice "golangci-lint not installed — skipping. Install: go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@latest (CI enforces this gate)"
fi

# ---------------------------------------------------------------------------
# 5. go test — add -race ONLY when a C compiler is available (race needs cgo).
# ---------------------------------------------------------------------------
# -race needs cgo, and cgo uses the specific compiler `go env CC` resolves to
# (gcc by default on this box). Only enable -race when THAT compiler actually
# exists — a stray clang in PATH does not make cgo work if go wants gcc.
race_flag=""
cc_bin="$(go env CC 2>/dev/null)"
if [ -n "$cc_bin" ] && command -v "$cc_bin" >/dev/null 2>&1; then
  race_flag="-race"
fi

if [ -n "$race_flag" ]; then
  step "go test -race ./..."
  test_out="$(mktemp)"
  CGO_ENABLED=1 go test -race ./... 2>&1 | tee "$test_out"
  test_rc=${PIPESTATUS[0]}
else
  step "go test ./..."
  notice "go's cgo compiler ('${cc_bin:-unset}') not found — running WITHOUT -race (the race detector needs cgo). CI runs -race on Linux."
  test_out="$(mktemp)"
  go test ./... 2>&1 | tee "$test_out"
  test_rc=${PIPESTATUS[0]}
fi

if [ "$test_rc" -ne 0 ]; then
  # A real test failure ALWAYS prints a FAIL / panic marker -> hard fail.
  if grep -Eq '^(--- FAIL|FAIL|panic:)|^[[:space:]]+FAIL' "$test_out"; then
    rm -f "$test_out"
    fail "go test"
  # Windows-only cleanup race: the go tool can fail to unlink the test binary
  # when a scanner briefly locks the .exe, exiting non-zero even though every
  # package passed. Tolerate ONLY that exact case (no FAIL markers present).
  elif grep -Eiq 'unlinkat.*(being used by another process|Access is denied)|The process cannot access the file' "$test_out"; then
    warn "go test exited $test_rc due to a Windows test-binary cleanup lock, but no package failed — treating as PASS. (Does not happen on Linux CI.)"
  else
    rm -f "$test_out"
    fail "go test (exit $test_rc, no test-failure marker — inspect output above)"
  fi
fi
rm -f "$test_out"

# ---------------------------------------------------------------------------
# 6. Custom class-detection gates (T8-style). Later stages drop an executable
#    *.sh into scripts/checks/ that enumerates a bug class across the tree and
#    exits non-zero if any instance is found. They all run here automatically.
# ---------------------------------------------------------------------------
if [ -d "$REPO_ROOT/scripts/checks" ]; then
  shopt -s nullglob
  for gate in "$REPO_ROOT"/scripts/checks/*.sh; do
    step "custom gate: $(basename "$gate")"
    bash "$gate" || fail "custom gate $(basename "$gate")"
  done
  shopt -u nullglob
fi

printf '\nALL GATES PASSED\n'
