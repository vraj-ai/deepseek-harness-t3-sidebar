# deepseek-harness-t3-sidebar

[T3 Code](https://github.com/pingdotgg/t3code)'s thread sidebar, rebuilt as a client plugin for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It replaces the Harness
sidebar's session-tree seat with T3's: pinned, working, snoozed and settled sections, card and
slim row densities, live status, jump hints, search, inline rename, pin, snooze, settle and archive.

**Status: scaffold.** The package manifest and license are in place; the plugin is not installable
yet. Slices are tracked in this repo's issues, and nothing here claims a working sidebar until the
verification command below has run against a real Harness window.

## Requirements

- DeepSeek Harness desktop `0.2.1-rc.2` (the packaged runtime the plugin was written against).
- `gh` on `PATH` and authenticated, if you want pull-request badges on rows.
- Node 20+ to build from source.

## Install

Harness installs third-party client plugins into the running app's `desktop` profile:

1. Open the Harness sidebar's **Plugins** page.
2. **Add plugin** → this repository (`vraj-ai/deepseek-harness-t3-sidebar`).
3. Enable the plugin when it appears in the list.

The sidebar takes over the session tree; the composer, conversation and right sidebar stay
Harness-native. Uninstall from the same page.

## Dev

```bash
npm install
npm run build      # writes lib/client.js and lib/index.js

npm test           # layer boundary check + unit tests over the pure sidebar model
npm run typecheck  # tsc --noEmit
>>>

```

`npm test` first runs `scripts/check-boundaries.ts`: `src/model/**` may not import DSH, React or
the adapter. Ported rules and their upstream files and commit are listed in
[`docs/provenance.md`](docs/provenance.md).

The packaged Harness app has no `pnpm run dev:web`; you do not need it. The app's
`dsh-client-hmr` polls each installed bundle every 500 ms and swaps a rebuilt `lib/client.js` into
the open window, so `npm run build` is the reload step. Bundle revisions are derived from file
mtime and size, so a rebuild that changes neither will not reload.

## Verification

A green build is not proof. Against a running desktop app with this package installed in its
profile:

```bash
node scripts/probe-projection.mjs                 # exit 0 when a session carries t3Sidebar
node scripts/probe-projection.mjs --expect-absent # exit 0 when NO session carries it
node scripts/probe-shell.mjs                      # exit 0 when the shell owns the seat
node scripts/probe-list.mjs --screenshot /tmp/list.png   # exit 0 when the rows match T3
```

`probe-list.mjs` measures the live list: shelf order and counts, 82 px cards, 36 px slim rows,
32 px shelf headers, 1 px gaps, the provider stack, the hover card, and a status driven end to end —
it creates a throwaway session, prompts it, watches the list report it Working, then reports its
completion state once the turn ends. The only model call is that throwaway session's one-word turn.

The probe reads the app's own origin cookie out of the desktop cookie store, opens
`http://127.0.0.1:54645` in headless Chromium, and prints the per-session values the client stub
published. It starts no server and touches no profile. `--expect-absent` is the control: remove the
loader row, re-run it, and the key is gone, so the key is this plugin's and not a built-in.

The client stub publishes on list changes only, never on mount, so a stamp means live host traffic
reached the browser. The sidebar shell slice replaces the stub; the verification skill in
`.cursor/skills/verify-t3-sidebar/` lands with it.

Installing into a profile (reversible):

```bash
ln -s "$PWD" ~/.dsh/profiles/desktop/node_modules/deepseek-harness-t3-sidebar
# then append to ~/.dsh/profiles/desktop/cordis.patch.yml:
# - insert:
#     - id: t3-sidebar
#       name: deepseek-harness-t3-sidebar
```

Reverse it by deleting that `insert:` block and the symlink. The profile's patch layer is recomposed
live, so neither direction needs an app restart.

## How it works

- One seat is replaced: `sidebar.workspaces`, registered at `priority: -1` so it shadows the
  shipped `WorkspaceBrowser`. The child seats it declares are re-declared by this plugin.
- Lists are derived from Harness's per-session projections (`title`, `plan`, `goal`, `inbox`,
  `modelSelection`, `sessionListMetadata`) plus a `t3Sidebar` projection this plugin's host half
  folds from `turn/start`, `turn/end` and `llm/retry` events.
- Snooze, settle, visit watermarks and manual order keys are this plugin's own durable state;
  Harness has no equivalent.
- T3's section, sort, status, snooze-wake and drag-planning rules are ported from T3's own source
  (MIT) rather than reinvented. `docs/decisions.md` records the mapping.
- Rows follow T3's densities: an 82 px card for pinned, working and active rows that are still
  live, a 36 px slim row for snoozed, settled and inactive Active rows, a 32 px shelf header, and
  1 px gaps. Each row carries `data-t3-thread-id`, `data-t3-row-density` (`card` | `slim`) and
  `data-t3-status`; each shelf carries `data-t3-section` and `data-t3-section-count`.

## License

MIT. See [LICENSE](LICENSE). The T3 Code-derived logic retains its MIT terms and attribution.
