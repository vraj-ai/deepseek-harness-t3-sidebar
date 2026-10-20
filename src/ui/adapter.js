/**
 * Adapter: the one place opaque host snapshots become the shell's own types.
 *
 * Every value crossing from the session list, the workspace list or a session's
 * projection values is `unknown` until proved here. Nothing downstream reads a
 * host shape directly, so a projection that changes shape degrades to a missing
 * field instead of a crash inside render.
 * @module deepseek-harness-t3-sidebar/ui/adapter
 */

/** @typedef {import('./types.js').SidebarSession} SidebarSession */
/** @typedef {import('./types.js').WorkspaceSummary} WorkspaceSummary */
/** @typedef {import('./types.js').Section} Section */
/** @typedef {import('./types.js').SidebarShellData} SidebarShellData */

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
 * The `t3Sidebar` projection value, validated field by field. The outcome pair
 * is all-or-nothing: a half-typed outcome would paint a wrong badge, so a bad
 * class nulls it.
 * @param {unknown} projectionValues - a session's whole projection value bag.
 * @returns {import('./types.js').T3Projection | null} validated value, or null.
 */
function readProjection(projectionValues) {
  const value = field(projectionValues, 't3Sidebar', isRecord)
  if (value === undefined) return null
  const rawOutcome = value.outcome
  const outcome =
    rawOutcome === 'ok' || rawOutcome === 'failed' || rawOutcome === 'interrupted' ? rawOutcome : null
  const rawClass = value.errorClass
  /** @param {string} key - timestamp field. @returns {number | null} its ms value, or null. */
  const time = (key) => field(value, key, isFiniteNumber) ?? null
  return {
    lastUserMessageAt: time('lastUserMessageAt'),
    lastTurnStartedAt: time('lastTurnStartedAt'),
    lastTurnCompletedAt: time('lastTurnCompletedAt'),
    outcome: rawClass === null || typeof rawClass === 'string' ? outcome : null,
    errorClass: outcome === null ? null : typeof rawClass === 'string' ? rawClass : null,
  }
}

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
    open: (field(field(row, 'retainedBy', isRecord), 'mainView', isFiniteNumber) ?? 0) > 0,
    projection: readProjection(field(row, 'projectionValues', isRecord)),
  }
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
  }
}

/**
 * Derive the sections this slice draws, in the shipped browser's row order.
 *
 * ponytail: placeholder derivation — it keeps the shipped occupant's own
 * visibility rule (no subagent rows, only the current blank row, archived rows
 * hidden), pinned-first partitioning and newest-first order, and nothing more.
 * Issue #5's pure T3 model replaces it, issue #6 renders its sections.
 * @param {object} input - host snapshots plus the selected workspace.
 * @param {readonly unknown[]} input.ids - `sessions.list.ids`.
 * @param {Record<string, unknown>} input.byId - `sessions.list.byId`.
 * @param {readonly WorkspaceSummary[]} input.workspaces - parsed workspaces.
 * @param {readonly string[]} input.pinnedSessionIds - host pin set.
 * @param {readonly string[]} input.archivedSessionIds - host archive list.
 * @param {string | null} input.selectedWorkspaceId - workspace scope, null for all.
 * @returns {Section[]} pinned then active, each in render order.
 */
export function deriveSections(input) {
  const pinned = new Set(input.pinnedSessionIds)
  const archived = new Set(input.archivedSessionIds)
  const scope =
    input.selectedWorkspaceId === null
      ? null
      : new Set(input.workspaces.find((workspace) => workspace.workspaceId === input.selectedWorkspaceId)?.sessionIds ?? [])

  const rows = input.ids.flatMap((id) => {
    if (typeof id !== 'string' || (scope !== null && !scope.has(id))) return []
    const session = parseSession(input.byId[id])
    return session === null ? [] : [session]
  })
  // The current blank Session is the one New Session placeholder a browser draws:
  // the blank the main view holds, the shipped browser's own rule.
  const current = rows.find((session) => session.blank && session.open)?.id
  const visible = rows.filter(
    (session) =>
      !session.isSubagent &&
      (!session.blank || session.id === current) &&
      !archived.has(session.id),
  )
  const newestFirst = [...visible].sort((a, b) => {
    const delta = (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    return delta !== 0 ? delta : a.id < b.id ? -1 : 1
  })
  const held = newestFirst.filter((session) => pinned.has(session.id))
  const rest = newestFirst.filter((session) => !pinned.has(session.id))
  return [
    { key: 'pinned', label: 'Pinned', rows: held },
    { key: 'active', label: 'Active', rows: rest },
  ].filter((section) => section.rows.length > 0)
}

/**
 * Everything the shell renders, from the two host snapshots it reads.
 * @param {object} input - raw host snapshots.
 * @param {unknown} input.sessions - `useSessions((s) => s)`.
 * @param {unknown} input.workspaces - `useWorkspaces((s) => s)`.
 * @param {string | null} input.selectedWorkspaceId - chosen workspace, null for all.
 * @param {string} input.unnamedWorkspaceLabel - label for the unnamed workspace.
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
  const ids = field(input.sessions, 'ids', isArray) ?? []
  const byId = field(input.sessions, 'byId', isRecord) ?? {}
  const sections = deriveSections({
    ids,
    byId,
    workspaces,
    pinnedSessionIds: field(input.workspaces, 'pinnedSessionIds', isArray) ?? [],
    archivedSessionIds: /** @type {string[]} */ (archivedSessionIds),
    selectedWorkspaceId,
  })
  const sessions = sections.flatMap((section) => section.rows)
  return {
    workspaces,
    selectedWorkspaceId,
    sections,
    sessions,
    sessionCount: sessions.length,
    pinnedCount: sections.find((section) => section.key === 'pinned')?.rows.length ?? 0,
    archivedCount: archivedSessionIds.length,
    projections: Object.fromEntries(
      ids.flatMap((id) => {
        const projection = typeof id === 'string' ? (parseSession(byId[id])?.projection ?? null) : null
        return projection === null ? [] : [[id, projection]]
      }),
    ),
    phase: field(input.sessions, 'phase', isNonEmptyString) ?? 'loading',
  }
}
