/**
 * The `sidebar.workspaces` occupant: T3's browsing region.
 *
 * Receives the seat's standard kit — `useSessions`, `useWorkspaces` — the
 * navigation actions `seat.js` injects, and the shell's owner share (`wide`,
 * `expandSidebar`). Everything crossing from a host snapshot is
 * validated in `adapter.js` first; this component only composes.
 *
 * The root's data attributes are the verification contract the probes assert:
 * `data-t3-sidebar` and `data-t3-sidebar-shell` (present, once per page),
 * `data-t3-sidebar-count` (rows drawn), `data-t3-sidebar-projections` (JSON
 * `t3Sidebar` value per listed session, which the projection probe reads),
 * `data-t3-section` + `data-t3-section-count` (once per shelf), and on each row
 * `data-t3-thread-id`, `data-t3-row-density` and `data-t3-status`. None depend
 * on route or theme.
 * @module deepseek-harness-t3-sidebar/ui/T3SidebarShell
 */

import { createElement as h, useEffect, useMemo, useState } from 'react'
import { emptyIntentState, parseSidebarIntentState, STORE_KEY } from '../adapter/store.ts'
import { deriveShellData, nextTickDelay } from './adapter.js'
import { Chrome } from './Chrome.js'
import { Sections } from './Sections.js'
import { installStyles, styles } from './styles.js'

/**
 * @typedef {object} OwnerProps
 * @property {boolean} wide - shell fold-state: full browser versus the 56px rail.
 * @property {() => void} expandSidebar - request the shell expand the column.
 */

/** @typedef {import('./seat.js').SeatActions} InjectedProps */

/**
 * @typedef {object} StandardProps
 * @property {<T,>(selector: (list: unknown) => T) => T} useSessions - session list selector hook.
 * @property {<T,>(selector: (snapshot: unknown) => T) => T} useWorkspaces - workspace snapshot selector hook.
 */

/**
 * The plugin's durable intent store, read and validated. A page without storage
 * (or with a corrupt record) yields the empty state, never a throw.
 * @returns {import('../adapter/store.ts').SidebarIntentState} the stored intent.
 */
function readIntentState() {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORE_KEY)
    return raw === null ? emptyIntentState() : parseSidebarIntentState(JSON.parse(raw))
  } catch {
    return emptyIntentState()
  }
}

/**
 * Render the browsing region.
 * @param {OwnerProps & InjectedProps & StandardProps} props - seat share, actions and hooks.
 * @returns {import('react').ReactElement} the region.
 */
export function T3SidebarShell({ wide, expandSidebar, startSession, openSession, useSessions, useWorkspaces }) {
  installStyles()
  const sessions = useSessions((list) => list)
  const workspaces = useWorkspaces((snapshot) => snapshot)
  // T3 keeps the project scope in persisted UI state (Sidebar.tsx:2851-2859);
  // this slice keeps it in the seat's own lifetime and clears it on reload.
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(/** @type {string | null} */ (null))
  const [settledRevealed, setSettledRevealed] = useState(0)
  // The intent store is not wired to this seat yet: T3 keeps snooze/settle/visit
  // on its server shell and DSH has no equivalent, so the plugin's own store
  // (`src/adapter/store.ts`) is read here, once per mount.
  // ponytail: a mount-time read, not a subscription; wire the store's writer
  // when issue #7 adds the row actions that mutate it.
  const [intent] = useState(() => readIntentState())
  // Shelves, wakes and durations read the clock, so it is state here: each tick re-derives.
  // A snapshot arriving between ticks is read at its own arrival, not the last tick.
  const [tickMs, setTickMs] = useState(() => Date.now())
  const snapshotMs = useMemo(() => Date.now(), [sessions, workspaces])
  const nowMs = Math.max(tickMs, snapshotMs)
  const data = deriveShellData({
    intent,
    sessions,
    workspaces,
    selectedWorkspaceId,
    unnamedWorkspaceLabel: 'Ungrouped',
    settledRevealed,
    nowMs,
  })
  const delay = nextTickDelay(data.rows, nowMs)
  useEffect(() => {
    const timer = setTimeout(() => setTickMs(Date.now()), delay)
    return () => clearTimeout(timer)
  }, [tickMs, nowMs, delay])

  const onStartSession = () => {
    if (data.selectedWorkspaceId === null) startSession()
    else startSession(data.selectedWorkspaceId)
  }

  return h(
    'div',
    {
      className: styles.root,
      'data-t3-sidebar': '',
      'data-t3-sidebar-shell': '',
      'data-t3-sidebar-count': String(data.sessionCount),
      'data-t3-sidebar-pinned': String(data.pinnedCount),
      'data-t3-sidebar-archived': String(data.archivedCount),
      'data-t3-sidebar-hidden-settled': String(data.hiddenSettled),
      'data-t3-sidebar-projections': JSON.stringify(data.projections),
      'data-t3-sidebar-wide': String(wide),
      'data-t3-sidebar-phase': data.phase,
      'aria-label': 'Sessions',
      role: 'region',
    },
    h(Chrome, {
      workspaces: data.workspaces,
      selectedWorkspaceId: data.selectedWorkspaceId,
      onSelectWorkspace: (workspaceId) => {
        setSelectedWorkspaceId(workspaceId)
        setSettledRevealed(0)
      },
      onStartSession,
      wide,
      busy: data.phase !== 'ready',
      onExpand: expandSidebar,
    }),
    h(Sections, {
      sections: data.sections,
      wide,
      phase: data.phase,
      hiddenSettled: data.hiddenSettled,
      onShowMore: () => setSettledRevealed((revealed) => revealed + 1),
      onOpen: openSession,
    }),
  )
}
