# deepseek-harness-t3-sidebar

[T3 Code](https://github.com/pingdotgg/t3code)'s thread sidebar, rebuilt as a client plugin for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It replaces the Harness
sidebar's session-tree seat with T3's: pinned, active, working, snoozed and settled sections, card and
slim row densities, live status, jump hints, search, inline rename, pin, snooze, settle and archive.

**Status: working.** Verified live on DeepSeek Harness desktop `0.2.1-rc.5` on 2026-11-03. The
plugin replaces the Harness sidebar's session-tree seat with T3's thread browser; the composer,
conversation and right sidebar stay Harness-native.

## Requirements

- DeepSeek Harness desktop `0.2.1-rc.5` (the packaged runtime this release was built against).
- Node 22.18+ and npm to build from source (`npm test` runs the TypeScript boundary check directly).
- No `gh` requirement: branch and pull-request badges are not part of this release.

## Install

Install this checkout as a Harness bundle, not as a global npm package:

```bash
git clone https://github.com/vraj-ai/deepseek-harness-t3-sidebar.git
cd deepseek-harness-t3-sidebar
npm ci
npm run build
```

Then open the Harness **Plugins** page, choose **Add plugin**, and give it the absolute path to this
checkout (for example `/Users/you/Work/deepseek-harness-t3-sidebar`). Enable **T3 Sidebar** when it
appears. The bundle inserts one host row, `t3-sidebar`; the shipped `ui-sidebar` and `ui-workspace`
rows are untouched.

Reload the Harness page once after the first install. The plugin loads live, but the open page's
session-list baseline was captured before the host row existed; the reload fills every listed
Session's `t3Sidebar` value. Later rebuilds hot-swap `lib/client.js` without a reload.

To uninstall, disable or remove **T3 Sidebar** from the Plugins page, then reload the Harness page:
the shipped sidebar returns. A reload can be blocked while a turn is in flight, so restart Harness
if the page will not reload. The plugin's own `t3Sidebar.state` stays in the browser's local storage;
remove that key if you want to discard local snooze/settle/order choices too.

## Dev

```bash
npm ci
npm run build      # writes lib/client.js and lib/index.js
npm test           # layer boundary check + node:test + vitest
npm run typecheck  # tsc --noEmit
```

`npm test` first runs `scripts/check-boundaries.ts`: `src/model/**` may not import DSH, React or
the adapter. Ported rules and their upstream files and commit are listed in
[`docs/provenance.md`](docs/provenance.md).

The packaged Harness app has no `pnpm run dev:web`; you do not need it. The app's
`dsh-client-hmr` polls each installed bundle every 500 ms and swaps a rebuilt `lib/client.js` into
the open window, so `npm run build` is the reload step. Bundle revisions are derived from file
mtime and size, so a rebuild that changes neither will not reload.

## Verification

The release gate is `npm test && npm run typecheck && npm run build`, plus a live audit in the real
window. The live audit on 2026-11-03 measured, inside the running page:

- exactly one `[data-t3-sidebar-shell]` in `sidebar.workspaces`, a 268 px-wide region filling its seat;
- a Working shelf with one 82 px card; empty Pinned/Active shelves draw no header;
- the search field, workspace filter and New Session icon button, all keyboard reachable and correctly labelled;
- search narrowing to zero rows with "No matching sessions", then restoring the row;
- the row menu opening as Rename / Pin / Archive and closing on Escape;
- pin → Pinned, unpin → Working, and archive → the Archived shelf, exercised live;
- no uncaught errors during the probe window, a theme-token stylesheet, and the working Session
  carrying a live `t3Sidebar` value after the projection refresh; older rows without one fill on
  their next event or reload.
- the host projection was read directly: a running Session carried
  `{ lastUserMessageAt, lastTurnStartedAt, outcome: null }`, and a failed Session carried
  `outcome: "failed", errorClass: "PI_AI_ERROR"`.

Still unproven in this release: a cold app restart, the light theme, drag reorder, the collapsed
rail, single-window rename/snooze/settle, and multi-window writes. Treat those as follow-up
verification, not as implied by the green build.

`scripts/probe-*.mjs` are older development probes. They launch headless Chromium with the app's
own cookie and are **not** part of the release gate; prefer the in-app audit when you need to
re-check the real window.

## Design

T3's header is one row: a quiet Search field, a workspace filter and a New Session icon action.
The workspace filter is a filter-icon trigger that becomes the scope's monogram when chosen, opening
a searchable list rather than a native select; selecting a workspace scopes the list without turning
the header into a form. Pinned and Active rows lead the list without permanent shelf headers; Working, Snoozed, Settled and Archived carry the 32 px
collapsible headers. Row badges use the workspace's first letter, so a project reads at a glance
without a second palette. The local archive lives in a quiet footer strip, so an archive is always
recoverable.

## How it works

- One seat is replaced: `sidebar.workspaces`, registered at `priority: -1000` so it shadows the
  shipped `WorkspaceBrowser`. The shipped occupant stops rendering, but its child seats stay
  declared; this plugin renders its own rows and menu and does not re-declare them.
- Lists are derived from Harness's per-session projections (`title`, `plan`, `goal`, `inbox`,
  `modelSelection`, `sessionListMetadata`) plus a `t3Sidebar` projection this plugin's host half
  folds from `turn/start`, `turn/end` and `llm/retry` events.
- Snooze, settle, visit watermarks and manual order keys are this plugin's own durable state;
  Harness has no equivalent. Rename, pin and archive are also stored locally (host pin/archive
  sets are still read and reflected); no shipped client service was available for rename/pin.
- T3's section, sort, status, snooze-wake and drag-planning rules are ported from T3's own source
  (MIT) rather than reinvented. `docs/decisions.md` records the mapping.
- Rows follow T3's densities: an 82 px card on the Pinned, Working and Active shelves, a 36 px
  slim row on Snoozed and Settled (`Sidebar.tsx:4795-4816`), a 32 px shelf header, and 1 px gaps. Each row carries `data-t3-thread-id`, `data-t3-row-density` (`card` | `slim`) and
  `data-t3-status`; each shelf carries `data-t3-section` and `data-t3-section-count`.

## License

MIT. See [LICENSE](LICENSE). The T3 Code-derived logic retains its MIT terms in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and [docs/provenance.md](docs/provenance.md).
