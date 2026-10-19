/**
 * Row text: relative time, working duration, model stack, and the section plan.
 *
 * Ported from T3 Code (MIT), commit 5307c233b1f0ae72b8894dd39d94019aaf9e7cb8:
 * - `formatRelativeTime` / `formatRelativeElapsed` / `compactSidebarTimeLabel`
 *   (`apps/web/src/timestampFormat.ts:262`, `Sidebar.tsx:820-822`).
 * - `formatWorkingDurationLabel` (`Sidebar.logic.ts:1090`).
 * - `resolveThreadProviderStack` (`packages/client-runtime/src/state/models.ts:296-304`).
 * - The section plan (`Sidebar.tsx:3526-3565`): pinned, active, working,
 *   snoozed, settled — empty shelves are omitted, and the settled tail is the
 *   first ten rows plus 25 per reveal (`Sidebar.tsx:364-365`, `#481-489`).
 */
import { resolveRowStatus, type RowStatus } from "./rowStatus.ts";
import { threadWokeAt, effectiveSnoozed, type ThreadSnoozeShell } from "./threadSettled.ts";
import type { Partitions, SidebarThreadShell } from "./types.ts";

export const SETTLED_TAIL_INITIAL = 10;
export const SETTLED_TAIL_STEP = 25;
export const THREAD_PROVIDER_STACK_LIMIT = 3;

/** `Sidebar.tsx:837-839` — the row clock is the latest user message, else update time. */
export function threadTimeTimestamp(shell: SidebarThreadShell): string {
  return shell.latestUserMessageAt ?? shell.updatedAt;
}

/** `timestampFormat.ts` — `just now`, `5m ago`, `3h ago`, `2d ago`. */
export function formatRelativeElapsed(elapsedMs: number): string {
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** `Sidebar.tsx:820-822` — the sidebar drops the ` ago` suffix. */
export function compactSidebarTimeLabel(label: string): string {
  if (label === "just now") return "now";
  return label.endsWith(" ago") ? label.slice(0, -4) : label;
}

/** Relative label for one timestamp, or null when it cannot be read. */
export function relativeLabel(iso: string | null, nowMs: number): string | null {
  if (iso === null) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return compactSidebarTimeLabel(formatRelativeElapsed(Math.max(0, nowMs - parsed)));
}

/** `Sidebar.logic.ts:1090` — `42s`, `7m`, `1h 12m`. */
export function formatWorkingDurationLabel(elapsedMs: number): string {
  const seconds = Number.isFinite(elapsedMs) ? Math.max(0, Math.floor(elapsedMs / 1000)) : 0;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * T3's 14 px row glyphs, modelled here so the UI keeps no data rules. Only the
 * set this sidebar can show is kept.
 */
export type GlyphName =
  | "working"
  | "waiting"
  | "approval"
  | "input"
  | "failed"
  | "woke"
  | "done";

/**
 * `Sidebar.tsx:1666-1715`: the status slot's label, glyph and token tone.
 * `limited` reuses the failed glyph in T3 and the warning tone.
 */
export const STATUS_PRESENTATION: Readonly<
  Record<Exclude<RowStatus["kind"], "settled" | "none">, { readonly glyph: GlyphName; readonly tone: string }>
> = {
  working: { glyph: "working", tone: "info" },
  waiting: { glyph: "waiting", tone: "muted" },
  approval: { glyph: "approval", tone: "warn" },
  input: { glyph: "input", tone: "accent" },
  limited: { glyph: "failed", tone: "warn" },
  failed: { glyph: "failed", tone: "error" },
  woke: { glyph: "woke", tone: "warn" },
  done: { glyph: "done", tone: "success" },
};

/** One provider/model step of the stack. */
export interface ProviderStackEntry {
  readonly provider: string;
  readonly model: string;
}

/**
 * The provider/model stack, up to three, oldest first with the current last.
 *
 * T3's `resolveThreadProviderStack` (`models.ts:296-304`) takes the current
 * instance from the live runtime and falls back to `modelSelection.instanceId`,
 * then appends the last two distinct history entries. DSH has a single provider
 * instance per session and no handoff history, so the stack is the current
 * selection alone: `modelSelection.next` (the choice the next turn uses), else
 * `modelSelection.lastUsed`. `runtime.providerInstanceId` names the same
 * instance while a turn runs, so it changes nothing here.
 */
export function providerStack(shell: SidebarThreadShell): ReadonlyArray<ProviderStackEntry> {
  const selection = shell.modelSelection;
  const current = selection.next ?? selection.lastUsed;
  if (current === null) return [];
  return [{ provider: current.provider, model: current.model }].slice(-THREAD_PROVIDER_STACK_LIMIT);
}

/** The stack as one line: `provider/model`, a handoff history joined by `←`. */
export function providerStackLabel(stack: ReadonlyArray<ProviderStackEntry>): string {
  const history = [...stack].reverse();
  const current = history[0];
  if (current === undefined) return "";
  return history
    .slice(1)
    .reduce((label, entry) => `${label} ← ${entry.provider}/${entry.model}`, `${current.provider}/${current.model}`);
}

const TIME_OF_DAY = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** A clock time for a `woke` row, which T3 labels with its wake. */
export function clockLabel(iso: string | null): string | null {
  if (iso === null) return null;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : TIME_OF_DAY.format(new Date(parsed));
}

/** One section of the plan: which shelf, and the rows in its sorted order. */
export interface SectionPlan {
  readonly key: "pinned" | "working" | "snoozed" | "settled" | "active";
  readonly rows: ReadonlyArray<SidebarThreadShell>;
}

/** A drawn section after the tail slice, with how many rows are still folded away. */
export interface VisibleSection extends SectionPlan {
  readonly hidden: number;
}

/**
 * T3's shelf order. Shelves are drawn only when they hold rows; Active is
 * always drawn because it is the fall-through bucket (`Sidebar.tsx:3558-3565`).
 */
export function planSections(partitions: Partitions): ReadonlyArray<SectionPlan> {
  const plan = (key: SectionPlan["key"], rows: ReadonlyArray<SidebarThreadShell>): SectionPlan[] =>
    key === "active" ? [{ key, rows }] : rows.length > 0 ? [{ key, rows }] : [];
  return [
    ...plan("pinned", partitions.pinned),
    ...plan("working", partitions.working),
    ...plan("snoozed", partitions.snoozed),
    ...plan("settled", partitions.settled),
    ...plan("active", partitions.active),
  ];
}

/**
 * Apply the settled tail: the first N rows plus 25 per reveal, never hiding a
 * row that is not in the settled shelf (`Sidebar.tsx:481-489`, `#554-558`).
 */
export function revealSettled(
  plan: ReadonlyArray<SectionPlan>,
  revealed: number,
): ReadonlyArray<VisibleSection> {
  const limit = SETTLED_TAIL_INITIAL + Math.max(0, revealed) * SETTLED_TAIL_STEP;
  return plan.map((section) =>
    section.key === "settled"
      ? { ...section, rows: section.rows.slice(0, limit), hidden: Math.max(0, section.rows.length - limit) }
      : { ...section, hidden: 0 },
  );
}

/** What the "Show more" button says (`Sidebar.tsx:5034-5044`). */
export function settledTailLabel(hidden: number): string {
  return `Show ${Math.min(hidden, SETTLED_TAIL_STEP)} more`;
}

/** Everything one row draws, derived once. */
export interface RowView {
  readonly shell: SidebarThreadShell;
  readonly title: string;
  readonly status: RowStatus;
  /** Provider/model stack label, `''` when the selection is absent. */
  readonly stack: string;
  readonly stackEntries: ReadonlyArray<ProviderStackEntry>;
  /** Card's status slot: the relative prompt time, or null. */
  readonly relativeTime: string | null;
  /** Slim row's right-hand time: wake time when snoozed, else relative. */
  readonly tailTime: string | null;
  /** Working duration, ticking from the turn's start. */
  readonly workingDuration: string | null;
  /** T3's `Goal` label swaps the Working label while a goal is active. */
  readonly goalLabel: string | null;
  /** Queued prompts for this session, from the host inbox projection. */
  readonly queued: number;
  /** Snoozed rows order by wake; the section already sorted them. */
  readonly wakeAt: string | null;
}

/**
 * Project one shell into everything its row needs. Pure: the clock is an
 * argument, so the UI can tick it and tests can pin it.
 */
export function rowView(input: {
  readonly shell: SidebarThreadShell;
  readonly settled: boolean;
  readonly now: string;
  readonly nowMs: number;
}): RowView {
  const { shell, now, nowMs } = input;
  const status = resolveRowStatus({ shell, settled: input.settled, now });
  const entries = providerStack(shell);
  const working = status.kind === "working";
  const startedAt = shell.runtime?.activityStartedAt ?? shell.latestRun?.startedAt ?? null;
  const wakeAt = threadWokeAt(shell as ThreadSnoozeShell, { now });
  const snoozed = effectiveSnoozed(shell as ThreadSnoozeShell, { now });
  return {
    shell,
    title: shell.title === "" ? "Untitled session" : shell.title,
    status,
    stack: providerStackLabel(entries),
    stackEntries: entries,
    relativeTime: relativeLabel(threadTimeTimestamp(shell), nowMs),
    tailTime:
      (snoozed ? clockLabel(shell.snoozedUntil) : null) ??
      relativeLabel(input.settled ? shell.settledAt ?? threadTimeTimestamp(shell) : threadTimeTimestamp(shell), nowMs),
    workingDuration:
      working && startedAt !== null && !Number.isNaN(Date.parse(startedAt))
        ? formatWorkingDurationLabel(nowMs - Date.parse(startedAt))
        : null,
    goalLabel: working && shell.goalActive ? "Goal" : null,
    queued: shell.queuedPrompts,
    wakeAt,
  };
}
