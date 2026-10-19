// Row rules, pinned as behaviour: the text T3's rows paint, the status the
// `t3Sidebar` projection adds to T3's state machine, the shelf plan, and the
// settled tail. Every rule cites the T3 source it was ported from.
import { describe, expect, it } from "vitest";

import { densityForSection, resolveRowStatus } from "../src/model/rowStatus.ts";
import {
  SETTLED_TAIL_INITIAL,
  formatRelativeElapsed,
  formatWorkingDurationLabel,
  planSections,
  providerStack,
  providerStackLabel,
  revealSettled,
  rowView,
  clockLabel,
  compactSidebarTimeLabel,
  settledTailLabel,
} from "../src/model/rowText.ts";
import type { SidebarThreadShell } from "../src/model/types.ts";
import { finishedThread, inFlightThread, NOW, run, thread } from "./fixtures.ts";

const nowMs = Date.parse(NOW);

describe("relative time (timestampFormat.ts, Sidebar.tsx:820-822)", () => {
  it("uses T3's buckets", () => {
    expect(formatRelativeElapsed(30_000)).toBe("just now");
    expect(formatRelativeElapsed(5 * 60_000)).toBe("5m ago");
    expect(formatRelativeElapsed(3 * 3_600_000)).toBe("3h ago");
    expect(formatRelativeElapsed(2 * 86_400_000)).toBe("2d ago");
  });

  it("drops the suffix in the sidebar", () => {
    expect(compactSidebarTimeLabel("just now")).toBe("now");
    expect(compactSidebarTimeLabel("5m ago")).toBe("5m");
  });
});

describe("working duration (Sidebar.logic.ts:1090)", () => {
  it("renders s, m and h m", () => {
    expect(formatWorkingDurationLabel(42_000)).toBe("42s");
    expect(formatWorkingDurationLabel(7 * 60_000)).toBe("7m");
    expect(formatWorkingDurationLabel(72 * 60_000)).toBe("1h 12m");
  });
});

describe("provider stack (models.ts:296-304, single instance)", () => {
  it("names the selection", () => {
    const shell = thread({
      modelSelection: {
        lastUsed: { provider: "cli-proxy", model: "inco/deepseek-flash" },
        next: { provider: "cli-proxy", model: "or/deepseek-1017" },
      },
    });
    expect(providerStack(shell)).toEqual([{ provider: "cli-proxy", model: "or/deepseek-1017" }]);
    expect(providerStackLabel(providerStack(shell))).toBe("cli-proxy/or/deepseek-1017");
  });

  it("is empty without a selection", () => {
    expect(providerStack(thread())).toEqual([]);
    expect(providerStackLabel([])).toBe("");
  });
});

describe("row status", () => {
  it("a live runtime is working", () => {
    expect(resolveRowStatus({ shell: inFlightThread(), settled: false, now: NOW }).kind).toBe("working");
  });

  it("pending flags outrank a running turn", () => {
    const shell = inFlightThread({ hasPendingApprovals: true });
    expect(resolveRowStatus({ shell, settled: false, now: NOW }).kind).toBe("approval");
  });

  it("a failed projection turn is failed", () => {
    const shell = finishedThread({
      sail: {
        lastUserMessageAt: null,
        lastTurnStartedAt: null,
        lastTurnCompletedAt: "2026-01-01T00:01:00.000Z",
        outcome: "failed",
        errorClass: "other",
      },
    });
    expect(resolveRowStatus({ shell, settled: false, now: NOW })).toEqual({
      kind: "failed",
      label: "Failed",
      visible: true,
    });
  });

  it("a usage-limit failure is limited", () => {
    const shell = finishedThread({
      sail: {
        lastUserMessageAt: null,
        lastTurnStartedAt: null,
        lastTurnCompletedAt: "2026-01-01T00:01:00.000Z",
        outcome: "failed",
        errorClass: "usage_limit",
      },
    });
    expect(resolveRowStatus({ shell, settled: false, now: NOW }).kind).toBe("limited");
  });

  it("a running turn is never reported failed", () => {
    const shell = inFlightThread({
      sail: {
        lastUserMessageAt: null,
        lastTurnStartedAt: "2026-01-01T00:00:00.000Z",
        lastTurnCompletedAt: null,
        outcome: "failed",
        errorClass: "other",
      },
    });
    expect(resolveRowStatus({ shell, settled: false, now: NOW }).kind).toBe("working");
  });

  it("a finished ok turn is quiet", () => {
    const shell = finishedThread({
      sail: {
        lastUserMessageAt: null,
        lastTurnStartedAt: null,
        lastTurnCompletedAt: "2026-01-01T00:01:00.000Z",
        outcome: "completed",
        errorClass: null,
      },
    });
    // A finished turn with no visit watermark is quiet; T3 has no unread state
    // without one (Sidebar.logic.ts:714-728).
    const quiet = rowView({ shell, settled: false, now: NOW, nowMs });
    expect(["none", "woke"]).toContain(quiet.status.kind);
  });

  it("an unread completion is done", () => {
    const shell = finishedThread({ lastVisitedAt: "2026-01-01T00:00:30.000Z" });
    expect(resolveRowStatus({ shell, settled: false, now: NOW }).kind).toBe("done");
  });

  it("density is the card for live shelves and the slim row for finished rows", () => {
    expect(densityForSection("pinned")).toBe("card");
    expect(densityForSection("working")).toBe("card");
    expect(densityForSection("active")).toBe("card");
    expect(densityForSection("active", false)).toBe("slim");
    expect(densityForSection("snoozed")).toBe("slim");
    expect(densityForSection("settled")).toBe("slim");
  });
});

describe("row view", () => {
  it("titles a nameless session and times it from the last prompt", () => {
    const shell = thread({ title: "", latestUserMessageAt: "2026-01-02T11:55:00.000Z" });
    const view = rowView({ shell, settled: false, now: NOW, nowMs });
    expect(view.title).toBe("Untitled session");
    expect(view.relativeTime).toBe("5m");
  });

  it("ticks a working row and swaps the label for an active goal", () => {
    const shell = inFlightThread({ goalActive: true });
    const view = rowView({ shell, settled: false, now: NOW, nowMs });
    expect(view.goalLabel).toBe("Goal");
    expect(view.workingDuration).not.toBeNull();
  });

  it("carries the queued count from the projection", () => {
    const shell: SidebarThreadShell = inFlightThread({ queuedPrompts: 2 });
    expect(rowView({ shell, settled: false, now: NOW, nowMs }).queued).toBe(2);
  });

  it("slim rows label a snooze with its wake", () => {
    const shell = thread({ snoozedUntil: "2026-01-02T13:00:00.000Z", snoozedAt: "2026-01-02T11:00:00.000Z" });
    const view = rowView({ shell, settled: false, now: NOW, nowMs });
    // A live snooze has not woken yet (threadSettled.ts:92-114), so the slim
    // row names the time it wakes instead.
    expect(view.wakeAt).toBeNull();
    expect(view.tailTime).toBe(clockLabel("2026-01-02T13:00:00.000Z"));
    expect(view.tailTime).not.toBeNull();
  });
});

describe("shelf plan (Sidebar.tsx:3526-3565)", () => {
  const of = (id: string) => thread({ id });
  it("orders pinned, working, snoozed, settled, active and omits empty shelves", () => {
    const plan = planSections({
      pinned: [of("p")],
      working: [of("w")],
      snoozed: [],
      settled: [of("s")],
      active: [of("a")],
    });
    expect(plan.map((section) => section.key)).toEqual(["pinned", "working", "settled", "active"]);
  });

  it("always keeps active, even empty", () => {
    const plan = planSections({ pinned: [], working: [], snoozed: [], settled: [], active: [] });
    expect(plan).toEqual([{ key: "active", rows: [] }]);
  });

  it("reveals the settled tail ten at a time plus twenty-five", () => {
    const settled = Array.from({ length: 40 }, (_, index) => of(`s${index}`));
    const plan = planSections({ pinned: [], working: [], snoozed: [], settled, active: [] });
    const first = revealSettled(plan, 0);
    expect(first[0]?.rows).toHaveLength(SETTLED_TAIL_INITIAL);
    expect(first[0]?.hidden).toBe(30);
    expect(settledTailLabel(first[0]?.hidden ?? 0)).toBe("Show 25 more");
    expect(revealSettled(plan, 1)[0]?.hidden).toBe(5);
    expect(revealSettled(plan, 2)[0]?.hidden).toBe(0);
  });
});
