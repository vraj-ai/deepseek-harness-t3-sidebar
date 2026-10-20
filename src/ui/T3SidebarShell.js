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
 *
 * Row actions dispatch commands to the plugin's durable intent (`useIntent`);
 * the list re-derives from the state they return. Cmd/Ctrl+1-9 jumps to the
 * first nine rows in the order they are drawn.
 * @module deepseek-harness-t3-sidebar/ui/T3SidebarShell
 */

import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readIntent } from '../adapter/store.ts'
import { canSearchThreadMessages } from '../model/sidebar.ts'
import { deriveShellData, nextTickDelay } from './adapter.js'
import { Chrome } from './Chrome.js'
import { ContextMenu, UndoToast } from './Overlays.js'
import { commandFor, jumpTarget, menuEntries, reorderCommand } from './rowActions.js'
import { Sections } from './Sections.js'
import { installStyles, styles } from './styles.js'
import { useIntent } from './useIntent.js'

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
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState(/** @type {import('./Overlays.js').MenuState | null} */ (null))
  const [renamingId, setRenaming] = useState(/** @type {string | null} */ (null))
  const [toast, setToast] = useState(/** @type {{ message: string, serial: number, undo: import('../adapter/intent.ts').IntentCommand } | null} */ (null))
  const [modHeld, setModHeld] = useState(false)
  // T3 keeps snooze/settle/visit/rename/archive on its server shell and DSH has
  // no equivalent, so the plugin's own durable store carries them.
  const intentStore = useIntent()
  const intent = intentStore.state
  // Shelves, wakes and durations read the clock, so it is state here: each tick re-derives.
  // A snapshot arriving between ticks is read at its own arrival, not the last tick;
  // a tick counts only for the snapshot it was taken under, so a clock stepped back stays followed.
  const snapshot = useMemo(() => ({ ms: Date.now() }), [sessions, workspaces])
  const [tick, setTick] = useState(() => ({ ms: Date.now(), snapshot }))
  const nowMs = tick.snapshot === snapshot ? tick.ms : snapshot.ms
  const data = deriveShellData({
    intent,
    sessions,
    workspaces,
    selectedWorkspaceId,
    unnamedWorkspaceLabel: 'Ungrouped',
    settledRevealed,
    query,
    nowMs,
  })
  const delay = nextTickDelay(data.rows, nowMs)
  useEffect(() => {
    const timer = setTimeout(() => setTick({ ms: Date.now(), snapshot }), delay)
    return () => clearTimeout(timer)
  }, [tick, snapshot, delay])

  const hintsRef = useRef(data.jumpHints)
  hintsRef.current = data.jumpHints
  useEffect(() => {
    const syncModifier = (/** @type {KeyboardEvent} */ event) => setModHeld(event.metaKey || event.ctrlKey)
    const onKeyDown = (/** @type {KeyboardEvent} */ event) => {
      syncModifier(event)
      const id = jumpTarget(event, hintsRef.current)
      if (id === null) return
      event.preventDefault()
      openSession(id)
    }
    const clearModifier = () => setModHeld(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', syncModifier)
    window.addEventListener('blur', clearModifier)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', syncModifier)
      window.removeEventListener('blur', clearModifier)
    }
  }, [openSession])

  const run = (id, sessionId, arg) => {
    const command = commandFor(id, sessionId, arg)
    if (command === null) return
    if (id === 'archive') {
      const title = data.rows.find((row) => row.id === sessionId)?.view.title ?? ''
      setToast({
        message: title === '' ? 'Archived session' : `Archived “${title}”`,
        serial: Date.now(),
        undo: { type: 'restore', key: command.key, intent: readIntent(intentStore.get(), command.key) },
      })
    }
    intentStore.dispatch(command, new Date().toISOString())
  }
  const undo = () => {
    if (toast === null) return
    intentStore.dispatch(toast.undo, new Date().toISOString())
    setToast(null)
  }
  const dismissToast = useCallback(() => setToast(null), [])
  const closeMenu = useCallback(() => setMenu(null), [])
  const menuRow = menu === null ? undefined : data.rows.find((row) => row.id === menu.sessionId)
  const nowIso = new Date(nowMs).toISOString()
  const actions = {
    open: openSession,
    run,
    openMenu: (sessionId, at) => setMenu({ sessionId, ...at }),
    renamingId,
    setRenaming,
    reorder: (shelfIds, movedId, beforeId) => {
      const command = reorderCommand(shelfIds, movedId, beforeId)
      if (command !== null) intentStore.dispatch(command, new Date().toISOString())
    },
    reorderable: !canSearchThreadMessages(query),
    hints: new Map(data.jumpHints.map((hint) => [hint.id, hint.label])),
    showHints: modHeld,
    now: nowIso,
  }

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
      'data-t3-sidebar-query': query,
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
      query,
      onQueryChange: setQuery,
    }),
    h(Sections, {
      sections: data.sections,
      wide,
      phase: data.phase,
      hiddenSettled: data.hiddenSettled,
      matchedNothing: data.matchedNothing,
      onShowMore: () => setSettledRevealed((revealed) => revealed + 1),
      actions,
    }),
    menu === null || menuRow === undefined
      ? null
      : h(ContextMenu, {
          menu,
          entries: menuEntries(menuRow, nowIso),
          nowMs,
          onClose: closeMenu,
          onChoose: (id) => {
            setMenu(null)
            if (id === 'rename') setRenaming(menu.sessionId)
            else run(id, menu.sessionId)
          },
          onSnooze: (until) => {
            setMenu(null)
            run('snooze', menu.sessionId, until)
          },
        }),
    toast === null ? null : h(UndoToast, { toast, onUndo: undo, onDismiss: dismissToast }),
  )
}
