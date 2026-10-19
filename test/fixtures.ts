/**
 * Shell fixtures for the model tests. Deliberately independent of the adapter:
 * the model must be exercisable without any DSH shape.
 */
import type { SidebarThreadShell, ThreadRunSummary } from "../src/model/types.ts";

export function thread(overrides: Partial<SidebarThreadShell> = {}): SidebarThreadShell {
  return {
    id: "t1",
    environmentId: "env",
    projectId: "p1",
    title: "Thread",
    interactionMode: "chat",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    latestUserMessageAt: null,
    latestUserAuthoredMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    pendingSubagentRequest: null,
    hasActionableProposedPlan: false,
    latestRun: null,
    runtime: null,
    settledOverride: null,
    settledAt: null,
    unsettledAt: null,
    snoozedUntil: null,
    snoozedAt: null,
    pinnedAt: null,
    pinOrderKey: null,
    activeOrderKey: null,
    lastVisitedAt: null,
    sail: {
      lastUserMessageAt: null,
      lastTurnStartedAt: null,
      lastTurnCompletedAt: null,
      outcome: "none",
      errorClass: null,
    },
    ...overrides,
  };
}

export function run(overrides: Partial<ThreadRunSummary> = {}): ThreadRunSummary {
  return {
    runId: "r1",
    status: "completed",
    requestedAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:01:00.000Z",
    ...overrides,
  };
}

/**
 * A thread that finished its run. Note it is still *working* under T3's rule
 * (`threadInbox.ts:15-30`): an idle runtime falls through the guard. The
 * Working shelf only leaves it because the adapter's idle state pairs a runtime
 * without the run id.
 */
export function idleThread(overrides: Partial<SidebarThreadShell> = {}): SidebarThreadShell {
  return thread({ latestRun: run(), runtime: idleRuntime(), ...overrides });
}

export function idleRuntime(overrides: Partial<NonNullable<SidebarThreadShell["runtime"]>> = {}) {
  return {
    status: "idle" as const,
    activeRunId: null,
    activityStartedAt: null,
    lastErrorClass: null,
    updatedAt: "2026-01-01T00:01:00.000Z",
    ...overrides,
  };
}

export const NOW = "2026-01-02T12:00:00.000Z";
