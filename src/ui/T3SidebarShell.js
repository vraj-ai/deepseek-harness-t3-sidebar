/**
 * The `sidebar.workspaces` occupant: T3's browsing region, with every row verb.
 *
 * Receives the seat's standard kit — `useSessions`, `useWorkspaces` and
 * `injectProps`' new-session entry point — plus the shell's owner share
 * (`wide`, `expandSidebar`). Everything crossing from a host snapshot is
 * validated in `adapter.js` first; this component only composes.
 *
 * Issue #7's verbs each land in one of two places:
 * - the app's own state, through the gateway (`ui/verbs.js`): rename, pin,
 *   archive/restore — the host's sets are the truth and the store mirrors them
 *   so the row is right between the reply and the next snapshot;
 * - the plugin's durable store (`src/adapter/store.ts`): snooze, settle/unsettle,
 *   the visit watermark, and the order keys a drag writes.
 *
 * The root's data attributes are the verification contract the probes assert:
 * `data-t3-sidebar` and `data-t3-sidebar-shell` (present, once per page),
 * `data-t3-sidebar-count` (rows drawn), `data-t3-section` +
 * `data-t3-section-count` (once per shelf), `data-t3-thread-id`,
 * `data-t3-row-density` and `data-t3-status` on each row, and
 * `data-t3-interaction="<action>"` on every control and menu item. None depend
 * on route or theme.
 * @module deepseek-harness-t3-sidebar/ui/T3SidebarShell
 */

import { createElement as h, useCallback, useEffect, useRef, useState } from 'react'
import { withMirrored } from '../adapter/store.ts'
import {
  DRAG_ACTIVATION_DISTANCE,
  canSettleThread,
  orderKeyFor,
  parseCustomSnooze,
  planDrop,
  resolveRename,
  snoozeChoices,
} from '../model/interactions.ts'
import {
  archiveSession,
  orderIntent,
  patchIntent,
  pinSession,
  settleIntent,
  snoozeIntent,
  unarchiveSession,
  unsettleIntent,
  unpinSession,
  unsnoozeIntent,
  visitIntent,
} from '../model/verbs.ts'
import { deriveShellData } from './adapter.js'
import { Chrome } from './Chrome.js'
import { ContextMenu } from './ContextMenu.js'
import { Sections } from './Sections.js'
import { installStyles, styles } from './styles.js'
import { loadStore, saveStore, subscribeStore, VERBS } from './verbs.js'

/**
 * @typedef {object} OwnerProps
 * @property {boolean} wide - shell fold-state: full browser versus the 56px rail.
 * @property {() => void} expandSidebar - request the shell expand the column.
 */

/**
 * @typedef {object} InjectedProps
 * @property {(workspaceId?: string) => void | Promise<unknown>} startSession - create a session.
 */

/**
 * @typedef {object} StandardProps
 * @property {<T,>(selector: (list: unknown) => T) => T} useSessions - session list selector hook.
 * @property {<T,>(selector: (snapshot: unknown) => T) => T} useWorkspaces - workspace snapshot selector hook.
 */

/**
 * The stored intent, plus a writer that persists before it renders. A refused
 * write leaves the old state in place, so an action that could not persist never
 * shows as done.
 * @returns {[import('../adapter/store.ts').SidebarIntentState, (fold: (state: import('../adapter/store.ts').SidebarIntentState) => import('../adapter/store.ts').SidebarIntentState) => boolean]} state and writer.
 */
function useIntentStore() {
  const [state, setState] = useState(loadStore)
  useEffect(() => subscribeStore(setState), [])
  const write = useCallback((fold) => {
    const next = fold(loadStore())
    if (!saveStore(next)) return false
    setState(next)
    return true
  }, [])
  return [state, write]
}

/** The current ISO instant; T3 stamps every verb with the wall clock. */
const nowIso = () => new Date().toISOString()

/**
 * Render the browsing region.
 * @param {OwnerProps & InjectedProps & StandardProps} props - seat share, actions and hooks.
 * @returns {import('react').ReactElement} the region.
 */
export function T3SidebarShell({ wide, expandSidebar, startSession, useSessions, useWorkspaces }) {
  installStyles()
  const sessions = useSessions((list) => list)
  const workspaces = useWorkspaces((snapshot) => snapshot)
  // T3 keeps the project scope in persisted UI state (Sidebar.tsx:2851-2859);
  // this slice keeps it in the seat's own lifetime and clears it on reload.
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(/** @type {string | null} */ (null))
  const [settledRevealed, setSettledRevealed] = useState(0)
  const [query, setQuery] = useState('')
  const [intent, writeIntent] = useIntentStore()
  const [editingId, setEditingId] = useState(/** @type {string | null} */ (null))
  const [draft, setDraft] = useState('')
  const [menu, setMenu] = useState(
    /** @type {{ rowId: string, x: number | null, y: number | null } | null} */ (null),
  )
  const [notice, setNotice] = useState(/** @type {{ text: string, undo: string } | null} */ (null))
  const [draggingId, setDraggingId] = useState(/** @type {string | null} */ (null))
  const [dropAt, setDropAt] = useState(/** @type {{ id: string, half: 'before' | 'after' } | null} */ (null))
  const [help, setHelp] = useState(false)
  // T3 wakes a snoozed row the moment its time passes (`threadSettled.ts:250-262`)
  // and redraws on a minute cadence; one re-render a minute mirrors that.
  const [, setWakeTick] = useState(0)
  const stripped = useRef(/** @type {HTMLDivElement | null} */ (null))
  const drag = useRef(
    /** @type {{ id: string, x: number, y: number, moved: boolean, target: { id: string, half: 'before' | 'after' } | null } | null} */ (null),
  )

  const data = deriveShellData({
    intent,
    extraPinned: intent.mirrored.pinned,
    extraArchived: intent.mirrored.archived,
    sessions,
    workspaces,
    selectedWorkspaceId,
    unnamedWorkspaceLabel: 'Ungrouped',
    settledRevealed,
    query,
  })
  const rows = data.rows
  const rowOf = useCallback((id) => rows.find((row) => row.id === id) ?? null, [rows])
  const menuRow = menu === null ? null : rowOf(menu.rowId)
  const snoozedLive = rows.some((row) => row.section === 'snoozed')

  useEffect(() => {
    if (!snoozedLive) return undefined
    const timer = setInterval(() => setWakeTick((value) => value + 1), 30_000)
    return () => clearInterval(timer)
  }, [snoozedLive])

  useEffect(() => {
    if (notice !== null) stripped.current?.focus()
  }, [notice])

  // The drop a pointer left behind, applied from the render that follows it: a
  // handler fired from a listener effect would close over the shelves of an
  // earlier render, and a drop must land in the list that is on screen.
  const [pendingDrop, setPendingDrop] = useState(
    /** @type {{ id: string, target: { id: string, half: 'before' | 'after' }, dragging: string } | null} */ (null),
  )
  useEffect(() => {
    if (pendingDrop === null) return
    setPendingDrop(null)
    setDraggingId(null)
    const row = rows.find((candidate) => candidate.id === pendingDrop.id)
    const section =
      row === null ? undefined : data.sections.find((candidate) => candidate.key === row.section)
    if (row !== null && row !== undefined && section !== undefined) {
      writeOrder(row, pendingDrop.id, pendingDrop.target.id, pendingDrop.target.half, section)
    }
  }, [pendingDrop])

  const onStartSession = () => {
    const result =
      data.selectedWorkspaceId === null ? startSession() : startSession(data.selectedWorkspaceId)
    if (result instanceof Promise) result.catch((error) => console.warn('t3-sidebar: startSession failed', error))
  }

  /**
   * Stamp the visit watermark — T3's `thread.visit` (`useThreadActions.ts:202-236`).
   * The unread "Done" rule reads this instant (`Sidebar.logic.ts:714-728`).
   */
  const markVisited = (sessionId) =>
    writeIntent((state) => patchIntent(state, `dsh:${sessionId}`, visitIntent(nowIso())))

  const fail = (what, code) => setNotice({ text: `${what} failed (${code})`, undo: '' })

  const commitRename = async () => {
    const id = editingId
    setEditingId(null)
    if (id === null) return
    const row = rowOf(id)
    const current = row?.title ?? ''
    const decision = resolveRename({ draft, current })
    if (decision.kind !== 'commit') return
    const key = `dsh:${id}`
    const written = writeIntent((state) => ({
      ...state,
      mirrored: { ...state.mirrored, titles: { ...state.mirrored.titles, [key]: decision.title } },
    }))
    if (!written) return fail('Rename', 'storage')
    const result = await VERBS.rename(id, decision.title)
    if (result.ok) return undefined
    writeIntent((state) => {
      const titles = { ...state.mirrored.titles }
      if (current === '') delete titles[key]
      else titles[key] = current
      return { ...state, mirrored: { ...state.mirrored, titles } }
    })
    return fail('Rename', result.code)
  }

  const togglePin = async (row) => {
    setMenu(null)
    const pinning = !row.pinned
    const written = writeIntent((state) =>
      withMirrored(state, pinning ? pinSession(state.mirrored, row.id) : unpinSession(state.mirrored, row.id)),
    )
    if (!written) return
    const result = pinning ? await VERBS.pin(row.id) : await VERBS.unpin(row.id)
    if (!result.ok) {
      writeIntent((state) =>
        withMirrored(state, pinning ? unpinSession(state.mirrored, row.id) : pinSession(state.mirrored, row.id)),
      )
      fail(pinning ? 'Pin' : 'Unpin', result.code)
    }
  }

  const doArchive = async (row) => {
    setMenu(null)
    const written = writeIntent((state) => withMirrored(state, archiveSession(state.mirrored, row.id)))
    if (!written) return
    setNotice({ text: `Archived "${row.title === '' ? 'Untitled session' : row.title}"`, undo: row.id })
    const result = await VERBS.archive(row.id)
    if (!result.ok) {
      writeIntent((state) => withMirrored(state, unarchiveSession(state.mirrored, row.id)))
      fail('Archive', result.code)
    }
  }

  const undoArchive = async (sessionId) => {
    setNotice(null)
    writeIntent((state) => withMirrored(state, unarchiveSession(state.mirrored, sessionId)))
    const result = await VERBS.unarchive(sessionId)
    if (result.ok) return
    writeIntent((state) => withMirrored(state, archiveSession(state.mirrored, sessionId)))
    fail('Restore', result.code)
  }

  const snooze = (row, until) => {
    setMenu(null)
    writeIntent((state) => patchIntent(state, `dsh:${row.id}`, snoozeIntent(until, nowIso())))
  }

  const snoozeCustom = (row, value) => {
    const until = value === '' ? null : parseCustomSnooze(value, Date.now())
    if (until === null) {
      fail('Snooze', 'date must be in the future')
      return
    }
    snooze(row, until)
  }

  const unsnooze = (row) => {
    setMenu(null)
    writeIntent((state) => patchIntent(state, `dsh:${row.id}`, unsnoozeIntent()))
  }

  const toggleSettle = (row) => {
    setMenu(null)
    if (!canSettleThread()) return
    const settling = row.section !== 'settled'
    writeIntent((state) =>
      patchIntent(state, `dsh:${row.id}`, settling ? settleIntent(nowIso()) : unsettleIntent(nowIso())),
    )
  }

  /**
   * Write one drop: the plugin's order key for the shelf, then the app's own
   * account position when the row belongs to a workspace. The plan is built from
   * the shelves as they are now, so a drop is applied to what is on screen.
   * @param {import('./types.js').DrawnRow} row - the moved row.
   * @param {string} movedId - the row being moved.
   * @param {string} targetId - the row it lands beside.
   * @param {'before' | 'after'} half - which side.
   * @param {Section} section - the shelf the row is drawn in.
   */
  const writeOrder = (row, movedId, targetId, half, section) => {
    const plan = planDrop({
      order: section.rows.map((candidate) => candidate.id),
      movedId,
      targetId,
      half,
      sameSection: section.rows.some((candidate) => candidate.id === targetId),
    })
    if (plan.kind !== 'reorder') return
    const keyField = row.section === 'pinned' ? 'pinOrderKey' : 'activeOrderKey'
    const keyOf = (id) => {
      const candidate = rowOf(id)
      const value = candidate === null ? null : candidate.shell[keyField]
      return value ?? null
    }
    const key = orderKeyFor(plan.order, movedId, keyOf)
    writeIntent((state) => patchIntent(state, `dsh:${movedId}`, orderIntent(keyField, key)))
    // The active shelf also follows the app's own account order: T3's active
    // order keys are the browser's, and ui-workspace moves a row with
    // `workspaces.insertSessionBefore(workspaceId, sessionId, beforeSessionId)`.
    const owner = data.workspaces.find((workspace) => workspace.sessionIds.includes(movedId))
    if (owner === undefined) return
    const index = plan.order.indexOf(movedId)
    VERBS.move(movedId, plan.order[index + 1] ?? '').then((result) => {
      if (!result.ok) fail('Reorder', result.code)
    })
  }


  /** Keyboard reorder: Alt+ArrowUp/Down moves the focused row inside its shelf. */
  const moveRow = (row, direction) => {
    const section = data.sections.find((candidate) => candidate.key === row.section)
    if (section === undefined) return
    const index = section.rows.findIndex((candidate) => candidate.id === row.id)
    const target = section.rows[direction === 'up' ? index - 1 : index + 1]
    if (target === undefined) return
    writeOrder(row, row.id, target.id, direction === 'up' ? 'before' : 'after', section)
  }

  /**
   * A press that may become a drag: the pointer's start, kept off React state so
   * a press that never travels moves nothing.
   */
  const startDrag = (event, row) => {
    if (event.button !== 0 || editingId !== null) return
    drag.current = { id: row.id, x: event.clientX, y: event.clientY, moved: false, target: null }
  }

  // Pointer drag: a row header press past 6 px starts one, and the row under the
  // pointer picks the drop side (`rowHalf`). Listeners live on the document so a
  // drag survives the pointer leaving the row.
  useEffect(() => {
    const onMove = (event) => {
      const current = drag.current
      if (current === null) return
      if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < DRAG_ACTIVATION_DISTANCE) return
      current.moved = true
      if (draggingId !== current.id) setDraggingId(current.id)
      const under = /** @type {HTMLElement | null} */ (document.elementFromPoint(event.clientX, event.clientY))

      const item = under?.closest?.('[data-t3-row-item]') ?? null
      if (item === null) return
      const id = item.getAttribute('data-t3-row-item')

      if (id === null || id === current.id) return
      const rect = item.getBoundingClientRect()
      const half = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
      current.target = { id, half }
      setDropAt((previous) => (previous?.id === id && previous.half === half ? previous : { id, half }))
    }
    const onUp = () => {
      // The write waits for the next render: it closes over the shelves as they
      // are, and a drop must land in the list that is on screen.
      const current = drag.current
      drag.current = null
      if (current === null || !current.moved || current.target === null) {
        setDraggingId(null)
        setDropAt(null)
        return
      }
      setPendingDrop({ id: current.id, target: current.target, dragging: current.id })
      setDraggingId(null)
      setDropAt(null)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }
  })

  /** ⌘1-9: open the row the hint numbers (`Sidebar.tsx:3054-3063`). */
  const jumpTo = (index) => {
    const row = rows.find((candidate) => candidate.jumpLabel === String(index))
    if (row === undefined) return
    markVisited(row.id)
    // The seat owns no navigation verb; reveal the row by scrolling it into
    // view and focusing it, and leave opening to the app's own row click.
    const element = root.current?.querySelector(`[data-t3-thread-id="${row.id}"]`)
    /** @type {HTMLElement | null} */ (element)?.scrollIntoView?.({ block: 'nearest' })
    /** @type {HTMLElement | null} */ (element)?.focus?.()
  }

  // Keyboard shortcuts: the column's own, T3's ⌘F / ⌘K search and ⌘1-9 jumps
  // plus a help sheet. Ignored while a field or a menu has focus.
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = /** @type {HTMLElement | null} */ (event.target)
      if (target !== null && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.isContentEditable)) return
      const meta = event.metaKey || event.ctrlKey
      if (meta && (event.key === 'f' || event.key === 'k')) {
        event.preventDefault()
        setQuery('')
        root.current?.querySelector('input[data-t3-control="search"]')?.focus()
        return
      }
      if (meta && /^[1-9]$/.test(event.key)) {
        event.preventDefault()
        jumpTo(Number(event.key))
        return
      }
      if (event.key === '?') {
        event.preventDefault()
        setHelp((open) => !open)
        return
      }
      if (event.key === 'Escape') {
        setHelp(false)
        setMenu(null)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  const startRename = (row) => {
    setMenu(null)
    setEditingId(row.id)
    setDraft(row.title)
  }

  /** The items the row menu carries — the same verbs as the row's own controls. */
  const menuItems = (row) => {
    if (row === null) return []
    /** @type {import('./ContextMenu.js').MenuItem[]} */
    const items = [
      {
        action: 'rename',
        label: 'Rename',
        hint: 'Enter',
        run: () => startRename(row),
      },
      {
        action: row.pinned ? 'unpin' : 'pin',
        label: row.pinned ? 'Unpin' : 'Pin',
        checked: row.pinned,
        run: () => togglePin(row),
      },
    ]
    if (row.section === 'snoozed') {
      items.push({ action: 'unsnooze', label: 'Unsnooze', run: () => unsnooze(row) })
    } else {
      for (const choice of snoozeChoices(new Date())) {
        items.push({
          action: `snooze:${choice.id}`,
          label: `Snooze — ${choice.label}`,
          hint: choice.whenLabel,
          run: () => snooze(row, choice.until),
        })
      }
      items.push({
        action: 'snooze:custom',
        label: 'Snooze — custom…',
        run: () => {
          const answer = typeof window.prompt === 'function' ? window.prompt('Wake at (YYYY-MM-DDTHH:mm)', '') : null
          if (typeof answer === 'string') snoozeCustom(row, answer)
        },
      })
    }
    items.push({
      action: row.section === 'settled' ? 'unsettle' : 'settle',
      label: row.section === 'settled' ? 'Unsettle' : 'Settle',
      run: () => toggleSettle(row),
    })
    items.push({ action: 'archive', label: 'Archive', run: () => doArchive(row) })
    return items
  }

  const handlers = {
    onOpen: (row) => {
      if (row === null) return
      markVisited(row.id)
      setMenu(null)
    },
    onMenu: (row, trigger) => {
      const rect = trigger?.getBoundingClientRect?.() ?? null
      setMenu({ rowId: row.id, x: rect === null ? null : rect.left, y: rect === null ? null : rect.bottom + 2 })
    },
    editingId,
    draft,
    onDraft: setDraft,
    onCommit: () => {
      void commitRename()
    },
    onCancel: () => setEditingId(null),
    onMove: moveRow,
    onDragStart: startDrag,
    draggingId,
    dropAt,
  }

  return h(
    'div',
    {
      ref: root,
      className: styles.root,
      'data-t3-sidebar': '',
      'data-t3-sidebar-shell': '',
      'data-t3-sidebar-count': String(data.sessionCount),
      'data-t3-sidebar-pinned': String(data.pinnedCount),
      'data-t3-sidebar-archived': String(data.archivedCount),
      'data-t3-sidebar-hidden-settled': String(data.hiddenSettled),
      'data-t3-sidebar-wide': String(wide),
      'data-t3-sidebar-phase': data.phase,
      'data-t3-sidebar-query': data.query,
      'data-t3-sidebar-drop': data.droppedBySearch,
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
      onQuery: setQuery,
      onClearQuery: () => setQuery(''),
    }),
    h(Sections, {
      sections: data.sections,
      wide,
      phase: data.phase,
      workspaces: data.workspaces,
      hiddenSettled: data.hiddenSettled,
      onShowMore: () => setSettledRevealed((revealed) => revealed + 1),
      handlers,
      searchActive: data.searchNarrowed,
    }),
    notice === null
      ? null
      : h(
          'div',
          { className: styles.notice, 'data-t3-notice': '', tabIndex: -1 },
          h('span', { className: styles.noticeText, 'data-t3-notice-text': '' }, notice.text),
          notice.undo === ''
            ? null
            : h(
                'button',
                {
                  type: 'button',
                  className: styles.noticeButton,
                  'data-t3-interaction': 'undo-archive',
                  onClick: () => {
                    void undoArchive(notice.undo)
                  },
                },
                'Undo',
              ),
          h(
            'button',
            {
              type: 'button',
              className: styles.noticeButton,
              'aria-label': 'Dismiss notice',
              'data-t3-interaction': 'dismiss-notice',
              onClick: () => setNotice(null),
            },
            '×',
          ),
        ),
    menuRow === null
      ? null
      : h(
          'div',
          {
            'data-t3-menu-anchor': menuRow.id,
            onContextMenu: (event) => {
              // A right click inside the menu must not open a second one.
              event.preventDefault()
            },
            style: {
              position: 'fixed',
              left: menu?.x ?? 12,
              top: menu?.y ?? 12,
              zIndex: 60,
            },
          },
          h(ContextMenu, {
            items: menuItems(menuRow),
            label: 'Session actions',
            onClose: () => setMenu(null),
          }),
        ),
    help ? h(HelpDialog, { onClose: () => setHelp(false) }) : null,
  )
}

/** The keyboard sheet (`?`): every shortcut the column owns. */
function HelpDialog({ onClose }) {
  /** @type {ReadonlyArray<[string, string]>} */
  const entries = [
    ['⌘1 - ⌘9', 'Open the numbered session'],
    ['⌘F / ⌘K', 'Focus search'],
    ['Enter', 'Commit a rename'],
    ['Escape', 'Cancel a rename, clear search, close a menu'],
    ['Alt+↑ / Alt+↓', 'Move the focused session in its section'],
    ['↩ (row menu)', 'Rename, pin, snooze, settle, archive'],
  ]
  return h(
    'div',
    { className: styles.dialogBackdrop, 'data-t3-help': '' },
    h(
      'div',
      { className: styles.dialog, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Keyboard shortcuts' },
      h('div', { className: styles.dialogTitle }, 'Keyboard shortcuts'),
      entries.map(([key, label]) =>
        h('div', { key, className: styles.dialogRow }, h('span', {}, label), h('span', { className: styles.dialogKey }, key)),
      ),
      h(
        'button',
        {
          type: 'button',
          className: styles.noticeButton,
          'data-t3-interaction': 'close-help',
          onClick: onClose,
          autoFocus: true,
        },
        'Close',
      ),
    ),
  )
}
