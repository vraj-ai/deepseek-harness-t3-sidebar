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
import { resolveSidebarThreadSection, type SidebarSection } from "../model/sidebar.ts";
import type {
  Partitions,
  SailProjection,
  SidebarThreadShell,
  ThreadRunSummary,
  ThreadRuntimeSummary,
} from "../model/types.ts";
import { parseSailProjection, parseSessionRow, parseSessionStatus, parseWorkspaces } from "./parse.ts";
import type { DshModelSelection, DshProjectionValues, DshSessionRow } from "./parse.ts";
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
 * The adapter emits exactly two runtime truths, because DSH has exactly two:
 * a turn is in flight, or it is not.
 *
 * - In flight: `{ status: "running", activeRunId }`, with the run id shared with
 *   `latestRun` by `runFor`, so `runSettled` in T3's `isThreadWorking`
 *   (`threadInbox.ts:15-30`) never fires mid-turn.
 * - Not in flight: `null`. That is the shape T3 itself produces for a session
 *   with no run (`shellRuntime`, `models.ts:167-189`, returns null when
 *   `latestRunId === null && activeProviderThreadId === null && !parkAtIdle`),
 *   and it is the only shape under which a finished session is not working,
 *   since T3's guard returns false for a null runtime (`!undefined` is true and
 *   `undefined !== "idle"` is true, so the conjunction is true).
 *
 * T3's `parkAtIdle` idle runtime is a warm, parked session waiting on
 * background work that will wake it. DSH's session lifecycle has no parked
 * runtime — a session is either running or done — so that branch is unreachable
 * from this adapter and is not emitted, rather than contradicted.
 *
 * Consequence, accepted: absence of a runtime also means absence of
 * `lastErrorClass`, so a failed turn keeps `latestRun.status === "failed"` but
 * does not render T3's failed/limited pill yet; `sailThreadOutcomeStatus` in the
 * model is what the row grows from in the UI slice.
 */
const DSH_ACTIVE_RUN_ID = "dsh-active-run";

function runtimeFor(input: {
  readonly running: boolean;
  readonly updatedAt: number;
  readonly sail: SailProjection;
  readonly modelSelection: DshModelSelection;
}): ThreadRuntimeSummary | null {
  if (!input.running) return null;
  const provider = input.modelSelection.lastUsed?.provider ?? null;
  return {
    status: "running",
    activeRunId: DSH_ACTIVE_RUN_ID,
    activityStartedAt: input.sail.lastTurnStartedAt,
    lastErrorClass: null,
    updatedAt: new Date(input.updatedAt).toISOString(),
    providerInstanceId: provider,
    providerName: provider,
  };
}

/** A finished turn with no recorded outcome reads as completed. */
function finishedRunStatus(outcome: SailProjection["outcome"]): ThreadRunSummary["status"] {
  return outcome === "none" ? "completed" : outcome;
}

function runFor(input: { readonly running: boolean; readonly sail: SailProjection }): ThreadRunSummary | null {
  const startedAt = input.sail.lastTurnStartedAt;
  const completedAt = input.sail.lastTurnCompletedAt;
  if (startedAt === null && completedAt === null) return null;
  return {
    runId: input.running ? DSH_ACTIVE_RUN_ID : "",
    status: input.running ? "running" : finishedRunStatus(input.sail.outcome),
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
  /** Project label resolved by the caller, carried as the shell's `projectId`. */
  readonly projectName?: string | null;
}): SidebarThreadShell {
  const { row, status, intent } = input;
  const projections: DshProjectionValues = row.projections;
  // The host's own project name for the row: the workspace's display title when
  // the caller knows it, else the directory's name, else none — the card's top
  // line then shows the status alone, and the title line carries the rest.
  // (T3's `projectDisplayName`, `Sidebar.tsx:2287-2293`.)
  const projectName =
    input.projectName ?? (input.cwd === null ? null : (input.cwd.split("/").at(-1) ?? null));
  const sail = projections.sail === null ? NO_SAIL : toSail(projections.sail);
  const lastPromptAt = isoOrNull(projections.lastPromptAt);
  return {
    id: row.sessionId,
    environmentId: input.environmentId,
    projectId: projectName ?? input.cwd ?? "",
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
    runtime: runtimeFor({
      running: status.running,
      updatedAt: row.updatedAt,
      sail,
      modelSelection: projections.modelSelection,
    }),
    settledOverride: intent.settledOverride,
    settledAt: intent.settledAt,
    unsettledAt: intent.unsettledAt,
    snoozedUntil: intent.snoozedUntil,
    snoozedAt: intent.snoozedAt,
    pinnedAt: intent.pinnedAt,
    pinOrderKey: intent.pinOrderKey,
    activeOrderKey: intent.activeOrderKey,
    lastVisitedAt: intent.lastVisitedAt,
    sail,
    modelSelection: {
      lastUsed: projections.modelSelection.lastUsed,
      next: projections.modelSelection.next,
    },
    goalActive: projections.goalActive,
    queuedPrompts: projections.queuedPrompts,
  };
}

function toSail(parsed: NonNullable<DshProjectionValues["sail"]>): SailProjection {
  const revalidated = parseSailProjection(parsed);
  return revalidated === null ? NO_SAIL : revalidated;
}

export interface AdapterInput {
  /** `session/list` rows, already JSON-decoded; `parseSailProjection` translates the `t3Sidebar` wire shape. */
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

/**
 * Adapt one DSH list row. Returns null when the row is not a sidebar candidate.
 *
 * Visibility is T3's `filterSidebarV2VisibleThreads` (`Sidebar.logic.ts:516-533`):
 * subagents never reach the list. It lives here so every caller gets the same
 * filter and no caller can forget it.
 */
export function adaptSession(input: {
  readonly row: unknown;
  readonly status: unknown;
  readonly pinned: boolean;
  readonly archived: boolean;
  readonly titleOverride: string | null;
  readonly intent: SidebarIntentState;
  readonly environmentId: string;
  readonly now: string;
  /** Project label to carry as `projectId`, when the caller resolved one. */
  readonly projectName?: string | null;
}): SidebarThreadShell | null {
  const row = parseSessionRow(input.row);
  if (row === null || row.origin === "subagent") return null;
  const parsedStatus = parseSessionStatus(input.status);
  const status = {
    running: parsedStatus?.running ?? row.running,
    pendingInteraction: parsedStatus?.pendingInteraction ?? null,
  };
  const intent = readIntent(input.intent, threadKey({ environmentId: input.environmentId, sessionId: row.sessionId }));
  return projectFor({
    row,
    status,
    environmentId: input.environmentId,
    intent: { ...intent, pinnedAt: input.pinned ? (intent.pinnedAt ?? new Date(0).toISOString()) : null },
    titleOverride: input.titleOverride,
    archived: input.archived,
    cwd: row.cwd,
    projectName: input.projectName ?? null,
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
