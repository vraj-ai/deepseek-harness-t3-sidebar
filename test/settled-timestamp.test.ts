// Failing-first evidence for the settled sort.
//
// T3 picks the sort timestamp of a settled thread in
// `packages/client-runtime/src/state/threadSort.ts` at commit
// 5307c233b1f0ae72b8894dd39d94019aaf9e7cb8 (`resolveSettledThreadTimestamp`):
//
//   1. `settledAt`, but only when it parses;
//   2. otherwise the newest *parsable* of `latestUserMessageAt`,
//      `latestRun.requestedAt`, `latestRun.startedAt`, `latestRun.completedAt`
//      — an unparsable candidate is skipped, never treated as 0;
//   3. otherwise `updatedAt`, but null when that does not parse either.
//
// These cases were written against that source before the port existed, so the
// first run of this file inside this branch fails. See the PR body for the run.
import { describe, expect, it } from "vitest";

import { resolveSettledThreadTimestamp } from "../src/model/threadSort.ts";
import type { SidebarThreadShell } from "../src/model/types.ts";

function shell(overrides: Partial<SidebarThreadShell>): SidebarThreadShell {
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
    sail: { lastUserMessageAt: null, lastTurnStartedAt: null, lastTurnCompletedAt: null, outcome: "none" },
    ...overrides,
  };
}

describe("resolveSettledThreadTimestamp (T3 threadSort.ts:28-49)", () => {
  it("keeps a par-able settledAt", () => {
    expect(resolveSettledThreadTimestamp(shell({ settledAt: "2026-02-01T00:00:00.000Z" }))).toBe(
      "2026-02-01T00:00:00.000Z",
    );
  });

  it("falls through to the newest run timestamp when settledAt does not parse", () => {
    const thread = shell({
      settledAt: "not-a-date",
      latestRun: {
        runId: "r1",
        status: "completed",
        requestedAt: "2026-03-01T00:00:00.000Z",
        startedAt: "2026-03-01T00:05:00.000Z",
        completedAt: "2026-03-01T00:10:00.000Z",
      },
    });
    expect(resolveSettledThreadTimestamp(thread)).toBe("2026-03-01T00:10:00.000Z");
  });

  it("skips an unparsable candidate instead of letting it win", () => {
    const thread = shell({
      latestUserMessageAt: "garbage",
      latestRun: {
        runId: "r1",
        status: "completed",
        requestedAt: "2026-01-01T00:00:00.000Z",
        startedAt: null,
        completedAt: "2026-01-02T00:00:00.000Z",
      },
    });
    expect(resolveSettledThreadTimestamp(thread)).toBe("2026-01-02T00:00:00.000Z");
  });

  it("returns null when nothing parses, even updatedAt", () => {
    expect(resolveSettledThreadTimestamp(shell({ updatedAt: "nope" }))).toBeNull();
  });
});
