/**
 * Boundary parsers for the DSH records the adapter reads. Each takes
 * `unknown`, validates once, and returns a narrow type or null. Nothing below
 * this file casts.
 *
 * Shapes are cited from the packaged DSH runtime (0.2.1-rc.2, app.asar):
 * - session list row + `projections.values`: `dsh-api-session-controller/lib/typert.host.js:523-580`
 *   (`session/list` result), projection interface declarations `:2403-2847`.
 * - session status `{ running?, pendingInteraction?, completionUnread }`: `dsh-client-ui-session/lib/client.js:981-988`;
 *   `pendingInteraction.kind` is `"approval"` (`dsh-client-ui-approval/lib/client.js:164`),
 *   `"question"` | `"plan-review"` (`dsh-client-ui-user-questions/lib/client.js:185`).
 * - workspaces `{ items, pinnedSessionIds, archivedSessionIds }`: `dsh-client-ui-workspace/lib/client.js:1550`.
 */
import type { FailureClass } from "../model/types.ts";

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function finiteNumberOrNull(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export type PendingInteractionKind = "approval" | "question" | "plan-review";

/** Opaque upstream; only the discriminant is contractual. */
export function parsePendingInteractionKind(value: unknown): PendingInteractionKind | null {
  if (!isRecord(value)) return null;
  const kind = value["kind"];
  return kind === "approval" || kind === "question" || kind === "plan-review" ? kind : null;
}

export interface DshSessionStatus {
  readonly running: boolean;
  readonly pendingInteraction: PendingInteractionKind | null;
  readonly completionUnread: boolean;
}

/** `dsh-client-ui-session/lib/client.js:981-988`. */
export function parseSessionStatus(value: unknown): DshSessionStatus | null {
  if (!isRecord(value)) return null;
  const running = value["running"];
  const completionUnread = value["completionUnread"];
  if (typeof running !== "boolean" && running !== undefined) return null;
  if (typeof completionUnread !== "boolean") return null;
  return {
    running: running ?? false,
    pendingInteraction: parsePendingInteractionKind(value["pendingInteraction"]),
    completionUnread,
  };
}

/**
 * The plugin's `t3Sidebar` projection (issue #1). Deliberately strict: an
 * unknown outcome or error class is a bug in the projector, not something to
 * coerce, and returning null lets the adapter fall back to DSH facts alone.
 */
export interface DshSailProjection {
  readonly lastUserMessageAt: string | null;
  readonly lastTurnStartedAt: string | null;
  readonly lastTurnCompletedAt: string | null;
  readonly outcome: "none" | "completed" | "failed" | "cancelled";
  readonly errorClass: FailureClass | null;
}

export function parseSailProjection(value: unknown): DshSailProjection | null {
  if (!isRecord(value)) return null;
  const lastUserMessageAt = stringOrNull(value["lastUserMessageAt"]);
  const lastTurnStartedAt = stringOrNull(value["lastTurnStartedAt"]);
  const lastTurnCompletedAt = stringOrNull(value["lastTurnCompletedAt"]);
  if (lastUserMessageAt === undefined) return null;
  if (lastTurnStartedAt === undefined) return null;
  if (lastTurnCompletedAt === undefined) return null;
  const outcome = value["outcome"];
  if (outcome !== "none" && outcome !== "completed" && outcome !== "failed" && outcome !== "cancelled") {
    return null;
  }
  const errorClass = value["errorClass"];
  if (errorClass !== undefined && errorClass !== null && errorClass !== "usage_limit" && errorClass !== "other") {
    return null;
  }
  return {
    lastUserMessageAt,
    lastTurnStartedAt,
    lastTurnCompletedAt,
    outcome,
    errorClass: errorClass ?? null,
  };
}

/** One provider/model pair, as `modelSelection.{lastUsed,next}` spells it. */
export type ModelRef = { readonly provider: string; readonly model: string } | null;

/** The `modelSelection` projection, reduced to the two choices the row names. */
export interface DshModelSelection {
  readonly lastUsed: ModelRef;
  readonly next: ModelRef;
}

function parseModelRef(value: unknown): ModelRef {
  if (!isRecord(value)) return null;
  const provider = value["provider"];
  const model = value["model"];
  return typeof provider === "string" && provider !== "" && typeof model === "string" && model !== ""
    ? { provider, model }
    : null;
}

export function parseModelSelection(value: unknown): DshModelSelection {
  const selection = isRecord(value) ? value : {};
  return { lastUsed: parseModelRef(selection["lastUsed"]), next: parseModelRef(selection["next"]) };
}

/**
 * The host `inbox` projection: two queues, `next-turn` (prompts waiting for the
 * running turn) and `next-step`. Both are arrays of items; only their length is
 * read (`dsh-client-ui-chat/lib/client.js`, `EMPTY_QUEUE`).
 */
export function parseQueuedPrompts(value: unknown): number {
  if (!isRecord(value)) return 0;
  const count = (raw: unknown) => (Array.isArray(raw) ? raw.length : 0);
  return count(value["next-turn"]) + count(value["next-step"]);
}

/** The subset of `projections.values` this slice reads. Every field is optional upstream. */
export interface DshProjectionValues {
  readonly title: string | null;
  /** The session's working directory, as the projection reports it. */
  readonly cwd: string | null;
  readonly lastPromptAt: number | null;
  readonly goalActive: boolean;
  readonly planActive: boolean;
  readonly modelId: string | null;
  readonly modelSelection: DshModelSelection;
  readonly queuedPrompts: number;
  readonly sail: DshSailProjection | null;
}

export function parseProjectionValues(value: unknown): DshProjectionValues {
  const empty: DshProjectionValues = {
    title: null,
    cwd: null,
    lastPromptAt: null,
    goalActive: false,
    planActive: false,
    modelId: null,
    modelSelection: { lastUsed: null, next: null },
    queuedPrompts: 0,
    sail: null,
  };
  if (!isRecord(value)) return empty;
  const title = stringOrNull(value["title"]);
  // `workingDirectory` is the host's field; `cwd` is the seat summary's spelling.
  const cwd = stringOrNull(value["workingDirectory"]) ?? stringOrNull(value["cwd"]);
  const metadata = isRecord(value["sessionListMetadata"]) ? value["sessionListMetadata"] : {};
  const lastPromptAt = finiteNumberOrNull(metadata["lastPromptAt"]);
  const modelSelection = parseModelSelection(value["modelSelection"]);
  const modelId = modelSelection.lastUsed?.model ?? null;
  const goal = isRecord(value["goal"]) ? value["goal"] : null;
  const goalSnapshot = goal !== null && isRecord(goal["goal"]) ? goal["goal"] : null;
  const plan = isRecord(value["plan"]) ? value["plan"] : {};
  return {
    title: title ?? null,
    cwd: cwd ?? null,
    lastPromptAt: lastPromptAt ?? null,
    goalActive: goalSnapshot !== null && goalSnapshot["phase"] === "active",
    planActive: plan["active"] === true,
    modelId: modelId === undefined ? null : modelId,
    modelSelection,
    queuedPrompts: parseQueuedPrompts(value["inbox"]),
    sail: parseSailProjection(value["t3Sidebar"]),
  };
}

export interface DshSessionRow {
  readonly sessionId: string;
  readonly updatedAt: number;
  readonly running: boolean;
  readonly blank: boolean;
  readonly cwd: string | null;
  readonly origin: "subagent" | null;
  readonly projections: DshProjectionValues;
}

/**
 * `session/list` row (`typert.host.js:524-539`). `updatedAt` is epoch milliseconds.
 *
 * Two row shapes arrive at this parser: the host's `sessionId` row and the seat's
 * own `{ id, updatedAt, blank, origin }` summary. Both are the same facts, so
 * either identity spelling is accepted; a row without both is rejected.
 * Projections arrive as the host bag (`projections.values`) or as the seat's
 * flattened `projectionValues`.
 */
export function parseSessionRow(value: unknown): DshSessionRow | null {
  if (!isRecord(value)) return null;
  const sessionId = value["sessionId"] ?? value["id"];
  const updatedAt = value["updatedAt"];
  if (typeof sessionId !== "string" || sessionId.length === 0) return null;
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return null;
  const cwd = stringOrNull(value["cwd"]);
  const bag = isRecord(value["projections"]) ? value["projections"] : {};
  const values = isRecord(bag["values"])
    ? bag["values"]
    : isRecord(value["projectionValues"])
      ? value["projectionValues"]
      : {};
  const projections = parseProjectionValues(values);
  return {
    sessionId,
    updatedAt,
    running: value["running"] === true,
    blank: value["blank"] === true,
    cwd: (cwd === undefined ? null : cwd) ?? projections.cwd,
    origin: value["origin"] === "subagent" ? "subagent" : null,
    projections,
  };
}

export interface DshWorkspaces {
  readonly items: ReadonlyArray<{
    readonly workspaceId: string;
    readonly cwd: string;
    readonly sessionIds: ReadonlyArray<string>;
  }>;
  readonly pinnedSessionIds: ReadonlyArray<string>;
  readonly archivedSessionIds: ReadonlyArray<string>;
}

export function parseWorkspaces(value: unknown): DshWorkspaces {
  const empty: DshWorkspaces = { items: [], pinnedSessionIds: [], archivedSessionIds: [] };
  if (!isRecord(value)) return empty;
  const rawItems = Array.isArray(value["items"]) ? value["items"] : [];
  const items = rawItems.flatMap((item) => {
    if (!isRecord(item)) return [];
    const workspaceId = item["workspaceId"];
    const cwd = item["cwd"];
    if (typeof workspaceId !== "string" || typeof cwd !== "string") return [];
    const sessionIds = Array.isArray(item["sessionIds"])
      ? item["sessionIds"].filter((id): id is string => typeof id === "string")
      : [];
    return [{ workspaceId, cwd, sessionIds }];
  });
  const idList = (raw: unknown): ReadonlyArray<string> =>
    Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
  return {
    items,
    pinnedSessionIds: idList(value["pinnedSessionIds"]),
    archivedSessionIds: idList(value["archivedSessionIds"]),
  };
}
