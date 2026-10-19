/**
 * The row's status, in T3's two layers, over this plugin's data.
 *
 * Layer one is T3's own state machine (`./sidebar.ts`): approval and input come
 * from the pending flags, working from a live runtime. Layer two is the
 * `t3Sidebar` projection (issue #1), which is where DSH reports the facts T3
 * reads from `runtime.lastErrorClass`: the last turn's outcome and the failure
 * class behind it. DSH's adapter emits no runtime for a finished turn
 * (`adapter/dsh.ts`), so a failed or cancelled turn has to be classified from
 * the projection, not from the runtime.
 *
 * Order follows T3's own precedence (`Sidebar.tsx:1666-1715`): approval, input,
 * working, then the terminal outcomes.
 */
import {
  hasThreadWoke,
  hasUnseenCompletion,
  resolveSidebarThreadStatus,
  type SidebarThreadStatus,
} from "./sidebar.ts";
import type { SidebarThreadShell } from "./types.ts";

/**
 * What one row paints in its status slot, before the UI decides how.
 * - `working` is a turn in flight; `waiting` a runtime parked at idle.
 * - `failed` / `limited` come from the projection's outcome and error class.
 * - `done` is T3's unread completion, `woke` its snooze wake.
 */
export type RowStatusKind =
  | "approval"
  | "input"
  | "working"
  | "waiting"
  | "failed"
  | "limited"
  | "woke"
  | "done"
  | "settled"
  | "none";

export interface RowStatus {
  readonly kind: RowStatusKind;
  /** Short label, T3's vocabulary. */
  readonly label: string;
  /** What this row should render; `settled`/`none` render nothing. */
  readonly visible: boolean;
}

const NONE: RowStatus = { kind: "none", label: "", visible: false };
const SETTLED: RowStatus = { kind: "settled", label: "", visible: false };

/**
 * The projection-backed terminal outcome: a failed turn that is not running now.
 * A `usage_limit` failure is T3's `limited`; anything else is `failed`.
 */
function outcomeStatus(shell: SidebarThreadShell, running: boolean): RowStatus | null {
  if (running || shell.sail.outcome !== "failed") return null;
  return shell.sail.errorClass === "usage_limit"
    ? { kind: "limited", label: "Limited", visible: true }
    : { kind: "failed", label: "Failed", visible: true };
}

/**
 * Classify one row. `settled` is passed in because section placement already
 * decided it; `now` is the same clock the partitions used, so a wake cannot
 * disagree with the section the row is drawn in.
 */
export function resolveRowStatus(input: {
  readonly shell: SidebarThreadShell;
  readonly settled: boolean;
  readonly now: string;
}): RowStatus {
  const { shell } = input;
  const status: SidebarThreadStatus = resolveSidebarThreadStatus(shell);
  const running = status === "working";
  if (status === "approval") return { kind: "approval", label: "Approval", visible: true };
  if (status === "input") return { kind: "input", label: "Input", visible: true };
  if (running) return { kind: "working", label: "Working", visible: true };
  if (status === "waiting") return { kind: "waiting", label: "Waiting", visible: true };
  const outcome = outcomeStatus(shell, running);
  if (outcome !== null) return outcome;
  if (input.settled) return SETTLED;
  if (hasThreadWoke({ wokeAt: shell.sail.lastTurnCompletedAt, lastVisitedAt: shell.lastVisitedAt, settled: false })) {
    return { kind: "woke", label: "Woke", visible: true };
  }
  if (hasUnseenCompletion(shell)) return { kind: "done", label: "Done", visible: true };
  return NONE;
}

/**
 * T3's row densities: the 82 px card and the 36 px slim row
 * (`Sidebar.tsx:4795-4816`).
 * @typedef {'card' | 'slim'} RowDensity
 */

/**
 * T3's density rule, exactly: every section but Snoozed and Settled is a card
 * (`Sidebar.tsx:4795-4816`). No section-dependent narrowing, no per-run
 * downgrade — a finished Active row stays an 82 px card the way T3 draws it.
 * @param {string} section - the section the row landed in.
 * @returns {RowDensity} card or slim.
 */
export function densityForSection(section: string) {
  return section === "snoozed" || section === "settled" ? "slim" : "card";
}
