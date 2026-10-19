/**
 * The shell's own types. The host's shapes stop at `adapter.js`; everything from
 * there inward is defined here.
 * @module deepseek-harness-t3-sidebar/ui/types
 */

/**
 * T3's turn outcome, as the `t3Sidebar` projection reports it.
 * @typedef {'ok' | 'failed' | 'interrupted'} Outcome
 */

/**
 * The validated slice of one session's `t3Sidebar` value.
 * @typedef {object} T3Projection
 * @property {Outcome | null} outcome - terminal outcome of the last turn.
 * @property {string | null} errorClass - machine code behind a failure or interruption.
 * @property {number | null} lastTurnCompletedAt - ms epoch, or null while a turn runs.
 */

/**
 * One session as the shell draws it.
 * @typedef {object} SidebarSession
 * @property {string} id - host session id (the row's stable marker).
 * @property {string} title - host title, `''` for a session that has none yet.
 * @property {boolean} blank - a session with no prompt yet.
 * @property {string | null} parentId - owning session for a subagent.
 * @property {boolean} isSubagent - spawned by another session.
 * @property {number | null} updatedAt - ms epoch of the last activity, when reported.
 * @property {T3Projection | null} projection - `t3Sidebar` value when present.
 */

/**
 * One workspace the selector offers.
 * @typedef {object} WorkspaceSummary
 * @property {string} workspaceId - host workspace id.
 * @property {string} title - display title.
 * @property {readonly string[]} sessionIds - member sessions, host order.
 */

/**
 * A rendered section: what it is and the rows it holds in list order.
 * @typedef {object} Section
 * @property {'pinned' | 'active'} key - stable marker suffix.
 * @property {string} label - heading text.
 * @property {SidebarSession[]} rows - members, host list order.
 */

/**
 * Everything the chrome and scaffolding draw.
 * @typedef {object} SidebarShellData
 * @property {WorkspaceSummary[]} workspaces - selector options.
 * @property {string | null} selectedWorkspaceId - current scope; null is every workspace.
 * @property {Section[]} sections - rendered sections; empty when there are no rows.
 * @property {SidebarSession[]} sessions - every drawn row, in section order.
 * @property {number} sessionCount - rows drawn.
 * @property {number} pinnedCount - pinned rows drawn.
 * @property {number} archivedCount - host archive set size, hidden from the tree.
 * @property {string} phase - host list phase (`ready`, `loading`, …).
 */

export {}
