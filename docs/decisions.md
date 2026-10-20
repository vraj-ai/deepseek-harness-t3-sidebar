# Decisions

Locked during design. Each line names what was decided and why, so a later change argues with the
reason rather than rediscovering it.

## Scope

T3's sidebar carries over whole: thread list, sections, densities, status, jump hints, search,
rename, pin, snooze, settle, archive. The composer, diff/review and right sidebar stay
Harness-native — in T3 they are the main pane, not the sidebar.

## Look

Harness theme tokens, T3 structure and density. No T3 palette is copied.

## Placement

The plugin replaces `sidebar.workspaces` (single seat, `priority: -1`). Replacing it also removes
the child seats the shipped occupant declared (`session.menu.item`, `session.row.action`,
`session.row.leading`, `session.row.hover`, `directoryFlow`), so this plugin re-declares the ones it
uses. There is one session tree, not two.

## State ownership

| State | Owner |
|---|---|
| title, plan, goal, queue, model, last prompt time, running, pending interaction, unread, archive, pin set | Harness, read through per-session projections |
| turn outcome, turn timings, error class | this plugin's host half, registered as the `t3Sidebar` session projection |
| branch, pull requests | host-side `git`/`gh` probe, cached |
| snooze, settled override, visit watermark, pin/active order keys | this plugin's durable store |
| diff counts | none — T3's own are dead code (`Sidebar.tsx:2507-2512`), so parity means no counts |

## Parity without invention

Where Harness has no verb (settle, snooze), the plugin owns the state rather than pretending it is
Harness state. Where T3 derives a status from data Harness lacks, the host projection rebuilds that
data from real session events instead of leaving a stale placeholder.

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
| `step/start` | drains remembered failures |

`completed`, `blocked` and `max-tokens` are `ok` — a blocked turn settled; it did not fail. `error` is
`failed` with `reason.error.code`. `aborted` is `interrupted` (`HOOK_CANCELLED` when a hook caused
it), and `interrupted` — the reason restart recovery writes when the process exited mid-turn — is
`interrupted` with `INTERRUPTED`. Anything else returns the same state reference, so the registry's
`Object.is` change detection never fires for events this unit does not read.
