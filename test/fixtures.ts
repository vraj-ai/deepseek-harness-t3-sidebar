/**
 * Shell fixtures for the model tests. Deliberately independent of the adapter:
 * the model must be exercisable without any DSH shape, except `dshRow`, which
 * builds the one wire record an adapter-facing test needs.
 *
 * Runtime shapes follow the adapter's contract: a thread with no turn in flight
 * carries `runtime: null`; only a live turn carries a runtime. `parkedIdleThread`
 * is T3's `parkAtIdle` shape, which the adapter never emits.
 */
import type { SidebarThreadShell, ThreadRunSummary, ThreadRuntimeSummary } from "../src/model/types.ts";

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

export function idleRuntime(
  overrides: Partial<NonNullable<SidebarThreadShell["runtime"]>> = {},
): ThreadRuntimeSummary {
  return {
    status: "idle",
    activeRunId: null,
    activityStartedAt: null,
    lastErrorClass: null,
    updatedAt: "2026-01-01T00:01:00.000Z",
    ...overrides,
  };
}

/** The adapter's only runtime: a turn in flight, carrying the run id it belongs to. */
export function inFlightRuntime(
  overrides: Partial<NonNullable<SidebarThreadShell["runtime"]>> = {},
): ThreadRuntimeSummary {
  return {
    status: "running",
    activeRunId: "r1",
    activityStartedAt: "2026-01-01T00:00:00.000Z",
    lastErrorClass: null,
    updatedAt: "2026-01-01T00:01:00.000Z",
    ...overrides,
  };
}

/** A turn in flight: a running run paired with a runtime that carries its id. */
export function inFlightThread(overrides: Partial<SidebarThreadShell> = {}): SidebarThreadShell {
  return thread({
    latestRun: run({ status: "running", completedAt: null }),
    runtime: inFlightRuntime(),
    ...overrides,
  });
}

/**
 * A session that finished its turn. The adapter emits no runtime when nothing is
 * in flight, and T3's guard returns false for a null runtime, so this is the
 * not-working shape.
 */
export function finishedThread(overrides: Partial<SidebarThreadShell> = {}): SidebarThreadShell {
  return thread({ latestRun: run(), runtime: null, ...overrides });
}

/**
 * T3's `parkAtIdle` shape (`models.ts:167-189`): an idle runtime kept for a
 * session whose background work will wake it. The adapter cannot emit it — DSH
 * has no parked runtime — but the rule's behaviour on it is worth pinning.
 */
export function parkedIdleThread(overrides: Partial<SidebarThreadShell> = {}): SidebarThreadShell {
  return thread({ latestRun: run(), runtime: idleRuntime(), ...overrides });
}

/** One `session/list` row in the shape `parseSessionRow` validates. */
export function dshRow(overrides: {
  readonly sessionId: string;
  readonly running?: boolean;
  readonly updatedAt?: number;
}): Record<string, unknown> {
  const running = overrides.running ?? false;
  return {
    sessionId: overrides.sessionId,
    updatedAt: overrides.updatedAt ?? Date.parse("2026-01-01T00:00:00.000Z"),
    running,
    blank: false,
    cwd: "/repo",
    // A mid-turn row has a turn the plugin's own projection reports; a session
    // with no turn reports none.
    projections: {
      values: running
        ? {
            t3Sidebar: {
              lastUserMessageAt: "2026-01-01T00:00:00.000Z",
              lastTurnStartedAt: "2026-01-01T00:00:00.000Z",
              lastTurnCompletedAt: null,
              outcome: "none",
              errorClass: null,
            },
          }
        : {},
    },
  };
}

export const NOW = "2026-01-02T12:00:00.000Z";
