/**
 * Adapter behaviour pinned by PR #11 review: status fall-through to the list
 * row, the DSH pin set as pin authority, terminal outcome mapping, and
 * out-of-range timestamps at the parse boundary.
 */
import { describe, expect, it } from "vitest";

import { adaptSidebar } from "../src/adapter/dsh.ts";
import { emptyIntentState, EMPTY_THREAD_INTENT, withIntent, type SidebarIntentState } from "../src/adapter/store.ts";
import { dshRow, NOW } from "./fixtures.ts";

function adapt(input: {
  readonly rows: ReadonlyArray<unknown>;
  readonly statuses?: ReadonlyMap<string, unknown>;
  readonly pinnedSessionIds?: ReadonlyArray<string>;
  readonly intent?: SidebarIntentState;
}) {
  return adaptSidebar({
    sessions: input.rows,
    statuses: input.statuses ?? new Map(),
    workspaces: { items: [], pinnedSessionIds: input.pinnedSessionIds ?? [], archivedSessionIds: [] },
    intent: input.intent ?? emptyIntentState(),
    now: NOW,
  });
}

describe("adapter review fixes", () => {
  it("falls back to the row's running when the status record omits it", () => {
    const { partitions } = adapt({
      rows: [dshRow({ sessionId: "a", running: true })],
      statuses: new Map([["a", { completionUnread: false }]]),
    });
    expect(partitions.working.map((t) => t.id)).toEqual(["a"]);
  });

  it("keeps an explicit running: false from the status record", () => {
    const { partitions } = adapt({
      rows: [dshRow({ sessionId: "a", running: true })],
      statuses: new Map([["a", { running: false, completionUnread: false }]]),
    });
    expect(partitions.working).toHaveLength(0);
  });

  it("unpins a session DSH no longer pins, even with a stored pinnedAt", () => {
    const intent = withIntent(emptyIntentState(), "dsh:a", { pinnedAt: "2026-01-01T00:00:00.000Z" });
    const { partitions } = adapt({ rows: [dshRow({ sessionId: "a" })], intent });
    expect(partitions.pinned).toHaveLength(0);
    expect(partitions.active.map((t) => t.id)).toEqual(["a"]);
  });

  it("keeps the stored pinnedAt while DSH pins the session", () => {
    const intent = withIntent(emptyIntentState(), "dsh:a", { pinnedAt: "2026-01-01T00:00:00.000Z" });
    const { threads } = adapt({ rows: [dshRow({ sessionId: "a" })], intent, pinnedSessionIds: ["a"] });
    expect(threads[0]?.pinnedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("keeps a cancelled turn from waking a snoozed session", () => {
    const row = {
      ...dshRow({ sessionId: "a" }),
      projections: {
        values: {
          t3Sidebar: {
            lastUserMessageAt: "2026-01-02T10:00:00.000Z",
            lastTurnStartedAt: "2026-01-02T10:00:00.000Z",
            lastTurnCompletedAt: "2026-01-02T10:01:00.000Z",
            outcome: "cancelled",
            errorClass: null,
          },
        },
      },
    };
    const intent = withIntent(emptyIntentState(), "dsh:a", {
      ...EMPTY_THREAD_INTENT,
      snoozedAt: "2026-01-02T10:00:00.000Z",
      snoozedUntil: "2026-01-03T09:00:00.000Z",
    });
    const { threads, partitions } = adapt({ rows: [row], intent });
    expect(threads[0]?.latestRun?.status).toBe("cancelled");
    expect(partitions.snoozed.map((t) => t.id)).toEqual(["a"]);
  });

  it("skips a row whose updatedAt is outside the Date range instead of throwing", () => {
    const { threads, skipped } = adapt({
      rows: [dshRow({ sessionId: "bad", updatedAt: 1e20 }), dshRow({ sessionId: "ok" })],
    });
    expect(threads.map((t) => t.id)).toEqual(["ok"]);
    expect(skipped).toBe(1);
  });

  it("treats an out-of-range lastPromptAt as absent", () => {
    const row = {
      ...dshRow({ sessionId: "a" }),
      projections: { values: { sessionListMetadata: { blank: false, lastPromptAt: 1e20 } } },
    };
    const { threads } = adapt({ rows: [row] });
    expect(threads[0]?.latestUserMessageAt).toBeNull();
  });
});
