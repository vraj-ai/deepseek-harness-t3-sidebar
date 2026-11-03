/**
 * Row actions as commands on the plugin's durable intent.
 *
 * One reducer, one command union: every sidebar action (menu, hover button,
 * drag, undo) dispatches a command and the UI persists the state it returns.
 * Pure — the clock is an argument and storage is the caller's.
 *
 * Why these live in the plugin's store rather than calling Harness: no Harness
 * verb for rename, pin or archive is confirmed from this repo (the desktop app
 * is not part of the build), so the plugin owns the state, as it already does for
 * snooze and settle (`docs/decisions.md`, "Parity without invention").
 */
import { readIntent, TITLE_MAX, withIntent, type SidebarIntentState, type ThreadIntent } from "./store.ts";

export type IntentCommand =
  | { readonly type: "rename"; readonly key: string; readonly title: string }
  | { readonly type: "pin"; readonly key: string }
  | { readonly type: "unpin"; readonly key: string }
  | { readonly type: "snooze"; readonly key: string; readonly until: string }
  | { readonly type: "wake"; readonly key: string }
  | { readonly type: "settle"; readonly key: string }
  | { readonly type: "unsettle"; readonly key: string }
  | { readonly type: "archive"; readonly key: string }
  | { readonly type: "unarchive"; readonly key: string }
  | { readonly type: "visit"; readonly key: string }
  | { readonly type: "reorder"; readonly keys: ReadonlyArray<string> };

/** Width that keeps string order equal to list order up to a million rows. */
const ORDER_KEY_WIDTH = 6;

/** `ids` with `movedId` placed before `beforeId`, or last when `beforeId` is null. */
export function moveBefore(
  ids: ReadonlyArray<string>,
  movedId: string,
  beforeId: string | null,
): string[] {
  if (!ids.includes(movedId) || movedId === beforeId) return [...ids];
  const rest = ids.filter((id) => id !== movedId);
  const at = beforeId === null ? rest.length : rest.indexOf(beforeId);
  if (at === -1) return [...ids];
  return [...rest.slice(0, at), movedId, ...rest.slice(at)];
}

/** One order key per id; the sort T3 uses compares them as strings. */
export function orderKeysFor(ids: ReadonlyArray<string>): Map<string, string> {
  return new Map(ids.map((id, index) => [id, String(index).padStart(ORDER_KEY_WIDTH, "0")]));
}

function patch(
  state: SidebarIntentState,
  key: string,
  changes: Partial<ThreadIntent>,
): SidebarIntentState {
  const current = readIntent(state, key);
  const changed = (Object.keys(changes) as Array<keyof ThreadIntent>).some(
    (field) => current[field] !== changes[field],
  );
  return changed ? withIntent(state, key, changes) : state;
}

/**
 * Apply one command. A command that changes nothing returns `state` itself, so
 * the caller can skip a write.
 * @param now - ISO instant stamped on the command's own timestamp field.
 */
export function applyCommand(
  state: SidebarIntentState,
  command: IntentCommand,
  now: string,
): SidebarIntentState {
  switch (command.type) {
    case "rename": {
      const title = command.title.trim().slice(0, TITLE_MAX);
      return patch(state, command.key, { titleOverride: title === "" ? null : title });
    }
    case "pin":
      // T3's pin brings the row into the pinned shelf: it ends a snooze and a settle.
      return patch(state, command.key, {
        pinOverride: "pinned",
        pinnedAt: now,
        pinOrderKey: null,
        settledOverride: null,
        settledAt: null,
        snoozedUntil: null,
        snoozedAt: null,
      });
    case "unpin":
      return patch(state, command.key, { pinOverride: "unpinned", pinnedAt: null, pinOrderKey: null });
    case "snooze":
      return patch(state, command.key, { snoozedUntil: command.until, snoozedAt: now, settledOverride: null });
    case "wake":
      return patch(state, command.key, { snoozedUntil: null, snoozedAt: null });
    case "settle":
      // T3's settle is terminal for the row's pin as well as its snooze.
      return patch(state, command.key, {
        settledOverride: "settled",
        settledAt: now,
        snoozedUntil: null,
        snoozedAt: null,
        pinnedAt: null,
        pinOrderKey: null,
        // T3's settle removes the pin, including a host pin; an unpin override
        // keeps that removal after Unsettle instead of reviving the old pin.
        pinOverride: "unpinned",
      });
    case "unsettle":
      return patch(state, command.key, { settledOverride: "active", unsettledAt: now });
    case "archive":
      return patch(state, command.key, { archivedAt: now });
    case "unarchive":
      return patch(state, command.key, { archivedAt: null });
    case "visit":
      return patch(state, command.key, { lastVisitedAt: now });
    case "reorder": {
      const keys = orderKeysFor(command.keys);
      return command.keys.reduce(
        (next, key) => patch(next, key, { pinOrderKey: keys.get(key) ?? null }),
        state,
      );
    }
  }
}
