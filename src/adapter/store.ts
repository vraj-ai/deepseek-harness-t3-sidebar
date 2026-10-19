/**
 * The durable intent store: snooze, settled override, visit watermark, pin and
 * active order keys. T3 keeps these on its server shell; DSH has no equivalent,
 * so the plugin owns them and the adapter feeds them into the shell.
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
  readonly lastVisitedAt: string | null;
  readonly pinnedAt: string | null;
  readonly pinOrderKey: string | null;
  readonly activeOrderKey: string | null;
}

export interface SidebarIntentState {
  readonly version: typeof STORE_VERSION;
  readonly threads: ReadonlyMap<string, ThreadIntent>;
}

export const EMPTY_THREAD_INTENT: ThreadIntent = {
  snoozedUntil: null,
  snoozedAt: null,
  settledOverride: null,
  settledAt: null,
  lastVisitedAt: null,
  pinnedAt: null,
  pinOrderKey: null,
  activeOrderKey: null,
};

export function emptyIntentState(): SidebarIntentState {
  return { version: STORE_VERSION, threads: new Map() };
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
  return { ...parsed, settledOverride: override ?? null };
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
  return { version: STORE_VERSION, threads: parsed };
}

export function serializeSidebarIntentState(state: SidebarIntentState): string {
  return JSON.stringify({
    version: state.version,
    threads: Object.fromEntries(state.threads),
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
  return { version: state.version, threads };
}
