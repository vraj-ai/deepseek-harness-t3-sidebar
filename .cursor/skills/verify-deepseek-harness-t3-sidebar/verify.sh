#!/usr/bin/env bash
# Static verify gate: clean install, build, typecheck, boundaries, unit tests.
# Usage: verify.sh [repo-dir] ; exit 0 only on a clean tree where every step the branch defines passes.
set -uo pipefail
cd "${1:-.}" || { echo "### VERIFY FAIL (cannot cd to ${1:-.})"; exit 1; }
git rev-parse --verify -q HEAD >/dev/null || { echo "### VERIFY FAIL (not a git checkout: $PWD)"; exit 1; }
fail=0
has() { node -e "process.exit(require('./package.json').scripts?.['$1']?0:1)"; }
step() { echo "### $*"; "$@"; rc=$?; echo "### exit $rc: $*"; [ $rc -eq 0 ] || fail=1; }
echo "### head $(git rev-parse HEAD) node $(node -v)"
dirty=$(git status --porcelain --untracked-files=all)
if [ -n "$dirty" ]; then echo "### dirty tree (PASS must match the head SHA):"; echo "$dirty"; fail=1; fi
if [ -f package-lock.json ]; then step npm ci --no-audit --no-fund; fi
ran=0
for s in build typecheck lint test; do
  if has "$s"; then step npm run -s "$s"; ran=1; fi
done
[ $ran -eq 1 ] || { echo "### no build/typecheck/lint/test scripts defined"; fail=1; }
echo "### VERIFY $([ $fail -eq 0 ] && echo PASS || echo FAIL)"
exit $fail
