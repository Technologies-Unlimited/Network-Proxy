# Custom class-detection gates

`scripts/check.sh` (and therefore CI) runs **every executable `*.sh` in this
directory** as an additional gate, after build/vet/staticcheck/golangci/test.
This is the plug-in point for **class-first bug detection** (a bug is a class
until a script proves it a one-off).

## Contract for a gate script

- Name it after the class: `no-swallowed-updater-errors.sh`, `no-empty-branch.sh`, …
- **Enumerate the class across the whole tree**, print each offender as
  `path/file.go:line: <what is wrong>`.
- **Exit non-zero if any instance is found**, zero if clean. That is the whole
  contract — `check.sh` fails the build on the first gate that exits non-zero.
- Prefer a `--selftest` flag that proves the detector actually fires on a known
  bad sample (so the gate can't silently rot into a no-op).
- Keep it dependency-light: `bash` + `grep`/`go` that already exist in CI.

## Why here and not inline in check.sh

Each gate is a standing regression wall for one fixed bug class. Committing it
here means reverting the fix re-fails the gate, and the next contributor sees the
class enumerated, not just one instance.

New gates are added by later burn-down stages as they fix each class in
`.golangci.yml`'s time-boxed baseline (search that file for `TODO(gate-burndown)`).
