#!/usr/bin/env bash
# Static verify gate: clean install, build, typecheck, boundaries, unit tests.
# Usage: verify.sh [repo-dir] ; exit 0 only on a checkout root whose tree and HEAD are unchanged by the steps, where every step the branch defines passes.
set -uo pipefail
die() { echo "### VERIFY FAIL ($1)"; exit 1; }
[ $# -le 1 ] && [ "${1-x}" != "" ] || die "usage: verify.sh [repo-dir]"
cd -- "${1:-.}" || die "cannot cd to ${1:-.}"
top=$(git rev-parse --show-toplevel 2>/dev/null) && [ "$top" = "$(pwd -P)" ] || die "not the root of a git checkout: $PWD"
head0=$(git rev-parse --verify -q HEAD) || die "no commits: $PWD"
fail=0
has() { node -e "process.exit(require('./package.json').scripts?.['$1']?0:1)"; }
step() { echo "### $*"; "$@"; rc=$?; echo "### exit $rc: $*"; [ $rc -eq 0 ] || fail=1; }
check_tree() {
  local dirty
  dirty=$(git status --porcelain --untracked-files=all) || { echo "### git status failed $1"; fail=1; return; }
  [ "$(git rev-parse HEAD 2>/dev/null)" = "$head0" ] || { echo "### head moved $1 (was $head0)"; fail=1; }
  [ -z "$dirty" ] && return
  echo "### dirty tree $1 (PASS must match the head SHA):"; echo "$dirty"; fail=1
}
echo "### head $head0 node $(node -v)"
check_tree "before the steps"
if [ -f package-lock.json ]; then step npm ci --include=dev --no-audit --no-fund; else echo "### no package-lock.json: npm ci needs one"; fail=1; fi
ran=0
for s in build typecheck lint test; do
  if has "$s"; then step npm run -s "$s"; ran=1; fi
done
check_tree "after the steps"
[ $ran -eq 1 ] || { echo "### no build/typecheck/lint/test scripts defined"; fail=1; }
echo "### VERIFY $([ $fail -eq 0 ] && echo PASS || echo FAIL)"
exit $fail
