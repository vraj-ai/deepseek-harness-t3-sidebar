/**
 * The pure rules behind issue #7's row verbs, ported from T3 Code (MIT),
 * commit 5307c233b1f0ae72b8894dd39d94019aaf9e7cb8:
 *
 * - Rename commit: Enter commits, Escape cancels, an empty or unchanged title is
 *   a no-op (`Sidebar.tsx:1813-1830`, `#3153-3178`).
 * - Pin/unpin eligibility and the undo promise (`Sidebar.tsx:3465-3498`).
 * - Snooze presets (`threadSettled.ts:166-242`), the custom-wake validation
 *   (`threadSettled.ts:263-286`) and the wake label (`Sidebar.tsx:4841-4847`).
 * - Settle/unsettle eligibility (`threadSettled.ts:104-122`).
 * - The visit watermark T3 keeps in `useUiStateStore` (`Sidebar.tsx:1608-1609`)
 *   and the unread rule it feeds (`Sidebar.logic.ts:714-728`).
 * - Drag reorder: the pointer activation distance (`Sidebar.tsx:3375-3382`),
 *   the half-anchor drop (`sidebarThreadHalf`), the within-section guard and the
 *   drop plan (`Sidebar.logic.ts:176-374`, `Sidebar.tsx:3679-3820`).
 * - The 2-character search minimum (`queries.ts:85`) and the jump hints
 *   (`Sidebar.tsx:3054-3063`, `deriveJumpOrder` in `./sidebar.ts`).
 *
 * Nothing here touches the host or the DOM: the adapter and the UI call it.
 */
import { resolveSnoozePresets, type SnoozePreset, type SnoozePresetId } from "./threadSettled.ts";
import { THREAD_SEARCH_MIN_LENGTH } from "./sidebar.ts";

/** T3's rename rule: a trimmed commit equal to the stored title writes nothing. */
export type RenameDecision =
  | { readonly kind: "commit"; readonly title: string }
  | { readonly kind: "cancel" }
  | { readonly kind: "noop" };

export function resolveRename(input: { readonly draft: string; readonly current: string }): RenameDecision {
  const title = input.draft.trim();
  if (title === "" || title === input.current.trim()) return { kind: "noop" };
  return { kind: "commit", title };
}

/** T3 draws the pin affordance on every row; the verb toggles (`Sidebar.tsx:4308-4313`). */
export function pinVerb(pinned: boolean): "pin" | "unpin" {
  return pinned ? "unpin" : "pin";
}

export function settleVerb(settled: boolean): "settle" | "unsettle" {
  return settled ? "unsettle" : "settle";
}

/** Snooze presets exactly as T3 computes them, labelled for a menu. */
export interface SnoozeChoice {
  readonly id: SnoozePresetId;
  readonly label: string;
  readonly whenLabel: string;
  readonly until: string;
}

export function snoozeChoices(now: Date): ReadonlyArray<SnoozeChoice> {
  return resolveSnoozePresets(now).map((preset: SnoozePreset) => ({
    id: preset.id,
    label: preset.label,
    whenLabel: preset.whenLabel,
    until: preset.snoozedUntil,
  }));
}

/**
 * `Sidebar.tsx:4253-4260` / `threadSettled.ts:263-286`: a custom wake must parse
 * and lie strictly in the future.
 * @returns the ISO instant, or null when the value is not a future date.
 */
export function parseCustomSnooze(value: string, nowMs: number): string | null {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed) || parsed <= nowMs) return null;
  return new Date(parsed).toISOString();
}

/** `Sidebar.tsx:4841-4847`: the preset label, else the clock time the row wakes. */
export function snoozeWakeDescription(input: {
  readonly until: string;
  readonly label: string | null;
  readonly clock: string | null;
}): string {
  if (input.label !== null) return input.label;
  return input.clock === null ? "Snoozed" : `Wakes ${input.clock}`;
}

/**
 * The visit watermark. T3 stores "visited now" on activation
 * (`useThreadActions.ts:202-236` sends the host `thread.visit`); DSH has no
 * such host field, so the plugin keeps the instant in its own store and the
 * row's unread rule (`hasUnseenCompletion`) reads it exactly as it reads T3's.
 */
export function visitWatermark(now: string): string {
  return now;
}

/** T3 settles on an explicit request only; a running turn is still settlable. */
export function canSettleThread(): boolean {
  return true;
}

/** Drag activation: T3's `SidebarPointerSensor` starts at 6 px (Sidebar.tsx:3375-3382). */
export const DRAG_ACTIVATION_DISTANCE = 6;

/** A press becomes a drag only once it travels the activation distance. */
export function exceedsDragThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DRAG_ACTIVATION_DISTANCE;
}

/**
 * The half of a row a pointer is over: the top half drops `before`, the bottom
 * half `after` (`workspaceGroupHalf`, ui-workspace, and T3's `over.half`).
 */
export function rowHalf(clientY: number, top: number, height: number): "before" | "after" {
  return clientY < top + height / 2 ? "before" : "after";
}

export type DropPlan =
  | { readonly kind: "none" }
  | { readonly kind: "reorder"; readonly order: ReadonlyArray<string> };

/**
 * Apply a drop inside one section to the whole order: the moved id is removed
 * and re-inserted at the target's anchor half. Sections are guarded —
 * T3 refuses a cross-section drop (`Sidebar.logic.ts:266-374`), and the
 * anchor is ignored when it would not move the row.
 */
export function planDrop(input: {
  readonly order: ReadonlyArray<string>;
  readonly movedId: string;
  readonly targetId: string;
  readonly half: "before" | "after";
  readonly sameSection: boolean;
}): DropPlan {
  const { order, movedId, targetId, half } = input;
  if (!input.sameSection || movedId === targetId) return { kind: "none" };
  if (!order.includes(movedId) || !order.includes(targetId)) return { kind: "none" };
  const next = order.filter((id) => id !== movedId);
  const anchored = next.findIndex((id) => id === targetId) + (half === "after" ? 1 : 0);
  next.splice(anchored, 0, movedId);
  if (next.every((id, index) => id === order[index])) return { kind: "none" };
  return { kind: "reorder", order: next };
}

/**
 * Fractional order keys, T3's `pinOrderKeyBetween`
 * (`threadSort.ts:180-262`): lexicographic strings over the digits
 * `0-9a-z`, so "between a and b" is always another key of the same alphabet.
 */
const BASE = "0123456789abcdefghijklmnopqrstuvwxyz";

export function orderKeyBetween(before: string | null, after: string | null): string {
  const upper = after ?? "z";
  const lower = before ?? "";
  let key = "";
  for (let index = 0; ; index += 1) {
    const low = lower[index] ?? "0";
    const high = upper[index] ?? "z";
    const lowValue = BASE.indexOf(low);
    const highValue = BASE.indexOf(high);
    if (highValue - lowValue > 1) {
      key += BASE[Math.floor((lowValue + highValue) / 2)];
      return key;
    }
    key += low;
  }
}

/**
 * The key `movedId` needs so that, among the rows that already carry keys, it
 * sorts exactly where the plan puts it. `window` is the plan's new position of
 * the nearest keyed neighbour on each side; unkeyed rows in between are ignored,
 * so the row lands beside the row that actually sorts.
 */
export function orderKeyForPosition(input: {
  readonly ids: ReadonlyArray<string>;
  readonly keyOf: (id: string) => string | null;
  readonly movedId: string;
  readonly window: { readonly beforeAt: number; readonly afterAt: number };
  readonly wanted: number;
}): string {
  const { ids, keyOf, movedId, window: bounds, wanted } = input;
  let before: string | null = null;
  for (let index = bounds.beforeAt; index >= 0; index -= 1) {
    const id = ids[index];
    const key = id === undefined ? null : keyOf(id);
    if (key !== null) {
      before = key;
      break;
    }
  }
  let after: string | null = null;
  for (let index = Math.max(bounds.afterAt, 0); index < ids.length; index += 1) {
    const id = ids[index];
    const key = id === undefined ? null : keyOf(id);
    if (key !== null) {
      after = key;
      break;
    }
  }
  // A row that must land ahead of every keyed row still sorts after `after`
  // when that is the closer side; the wanted index decides between the two.
  const above = ids.slice(0, wanted).some((id) => id !== movedId && keyOf(id) !== null);
  const below = ids.slice(wanted + 1).some((id) => id !== movedId && keyOf(id) !== null);
  if (!above && below) return orderKeyBetween(null, after);
  if (above && !below) return orderKeyBetween(before, null);
  return orderKeyBetween(before, after);
}

/**
 * The order key a row needs to sit where a plan puts it, given the keys the
 * section's rows already carry.
 */
export function orderKeyFor(plan: ReadonlyArray<string>, movedId: string, keyOf: (id: string) => string | null): string {
  const position = plan.indexOf(movedId);
  if (position === -1) return orderKeyBetween(null, null);
  if (keyOf(movedId) === null) {
    // Nothing to overtake yet: seed the moved row apart from its neighbours by
    // taking the middle of the key range, which a later drag refines.
    return orderKeyBetween(null, null);
  }
  let beforeAt = -1;
  for (let index = position - 1; index >= 0; index -= 1) {
    const id = plan[index];
    if (id !== movedId && id !== undefined && keyOf(id) !== null) {
      beforeAt = index;
      break;
    }
  }
  let afterAt = plan.length;
  for (let index = position + 1; index < plan.length; index += 1) {
    const id = plan[index];
    if (id !== movedId && id !== undefined && keyOf(id) !== null) {
      afterAt = index;
      break;
    }
  }
  return orderKeyForPosition({ ids: plan, keyOf, movedId, window: { beforeAt, afterAt }, wanted: position });
}

/**
 * Search narrowing with T3's minimum. Below the minimum nothing is filtered —
 * the field is still typing (`queries.ts:85`); at or above it, matching rows
 * survive and the rest are hidden.
 */
export interface SearchNarrowing<T> {
  readonly active: boolean;
  readonly results: ReadonlyArray<T>;
}

export function narrowBySearch<T extends { readonly title: string }>(
  rows: ReadonlyArray<T>,
  query: string,
): SearchNarrowing<T> {
  const trimmed = query.trim();
  if (trimmed.length < THREAD_SEARCH_MIN_LENGTH) return { active: false, results: rows };
  const needle = trimmed.toLowerCase();
  return { active: true, results: rows.filter((row) => row.title.toLowerCase().includes(needle)) };
}
