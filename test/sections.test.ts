/**
 * Sections: precedence, each section's sort, and the render order.
 * Spec: T3 `Sidebar.logic.ts:121-132`, `Sidebar.tsx:584-675`, `:644-671`,
 * `threadSort.ts:28-58`, `:263-337`, `threadInbox.ts:15-72`.
 */
import { describe, expect, it } from "vitest";

import { partitionSidebarThreads, classifyThread } from "../src/adapter/dsh.ts";
import { orderSidebarThreads, sortSnoozedThreads } from "../src/model/order.ts";
import { isThreadWorking } from "../src/model/threadInbox.ts";
import { resolveSidebarThreadSection } from "../src/model/sidebar.ts";
import {
  sortActiveThreadsByOrderKey,
  sortPinnedThreadsByOrderKey,
  sortSettledThreads,
} from "../src/model/threadSort.ts";
import { idleRuntime, idleThread, NOW, thread } from "./fixtures.ts";
import { run } from "./fixtures.ts";

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
    const working = thread({ id: "t1", latestRun: run({ completedAt: null }), runtime: idleRuntime({ status: "running" }) });
    const active = idleThread({ id: "t2" });
    const partitions = partitionSidebarThreads({ shells: [working, active], now: NOW });
    expect(partitions.working.map((t) => t.id)).toEqual(["t1"]);
    expect(partitions.active.map((t) => t.id)).toEqual(["t2"]);
  });
});

describe("isThreadWorking (threadInbox.ts:15-30)", () => {
  it("is false while an approval is pending", () => {
    expect(isThreadWorking(thread({ hasPendingApprovals: true, runtime: idleRuntime({ status: "running" }) }))).toBe(false);
  });

  it("is true for a live run with no pending interaction", () => {
    expect(
      isThreadWorking(thread({ latestRun: run({ completedAt: null }), runtime: idleRuntime({ status: "running" }) })),
    ).toBe(true);
  });

  // T3 quirk, kept: `!threadRuntimeIsActive(runtime) && runtime?.status !==
  // "idle"` only rejects runtimes that are neither active nor idle, so a
  // runtime-less thread falls straight through to true (`threadInbox.ts:15-30`).
  // The adapter always builds a runtime for a real shell, so only a hand-built
  // shell reaches this.
  it("keeps T3's fall-through for a null runtime and null latestRun", () => {
    expect(isThreadWorking(thread({ runtime: null, latestRun: null }))).toBe(true);
  });

  // This contradicts the rule's plain reading, and it is what T3's source and
  // runtime produce (verbatim upstream bodies, repro recorded in the PR body).
  // `idleThread()` therefore reports working; see the fixture's note.
  it("keeps T3's fall-through for an idle runtime whose run finished", () => {
    expect(isThreadWorking(idleThread())).toBe(true);
  });

  it("is false once the plan is actionable and the run has settled", () => {
    expect(
      isThreadWorking(idleThread({ interactionMode: "plan", hasActionableProposedPlan: true })),
    ).toBe(false);
  });

  it("keeps a thread working while its run is still the active one", () => {
    expect(isThreadWorking(thread({ latestRun: run({ completedAt: null }), runtime: idleRuntime({ activeRunId: "r1" }) }))).toBe(true);
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
