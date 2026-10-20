#!/usr/bin/env bash
# Fixture tests for verify.sh: each case builds a tiny repo and states whether the gate must PASS or FAIL.
# Usage: verify.test.sh ; exit 0 only when every case behaves as stated.
set -uo pipefail
gate="$(cd "$(dirname "$0")" && pwd)/verify.sh"
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
bad=0

fixture() { # name, scripts-json
  local d="$root/$1"
  mkdir -p "$d" && git -C "$d" init -q
  printf '{"name":"x","scripts":%s}\n' "$2" > "$d/package.json"
  printf '{"name":"x","lockfileVersion":3,"packages":{"":{"name":"x"}}}\n' > "$d/package-lock.json"
  echo base > "$d/tracked.txt"
  printf 'node_modules/\n' > "$d/.gitignore"
  git -C "$d" add . && git -C "$d" commit -qm init
  echo "$d"
}

expect() { # PASS|FAIL, name, reason line the log must contain ("" for PASS), gate args...
  local want=$1 name=$2 why=$3; shift 3
  "$gate" "$@" > "$root/$name.log" 2>&1
  local rc=$? got=PASS
  [ $rc -eq 0 ] || got=FAIL
  if [ "$got" = "$want" ] && { [ -z "$why" ] || grep -qF -- "$why" "$root/$name.log"; }; then echo "ok   $name ($want)"; else echo "FAIL $name: wanted $want ${why:+with \"$why\" }, got $got"; sed 's/^/     /' "$root/$name.log"; bad=1; fi
}

expect PASS clean "### VERIFY PASS" "$(fixture clean '{"test":"true"}')"
expect FAIL step-fails "### exit 1: npm run -s test" "$(fixture step-fails '{"test":"false"}')"
expect FAIL early-fail-late-pass "### exit 1: npm run -s build" "$(fixture early-fail-late-pass '{"build":"false","test":"true"}')"
expect FAIL no-scripts "### no build/typecheck/lint/test scripts defined" "$(fixture no-scripts '{}')"
expect FAIL dirty-after "### dirty tree after the steps" "$(fixture dirty-after '{"build":"echo more >> tracked.txt","test":"true"}')"
expect FAIL untracked-after "### dirty tree after the steps" "$(fixture untracked-after '{"build":"echo x > new.txt","test":"true"}')"
expect FAIL head-moves "### head moved after the steps" "$(fixture head-moves '{"test":"git commit -q --allow-empty -m moved"}')"
expect FAIL git-lost "### git status failed after the steps" "$(fixture git-lost '{"test":"rm -rf .git"}')"

d=$(fixture dirty-before '{"test":"true"}'); echo extra > "$d/stray.txt"
expect FAIL dirty-before "### dirty tree before the steps" "$d"

d=$(fixture hidden-edit '{"test":"true"}'); git -C "$d" update-index --skip-worktree tracked.txt; echo edited > "$d/tracked.txt"
expect FAIL hidden-edit "### hidden tracked changes before the steps" "$d"

d=$(fixture no-lockfile '{"test":"true"}'); git -C "$d" rm -q package-lock.json && git -C "$d" commit -qm drop
expect FAIL no-lockfile "### no package-lock.json" "$d"

d=$(fixture stale-lockfile '{"test":"true"}'); printf '{"name":"x","scripts":{"test":"true"},"dependencies":{"left-pad":"1.3.0"}}\n' > "$d/package.json"; git -C "$d" commit -qam dep
expect FAIL stale-lockfile "### exit 1: npm ci" "$d"

d=$(fixture subdir '{"test":"true"}'); mkdir "$d/sub"; cp "$d/package.json" "$d/package-lock.json" "$d/sub/"; git -C "$d" add . && git -C "$d" commit -qm sub
expect FAIL subdir "not the root of a git checkout" "$d/sub"
expect FAIL missing-dir "cannot cd to" "$root/nope"
d=$root/no-commits; mkdir "$d" && git -C "$d" init -q
expect FAIL no-commits "no commits" "$d"
cd "$(fixture empty-arg '{"test":"true"}')" && expect FAIL empty-arg "usage:" ""
expect FAIL extra-arg "usage:" "$(fixture extra-arg '{"test":"true"}')" "$root"

exit $bad
