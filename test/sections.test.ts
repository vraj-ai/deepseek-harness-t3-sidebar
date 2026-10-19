/**
 * Sections: precedence, each section's sort, and the render order.
 * Spec: T3 `Sidebar.logic.ts:121-132`, `Sidebar.tsx:584-675`, `:644-671`,
 * `threadSort.ts:28-58`, `:263-337`, `threadInbox.ts:15-72`.
 */
import { describe, expect, it } from "vitest";

import { adaptSidebar, classifyThread, partitionSidebarThreads } from "../src/adapter/dsh.ts";
import { emptyIntentState } from "../src/adapter/store.ts";
import { orderSidebarThreads, sortSnoozedThreads } from "../src/model/order.ts";
import { isThreadWorking } from "../src/model/threadInbox.ts";
import { resolveSidebarThreadSection } from "../src/model/sidebar.ts";
import {
  sortActiveThreadsByOrderKey,
  sortPinnedThreadsByOrderKey,
  sortSettledThreads,
} from "../src/model/threadSort.ts";
import {
  dshRow,
  finishedThread,
  idleRuntime,
  inFlightRuntime,
  inFlightThread,
  NOW,
  parkedIdleThread,
  run,
  thread,
} from "./fixtures.ts";

describe("section precedence (Sidebar.logic.ts:121-132)", () => {
  it("keeps T3's order: snoozed > settled > pinned > active", () => {
    expect(resolveSidebarThreadSection({ snoozed: true, settled: true, pinned: true })).toBe("snoozed");
    expect(resolveSidebarThreadSection({ snoozed: false, settled: true, pinned: true })).toBe("settled");
    expect(resolveSidebarThreadSection({ snoozed: false, settled: false, pinned: true })).toBe("pinned");
    expect(resolveSidebarThreadSection({ snoozed: false, settled: false, pinned: false })).toBe("active");
  });

  it("puts a pinned thread that is also snoozed only in Snoozed", () => {
    const shell = thread({
      pinnedAt: "2026-01-01T00:00:00.000Z",
      snoozedUntil: "2026-01-02T18:00:00.000Z",
    });
    expect(classifyThread({ shell, now: NOW })).toBe("snoozed");
  });

  it("puts a pinned thread that is also settled only in Settled", () => {
    const shell = thread({
      pinnedAt: "2026-01-01T00:00:00.000Z",
      settledOverride: "settled",
    });
    expect(classifyThread({ shell, now: NOW })).toBe("settled");
  });

  it("splits live status out of active: working vs active", () => {
    // Both shells come from the adapter, not hand-built, so the split is proved
    // on the runtime shapes the adapter actually emits.
    const { partitions } = adaptSidebar({
      sessions: [dshRow({ sessionId: "mid-turn", running: true }), dshRow({ sessionId: "finished" })],
      statuses: new Map(),
      workspaces: { items: [], pinnedSessionIds: [], archivedSessionIds: [] },
      intent: emptyIntentState(),
      now: NOW,
    });
    expect(partitions.working.map((t) => t.id)).toEqual(["mid-turn"]);
    expect(partitions.active.map((t) => t.id)).toEqual(["finished"]);
  });
});

describe("isThreadWorking (threadInbox.ts:15-30)", () => {
  it("is false while an approval is pending", () => {
    expect(isThreadWorking(thread({ hasPendingApprovals: true, runtime: inFlightRuntime() }))).toBe(false);
  });

  it("is true for a live run with no pending interaction", () => {
    expect(isThreadWorking(inFlightThread())).toBe(true);
  });

  // T3 quirk, kept: `!threadRuntimeIsActive(null)` is true and
  // `null?.status !== "idle"` is `undefined !== "idle"`, also true, so
  // `true && true` returns false before `runSettled` is ever consulted.
  it("is false for a null runtime and null latestRun", () => {
    expect(isThreadWorking(thread({ runtime: null, latestRun: null }))).toBe(false);
  });

  // The adapter's not-in-flight shape: no runtime, a finished run. Lands in
  // active without touching the plan clause.
  it("is false for a finished thread, which carries no runtime", () => {
    expect(isThreadWorking(finishedThread())).toBe(false);
  });

  // T3's other idle shape, `parkAtIdle` in `shellRuntime` (`models.ts:167-189`):
  // a warm parked session whose background work will wake it. The adapter never
  // emits it — DSH sessions are running or done — so this pins the rule's branch,
  // not an adapter output.
  it("keeps T3's fall-through for a parked idle runtime whose run finished", () => {
    expect(isThreadWorking(parkedIdleThread())).toBe(true);
  });

  it("is false for a parked idle runtime once the plan is actionable", () => {
    expect(
      isThreadWorking(parkedIdleThread({ interactionMode: "plan", hasActionableProposedPlan: true })),
    ).toBe(false);
  });
});

describe("pinned sort (threadSort.ts:263-291)", () => {
  it("sorts keyed rows lexicographically, then keyless rows by createdAt desc", () => {
    const sorted = sortPinnedThreadsByOrderKey([
      thread({ id: "legacy-old", pinOrderKey: null, createdAt: "2026-01-01T00:00:00.000Z" }),
      thread({ id: "b", pinOrderKey: "b" }),
      thread({ id: "a", pinOrderKey: "a" }),
      thread({ id: "legacy-new", pinOrderKey: null, createdAt: "2026-01-03T00:00:00.000Z" }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["a", "b", "legacy-new", "legacy-old"]);
  });

  it("breaks equal keys by id then environmentId", () => {
    const sorted = sortPinnedThreadsByOrderKey([
      thread({ id: "z", environmentId: "e1", pinOrderKey: "m" }),
      thread({ id: "a", environmentId: "e2", pinOrderKey: "m" }),
      thread({ id: "a", environmentId: "e1", pinOrderKey: "m" }),
    ]);
    expect(sorted.map((t) => `${t.environmentId}/${t.id}`)).toEqual(["e1/a", "e2/a", "e1/z"]);
  });
});

describe("active sort (threadSort.ts:298-337 and threadInbox.ts:36-57)", () => {
  it("manual order: keyless rows first by max(createdAt, unsettledAt) desc, then keyed ascending", () => {
    const sorted = sortActiveThreadsByOrderKey([
      thread({ id: "keyed-b", activeOrderKey: "b" }),
      thread({ id: "plain-old", createdAt: "2026-01-01T00:00:00.000Z" }),
      thread({ id: "keyed-a", activeOrderKey: "a" }),
      thread({ id: "plain-new", createdAt: "2026-01-01T00:00:00.000Z", unsettledAt: "2026-01-05T00:00:00.000Z" }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["plain-new", "plain-old", "keyed-a", "keyed-b"]);
  });

  it("shelf order: by return time, ignoring manual keys", () => {
    const ordered = orderSidebarThreads({
      partitions: {
        pinned: [],
        active: [
          thread({ id: "manual-first", activeOrderKey: "a", createdAt: "2026-01-01T00:00:00.000Z" }),
          thread({ id: "returned", createdAt: "2026-01-01T00:00:00.000Z" }),
        ],
        working: [],
        snoozed: [],
        settled: [],
      },
      inboxReturnAt: (t) => (t.id === "returned" ? Date.parse("2026-01-09T00:00:00.000Z") : undefined),
    });
    expect(ordered.orderedThreadKeys).toEqual(["returned", "manual-first"]);
  });
});

describe("working sort (threadInbox.ts:60-72)", () => {
  it("sorts by max(createdAt, latest user-authored message) desc", () => {
    const ordered = orderSidebarThreads({
      partitions: {
        pinned: [],
        active: [],
        working: [
          thread({ id: "older", latestUserAuthoredMessageAt: "2026-01-02T00:00:00.000Z", runtime: idleRuntime({ status: "running" }) }),
          thread({ id: "newer", latestUserAuthoredMessageAt: "2026-01-03T00:00:00.000Z", runtime: idleRuntime({ status: "running" }) }),
        ],
        snoozed: [],
        settled: [],
      },
    });
    expect(ordered.orderedThreadKeys).toEqual(["newer", "older"]);
  });
});

describe("snoozed sort (Sidebar.tsx:667-671)", () => {
  it("puts the soonest wake first", () => {
    const sorted = sortSnoozedThreads([
      thread({ id: "late", snoozedUntil: "2026-01-05T00:00:00.000Z" }),
      thread({ id: "soon", snoozedUntil: "2026-01-02T13:00:00.000Z" }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["soon", "late"]);
  });
});

describe("settled sort (threadSort.ts:28-58)", () => {
  it("sorts by settled timestamp desc, tie by id asc", () => {
    const sorted = sortSettledThreads([
      thread({ id: "b", settledAt: "2026-01-03T00:00:00.000Z" }),
      thread({ id: "a", settledAt: "2026-01-03T00:00:00.000Z" }),
      thread({ id: "old", settledAt: "2026-01-01T00:00:00.000Z" }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["a", "b", "old"]);
  });

  it("falls back to the newest run timestamp when settledAt is absent", () => {
    const sorted = sortSettledThreads([
      thread({ id: "settled-late", settledAt: "2026-01-04T00:00:00.000Z" }),
      thread({ id: "run-based", latestRun: run({ completedAt: "2026-01-05T00:00:00.000Z" }) }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["run-based", "settled-late"]);
  });
});

describe("render order (Sidebar.tsx:524-530) and jump order (Sidebar.tsx:3054-3063)", () => {
  it("orders pinned, active, working, snoozed, settled and numbers the first nine", () => {
    const ids = ["p1", "p2", "a1", "w1", "s1", "x1", "x2", "x3", "x4", "x5", "x6"];
    const shells = ids.map((id) => thread({ id }));
    const ordered = orderSidebarThreads({
      partitions: {
        pinned: shells.slice(0, 2),
        active: shells.slice(2, 3),
        working: shells.slice(3, 4),
        snoozed: [thread({ id: "s1", snoozedUntil: "2026-01-06T00:00:00.000Z" })],
        settled: shells.slice(5),
      },
      inboxReturnAt: () => undefined,
    });
    expect(ordered.orderedThreadKeys).toEqual(ids);
    expect(ordered.jumpOrder).toHaveLength(9);
    expect(ordered.jumpOrder.map((h) => h.label)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expect(ordered.jumpOrder[8]?.threadKey).toBe("x4");
  });
});
