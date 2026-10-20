/**
 * T3's render order, derived from the partitions.
 *
 * `Sidebar.tsx:524-530` orders pinned → active → working → snoozed → settled,
 * each already sorted by its own rule; `Sidebar.tsx:3054-3063` numbers the first
 * nine rows of that order as jump hints.
 */
import type { Partitions, SidebarThreadShell } from "./types.ts";
import { sortInboxThreadsByReturn, sortWorkingThreadsBySend } from "./threadInbox.ts";
import { sortActiveThreadsByOrderKey, sortPinnedThreadsByOrderKey, sortSettledThreads, toSortableTimestamp } from "./threadSort.ts";
import { deriveJumpOrder } from "./sidebar.ts";

/** `Sidebar.tsx:667-671`, inline upstream: soonest wake first. */
export function sortSnoozedThreads<T extends { readonly snoozedUntil: string | null }>(
  threads: readonly T[],
): T[] {
  return [...threads].sort(
    (left, right) =>
      (toSortableTimestamp(left.snoozedUntil ?? undefined) ?? 0) -
      (toSortableTimestamp(right.snoozedUntil ?? undefined) ?? 0),
  );
}

export interface OrderedSidebar {
  readonly orderedThreads: ReadonlyArray<SidebarThreadShell>;
  readonly orderedThreadKeys: ReadonlyArray<string>;
  readonly jumpOrder: ReturnType<typeof deriveJumpOrder<string>>;
}

export function orderSidebarThreads(input: {
  readonly partitions: Partitions;
  readonly inboxReturnAt?: (thread: SidebarThreadShell) => number | undefined;
}): OrderedSidebar {
  const pinned = sortPinnedThreadsByOrderKey(input.partitions.pinned);
  // With the working shelf on, T3 sorts active rows by return time and ignores
  // manual active keys (`Sidebar.tsx:644-646`). This slice always has the shelf.
  const active = sortInboxThreadsByReturn(input.partitions.active, input.inboxReturnAt);
  const working = sortWorkingThreadsBySend(input.partitions.working);
  const snoozed = sortSnoozedThreads(input.partitions.snoozed);
  const settled = sortSettledThreads(input.partitions.settled);
  const orderedThreads = [...pinned, ...active, ...working, ...snoozed, ...settled];
  const orderedThreadKeys = orderedThreads.map((thread) => thread.id);
  return { orderedThreads, orderedThreadKeys, jumpOrder: deriveJumpOrder(orderedThreadKeys) };
}

