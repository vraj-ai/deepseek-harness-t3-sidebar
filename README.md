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
npm test           # unit tests over the pure sidebar model
```

The packaged Harness app has no `pnpm run dev:web`; you do not need it. The app's
`dsh-client-hmr` polls each installed bundle every 500 ms and swaps a rebuilt `lib/client.js` into
the open window, so `npm run build` is the reload step. Bundle revisions are derived from file
mtime and size, so a rebuild that changes neither will not reload.

## Verification

A green build is not proof. `.cursor/skills/verify-deepseek-harness-t3-sidebar/` is only the
static gate (clean tree, install, build, typecheck, lint, tests). A separate live-probe skill, not yet in the repo, will drive the
real Harness window (Playwright, authenticated through the app's own origin cookie) and assert the
sidebar's features end to end. It lands with the sidebar shell slice; this README will name its
command once it exists.

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
