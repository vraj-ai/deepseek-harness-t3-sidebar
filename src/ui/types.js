/**
 * The shell's own types. The host's shapes stop at `adapter.js`; everything from
 * there inward is defined here.
 * @module deepseek-harness-t3-sidebar/ui/types
 */

/**
 * The `t3Sidebar` projection's outcome as the shell draws it; the model calls a
 * successful turn `completed`, the seat's published marker calls it `ok`.
 * @typedef {'ok' | 'failed' | 'interrupted'} Outcome
 */

/**
 * One session's `t3Sidebar` value, validated.
 * @typedef {object} T3Projection
 * @property {number | null} lastUserMessageAt - ms epoch of the last prompt.
 * @property {number | null} lastTurnStartedAt - ms epoch.
 * @property {number | null} lastTurnCompletedAt - ms epoch, or null while a turn runs.
 * @property {Outcome | null} outcome - terminal outcome of the last turn.
 * @property {string | null} errorClass - machine code behind a failure or interruption.
 */

/**
 * One row as the list draws it: the compact session plus the model's
 * derivation. `shell`, `view`, `density` and `status` come from `src/model/**`.
 * @typedef {object} DrawnRow
 * @property {import('../model/types.ts').SidebarThreadShell} shell - the adapted shell.
 * @property {import('../model/rowText.ts').RowView} view - title, times, stack, goal, queue.
 * @property {import('../model/rowStatus.ts').RowDensity} density - 82 px card or 36 px slim.
 * @property {import('../model/rowStatus.ts').RowStatus} status - the status slot's state.
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
 * @property {boolean} open - the main view shows this session.
 * @property {T3Projection | null} projection - `t3Sidebar` value when present.
 */

/**
 * One workspace the selector offers.
 * @typedef {object} WorkspaceSummary
 * @property {string} workspaceId - host workspace id.
 * @property {string} title - display title.
 * @property {readonly string[]} sessionIds - member sessions, host order.
 * @property {string | null} cwd - the workspace directory, when the host reports it.
 */

/**
 * A drawn shelf: T3's section name, the density its rows use, and its rows
 * already sorted by that shelf's own rule.
 * @typedef {object} Section
 * @property {'pinned' | 'working' | 'snoozed' | 'settled' | 'active'} key - stable marker suffix.
 * @property {string} label - heading text.
 * @property {import('../model/rowStatus.ts').RowDensity} density - card or slim.
 * @property {DrawnRow[]} rows - members, in this shelf's sort order.
 * @property {number} hidden - settled rows folded past the tail (0 elsewhere).
 */

/**
 * Everything the chrome and scaffolding draw.
 * @typedef {object} SidebarShellData
 * @property {WorkspaceSummary[]} workspaces - selector options.
 * @property {string | null} selectedWorkspaceId - current scope; null is every workspace.
 * @property {Section[]} sections - rendered sections; empty when there are no rows.
 * @property {DrawnRow[]} rows - every drawn row, in section order.
 * @property {DrawnRow[]} sessions - the same rows; the shell's published name for them.
 * @property {number} sessionCount - rows drawn.
 * @property {number} hiddenSettled - settled rows the tail folded away.
 * @property {number} pinnedCount - pinned rows drawn.
 * @property {number} archivedCount - host archive set size, hidden from the tree.
 * @property {Record<string, T3Projection>} projections - `t3Sidebar` value per listed session, drawn or not.
 * @property {string} phase - host list phase (`ready`, `loading`, …).
 */

export {}
