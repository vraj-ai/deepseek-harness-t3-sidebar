# deepseek-harness-t3-sidebar

[T3 Code](https://github.com/pingdotgg/t3code)'s thread sidebar, rebuilt as a client plugin for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It replaces the Harness
sidebar's session-tree seat with T3's: pinned, working, snoozed and settled sections, card and
slim row densities, live status, jump hints, search, inline rename, pin, snooze, settle and archive.

**Status: in progress.** The package is installable as a Harness bundle and the Plugins page can
enable and disable it, but the sidebar itself is still being debugged. Slices are tracked in this
repo's issues, and nothing here claims a working sidebar until the verification command below has
run against a real Harness window.

## Requirements

- DeepSeek Harness desktop `0.2.1-rc.2` (the packaged runtime the plugin was written against).
- `gh` on `PATH` and authenticated, if you want pull-request badges on rows.
- Node 20+ to build from source.

## Install

The package is a Harness bundle: `cordis.patch.yml` inserts one `t3-sidebar` row, and the bundle
selection decides whether that layer applies. Harness owns that selection, so the plugin is turned
on and off from the UI instead of from a hand-written profile patch.

1. Open the Harness sidebar's **Plugins** page.
2. **Add plugin** → `link:/absolute/path/to/this/checkout` for a development build, or this
   repository (`vraj-ai/deepseek-harness-t3-sidebar`).
3. Toggle it **On** to take over the session tree; toggle it **Off** to get Harness's own sidebar
   back. Remove uninstalls it.

While enabled the sidebar takes over the session tree; the composer, conversation and right sidebar
stay Harness-native.

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
```

The probe reads the app's own origin cookie out of the desktop cookie store, opens
`http://127.0.0.1:54645` in headless Chromium, and prints the per-session values the client stub
published. It starts no server and touches no profile. `--expect-absent` is the control: remove the
loader row, re-run it, and the key is gone, so the key is this plugin's and not a built-in.

The client stub publishes on list changes only, never on mount, so a stamp means live host traffic
reached the browser. The sidebar shell slice replaces the stub; the verification skill in
`.cursor/skills/verify-t3-sidebar/` lands with it.

The bundle patch in `cordis.patch.yml` is the whole wiring. Nothing is added to the profile's
`cordis.patch.yml` and nothing is symlinked into `node_modules` by hand: the Plugins toggle writes
the bundle selection, and the live profile recomposes, so neither direction needs an app restart.
Disabling deselects the bundle layer while keeping the dependency installed, so the shipped
`ui-sidebar` rows are never modified.

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

## License

MIT. See [LICENSE](LICENSE). The T3 Code-derived logic retains its MIT terms and attribution.
