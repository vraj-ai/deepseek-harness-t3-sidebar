/**
 * The durable intent store: snooze, settled override, visit watermark, pin and
 * active order keys — plus the sidebar's own mirror of the host facts it writes
 * through verbs (titles, pins, archives). T3 keeps these on its server shell;
 * DSH has no equivalent for snooze/settle/visit, so the plugin owns them and the
 * adapter feeds them into the shell.
 *
 * Layout: `t3Sidebar.state` in local storage, version-keyed so a later shape
 * change can migrate instead of guessing. Every read is validated; a corrupt or
 * older record yields empty state, never a throw. Pure — no storage access.
 */
export const STORE_NAMESPACE = "t3Sidebar";
export const STORE_KEY = `${STORE_NAMESPACE}.state`;
export const STORE_VERSION = 1;

export interface ThreadIntent {
  readonly snoozedUntil: string | null;
  readonly snoozedAt: string | null;
  readonly settledOverride: "settled" | "active" | null;
  readonly settledAt: string | null;
  readonly unsettledAt: string | null;
  readonly lastVisitedAt: string | null;
  readonly pinnedAt: string | null;
  readonly pinOrderKey: string | null;
  readonly activeOrderKey: string | null;
}

/**
 * The facts the sidebar itself writes: a rename, a pin, an archive. The host
 * owns the durable copy (verbs `session/rename`, `workspace/pinSession`, …);
 * this mirror is what keeps the row correct between the verb's reply and the
 * next list snapshot, and across a reload while that snapshot is stale.
 */
export interface MirroredState {
  /** Titles written by the sidebar, by scoped thread key. */
  readonly titles: Readonly<Record<string, string>>;
  /** Session ids the sidebar pinned, newest first. */
  readonly pinned: ReadonlyArray<string>;
  /** Session ids the sidebar archived. */
  readonly archived: ReadonlyArray<string>;
}

export interface SidebarIntentState {
  readonly version: typeof STORE_VERSION;
  readonly threads: ReadonlyMap<string, ThreadIntent>;
  readonly mirrored: MirroredState;
}

export const EMPTY_THREAD_INTENT: ThreadIntent = {
  snoozedUntil: null,
  snoozedAt: null,
  settledOverride: null,
  settledAt: null,
  unsettledAt: null,
  lastVisitedAt: null,
  pinnedAt: null,
  pinOrderKey: null,
  activeOrderKey: null,
};

export const EMPTY_MIRRORED: MirroredState = { titles: {}, pinned: [], archived: [] };

export function emptyIntentState(): SidebarIntentState {
  return { version: STORE_VERSION, threads: new Map(), mirrored: EMPTY_MIRRORED };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(record: Readonly<Record<string, unknown>>, key: string): string | null | undefined {
  const value = record[key];
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function parseIntent(value: unknown): ThreadIntent | null {
  if (!isRecord(value)) return null;
  const fields = [
    "snoozedUntil",
    "snoozedAt",
    "settledAt",
    "lastVisitedAt",
    "pinnedAt",
    "pinOrderKey",
    "activeOrderKey",
  ] as const;
  const parsed: { -readonly [K in (typeof fields)[number]]: string | null } = {
    snoozedUntil: null,
    snoozedAt: null,
    settledAt: null,
    lastVisitedAt: null,
    pinnedAt: null,
    pinOrderKey: null,
    activeOrderKey: null,
  };
  for (const field of fields) {
    const fieldValue = nullableString(value, field);
    if (fieldValue === undefined) return null;
    parsed[field] = fieldValue;
  }
  const override = value["settledOverride"];
  if (override !== undefined && override !== null && override !== "settled" && override !== "active") {
    return null;
  }
  return {
    ...parsed,
    unsettledAt: nullableString(value, "unsettledAt") ?? null,
    settledOverride: override ?? null,
  };
}

function parseMirrored(value: unknown): MirroredState {
  if (!isRecord(value)) return EMPTY_MIRRORED;
  const idList = (raw: unknown): ReadonlyArray<string> =>
    Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
  const titles: Record<string, string> = {};
  if (isRecord(value["titles"])) {
    for (const [key, title] of Object.entries(value["titles"])) {
      if (typeof title === "string") titles[key] = title;
    }
  }
  return { titles, pinned: idList(value["pinned"]), archived: idList(value["archived"]) };
}

/** Validate stored JSON once, at the edge. */
export function parseSidebarIntentState(value: unknown): SidebarIntentState {
  if (!isRecord(value)) return emptyIntentState();
  if (value["version"] !== STORE_VERSION) return emptyIntentState();
  const threads = value["threads"];
  if (!isRecord(threads)) return emptyIntentState();
  const parsed = new Map<string, ThreadIntent>();
  for (const [key, entry] of Object.entries(threads)) {
    const intent = parseIntent(entry);
    if (intent !== null) parsed.set(key, intent);
  }
  return { version: STORE_VERSION, threads: parsed, mirrored: parseMirrored(value["mirrored"]) };
}

export function serializeSidebarIntentState(state: SidebarIntentState): string {
  return JSON.stringify({
    version: state.version,
    threads: Object.fromEntries(state.threads),
    mirrored: state.mirrored,
  });
}

export function readIntent(
  state: SidebarIntentState,
  threadKey: string,
): ThreadIntent {
  return state.threads.get(threadKey) ?? EMPTY_THREAD_INTENT;
}

export function withIntent(
  state: SidebarIntentState,
  threadKey: string,
  patch: Partial<ThreadIntent>,
): SidebarIntentState {
  const threads = new Map(state.threads);
  threads.set(threadKey, { ...readIntent(state, threadKey), ...patch });
  return { version: state.version, threads, mirrored: state.mirrored };
}

/** Replace the mirrored host facts, keeping every thread's intent. */
export function withMirrored(state: SidebarIntentState, mirrored: MirroredState): SidebarIntentState {
  return { version: state.version, threads: state.threads, mirrored };
}

export function readTitle(state: SidebarIntentState, threadKey: string): string | null {
  return state.mirrored.titles[threadKey] ?? null;
}
