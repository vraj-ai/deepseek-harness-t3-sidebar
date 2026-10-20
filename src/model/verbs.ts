/**
 * The verb layer: everything issue #7's row actions and the visit watermark
 * change in the plugin's own durable state, as pure folds over
 * `SidebarIntentState`. The store writes JSON; these rules decide what it says.
 *
 * Persisted where the plugin owns the fact:
 * - rename → the session's own title (host verb `session/rename`), mirrored in
 *   `titles` so the row keeps it even before the list republishes;
 * - pin/unpin → the host's `pinnedSessionIds` (verb), mirrored in `pinned`;
 * - archive/unarchive → the host's `archivedSessionIds` (verb), mirrored in
 *   `archived`;
 * - order inside a section → `pinOrderKey` / `activeOrderKey`;
 * - snooze, settle, visit → the intent store alone (T3 keeps them on its shell,
 *   DSH has no equivalent).
 */
import {
  emptyIntentState,
  readIntent,
  withIntent,
  type SidebarIntentState,
  type ThreadIntent,
} from "../adapter/store.ts";

export interface VerbState {
  /** Titles the sidebar wrote, by scoped thread key. */
  readonly titles: Readonly<Record<string, string>>;
  /** Session ids the sidebar pinned, in pin order (newest first). */
  readonly pinned: ReadonlyArray<string>;
  /** Session ids the sidebar archived. */
  readonly archived: ReadonlyArray<string>;
}

export const EMPTY_VERB_STATE: VerbState = { titles: {}, pinned: [], archived: [] };

export function setTitle(state: VerbState, threadKey: string, title: string): VerbState {
  return { ...state, titles: { ...state.titles, [threadKey]: title } };
}

/** Pin to the front, as T3's `thread.pin` fronts a fresh pin (`Sidebar.tsx:3467-3470`). */
export function pinSession(state: VerbState, sessionId: string): VerbState {
  return { ...state, pinned: [sessionId, ...state.pinned.filter((id) => id !== sessionId)] };
}

export function unpinSession(state: VerbState, sessionId: string): VerbState {
  return { ...state, pinned: state.pinned.filter((id) => id !== sessionId) };
}

/** Archive drops the pin and the position the row had, and keeps them for undo. */
export function archiveSession(state: VerbState, sessionId: string): VerbState {
  return {
    ...state,
    pinned: state.pinned.filter((id) => id !== sessionId),
    archived: [...state.archived.filter((id) => id !== sessionId), sessionId],
  };
}

export function unarchiveSession(state: VerbState, sessionId: string): VerbState {
  return { ...state, archived: state.archived.filter((id) => id !== sessionId) };
}

/** Apply the host's own sets on top of the local mirror, host first. */
export function reconcileHostSets(
  state: VerbState,
  host: { readonly pinnedSessionIds: ReadonlyArray<string>; readonly archivedSessionIds: ReadonlyArray<string> },
): VerbState {
  const merge = (local: ReadonlyArray<string>, remote: ReadonlyArray<string>): ReadonlyArray<string> => {
    const seen = new Set(remote);
    return [...remote, ...local.filter((id) => !seen.has(id) && !remote.includes(id))];
  };
  return {
    ...state,
    pinned: merge(state.pinned, host.pinnedSessionIds),
    archived: merge(state.archived, host.archivedSessionIds),
  };
}

/** The fold's starting point for a page with no stored record. */
export function emptyVerbs(): SidebarIntentState {
  return emptyIntentState();
}

export type IntentPatch = Partial<ThreadIntent>;

export function snoozeIntent(until: string, now: string): IntentPatch {
  return { snoozedUntil: until, snoozedAt: now, settledOverride: "active", settledAt: null };
}

export function unsnoozeIntent(): IntentPatch {
  return { snoozedUntil: null, snoozedAt: null };
}

export function settleIntent(now: string): IntentPatch {
  return { settledOverride: "settled", settledAt: now, unsettledAt: null, snoozedUntil: null, snoozedAt: null };
}

export function unsettleIntent(now: string): IntentPatch {
  return { settledOverride: "active", settledAt: null, unsettledAt: now };
}

export function visitIntent(now: string): IntentPatch {
  return { lastVisitedAt: now };
}

export function orderIntent(field: "pinOrderKey" | "activeOrderKey", key: string): IntentPatch {
  return { [field]: key } as IntentPatch;
}

/** One thread's intent after a patch; every other thread is untouched. */
export function patchIntent(state: SidebarIntentState, threadKey: string, patch: IntentPatch): SidebarIntentState {
  return withIntent(state, threadKey, patch);
}

/** A thread's stored intent, for callers that need the whole record. */
export function intentOf(state: SidebarIntentState, threadKey: string): ThreadIntent {
  return readIntent(state, threadKey);
}
