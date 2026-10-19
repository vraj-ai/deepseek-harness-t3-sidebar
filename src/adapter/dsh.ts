/**
 * The only DSH-aware module. Maps DSH's session list rows, per-session status,
 * workspaces and the plugin's durable intent store into T3's shell shape, then
 * derives the sidebar sections in T3's order.
 *
 * Everything DSH-shaped enters as `unknown` and is validated by `./parse.ts`.
 */
import {
  effectiveSnoozed,
  threadWokeAt,
  type ThreadSnoozeShell,
} from "../model/threadSettled.ts";
import { isThreadWorking } from "../model/threadInbox.ts";
import {
  resolveSidebarThreadSection,
  sailThreadOutcomeStatus,
  type SidebarSection,
} from "../model/sidebar.ts";
import type {
  Partitions,
  SailProjection,
  SidebarThreadShell,
  ThreadRunSummary,
  ThreadRuntimeSummary,
} from "../model/types.ts";
import { parseSailProjection, parseSessionRow, parseSessionStatus, parseWorkspaces } from "./parse.ts";
import type { DshProjectionValues, DshSessionRow } from "./parse.ts";
import { readIntent, type SidebarIntentState } from "./store.ts";

/** Re-exported so adapter callers keep one import site; the shape is `model/types.ts`. */
export type { Partitions };

/** `title ?? "Untitled session"` is the adapter's own choice; T3 always has a title. */
const UNTITLED = "Untitled session";

function isoOrNull(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

const NO_SAIL: SailProjection = {
  lastUserMessageAt: null,
  lastTurnStartedAt: null,
  lastTurnCompletedAt: null,
  outcome: "none",
  errorClass: null,
};

/**
 * T3 reads `runtime.status === "failed"` for its failed/limited rows. DSH's
 * per-session status only says `running`, so the shell's `runtime.status`
 * becomes `failed` when `running` is true, and T3's `outcome`/error class fill
 * `lastErrorClass` once the turn is over.
 *
 * `activeRunId` is the sentinel `DSH_ACTIVE_RUN_ID`, not null: T3's
 * `isThreadWorking` (`threadInbox.ts:15-30`) falls through to *working* for any
 * runtime that is idle-or-active, so the only thing that stops a finished
 * thread from sitting on the Working shelf is `runSettled`, and `runSettled`
 * needs `runtime.activeRunId === latestRun.runId`. Both are built from the same
 * `running` flag, so the sentinel pairs only with the run it describes.
 */
const DSH_ACTIVE_RUN_ID = "dsh-active-run";

function runtimeFor(input: {
  readonly running: boolean;
  readonly updatedAt: number;
  readonly sail: SailProjection;
}): ThreadRuntimeSummary {
  if (input.running) {
    return {
      status: "running",
      activeRunId: DSH_ACTIVE_RUN_ID,
      activityStartedAt: input.sail.lastTurnStartedAt,
      lastErrorClass: null,
      updatedAt: new Date(input.updatedAt).toISOString(),
    };
  }
  const outcome = sailThreadOutcomeStatus({ sail: input.sail, running: false });
  return {
    status: outcome.kind === "failed" ? "failed" : "idle",
    activeRunId: null,
    activityStartedAt: input.sail.lastTurnStartedAt,
    lastErrorClass: outcome.kind === "failed" ? outcome.errorClass : null,
    updatedAt: new Date(input.updatedAt).toISOString(),
  };
}

function runFor(input: { readonly running: boolean; readonly sail: SailProjection }): ThreadRunSummary | null {
  const startedAt = input.sail.lastTurnStartedAt;
  const completedAt = input.sail.lastTurnCompletedAt;
  if (startedAt === null && completedAt === null) return null;
  return {
    runId: input.running ? DSH_ACTIVE_RUN_ID : "",
    status: input.running ? "running" : "completed",
    requestedAt: input.sail.lastUserMessageAt,
    startedAt,
    completedAt: input.running ? null : completedAt,
  };
}

function projectFor(input: {
  readonly row: DshSessionRow;
  readonly status: { readonly running: boolean; readonly pendingInteraction: "approval" | "question" | "plan-review" | null };
  readonly environmentId: string;
  readonly intent: ReturnType<typeof readIntent>;
  readonly titleOverride: string | null;
  readonly archived: boolean;
  readonly cwd: string | null;
}): SidebarThreadShell {
  const { row, status, intent } = input;
  const projections: DshProjectionValues = row.projections;
  const sail = projections.sail === null ? NO_SAIL : toSail(projections.sail);
  const lastPromptAt = isoOrNull(projections.lastPromptAt);
  return {
    id: row.sessionId,
    environmentId: input.environmentId,
    projectId: input.cwd ?? "",
    title: input.titleOverride ?? projections.title ?? (input.cwd === null ? UNTITLED : (input.cwd.split("/").at(-1) ?? UNTITLED)),
    interactionMode: projections.planActive ? "plan" : "chat",
    createdAt: isoOrNull(row.updatedAt) ?? new Date(0).toISOString(),
    updatedAt: isoOrNull(row.updatedAt) ?? new Date(0).toISOString(),
    latestUserMessageAt: lastPromptAt ?? sail.lastUserMessageAt,
    latestUserAuthoredMessageAt: lastPromptAt ?? sail.lastUserMessageAt,
    hasPendingApprovals: status.pendingInteraction === "approval",
    hasPendingUserInput:
      status.pendingInteraction === "question" || status.pendingInteraction === "plan-review",
    pendingSubagentRequest: null,
    hasActionableProposedPlan:
      projections.planActive && sail.outcome === "completed" && status.pendingInteraction === "plan-review",
    latestRun: runFor({ running: status.running, sail }),
    runtime: runtimeFor({ running: status.running, updatedAt: row.updatedAt, sail }),
    settledOverride: intent.settledOverride,
    settledAt: intent.settledAt,
    unsettledAt: null,
    snoozedUntil: intent.snoozedUntil,
    snoozedAt: intent.snoozedAt,
    pinnedAt: intent.pinnedAt,
    pinOrderKey: intent.pinOrderKey,
    activeOrderKey: intent.activeOrderKey,
    lastVisitedAt: intent.lastVisitedAt,
    sail,
  };
}

function toSail(parsed: NonNullable<DshProjectionValues["sail"]>): SailProjection {
  const revalidated = parseSailProjection(parsed);
  return revalidated === null ? NO_SAIL : revalidated;
}

export interface AdapterInput {
  /** `session/list` rows, already JSON-decoded: projection values arrive as ISO strings client-side. */
  readonly sessions: unknown;
  /** One entry per session id; value is the ui-session status record or undefined. */
  readonly statuses: ReadonlyMap<string, unknown>;
  readonly workspaces: unknown;
  readonly intent: SidebarIntentState;
  readonly environmentId?: string;
  readonly now: string;
}

/**
 * T3's `partitionSidebarThreads` input side (`Sidebar.tsx:584-675`), without
 * its capability gates: this plugin always supports settlement and snooze.
 */
export function partitionSidebarThreads(input: {
  readonly shells: ReadonlyArray<SidebarThreadShell>;
  readonly now: string;
}): Partitions {
  const pinned: SidebarThreadShell[] = [];
  const active: SidebarThreadShell[] = [];
  const working: SidebarThreadShell[] = [];
  const snoozed: SidebarThreadShell[] = [];
  const settled: SidebarThreadShell[] = [];
  for (const shell of input.shells) {
    const classified = classifyThread({ shell, now: input.now });
    switch (classified) {
      case "pinned":
        pinned.push(shell);
        break;
      case "active":
        active.push(shell);
        break;
      case "working":
        working.push(shell);
        break;
      case "snoozed":
        snoozed.push(shell);
        break;
      case "settled":
        settled.push(shell);
        break;
    }
  }
  return { pinned, active, working, snoozed, settled };
}

/**
 * A thread is either in one of T3's stored sections (snoozed/settled/pinned)
 * or in the live active/working pair. Kept as a union so the callers exhaust it.
 */
export type ThreadPlacement =
  | { readonly kind: "snoozed" }
  | { readonly kind: "settled" }
  | { readonly kind: "pinned" }
  | { readonly kind: "active" }
  | { readonly kind: "working" };

export function classifyThread(input: {
  readonly shell: ThreadSnoozeShell &
    Pick<SidebarThreadShell, "interactionMode" | "hasActionableProposedPlan" | "settledOverride" | "pinnedAt">;
  readonly now: string;
}): "pinned" | "active" | "working" | "snoozed" | "settled" {
  const section: SidebarSection = resolveSidebarThreadSection({
    snoozed: effectiveSnoozed(input.shell, { now: input.now }),
    settled: input.shell.settledOverride === "settled",
    pinned: input.shell.pinnedAt != null,
  });
  if (section !== "active") return section;
  return isThreadWorking(input.shell) ? "working" : "active";
}

export function wokeAtFor(shell: ThreadSnoozeShell, now: string): string | null {
  return threadWokeAt(shell, { now });
}

/** Adapt one DSH list row. Returns null when the row is not a sidebar candidate. */
export function adaptSession(input: {
  readonly row: unknown;
  readonly status: unknown;
  readonly pinned: boolean;
  readonly archived: boolean;
  readonly titleOverride: string | null;
  readonly intent: SidebarIntentState;
  readonly environmentId: string;
  readonly now: string;
}): SidebarThreadShell | null {
  const row = parseSessionRow(input.row);
  if (row === null) return null;
  const status = parseSessionStatus(input.status) ?? {
    running: row.running,
    pendingInteraction: null,
    completionUnread: false,
  };
  const intent = readIntent(input.intent, threadKey({ environmentId: input.environmentId, sessionId: row.sessionId }));
  return projectFor({
    row,
    status,
    environmentId: input.environmentId,
    intent: input.pinned && intent.pinnedAt === null ? { ...intent, pinnedAt: new Date(0).toISOString() } : intent,
    titleOverride: input.titleOverride,
    archived: input.archived,
    cwd: row.cwd,
  });
}

/** T3 scopes ids per environment; DSH is single-environment per connection, but the key keeps the shape. */
export function threadKey(input: { readonly environmentId: string; readonly sessionId: string }): string {
  return `${input.environmentId}:${input.sessionId}`;
}

export interface AdaptSidebarResult {
  readonly threads: ReadonlyArray<SidebarThreadShell>;
  readonly partitions: Partitions;
  readonly skipped: number;
}

/** Visible threads only: archived threads are dropped, as T3 drops `archivedAt != null`. */
export function adaptSidebar(input: AdapterInput): AdaptSidebarResult {
  const environmentId = input.environmentId ?? "dsh";
  const workspaces = parseWorkspaces(input.workspaces);
  const archived = new Set(workspaces.archivedSessionIds);
  const pinned = new Set(workspaces.pinnedSessionIds);
  const rows = Array.isArray(input.sessions) ? input.sessions : [];
  const threads: SidebarThreadShell[] = [];
  let skipped = 0;
  for (const rawRow of rows) {
    const row = parseSessionRow(rawRow);
    if (row === null) {
      skipped += 1;
      continue;
    }
    if (row.origin === "subagent") {
      skipped += 1;
      continue;
    }
    if (archived.has(row.sessionId)) {
      skipped += 1;
      continue;
    }
    const thread = adaptSession({
      row: rawRow,
      status: input.statuses.get(row.sessionId),
      pinned: pinned.has(row.sessionId),
      archived: false,
      titleOverride: null,
      intent: input.intent,
      environmentId,
      now: input.now,
    });
    if (thread !== null) threads.push(thread);
  }
  return { threads, partitions: partitionSidebarThreads({ shells: threads, now: input.now }), skipped };
}
