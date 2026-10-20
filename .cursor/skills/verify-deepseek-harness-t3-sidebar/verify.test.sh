#!/usr/bin/env bash
# Fixture tests for verify.sh: each case builds a tiny repo and states whether the gate must PASS or FAIL.
# Usage: verify.test.sh ; exit 0 only when every case behaves as stated.
set -uo pipefail
gate="$(cd "$(dirname "$0")" && pwd)/verify.sh"
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
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

expect() { # PASS|FAIL, name, gate args...
  local want=$1 name=$2; shift 2
  "$gate" "$@" > "$root/$name.log" 2>&1
  local rc=$? got=PASS
  [ $rc -eq 0 ] || got=FAIL
  if [ "$got" = "$want" ]; then echo "ok   $name ($want)"; else echo "FAIL $name: wanted $want, got $got"; sed 's/^/     /' "$root/$name.log"; bad=1; fi
}

expect PASS clean "$(fixture clean '{"test":"true"}')"
expect FAIL step-fails "$(fixture step-fails '{"test":"false"}')"
expect FAIL no-scripts "$(fixture no-scripts '{}')"
expect FAIL dirty-after "$(fixture dirty-after '{"build":"echo more >> tracked.txt","test":"true"}')"
expect FAIL untracked-after "$(fixture untracked-after '{"build":"echo x > new.txt","test":"true"}')"
expect FAIL head-moves "$(fixture head-moves '{"test":"git commit -q --allow-empty -m moved"}')"
expect FAIL git-lost "$(fixture git-lost '{"test":"rm -rf .git"}')"

d=$(fixture dirty-before '{"test":"true"}'); echo extra > "$d/stray.txt"
expect FAIL dirty-before "$d"

d=$(fixture no-lockfile '{"test":"true"}'); git -C "$d" rm -q package-lock.json && git -C "$d" commit -qm drop
expect FAIL no-lockfile "$d"

d=$(fixture subdir '{"test":"true"}'); mkdir "$d/sub"; cp "$d/package.json" "$d/package-lock.json" "$d/sub/"; git -C "$d" add . && git -C "$d" commit -qm sub
expect FAIL subdir "$d/sub"
expect FAIL missing-dir "$root/nope"
cd "$(fixture empty-arg '{"test":"true"}')" && expect FAIL empty-arg ""
expect FAIL extra-arg "$(fixture extra-arg '{"test":"true"}')" "$root"

exit $bad
