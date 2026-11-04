# Decisions

Locked during design. Each line names what was decided and why, so a later change argues with the
reason rather than rediscovering it.

## Scope

T3's sidebar carries over whole: thread list, sections, densities, status, jump hints, search,
rename, pin, snooze, settle, archive. The composer, diff/review and right sidebar stay
Harness-native — in T3 they are the main pane, not the sidebar.

## Look

Harness theme tokens, T3 structure and density. No T3 palette is copied. The header is one row
(Search, workspace filter, New Session) like T3's SidebarThreadHeader; the filter is a monogram
trigger with a searchable popover, never a native select. Pinned and Active rows lead the list
without permanent headers; Working, Snoozed, Settled and Archived use collapsible 32 px headers.

## Placement

The plugin replaces `sidebar.workspaces` (single seat, `priority: -1000`). The shipped occupant
stops rendering but keeps its child seats declared; 0.2.1-rc.5 spells them `session.menu.item`,
`session.row.action`, `session.row.leading`, `session.row.hover` and `directoryFlow`, and
0.2.2-rc.1 moves the workspace-scoped ones under `sidebar.workspaces.*` and adds
`sidebar.session.row.trailing`. This release draws its own rows and menu and re-declares none of
them, so no second session tree appears and shipped row-action entries have no row of this browser
to attach to while the plugin is enabled.

## State ownership

| State | Owner |
|---|---|
| title, plan, goal, queue, model, last prompt time, running, pending interaction, unread | Harness, read through per-session projections |
| host pin set and host archive set | Harness, read and reflected; local overrides can win |
| turn outcome, turn timings, error class | this plugin's host half, registered as the `t3Sidebar` session projection |
| snooze, settled override, visit watermark, pin/active order keys, rename, local pin/archive | this plugin's durable store |
| diff counts | none — T3's own are dead code (`Sidebar.tsx:2507-2512`), so parity means no counts |

## Parity without invention

Where Harness has no equivalent (settle, snooze, visit watermark, manual order), the plugin owns
the state rather than pretending it is Harness state. Where T3 derives a status from data Harness
lacks, the host projection rebuilds that data from real session events instead of leaving a stale
placeholder.

## Scope cuts in this release

- Branch and pull-request badges are not ported (the upstream meta slice is separate).
- Rename, pin and archive are plugin-local overrides. The host `pinnedSessionIds` and
  `archivedSessionIds` sets are still read, and a local choice wins over them until the local store
  is cleared. There is no public client service for rename or pin; `uiWorkspace` exposes
  archive/unarchive, but this release keeps archive local so its undo and rollback are atomic with
  the rest of the intent store.
- The plugin does not re-declare the shipped row-action child seats, so other plugins' row menu
  entries do not render while it owns `sidebar.workspaces`.

## Build

The packaged app ships no client build preset, so this repo carries its own build that emits the
module-loader wrapper the Harness client expects:
`window.__ModuleLoader__.load({ id: <package name>, factory })`.

## The `t3Sidebar` projection contract

Key `t3Sidebar`, `stateVersion: 1`, registered by the host half on
`ctx.sessionProjections` (cordis `inject: ['sessionProjections']`, so an app without the registry
leaves the plugin pending instead of throwing). Registration is an effect on the plugin fiber:
unload the row and the key disappears from every snapshot.

Wire shape — the only thing that crosses to the client:

```ts
{
  lastUserMessageAt: number | null   // ms, prompt only, not a compaction checkpoint
  lastTurnStartedAt: number | null   // ms
  lastTurnCompletedAt: number | null // ms
  outcome: 'ok' | 'failed' | 'interrupted' | null
  errorClass: string | null          // machine code: RATE_LIMIT, INTERRUPTED, HOOK_CANCELLED, …
}
```

Folded events, and why each one is read:

| Event | Moves |
|---|---|
| `user/message` (surface append) | `lastUserMessageAt` |
| `turn/start` | `lastTurnStartedAt`; clears `outcome`, `errorClass` and retry memory |
| `turn/end` | `lastTurnCompletedAt`, `outcome`, `errorClass` |
| `llm/retry` | remembered failure class, used only if the turn cannot say why it failed |
| `step/end` | drains remembered failures |

`completed` and `max-tokens` are `ok`. `blocked` is `failed` with `BLOCKED`: a blocked end is a
pre-step rejection that discarded the claimed input, so the work did not complete. `error` is `failed`
with `reason.error.code`. `aborted` is `interrupted` (`HOOK_CANCELLED` when a hook caused
it), and `interrupted` — the reason restart recovery writes when the process exited mid-turn — is
`interrupted` with `INTERRUPTED`. Anything else returns the same state reference, so the registry's
`Object.is` change detection never fires for events this unit does not read.

## Row actions (issue #7)

Every row action is a command on the plugin's own durable intent (`src/adapter/intent.ts`), written
to local storage and re-read on load. The writer applies each command to the record as storage
holds it, so two windows do not overwrite each other. When storage refuses a write, the page's
state stays the base until a write lands again.

- Snooze and settle are exclusive. Settling a snoozed row ends its snooze, and snoozing a settled
  row clears the settle, so a row never wakes into a state the user replaced.
- Undo of an archive is `unarchive`. Only the latest archive offers undo; a second archive replaces
  the toast.
- Drag and Alt+arrow reorder only the pinned shelf, and only when the list is neither scoped to a
  workspace nor narrowed by search: the stored order keys span all pinned rows, and a partial list
  cannot rewrite them. T3 orders only its pinned shelf by hand; the active shelf's `activeOrderKey`
  is not written.
- A pin or unpin the user chooses overrides the host's pin set from then on, including a later host
  pin of the same session. Clearing `t3Sidebar.state` returns the row to the host's set.
- An archive is local: the host still considers the Session unarchived, and another client (or the
  shipped browser after disabling this plugin) still sees it. The chrome's **Archived (N)** toggle
  reveals the local archive shelf, where Unarchive is the undo; without the toggle an archived row
  would be unreachable after the toast.
- A title is capped at 200 characters on the way in and on the way back from storage.
- Cmd/Ctrl+1-9 jumps only while the sidebar is wide, where the numbered rows are drawn.
