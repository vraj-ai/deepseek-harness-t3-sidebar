---
name: verify-deepseek-harness-t3-sidebar
description: Verify gate for the deepseek-harness-t3-sidebar Harness client plugin. Run before calling any change in this repo fixed: clean install, build, typecheck, lint, boundary check and unit tests on the checked-out head.
---

# verify-deepseek-harness-t3-sidebar

## Launch
From the repo root (or pass a worktree path):

    .cursor/skills/verify-deepseek-harness-t3-sidebar/verify.sh [repo-dir] 2>&1 | tee <log>

The script prints the head SHA, then runs `npm ci` (when a lockfile exists) and every one of
`build`, `typecheck`, `lint`, `test` that `package.json` defines. Last line is
`### VERIFY PASS` or `### VERIFY FAIL`; exit code 0 only on PASS. A branch defining none of those
scripts fails.

## Doctor
`node -v` (20+), `git rev-parse HEAD` matches the SHA you mean to judge, `package.json` present.

## Evidence
Keep the full log (outside the repo) and cite: command, exit code, head SHA, log path.

## Not covered (yet)
The live probes (`npm run probe`, `scripts/probe-*.mjs`) drive a running Harness desktop window
with its auth cookie. They need the desktop app, so they are not part of this gate; a UI claim
still needs a probe run on a machine with Harness open.

## Cleanup
Nothing to tear down; `npm ci` leaves `node_modules/` and `lib/` (gitignored).
