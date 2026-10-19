/**
 * Ported from T3 Code, `apps/web/src/components/Sidebar.logic.ts` (MIT), commit
 * 5307c233b1f0ae72b8894dd39d94019aaf9e7cb8 and — where the button calls it —
 * `Sidebar.tsx:1653-1658`. Function names follow upstream.
 */
import type { SailProjection, SidebarThreadShell } from "./types.ts";

export type SidebarSection = "pinned" | "active" | "working" | "snoozed" | "settled";

/** `Sidebar.logic.ts:121-132`. Precedence is snoozed > settled > pinned > active. */
export function resolveSidebarThreadSection(input: {
  readonly snoozed: boolean;
  readonly settled: boolean;
  readonly pinned: boolean;
}): SidebarSection {
  if (input.snoozed) return "snoozed";
  if (input.settled) return "settled";
  if (input.pinned) return "pinned";
  return "active";
}

export type SidebarThreadStatus =
  | "approval"
  | "input"
  | "working"
  | "waiting"
  | "failed"
  | "limited"
  | "ready";

type SidebarThreadStatusInput = Pick<
  SidebarThreadShell,
  "hasPendingApprovals" | "hasPendingUserInput" | "pendingSubagentRequest" | "runtime"
> & {
  readonly runtime:
    | {
        readonly status: string;
        readonly lastErrorClass: string | null;
      }
    | null;
};

/**
 * `Sidebar.logic.ts:922-941`. DSH's `t3Sidebar` projection supplies the failed
 * and limited rows T3 reads from `runtime.lastErrorClass`.
 */
export function resolveSidebarThreadStatus(thread: SidebarThreadStatusInput): SidebarThreadStatus {
  if (thread.hasPendingApprovals || thread.pendingSubagentRequest === "approval") {
    return "approval";
  }
  if (thread.hasPendingUserInput || thread.pendingSubagentRequest === "user_input") {
    return "input";
  }
  if (
    thread.runtime !== null &&
    ["preparing", "queued", "starting", "running", "waiting"].includes(thread.runtime.status)
  ) {
    return "working";
  }
  if (thread.runtime?.status === "idle") {
    return "waiting";
  }
  if (thread.runtime?.status === "failed") {
    return thread.runtime.lastErrorClass === "usage_limit" ? "limited" : "failed";
  }
  return "ready";
}

/**
 * T3's desktop status derives `failed`/`limited` from `runtime.status ===
 * "failed"` (`Sidebar.logic.ts:922-941`), which DSH's session status does not
 * carry. The `t3Sidebar` outcome is the equivalent fact: the last turn failed
 * and nothing is running since.
 */
export function sailThreadOutcomeStatus(input: {
  readonly sail: SailProjection;
  readonly running: boolean;
}):
  | { readonly kind: "failed"; readonly errorClass: "usage_limit" | "other" }
  | { readonly kind: "none" } {
  if (input.running) return { kind: "none" };
  if (input.sail.outcome !== "failed") return { kind: "none" };
  return { kind: "failed", errorClass: input.sail.errorClass ?? "other" };
}

type ThreadStatusInput = Pick<SidebarThreadShell, "latestRun" | "lastVisitedAt"> & {
  readonly latestRun: { readonly status: string; readonly completedAt: string | null } | null;
};

/** `Sidebar.logic.ts:714-728`. */
export function hasUnseenCompletion(thread: ThreadStatusInput): boolean {
  if (!thread.latestRun?.completedAt) return false;
  const completedAt = Date.parse(thread.latestRun.completedAt);
  if (Number.isNaN(completedAt)) return false;
  if (!thread.lastVisitedAt) return false;

  const lastVisitedAt = Date.parse(thread.lastVisitedAt);
  if (Number.isNaN(lastVisitedAt)) return true;
  return completedAt > lastVisitedAt;
}

/** `Sidebar.tsx:1653-1658` — woke = a reached wake time newer than the last visit. */
export function hasThreadWoke(input: {
  readonly wokeAt: string | null;
  readonly lastVisitedAt: string | null;
  readonly settled: boolean;
}): boolean {
  if (input.settled) return false;
  if (input.wokeAt === null) return false;
  if (input.lastVisitedAt === null) return true;
  return Date.parse(input.wokeAt) > Date.parse(input.lastVisitedAt);
}

/**
 * `apps/web/src/state/queries.ts:85` and `packages/contracts/src/threadSearch.ts`
 * `:10-17`: server message search only runs on a trimmed query of 2–200 chars.
 */
export const THREAD_SEARCH_MIN_LENGTH = 2;
export const THREAD_SEARCH_MAX_LENGTH = 200;

export function canSearchThreadMessages(query: string): boolean {
  const normalizedQuery = query.trim();
  return (
    normalizedQuery.length >= THREAD_SEARCH_MIN_LENGTH &&
    normalizedQuery.length <= THREAD_SEARCH_MAX_LENGTH
  );
}

/** `apps/web/src/lib/utils.ts:22-24`. */
export function normalizeSearchText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const EMPTY_CONTENT_MATCH_KEYS: ReadonlySet<string> = new Set<string>();

export function threadSearchMatchKey(input: {
  readonly environmentId: string;
  readonly threadId: string;
}): string {
  return `${input.environmentId}:${input.threadId}`;
}

/**
 * `Sidebar.logic.ts:1007-1038`. Title matches first, then message matches,
 * each in partition order. PR terms are not ported (no PR data in this slice).
 */
export function searchSidebarThreads<T extends { readonly environmentId: string; readonly id: string; readonly title: string }>(
  threads: readonly T[],
  query: string,
  contentMatchKeys: ReadonlySet<string> = EMPTY_CONTENT_MATCH_KEYS,
): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) return [];
  const titleMatches: T[] = [];
  const contentMatches: T[] = [];
  for (const thread of threads) {
    const matchesTitle = [thread.title].some((term) => term.toLowerCase().includes(normalizedQuery));
    if (matchesTitle) {
      titleMatches.push(thread);
    } else if (
      contentMatchKeys.size > 0 &&
      contentMatchKeys.has(threadSearchMatchKey({ environmentId: thread.environmentId, threadId: thread.id }))
    ) {
      contentMatches.push(thread);
    }
  }
  return [...titleMatches, ...contentMatches];
}

export type ThreadTraversalDirection = "previous" | "next";

/** `Sidebar.logic.ts:823-849`. No wrap at the ends; a null route starts at an end. */
export function resolveAdjacentThreadId<T>(input: {
  threadIds: readonly T[];
  currentThreadId: T | null;
  direction: ThreadTraversalDirection;
}): T | null {
  const { currentThreadId, direction, threadIds } = input;

  if (threadIds.length === 0) {
    return null;
  }

  if (currentThreadId === null) {
    return direction === "previous" ? (threadIds.at(-1) ?? null) : (threadIds[0] ?? null);
  }

  const currentIndex = threadIds.indexOf(currentThreadId);
  if (currentIndex === -1) {
    return null;
  }

  if (direction === "previous") {
    return currentIndex > 0 ? (threadIds[currentIndex - 1] ?? null) : null;
  }

  return currentIndex < threadIds.length - 1 ? (threadIds[currentIndex + 1] ?? null) : null;
}

/** `Sidebar.tsx:3054-3063` — numbered hints cover the first nine rows only. */
export const THREAD_JUMP_HINT_LIMIT = 9;

export function deriveJumpOrder<T>(orderedThreadKeys: readonly T[]): ReadonlyArray<{
  readonly index: number;
  readonly label: string;
  readonly threadKey: T;
}> {
  return orderedThreadKeys.slice(0, THREAD_JUMP_HINT_LIMIT).map((threadKey, index) => ({
    index,
    label: String(index + 1),
    threadKey,
  }));
}
