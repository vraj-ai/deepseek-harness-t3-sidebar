/**
 * The adapter's runtime contract and what T3's rules do with it.
 *
 * T3's `isThreadWorking` (`threadInbox.ts:15-30`) returns false for a null
 * runtime, and `shellRuntime` (`models.ts:167-189`) produces null for a session
 * with no run. DSH has exactly two truths the adapter controls — a turn is in
 * flight, or it is not — so a finished session emits no runtime, and that is
 * what keeps it off the Working shelf.
 */
import { describe, expect, it } from "vitest";

import { adaptSidebar } from "../src/adapter/dsh.ts";
import { emptyIntentState } from "../src/adapter/store.ts";
import { isThreadWorking } from "../src/model/threadInbox.ts";
import { dshRow, finishedThread, inFlightThread, NOW, thread } from "./fixtures.ts";

function adapt(rows: ReadonlyArray<unknown>) {
  return adaptSidebar({
    sessions: rows,
    statuses: new Map(),
    workspaces: { items: [], pinnedSessionIds: [], archivedSessionIds: [] },
    intent: emptyIntentState(),
    now: NOW,
  });
}

describe("adapter runtime shapes", () => {
  it("emits a runnable runtime for a segment mid-turn", () => {
    const { threads } = adapt([dshRow({ sessionId: "mid-turn", running: true })]);
    const shell = threads[0];
    expect(shell?.runtime?.status).toBe("running");
    // The runtime names the run it belongs to, which is what keeps a mid-turn
    // thread from reading as settled.
    expect(shell?.runtime?.activeRunId).toBe(shell?.latestRun?.runId);
    expect(shell === undefined ? false : isThreadWorking(shell)).toBe(true);
  });

  it("emits no runtime for a finished session, which lands in active", () => {
    const { threads, partitions } = adapt([dshRow({ sessionId: "finished" })]);
    expect(threads[0]?.runtime).toBeNull();
    expect(partitions.working).toHaveLength(0);
    expect(partitions.active.map((t) => t.id)).toEqual(["finished"]);
  });

  it("emits no runtime for a session that never ran, which lands in active", () => {
    const { threads, partitions } = adapt([dshRow({ sessionId: "never-ran" })]);
    expect(threads[0]?.runtime).toBeNull();
    expect(threads[0]?.latestRun).toBeNull();
    expect(partitions.active.map((t) => t.id)).toEqual(["never-ran"]);
  });

  it("splits a mixed list on the live turn alone", () => {
    const { partitions } = adapt([
      dshRow({ sessionId: "mid-turn", running: true }),
      dshRow({ sessionId: "finished" }),
      dshRow({ sessionId: "never-ran" }),
    ]);
    expect(partitions.working.map((t) => t.id)).toEqual(["mid-turn"]);
    expect(partitions.active.map((t) => t.id)).toEqual(["finished", "never-ran"]);
  });

  // The fixture shapes the rule tests rely on, pinned to what the adapter emits.
  it("agrees with the fixtures the rule tests are written against", () => {
    expect(isThreadWorking(inFlightThread())).toBe(true);
    expect(isThreadWorking(finishedThread())).toBe(false);
    expect(isThreadWorking(thread({ runtime: null, latestRun: null }))).toBe(false);
    expect(inFlightThread().runtime?.activeRunId).toBe(inFlightThread().latestRun?.runId);
  });
});
