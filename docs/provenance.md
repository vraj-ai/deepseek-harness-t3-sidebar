# Provenance

The rules in `src/model/` are ported from [T3 Code](https://github.com/pingdotgg/t3code), which is
MIT licensed (`Copyright (c) 2026 T3 Tools Inc.`, `LICENSE` at the repository root). This repository
is MIT as well, and every ported file names its upstream source and commit in its header. Function
names and bodies are kept verbatim where possible so a later change can be diffed against upstream.

Only the pure rules were ported. Nothing React, DOM, Effector/React-query, DnD or server-shaped was
copied; `src/adapter/` is new code that maps DSH's records onto the shell type the rules expect.

## Upstream commit

Rules were taken from:

```
pingdotgg/t3code @ 5307c233b1f0ae72b8894dd39d94019aaf9e7cb8
```

Equivalence was re-checked against `main` at `7e7e6d8240858d19d8e72dbcd0f0117e3d0a7f56`
(2026-10-19): `threadInbox.ts`, `threadSettled.ts`, `models.ts` and `Sidebar.logic.ts` are
unchanged at those symbols.

## Files ported

Paths are relative to the T3 repository root.

| Upstream file | Commit's range | Ported into | Symbols |
| --- | --- | --- | --- |
| `packages/client-runtime/src/state/threadInbox.ts` | `:15-30` | `src/model/threadInbox.ts` | `isThreadWorking` |
| `packages/client-runtime/src/state/threadInbox.ts` | `:36-57` | `src/model/threadInbox.ts` | `sortInboxThreadsByReturn` |
| `packages/client-runtime/src/state/threadInbox.ts` | `:60-72` | `src/model/threadInbox.ts` | `sortWorkingThreadsBySend` |
| `packages/client-runtime/src/state/threadInbox.ts` | `:94-126` | `src/model/threadInbox.ts` | `createInboxReturnTracker` |
| `packages/client-runtime/src/state/threadSort.ts` | `:17-21` | `src/model/threadSort.ts` | `toSortableTimestamp` |
| `packages/client-runtime/src/state/threadSort.ts` | `:23-49` | `src/model/threadSort.ts` | `resolveSettledThreadTimestamp` |
| `packages/client-runtime/src/state/threadSort.ts` | `:51-58` | `src/model/threadSort.ts` | `sortSettledThreads` |
| `packages/client-runtime/src/state/threadSort.ts` | `:116-124` | `src/model/threadSort.ts` | `activeThreadAnchorTimestampMs` |
| `packages/client-runtime/src/state/threadSort.ts` | `:263-291` | `src/model/threadSort.ts` | `sortPinnedThreadsByOrderKey` |
| `packages/client-runtime/src/state/threadSort.ts` | `:298-331` | `src/model/threadSort.ts` | `sortActiveThreadsByOrderKey` |
| `packages/client-runtime/src/state/threadSettled.ts` | `:44-73` | `src/model/threadSettled.ts` | `hasQueuedTurnStart` (with `QUEUED_TURN_START_GRACE_MS`) |
| `packages/client-runtime/src/state/threadSettled.ts` | `:81-102` | `src/model/threadSettled.ts` | `threadRaisedHandWhileSnoozed` |
| `packages/client-runtime/src/state/threadSettled.ts` | `:104-122` | `src/model/threadSettled.ts` | `canSnooze` |
| `packages/client-runtime/src/state/threadSettled.ts` | `:124-133` | `src/model/threadSettled.ts` | `effectiveSnoozed` |
| `packages/client-runtime/src/state/threadSettled.ts` | `:135-166` | `src/model/threadSettled.ts` | `threadWokeAt` |
| `packages/client-runtime/src/state/threadSettled.ts` | `:166-287` | `src/model/threadSettled.ts` | `SnoozePresetId`, `SnoozePreset`, `resolveSnoozePresets`, `snoozeWakeLabel` |
| `packages/client-runtime/src/state/models.ts` | `:37-50` | `src/model/types.ts` | `ThreadRunSummary`, `ThreadRuntimeSummary` (field subset) |
| `packages/client-runtime/src/state/models.ts` | `:67-69`, `:80-89` | `src/model/models.ts` | `threadRuntimeIsActive`, `threadRunStatusIsActive` |
| `packages/client-runtime/src/state/models.ts` | `:90-144` | `src/model/types.ts` | `SidebarThreadShell` (field subset) |
| `apps/web/src/components/Sidebar.logic.ts` | `:121-132` | `src/model/sidebar.ts` | `SidebarSection`, `resolveSidebarThreadSection` |
| `apps/web/src/components/Sidebar.logic.ts` | `:714-728` | `src/model/sidebar.ts` | `hasUnseenCompletion` |
| `apps/web/src/components/Sidebar.logic.ts` | `:823-849` | `src/model/sidebar.ts` | `resolveAdjacentThreadId` |
| `apps/web/src/components/Sidebar.logic.ts` | `:892-942` | `src/model/sidebar.ts` | `SidebarThreadStatus`, `resolveSidebarThreadStatus` |
| `apps/web/src/components/Sidebar.logic.ts` | `:1007-1038` | `src/model/sidebar.ts` | `searchSidebarThreads`, `normalizeSearchText`, `canSearchThreadMessages` |
| `apps/web/src/components/Sidebar.tsx` | `:584-675` | `src/adapter/dsh.ts`, `src/model/order.ts` | partition input shape and per-section sorts |
| `apps/web/src/components/Sidebar.tsx` | `:524-530` | `src/model/order.ts` | render order |
| `apps/web/src/components/Sidebar.tsx` | `:1653-1658` | `src/model/sidebar.ts` | `hasThreadWoke` |
| `apps/web/src/components/Sidebar.tsx` | `:3054-3063` | `src/model/sidebar.ts` | `deriveJumpOrder`, `THREAD_JUMP_HINT_LIMIT` |

### Deliberate divergences

- `src/model/types.ts` spells `RuntimeStatus` as a plain literal union. Upstream's
  `ThreadRuntimeSummary["status"]` is `OrchestrationV2RunStatus | "idle"`; the port only needs the
  members the rules branch on.
- `threadRaisedHandWhileSnoozed` also reads `latestRun.status === "failed"`, not only `"completed"`,
  because DSH reports a failed turn on `latestRun` rather than a run-level state machine.
- `searchSidebarThreads` does not match pull-request terms (`Sidebar.logic.ts:1040-1048`): this
  slice has no PR data.
- `threadInbox.ts` line numbers in this repository's comments refer to the commit above. Its
  `isThreadWorking` has a fall-through that disagrees with its own reading — see known gaps in the
  issue #5 pull request.
