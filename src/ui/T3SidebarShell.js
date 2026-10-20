/**
 * The `sidebar.workspaces` occupant: T3's browsing region.
 *
 * Receives the seat's standard kit — `useSessions`, `useWorkspaces` — the
 * navigation actions `seat.js` injects, and the shell's owner share (`wide`,
 * `expandSidebar`). Everything crossing from a host snapshot is
 * validated in `adapter.js` first; this component only composes.
 *
 * The root's data attributes are the verification contract the shell probe
 * asserts: `data-t3-sidebar` and `data-t3-sidebar-shell` (present, once per
 * page), `data-t3-sidebar-count` (rows drawn), `data-t3-section` (once per
 * section) and `data-t3-thread-id` (once per row). None depend on route or theme.
 * @module deepseek-harness-t3-sidebar/ui/T3SidebarShell
 */

import { createElement as h, useState } from 'react'
import { deriveShellData } from './adapter.js'
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
 * The scope a fresh mount starts in.
 * @returns {string | null} null, every workspace.
 */
const everyWorkspace = () => null

/**
 * Render the browsing region.
 * @param {OwnerProps & InjectedProps & StandardProps} props - seat share, actions and hooks.
 * @returns {import('react').ReactElement} the region.
 */
export function T3SidebarShell({ wide, expandSidebar, startSession, openSession, useSessions, useWorkspaces }) {
  installStyles()
  const sessions = useSessions((list) => list)
  const workspaces = useWorkspaces((snapshot) => snapshot)
  // ponytail: the selection lives as long as this mount; persisting it across
  // reloads lands with issue #6's rows.
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(everyWorkspace)
  const data = deriveShellData({
    sessions,
    workspaces,
    selectedWorkspaceId,
    unnamedWorkspaceLabel: 'Ungrouped',
  })

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
      'data-t3-sidebar-wide': String(wide),
      'data-t3-sidebar-phase': data.phase,
      'aria-label': 'Sessions',
      role: 'region',
    },
    h(Chrome, {
      workspaces: data.workspaces,
      selectedWorkspaceId: data.selectedWorkspaceId,
      onSelectWorkspace: setSelectedWorkspaceId,
      onStartSession,
      wide,
      busy: data.phase !== 'ready',
      onExpand: expandSidebar,
    }),
    h(Sections, { sections: data.sections, wide, phase: data.phase, onOpen: openSession }),
  )
}
