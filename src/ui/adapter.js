/**
 * Adapter: the one place opaque host snapshots become the shell's own rows.
 *
 * Every value crossing from the session list, the workspace list or a session's
 * projection values is `unknown` until proved here. Nothing downstream reads a
 * host shape directly, so a projection that changes shape degrades to a missing
 * field instead of a crash inside render.
 *
 * The partition, sort, status and text rules are issue #5's pure model
 * (`src/model/**`, ported from T3 Code); this file only feeds them. That is why
 * the seat's rows are exactly the rows the unit tests pin.
 * @module deepseek-harness-t3-sidebar/ui/adapter
 */

import { adaptSession, classifyThread } from '../adapter/dsh.ts'
import { emptyIntentState } from '../adapter/store.ts'
import { sortInboxThreadsByReturn, sortWorkingThreadsBySend } from '../model/threadInbox.ts'
import {
  sortPinnedThreadsByOrderKey,
  sortSettledThreads,
} from '../model/threadSort.ts'
import { sortSnoozedThreads } from '../model/order.ts'
import { densityForSection } from '../model/rowStatus.ts'
import { planSections, revealSettled, rowView } from '../model/rowText.ts'

/**
 * @typedef {import('./types.js').SidebarSession} SidebarSession
 * @typedef {import('./types.js').WorkspaceSummary} WorkspaceSummary
 * @typedef {import('./types.js').Section} Section
 * @typedef {import('./types.js').SidebarShellData} SidebarShellData
 */

/**
 * True for a non-null non-array object.
 * @param {unknown} value - candidate.
 * @returns {value is Record<string, unknown>} whether it is a plain record.
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read one field of a record, or `undefined` when it is not that type.
 *
 * Returns the field's VALUE, so the returned union also contains `true`. Test
 * presence with `!== undefined`; never compare a boolean-typed field to `true`,
 * because the value can be the string you matched.
 * @template T - the expected member type.
 * @param {unknown} record - candidate record.
 * @param {string} key - field name.
 * @param {(value: unknown) => value is T} check - member test.
 * @returns {T | undefined} the field when it satisfies `check`.
 */
function field(record, key, check) {
  if (!isRecord(record)) return undefined
  const value = record[key]
  return check(value) ? value : undefined
}

/** @param {unknown} value - candidate. @returns {value is string} non-empty string test. */
const isNonEmptyString = (value) => typeof value === 'string' && value !== ''

/** @param {unknown} value - candidate. @returns {value is boolean} boolean test. */
const isBoolean = (value) => typeof value === 'boolean'

/** @param {unknown} value - candidate. @returns {value is number} finite number test. */
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)

/** @param {unknown} value - candidate. @returns {value is unknown[]} array test. */
const isArray = Array.isArray

/**
 * One section as the list draws it: its shelf, its rows already projected, and
 * what the tail folded away.
 * @typedef {object} DrawnSection
 * @property {'pinned' | 'active' | 'working' | 'snoozed' | 'settled'} key - shelf marker.
 * @property {string} label - heading text.
 * @property {RowDensity} density - 82 px card or 36 px slim row.
 * @property {DrawnRow[]} rows - what to draw, in this shelf's sort order.
 * @property {number} hidden - settled rows beyond the tail.
 */

/**
 * One row: the compact {@link SidebarSession} the shell already published plus
 * everything the model derives for it.
 * @typedef {object} DrawnRow
 * @property {string} id - the session id, the row's marker.
 * @property {string} title - the session title, `''` when it has none.
 * @property {boolean} blank - reserved: the model draws no blank placeholder row.
 * @property {string | null} parentId - reserved: subagent rows are excluded.
 * @property {boolean} isSubagent - reserved, always false after the filter.
 * @property {number | null} updatedAt - ms epoch of the row's clock.
 * @property {{ outcome: 'ok' | 'failed' | 'interrupted', errorClass: string | null, lastTurnCompletedAt: number | null } | null} projection - the seat's published outcome marker.
 * @property {SidebarThreadShell} shell - the adapted shell.
 * @property {RowView} view - title, times, stack, goal, queue.
 * @property {RowDensity} density - 82 px card or 36 px slim.
 * @property {RowStatus} status - the status slot's state.
 * @property {boolean} pinned - the row is pinned (T3 draws the pin on every pin).
 */

/** Heading text, T3's shelf names (`Sidebar.tsx:4954-5010`). */
const SECTION_LABELS = /** @type {const} */ ({
  pinned: 'Pinned',
  working: 'Working',
  snoozed: 'Snoozed',
  settled: 'Settled',
  active: 'Active',
})

/**
 * The text a row shows for one session. The host's own rule (`displayTitle` on
 * the list row, else `title`): a blank session and an untitled one carry no text
 * and the row paints the localized label instead.
 * @param {unknown} row - candidate session summary.
 * @returns {string} display title, possibly empty.
 */
function titleOf(row) {
  const display = field(row, 'displayTitle', isNonEmptyString) ?? field(row, 'title', isNonEmptyString)
  return display?.trim() ?? ''
}

/**
 * The `t3Sidebar` value's outcome, narrowed to the model's vocabulary. The
 * model calls a successful turn `completed`; the seat's published marker calls
 * it `ok`, so that translation happens here and only here.
 * @param {unknown} projectionValues - a session's whole projection value bag.
 * @returns {{ outcome: 'ok' | 'failed' | 'interrupted', errorClass: string | null, lastTurnCompletedAt: string | null } | null}
 */
function readProjection(projectionValues) {
  const value = field(projectionValues, 't3Sidebar', isRecord)
  if (value === undefined) return null
  const raw = value.outcome
  const outcome =
    raw === 'completed' ? 'ok' : raw === 'ok' || raw === 'failed' || raw === 'interrupted' ? raw : null
  if (outcome === null) return null
  const errorClass = value.errorClass
  const completedAt = value.lastTurnCompletedAt
  return {
    outcome,
    errorClass: typeof errorClass === 'string' ? errorClass : null,
    lastTurnCompletedAt: typeof completedAt === 'string' ? completedAt : null,
  }
}

/**
 * One row of `sessions.list.byId`, validated. A title that equals the session id
 * is the host's "no title yet" fallback, not a title.
 * @param {unknown} row - candidate session summary.
 * @returns {SidebarSession | null} the session, or null when it carries no identity.
 */
export function parseSession(row) {
  const id = field(row, 'id', isNonEmptyString)
  if (id === undefined) return null
  const title = titleOf(row)
  return {
    id,
    title: title === id ? '' : title,
    blank: field(row, 'blank', isBoolean) ?? false,
    parentId: field(row, 'parentId', isNonEmptyString) ?? null,
    isSubagent: field(row, 'origin', (value) => value === 'subagent') !== undefined,
    updatedAt: field(row, 'updatedAt', isFiniteNumber) ?? null,
    projection: readProjection(field(row, 'projectionValues', isRecord)),
  }
}

/**
 * The working directory a seat row names, from either row shape.
 * @param {unknown} row - candidate session summary.
 * @returns {string | null} the directory, or null.
 */
function cwdOf(row) {
  const direct = field(row, 'cwd', isNonEmptyString)
  if (direct !== undefined) return direct
  const values = field(row, 'projectionValues', isRecord)
  return field(values, 'workingDirectory', isNonEmptyString) ?? field(values, 'cwd', isNonEmptyString) ?? null
}

/**
 * One workspace item, validated. `default-workspace` is the host's stored marker
 * for the unnamed workspace (the shipped browser swaps in its localized label).
 * @param {unknown} item - candidate workspace item.
 * @param {string} unnamedLabel - label to draw for the unnamed workspace.
 * @returns {WorkspaceSummary | null} the workspace, or null without an id.
 */
export function parseWorkspace(item, unnamedLabel) {
  const workspaceId = field(item, 'workspaceId', isNonEmptyString)
  if (workspaceId === undefined) return null
  const rawTitle = field(item, 'title', isNonEmptyString) ?? unnamedLabel
  return {
    workspaceId,
    title: rawTitle === 'default-workspace' ? unnamedLabel : rawTitle,
    sessionIds: field(item, 'sessionIds', (value) => isArray(value) && value.every((id) => typeof id === 'string')) ?? [],
    // The host snapshot's own field; `workingDirectory` is the projection's name.
    cwd: field(item, 'cwd', isNonEmptyString) ?? field(item, 'workingDirectory', isNonEmptyString) ?? null,
  }
}

/**
 * Partition one session into T3's shelves: snoozed wins over settled, settled
 * over pinned, and working is the live fall-through (`classifyThread`).
 * @param {SidebarThreadShell} shell - the adapted shell.
 * @param {string} now - one ISO instant shared by every row in a derivation.
 * @returns {'pinned' | 'active' | 'working' | 'snoozed' | 'settled'} the shelf.
 */
function shelfOf(shell, now) {
  return classifyThread({ shell, now })
}

/**
 * Sort each shelf with T3's own rule, then lay the shelves out in T3's order.
 * @param {Partitions} partitions - unsorted buckets.
 * @returns {ReadonlyArray<{ key: DrawnSection['key'], rows: ReadonlyArray<SidebarThreadShell> }>} the plan.
 */
function sortPartitions(partitions) {
  return planSections({
    pinned: sortPinnedThreadsByOrderKey(partitions.pinned),
    active: sortInboxThreadsByReturn(partitions.active),
    working: sortWorkingThreadsBySend(partitions.working),
    snoozed: sortSnoozedThreads(partitions.snoozed),
    settled: sortSettledThreads(partitions.settled),
  })
}

/**
 * Project one adapted shell into the row the list draws.
 * @param {SidebarThreadShell} shell - adapted shell.
 * @param {DrawnSection['key']} section - the shelf it was placed in.
 * @param {string} now - derivation instant, ISO.
 * @param {number} nowMs - the same instant in ms.
 * @param {boolean} pinned - the host's pin set contains this session.
 * @returns {DrawnRow} the row.
 */
function drawRow(shell, section, now, nowMs, pinned) {
  const settled = section === 'settled'
  const view = rowView({ shell, settled, now, nowMs })
  return {
    id: shell.id,
    title: shell.title,
    blank: false,
    parentId: null,
    isSubagent: false,
    updatedAt: shell.latestUserMessageAt === null ? null : Date.parse(shell.latestUserMessageAt),
    projection:
      view.status.kind === 'none' || view.status.kind === 'settled'
        ? null
        : {
            outcome: view.status.kind === 'failed' || view.status.kind === 'limited' ? 'failed' : 'ok',
            errorClass: shell.sail.errorClass,
            lastTurnCompletedAt:
              shell.sail.lastTurnCompletedAt === null ? null : Date.parse(shell.sail.lastTurnCompletedAt),
          },
    shell,
    view,
    density: densityForSection(section),
    status: view.status,
    pinned,
  }
}

/**
 * Derive every drawn row and section from the seat's two snapshots.
 *
 * The host row shape is the seat's: `sessions.list` rows carry `projections`
 * (the full bag) while the workspace snapshot carries `projectionValues` (the
 * keyed subset). Both are accepted; the model's adapter validates the union.
 * @param {object} input - host snapshots plus the selected workspace.
 * @param {readonly unknown[]} input.ids - `sessions.list.ids`.
 * @param {Record<string, unknown>} input.byId - `sessions.list.byId`.
 * @param {readonly WorkspaceSummary[]} input.workspaces - parsed workspaces.
 * @param {readonly string[]} input.pinnedSessionIds - host pin set.
 * @param {readonly string[]} input.archivedSessionIds - host archive list.
 * @param {string | null} input.selectedWorkspaceId - workspace scope, null for all.
 * @param {number} input.settledRevealed - how many 25-row tail pages were revealed.
 * @param {number} [input.nowMs] - derivation instant, for tests.
 * @param {import('../adapter/store.ts').SidebarIntentState} [input.intent] - stored snooze/settle/pin/visit intent.
 * @returns {{ sections: DrawnSection[], rows: DrawnRow[], hiddenSettled: number }} the list.
 */
export function deriveSections(input) {
  const nowMs = input.nowMs ?? Date.now()
  const now = new Date(nowMs).toISOString()
  const archived = new Set(input.archivedSessionIds)
  const pinned = new Set(input.pinnedSessionIds)
  // A session's project is its workspace when the host names one, and its own
  // working directory otherwise; `workspaceFor` is the same lookup the rows use.
  const projectOf = (cwd) => {
    const owner = input.workspaces.find((workspace) => workspace.cwd !== null && workspace.cwd === cwd)
    return owner?.title ?? null
  }
  const selected = input.selectedWorkspaceId === null ? null : input.workspaces.find((workspace) => workspace.workspaceId === input.selectedWorkspaceId) ?? null
  // A session belongs to a workspace through `sessionIds`, and also through its
  // own working directory: the host leaves a session out of a workspace's id
  // list while its file lives under that directory.
  const scope =
    selected === null
      ? null
      : {
          ids: new Set(selected.sessionIds),
          cwd: selected.cwd,
        }
  const inScope = (id) => scope === null || scope.ids.has(id) || (scope.cwd !== null && cwdOf(input.byId[id]) === scope.cwd)

  /** @type {SidebarThreadShell[]} */
  const shells = []
  /** @type {Set<string>} */
  const pinnedShells = new Set()
  for (const id of input.ids) {
    if (typeof id !== 'string' || !inScope(id) || archived.has(id)) continue
    const raw = /** @type {Record<string, unknown> | undefined} */ (input.byId[id])
    const session = parseSession(raw)
    if (session === null || session.isSubagent) continue
    const cwd = cwdOf(raw)
    const shell = adaptSession({
      row: raw,
      status: undefined,
      pinned: pinned.has(id),
      archived: false,
      titleOverride: null,
      intent: input.intent ?? emptyIntentState(),
      environmentId: 'dsh',
      now,
      projectName: projectOf(cwd),
    })
    if (shell !== null) {
      shells.push(shell)
      if (pinned.has(id)) pinnedShells.add(shell.id)
    }
  }

  /** @type {Partitions} */
  const partitions = { pinned: [], active: [], working: [], snoozed: [], settled: [] }
  for (const shell of shells) partitions[shelfOf(shell, now)].push(shell)

  const visible = revealSettled(sortPartitions(partitions), input.settledRevealed)
  const sections = visible.map((section) => ({
    key: section.key,
    label: SECTION_LABELS[section.key],
    density: densityForSection(section.key),
    rows: section.rows.map((shell) => drawRow(shell, section.key, now, nowMs, pinnedShells.has(shell.id))),
    hidden: section.hidden,
  }))
  return {
    sections,
    rows: sections.flatMap((section) => section.rows),
    hiddenSettled: sections.reduce((total, section) => total + section.hidden, 0),
  }
}

/**
 * Everything the shell renders, from the two host snapshots it reads.
 * @param {object} input - raw host snapshots.
 * @param {unknown} input.sessions - `useSessions((s) => s)`.
 * @param {unknown} input.workspaces - `useWorkspaces((s) => s)`.
 * @param {string | null} input.selectedWorkspaceId - chosen workspace, null for all.
 * @param {string} input.unnamedWorkspaceLabel - label for the unnamed workspace.
 * @param {number} [input.settledRevealed] - settled tail pages revealed.
 * @param {number} [input.nowMs] - derivation instant, for tests.
 * @param {import('../adapter/store.ts').SidebarIntentState} [input.intent] - stored intent.
 * @returns {SidebarShellData} validated data plus the resolved selection.
 */
export function deriveShellData(input) {
  const rawWorkspaces = field(input.workspaces, 'items', isArray) ?? []
  const workspaces = rawWorkspaces.flatMap((item) => {
    const workspace = parseWorkspace(item, input.unnamedWorkspaceLabel)
    return workspace === null ? [] : [workspace]
  })
  const selectedWorkspaceId = workspaces.some((workspace) => workspace.workspaceId === input.selectedWorkspaceId)
    ? input.selectedWorkspaceId
    : null
  const archivedSessionIds = field(input.workspaces, 'archivedSessionIds', isArray) ?? []
  const { sections, rows, hiddenSettled } = deriveSections({
    ids: field(input.sessions, 'ids', isArray) ?? [],
    byId: field(input.sessions, 'byId', isRecord) ?? {},
    workspaces,
    pinnedSessionIds: field(input.workspaces, 'pinnedSessionIds', isArray) ?? [],
    archivedSessionIds: /** @type {string[]} */ (archivedSessionIds),
    selectedWorkspaceId,
    settledRevealed: input.settledRevealed ?? 0,
    nowMs: input.nowMs,
    intent: input.intent,
  })
  return {
    workspaces,
    selectedWorkspaceId,
    sections,
    rows,
    sessions: rows,
    sessionCount: rows.length,
    hiddenSettled,
    pinnedCount: sections.find((section) => section.key === 'pinned')?.rows.length ?? 0,
    archivedCount: archivedSessionIds.length,
    phase: field(input.sessions, 'phase', isNonEmptyString) ?? 'loading',
  }
}

/** @typedef {import('../model/types.ts').Partitions} Partitions */
/** @typedef {import('../model/rowStatus.ts').RowDensity} RowDensity */
/** @typedef {import('../model/rowStatus.ts').RowStatus} RowStatus */
/** @typedef {import('../model/rowText.ts').RowView} RowView */
/** @typedef {import('../model/types.ts').SidebarThreadShell} SidebarThreadShell */
