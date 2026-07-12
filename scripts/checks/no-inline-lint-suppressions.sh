#!/usr/bin/env bash
#
# Class gate: INLINE LINT SUPPRESSIONS (a linter-detectable bug hushed in place
# instead of fixed).
#
# The staticcheck/errcheck/govet gate only has teeth if a real finding can't be
# silenced where it lives. The project rule (CLAUDE.md) is: NO `//nolint`, NO
# `//lint:ignore`, NO `_ = err`-style swallow of a captured error — fix the code,
# or make a CENTRALISED, reviewed exclude in .golangci.yml / staticcheck.conf that
# a reviewer sees. This gate promotes that prose rule into an executable wall: it
# enumerates every production .go file and FAILS if any inline suppression exists,
# so the only way to quiet a linter is the visible, reviewable config path.
#
# What it flags (production code only — see the exclusions below):
#   1. //nolint            (with or without a :linter list, any spacing)
#   2. //lint:ignore       (staticcheck's inline directive)
#   3. `_ = <err>` at statement start — blank-assigning a CAPTURED error variable
#      (name ends in err/Err) purely to dodge errcheck. This deliberately does NOT
#      match `_ = someCall()` (the idiomatic, greppable "explicitly ignore this
#      call's result"): errcheck itself accepts that form, and it stays visible in
#      review, unlike a hidden captured-error swallow.
#
# Excluded surfaces (NOT production code that ships behavior):
#   - *_test.go                — tests
#   - **/testdata/**           — analyzer FIXTURES that intentionally contain the
#                                bad pattern so a linter can be tested against it
#   - generated files          — *.pb.go / *_grpc.pb.go / *.gen.go
#
# Ships with a --selftest so it can't silently rot into a no-op. check.sh (and
# therefore CI) auto-runs every scripts/checks/*.sh.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT" || { echo "cannot cd to repo root $REPO_ROOT"; exit 1; }

# Suppression signatures. Anchored where it matters so comments-about-the-rule and
# idiomatic call-ignores don't false-positive.
NOLINT_RE='//[[:space:]]*nolint'
LINTIGNORE_RE='//[[:space:]]*lint:ignore'
# `_ = <ident>err` / `_ = <ident>Err` as a STATEMENT (line starts with it), so a
# comment that merely mentions `_ = err` (starts with //) is not matched, and
# `_ = errors.New(...)` is not matched (errors -> no `err` word-boundary).
BLANKERR_RE='^[[:space:]]*_ = [A-Za-z_]*[Ee]rr\b'

# is_excluded PATH -> 0 (true) if the file must be skipped.
is_excluded() {
  case "$1" in
    *_test.go)      return 0 ;;
    */testdata/*)   return 0 ;;
    *.pb.go)        return 0 ;;
    *_grpc.pb.go)   return 0 ;;
    *.gen.go)       return 0 ;;
  esac
  return 1
}

# scan_file FILE -> prints "file:line:reason" for each offender, returns 0 if any
# offender found, 1 if clean. The reason tag lets the class be told apart in output.
scan_file() {
  local f="$1" out found=1
  out="$(grep -HnE "$NOLINT_RE" "$f" 2>/dev/null)"
  [ -n "$out" ] && { printf '%s [inline //nolint — use a reviewed .golangci.yml exclude]\n' "$out"; found=0; }
  out="$(grep -HnE "$LINTIGNORE_RE" "$f" 2>/dev/null)"
  [ -n "$out" ] && { printf '%s [inline //lint:ignore — use a reviewed staticcheck.conf exclude]\n' "$out"; found=0; }
  out="$(grep -HnE "$BLANKERR_RE" "$f" 2>/dev/null)"
  [ -n "$out" ] && { printf '%s [captured error swallowed via _ = err — handle or propagate it]\n' "$out"; found=0; }
  return $found
}

# --- self-test: prove the detector fires on each bad form and stays silent on the
#     legitimate look-alikes, so it can never degrade into a no-op. -------------
selftest() {
  local dir bad good rc=0
  dir="$(mktemp -d)"
  bad="$dir/bad.go"
  good="$dir/good.go"
  {
    printf 'package x\n'
    printf 'func a() { doThing() //nolint:errcheck\n }\n'
    printf 'func b() { other() //lint:ignore SA0000 whatever\n }\n'
    printf 'func c() {\n'
    printf '\terr := run()\n'
    printf '\t_ = err\n'
    printf '}\n'
  } > "$bad"
  {
    printf 'package x\n'
    printf '// mentions _ = err in prose but is a comment, not a swallow\n'
    printf 'func d() {\n'
    printf '\t_ = os.Remove(path) // idiomatic explicit call-ignore, not a captured-err swallow\n'
    printf '}\n'
    printf 'var _ = errors.New\n'
  } > "$good"

  local hits
  hits="$(scan_file "$bad")"
  # Must catch all three bad forms.
  if [ "$(printf '%s\n' "$hits" | grep -c 'nolint')" -lt 1 ] \
     || [ "$(printf '%s\n' "$hits" | grep -c 'lint:ignore')" -lt 1 ] \
     || [ "$(printf '%s\n' "$hits" | grep -c 'swallowed via _ = err')" -lt 1 ]; then
    echo "SELFTEST FAILED: detector missed a known inline suppression"
    printf 'got:\n%s\n' "$hits"
    rc=1
  fi
  if scan_file "$good" >/dev/null; then
    echo "SELFTEST FAILED: detector flagged a legitimate line (comment / call-ignore / errors.New)"
    scan_file "$good"
    rc=1
  fi
  rm -rf "$dir"
  return $rc
}

echo "-- no-inline-lint-suppressions self-test --"
if ! selftest; then
  echo "GATE FAILED: no-inline-lint-suppressions detector self-test failed."
  exit 1
fi
echo "selftest OK"

echo "-- scanning production .go files for inline suppressions --"
violations=0
while IFS= read -r f; do
  is_excluded "$f" && continue
  if scan_file "$f"; then
    violations=1
  fi
done < <(find . -type f -name '*.go' | sed 's#^\./##')

if [ "$violations" -ne 0 ]; then
  echo ""
  echo "GATE FAILED: inline lint suppression(s) found (above)."
  echo "Fix the underlying code, OR add a narrowly-scoped, commented exclude to"
  echo ".golangci.yml / staticcheck.conf so the decision is centralised and reviewed."
  exit 1
fi

echo "OK: no inline lint suppressions in production code."
