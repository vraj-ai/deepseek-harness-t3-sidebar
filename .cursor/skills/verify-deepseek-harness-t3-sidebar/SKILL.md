---
name: verify-deepseek-harness-t3-sidebar
description: Static verify gate for the deepseek-harness-t3-sidebar Harness client plugin. Run before calling any change in this repo fixed: clean-tree check, clean install, then whichever of build, typecheck, lint and test the branch defines, on the checked-out head.
---

# verify-deepseek-harness-t3-sidebar

## Launch
From the repo root (or pass a worktree path):

    set -o pipefail; .cursor/skills/verify-deepseek-harness-t3-sidebar/verify.sh [repo-dir] 2>&1 | tee <log>

Keep `set -o pipefail`: without it the pipeline returns `tee`'s status (0) even when the gate
fails. Without pipefail, read `${PIPESTATUS[0]}` instead of `$?`.

The script fails at once if `repo-dir` can't be entered or isn't a git checkout. It prints the
head SHA and fails if `git status --porcelain` shows any change or untracked file, before the
steps run and again after them (a build that rewrites a tracked file fails), so a PASS always
describes that commit. Gitignored output (`node_modules/`, `lib/`) doesn't count.
It then runs `npm ci` (when a lockfile exists) and each of `build`, `typecheck`, `lint`, `test`
that `package.json` defines. Steps a branch doesn't define are skipped, not failed: a PASS
covers only the `### exit` lines in the log. No branch defines `lint` yet, and the boundary check
runs only because `test` chains it. Last line is `### VERIFY PASS` or `### VERIFY FAIL`; the
exit code is 0 only on PASS. A branch defining none of those scripts fails.

## Doctor
`node -v` at least 22.18 (or 23.6+ on the 23 line): `test` runs `node scripts/check-boundaries.ts`,
which needs Node's unflagged TypeScript type stripping. Older Node gives a false FAIL.
`git rev-parse HEAD` matches the SHA you mean to judge, `git status --porcelain` is empty,
`package.json` present.

## Evidence
Keep the full log (outside the repo) and cite: command, exit code, head SHA, log path.

## Not covered (yet)
This is the static gate only. The live-probe skill the README describes (Playwright against a
running Harness window, with its auth cookie) is separate and hasn't landed. It needs the desktop
app, so it isn't part of this gate: a UI claim still needs a live probe run on a machine with
Harness open.

## Cleanup
Nothing to tear down; `npm ci` leaves `node_modules/` and `lib/` (gitignored).
