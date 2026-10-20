/**
 * Row actions as commands on the plugin's durable intent: each command's result
 * survives a serialize/parse round trip (the reload), and undo restores exactly
 * what the command replaced.
 */
import { describe, expect, it } from "vitest";

import {
  applyCommand,
  moveBefore,
  orderKeysFor,
  type IntentCommand,
} from "../src/adapter/intent.ts";
import {
  emptyIntentState,
  parseSidebarIntentState,
  readIntent,
  serializeSidebarIntentState,
  type SidebarIntentState,
} from "../src/adapter/store.ts";

const NOW = "2026-01-02T12:00:00.000Z";
const KEY = "dsh:s1";

function run(state: SidebarIntentState, command: IntentCommand): SidebarIntentState {
  return applyCommand(state, command, NOW);
}

function reload(state: SidebarIntentState): SidebarIntentState {
  return parseSidebarIntentState(JSON.parse(serializeSidebarIntentState(state)));
}

describe("durable intent round trip", () => {
  it("keeps rename, pin override, archive and unsettle through a reload", () => {
    let state = emptyIntentState();
    state = run(state, { type: "rename", key: KEY, title: "  Fix the build  " });
    state = run(state, { type: "pin", key: KEY });
    state = run(state, { type: "archive", key: KEY });
    state = run(state, { type: "unsettle", key: KEY });
    const intent = readIntent(reload(state), KEY);
    expect(intent.titleOverride).toBe("Fix the build");
    expect(intent.pinOverride).toBe("pinned");
    expect(intent.pinnedAt).toBe(NOW);
    expect(intent.archivedAt).toBe(NOW);
    expect(intent.settledOverride).toBe("active");
    expect(intent.unsettledAt).toBe(NOW);
  });

  it("reads a record written before these fields existed", () => {
    const old = {
      version: 1,
      threads: {
        [KEY]: {
          snoozedUntil: null,
          snoozedAt: null,
          settledOverride: "settled",
          settledAt: NOW,
          lastVisitedAt: null,
          pinnedAt: null,
          pinOrderKey: null,
          activeOrderKey: null,
        },
      },
    };
    const intent = readIntent(parseSidebarIntentState(old), KEY);
    expect(intent.settledOverride).toBe("settled");
    expect(intent.titleOverride).toBeNull();
    expect(intent.archivedAt).toBeNull();
    expect(intent.pinOverride).toBeNull();
  });

  it("drops an entry whose new field has the wrong type instead of guessing", () => {
    const bad = { version: 1, threads: { [KEY]: { titleOverride: 7, pinOverride: "sideways" } } };
    expect(parseSidebarIntentState(bad).threads.size).toBe(0);
  });
});

describe("commands", () => {
  it("renames, and clears the override on a blank title", () => {
    let state = run(emptyIntentState(), { type: "rename", key: KEY, title: "New" });
    expect(readIntent(state, KEY).titleOverride).toBe("New");
    state = run(state, { type: "rename", key: KEY, title: "   " });
    expect(readIntent(state, KEY).titleOverride).toBeNull();
  });

  it("pin then unpin overrides the host's pin set both ways", () => {
    let state = run(emptyIntentState(), { type: "pin", key: KEY });
    expect(readIntent(state, KEY).pinOverride).toBe("pinned");
    state = run(state, { type: "unpin", key: KEY });
    const intent = readIntent(state, KEY);
    expect(intent.pinOverride).toBe("unpinned");
    expect(intent.pinnedAt).toBeNull();
    expect(intent.pinOrderKey).toBeNull();
  });

  it("snoozes until a time and wakes by clearing both stamps", () => {
    let state = run(emptyIntentState(), { type: "snooze", key: KEY, until: "2026-01-02T18:00:00.000Z" });
    expect(readIntent(state, KEY)).toMatchObject({ snoozedUntil: "2026-01-02T18:00:00.000Z", snoozedAt: NOW });
    state = run(state, { type: "wake", key: KEY });
    expect(readIntent(state, KEY)).toMatchObject({ snoozedUntil: null, snoozedAt: null });
  });

  it("settle and unsettle set the override and its own stamp", () => {
    let state = run(emptyIntentState(), { type: "settle", key: KEY });
    expect(readIntent(state, KEY)).toMatchObject({ settledOverride: "settled", settledAt: NOW });
    state = run(state, { type: "unsettle", key: KEY });
    expect(readIntent(state, KEY)).toMatchObject({ settledOverride: "active", unsettledAt: NOW });
  });

  it("archive then unarchive clears the stamp", () => {
    let state = run(emptyIntentState(), { type: "archive", key: KEY });
    expect(readIntent(state, KEY).archivedAt).toBe(NOW);
    state = run(state, { type: "unarchive", key: KEY });
    expect(readIntent(state, KEY).archivedAt).toBeNull();
  });

  it("restore puts back exactly the intent a command replaced (undo)", () => {
    const before = run(emptyIntentState(), { type: "rename", key: KEY, title: "Keep" });
    const previous = readIntent(before, KEY);
    const archived = run(before, { type: "archive", key: KEY });
    const undone = run(archived, { type: "restore", key: KEY, intent: previous });
    expect(readIntent(undone, KEY)).toEqual(previous);
  });

  it("returns the same state reference for a command that changes nothing", () => {
    const state = emptyIntentState();
    expect(run(state, { type: "wake", key: KEY })).toBe(state);
    expect(run(state, { type: "unarchive", key: KEY })).toBe(state);
  });
});

describe("reorder", () => {
  it("moves one id before another and leaves the rest in place", () => {
    expect(moveBefore(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(moveBefore(["a", "b", "c", "d"], "a", "d")).toEqual(["b", "c", "a", "d"]);
  });

  it("is a no-op for an unknown id or a move onto itself", () => {
    expect(moveBefore(["a", "b"], "x", "a")).toEqual(["a", "b"]);
    expect(moveBefore(["a", "b"], "a", "a")).toEqual(["a", "b"]);
  });

  it("moves to the end when the target is null", () => {
    expect(moveBefore(["a", "b", "c"], "a", null)).toEqual(["b", "c", "a"]);
  });

  it("assigns string keys whose order is the list order, past ten entries", () => {
    const ids = Array.from({ length: 12 }, (_, index) => `s${index}`);
    const keys = orderKeysFor(ids);
    const sorted = [...ids].sort((left, right) => (keys.get(left)! < keys.get(right)! ? -1 : 1));
    expect(sorted).toEqual(ids);
  });

  it("writes pinOrderKey for every listed key and survives a reload", () => {
    const state = run(emptyIntentState(), { type: "reorder", keys: ["dsh:b", "dsh:a"] });
    const loaded = reload(state);
    expect(readIntent(loaded, "dsh:b").pinOrderKey! < readIntent(loaded, "dsh:a").pinOrderKey!).toBe(true);
  });
});
