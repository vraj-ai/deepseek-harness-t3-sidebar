/**
 * The sidebar's shell type.
 *
 * This is a field subset of T3's `EnvironmentThreadShell`
 * (`packages/client-runtime/src/state/models.ts:90-144`, commit
 * 5307c233b1f0ae72b8894dd39d94019aaf9e7cb8) with the same field names and
 * nullability, so the ported rules diff cleanly against upstream. Fields T3
 * reads but this sidebar does not derive (branch, pull requests, goal, provider
 * stack) are absent; their rules are out of this slice.
 *
 * `sail` carries the plugin's own `t3Sidebar` session projection (issue #1).
 * It is already validated when it reaches here: the adapter parses the wire
 * shape once and builds this type, never casts into it.
 */
export type RunStatus =
  | "preparing"
  | "queued"
  | "starting"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Plain string members, not `RunStatus | "idle"`. TypeScript narrows the
 * truthiness side of `!threadRuntimeIsActive(runtime) && runtime?.status !== "idle"`
 * to `RuntimeStatus` minus the active members; when that subtraction leaves a
 * non-literal string the comparison is emitted, and when it collapses to
 * `"idle"` the comparison is erased as provably true — so the same guard
 * compiles differently depending on how the type is spelled. Upstream T3 gets
 * an erased guard; this port needs the comparison, so it stays a plain union.
 */
export type RuntimeStatus =
  | "preparing"
  | "queued"
  | "starting"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled"
  | "idle";

/** T3's `OrchestrationV2ProviderFailureClass`, reduced to the classes it branches on. */
export type FailureClass = "usage_limit" | "other";

export type PendingSubagentRequest = "approval" | "user_input";

export interface ThreadRunSummary {
  readonly runId: string;
  readonly status: RunStatus;
  readonly requestedAt: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
}

export interface ThreadRuntimeSummary {
  readonly status: RuntimeStatus;
  readonly activeRunId: string | null;
  readonly activityStartedAt: string | null;
  readonly lastErrorClass: FailureClass | null;
  readonly updatedAt: string;
  /** T3's runtime always names its provider; the adapter fills these in-flight. */
  readonly providerInstanceId?: string | null;
  readonly providerName?: string | null;
}

/** The plugin-owned `t3Sidebar` projection. Timestamps are ISO strings. */
export interface SailProjection {
  readonly lastUserMessageAt: string | null;
  readonly lastTurnStartedAt: string | null;
  readonly lastTurnCompletedAt: string | null;
  readonly outcome: "none" | "completed" | "failed" | "cancelled";
  readonly errorClass: FailureClass | null;
}

export interface SidebarThreadShell {
  readonly id: string;
  readonly environmentId: string;
  readonly projectId: string;
  readonly title: string;
  readonly interactionMode: "chat" | "plan";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly latestUserMessageAt: string | null;
  readonly latestUserAuthoredMessageAt: string | null;
  readonly hasPendingApprovals: boolean;
  readonly hasPendingUserInput: boolean;
  readonly pendingSubagentRequest: PendingSubagentRequest | null;
  readonly hasActionableProposedPlan: boolean;
  readonly latestRun: ThreadRunSummary | null;
  readonly runtime: ThreadRuntimeSummary | null;
  readonly settledOverride: "settled" | "active" | null;
  readonly settledAt: string | null;
  readonly unsettledAt: string | null;
  readonly snoozedUntil: string | null;
  readonly snoozedAt: string | null;
  readonly pinnedAt: string | null;
  readonly pinOrderKey: string | null;
  readonly activeOrderKey: string | null;
  readonly lastVisitedAt: string | null;
  readonly sail: SailProjection;
}

/** T3's `partitionSidebarThreads` result, one bucket per sidebar section. */
export interface Partitions {
  readonly pinned: ReadonlyArray<SidebarThreadShell>;
  readonly active: ReadonlyArray<SidebarThreadShell>;
  readonly working: ReadonlyArray<SidebarThreadShell>;
  readonly snoozed: ReadonlyArray<SidebarThreadShell>;
  readonly settled: ReadonlyArray<SidebarThreadShell>;
}
