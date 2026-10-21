/**
 * The list: T3's shelves, and the rows inside them at T3's densities.
 *
 * A card is 82 px (78 px of content plus 4 px of vertical padding) and carries
 * the project and status line, the title, then branch and provider stack. A slim
 * row is 36 px on one line. Shelves are 32 px headers, rows are 1 px apart, and
 * the section order and headings are T3's (`Sidebar.tsx:2278`, `#2110`, `#4782`,
 * `ui/collapsible-section-header.tsx:31`, `Sidebar.tsx:3526-3565`).
 *
 * Every row is a real `<button>` inside its section, so it has a role and an
 * accessible name the verification harness resolves. Beside it sit the hover
 * actions (pin, archive); a right-click opens the full menu, a double-click or F2
 * renames in place, and a pinned row drags (or Alt+arrows) within its shelf.
 *
 * The markers are the verification contract:
 * - `data-t3-section` + `data-t3-section-count` on each shelf,
 * - `data-t3-thread-id` on each row,
 * - `data-t3-row-density="card|slim"` on each row,
 * - `data-t3-status="<status>"` on each row (the same value on its status line),
 * - `data-t3-jump-hint="1-9"` on each of the first nine rows,
 * - `data-t3-row-action="pin|unpin|archive"` on each hover action,
 * - `data-t3-rename` on the inline rename field.
 * @module deepseek-harness-t3-sidebar/ui/Sections
 */

import { createElement as h, useRef, useState } from 'react'
import { STATUS_PRESENTATION } from '../model/rowText.ts'
import { ArchiveIcon, ChevronIcon, GoalIcon, PinIcon, QueueIcon, StatusGlyph } from './icons.js'
import { keyboardMoveTarget } from './rowActions.js'
import { styles } from './styles.js'

/**
 * @typedef {import('./types.js').Section} Section
 * @typedef {import('./types.js').DrawnRow} Row
 * @typedef {import('../model/rowStatus.ts').RowDensity} RowDensity
 */

/**
 * The text a row paints: the host title, or the placeholder for a session that
 * has none yet. Kept exported: issue #4's tests pin it.
 * @param {{ title: string }} session - the session.
 * @returns {string} the visible text.
 */
export function rowText(session) {
  return session.title !== '' ? session.title : 'Untitled session'
}

/**
 * The project a row names on its top line: its workspace's title, else the
 * shell's own project (the session's directory name, or its title).
 * @param {import('./types.js').WorkspaceSummary | null} workspace - owning workspace.
 * @param {Row} row - the row.
 * @returns {string} project name, possibly empty.
 */
export function projectLabel(workspace, row) {
  return workspace?.title ?? row.shell.projectId ?? row.shell.title
}

/** Tone class for a status, from the model's presentation table. */
function toneClass(kind) {
  return kind === 'settled' || kind === 'none' ? '' : styles[`tone${capitalise(STATUS_PRESENTATION[kind].tone)}`]
}

function capitalise(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * The status slot: T3's label plus, for a working row, its ticking duration;
 * otherwise the compact relative time (`Sidebar.tsx:1666-1715`, `#837-839`).
 * @param {{ row: Row }} props - the row.
 * @returns {import('react').ReactElement} the slot.
 */
function StatusLine({ row }) {
  const { status, workingDuration, relativeTime, goalLabel } = row.view
  if (status.visible) {
    const tone = toneClass(status.kind)
    return h(
      'span',
      { className: `${styles.rowStatus} ${tone}`, 'data-t3-status': status.kind },
      h(StatusGlyph, { name: STATUS_PRESENTATION[status.kind].glyph }),
      h('span', { className: styles.rowStatusLabel }, goalLabel ?? status.label),
      workingDuration === null ? null : h('span', { className: styles.rowStatusDuration }, workingDuration),
    )
  }
  return h(
    'span',
    { className: `${styles.rowStatus} ${styles.toneMuted}`, 'data-t3-status': 'ready' },
    relativeTime === null ? null : h('span', { className: styles.rowStatusDuration }, relativeTime),
  )
}

/**
 * One card: project + status line, title, then goal/queue and the provider
 * stack (`Sidebar.tsx:2278-2497`).
 *
 * T3 puts the branch on this line; DSH's session list carries no branch, and
 * this seat gets no Git status (`useGitStatus` is a seat of its own), so the
 * line leads with the goal and queue markers until issue #2 supplies a branch.
 * @param {{ row: Row, project: string }} props - the row and its project name.
 * @returns {import('react').ReactElement} the card's content.
 */
function CardContent({ row, project }) {
  const { view, status } = row
  return h(
    'span',
    { className: styles.cardInner },
    h(
      'span',
      { className: styles.cardTop },
      project === '' ? h('span', { className: styles.cardProject }) : h('span', { className: styles.cardProject, 'data-t3-project': '' }, project),
      row.pinned
        ? h('span', { className: styles.pin, 'aria-hidden': 'true', 'data-t3-pin': '' }, h(PinIcon, {}))
        : null,
      h(StatusLine, { row }),
    ),
    h('span', { className: styles.cardTitle }, row.view.title),
    h(
      'span',
      { className: styles.cardMeta },
      view.goalLabel === null
        ? null
        : h(
            'span',
            { className: `${styles.cardMetaItem} ${styles.toneInfo}`, 'data-t3-goal': '' },
            h(GoalIcon, {}),
            h('span', { className: styles.cardMetaText }, 'Goal'),
          ),
      view.queued === 0
        ? null
        : h(
            'span',
            { className: `${styles.cardMetaItem} ${styles.toneWarn}`, 'data-t3-queued': String(view.queued) },
            h(QueueIcon, {}),
            h('span', { className: styles.cardMetaText }, `${view.queued} queued`),
          ),
      view.stack === '' ? null : h(
        'span',
        { className: `${styles.stack} ${styles.cardMetaRight}`, 'data-t3-provider-stack': view.stack },
        view.stackEntries.map((entry, index) =>
          h(
            'span',
            {
              key: `${entry.provider}/${entry.model}`,
              className: index === view.stackEntries.length - 1 ? styles.stackCurrent : styles.stackPrevious,
            },
            `${entry.provider}/${entry.model}`,
          ),
        ),
      ),
    ),
  )
}

/**
 * One slim row: the title, then the wake or relative time (`Sidebar.tsx:2088-2243`).
 * @param {{ row: Row, project: string }} props - the row.
 * @returns {import('react').ReactElement} the row's content.
 */
function SlimContent({ row, project }) {
  return h(
    'span',
    { className: styles.slimInner },
    project === '' ? null : h('span', { className: `${styles.cardProject} ${styles.slimProject}`, 'data-t3-project': '' }, project),
    h('span', { className: styles.slimTitle }, row.view.title),
    row.pinned ? h('span', { className: styles.pin, 'aria-hidden': 'true', 'data-t3-pin': '' }, h(PinIcon, {})) : null,
    h(
      'span',
      { className: styles.slimTail, 'data-t3-status': row.status.kind },
      row.view.tailTime === null ? project : h('span', { className: styles.rowStatusDuration }, row.view.tailTime),
    ),
  )
}

/**
 * What the list can do to a row; the shell supplies it.
 * @typedef {object} ListActions
 * @property {(sessionId: string) => void} open - show a row's session.
 * @property {(id: import('./rowActions.js').MenuEntry['id'], sessionId: string, arg?: string) => void} run - dispatch a menu choice.
 * @property {(sessionId: string, at: { x: number, y: number }) => void} openMenu - open the context menu.
 * @property {string | null} renamingId - the row being renamed in place.
 * @property {(sessionId: string | null) => void} setRenaming - start or stop a rename.
 * @property {(shelfIds: readonly string[], movedId: string, beforeId: string | null) => void} reorder - land a pinned row.
 * @property {boolean} reorderable - drag is on; off while a search narrows the list.
 * @property {ReadonlyMap<string, string>} hints - session id to jump label.
 * @property {boolean} showHints - draw the labels (the modifier is held).
 * @property {string} now - ISO instant the menu entries are resolved against.
 */

/**
 * The inline rename field. Enter or leaving the field commits, Escape cancels;
 * a blank value clears the rename and the host's title shows again.
 * @param {{ row: Row, onDone: (title: string | null) => void }} props - the row; `null` cancels.
 * @returns {import('react').ReactElement} the field.
 */
function RenameField({ row, onDone }) {
  const finished = useRef(false)
  const finish = (/** @type {string | null} */ title) => {
    if (finished.current) return
    finished.current = true
    onDone(title)
  }
  return h('input', {
    type: 'text',
    className: styles.renameInput,
    defaultValue: row.title,
    autoFocus: true,
    'aria-label': 'Rename session',
    'data-t3-rename': row.id,
    onFocus: (event) => event.currentTarget.select(),
    onBlur: (event) => finish(event.currentTarget.value),
    onKeyDown: (event) => {
      if (event.key === 'Enter') finish(event.currentTarget.value)
      else if (event.key === 'Escape') finish(null)
    },
  })
}

/**
 * The hover actions beside a row's button.
 * @param {{ row: Row, actions: ListActions }} props - the row and what it can do.
 * @returns {import('react').ReactElement} the buttons.
 */
function HoverActions({ row, actions }) {
  const pinAction = row.pinned ? 'unpin' : 'pin'
  const label = row.pinned ? 'Unpin' : 'Pin'
  return h(
    'span',
    { className: styles.rowActions, 'data-t3-row-actions': '' },
    h(
      'button',
      {
        type: 'button',
        className: styles.rowAction,
        'aria-label': `${label} ${rowText(row)}`,
        title: label,
        'data-t3-row-action': pinAction,
        onClick: () => actions.run(pinAction, row.id),
      },
      h(PinIcon, { size: 12 }),
    ),
    h(
      'button',
      {
        type: 'button',
        className: styles.rowAction,
        'aria-label': `Archive ${rowText(row)}`,
        title: 'Archive',
        'data-t3-row-action': 'archive',
        onClick: () => actions.run('archive', row.id),
      },
      h(ArchiveIcon, {}),
    ),
  )
}

/**
 * The row's own keys: F2 renames, the menu key opens the menu, and Alt+arrows
 * move a pinned row.
 * @param {import('react').KeyboardEvent<HTMLButtonElement>} event - the key.
 * @param {Row} row - the row.
 * @param {readonly string[]} shelfIds - the row's shelf, drawn order.
 * @param {ListActions} actions - what the list can do.
 */
function onRowKeyDown(event, row, shelfIds, actions) {
  if (event.key === 'F2') {
    event.preventDefault()
    actions.setRenaming(row.id)
    return
  }
  if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
  if (row.section !== 'pinned' || !actions.reorderable) return
  event.preventDefault()
  const before = keyboardMoveTarget(shelfIds, row.id, event.key === 'ArrowUp' ? 'up' : 'down')
  if (before === undefined) return
  actions.reorder(shelfIds, row.id, before)
  // A moved node can lose focus; put it back on the row after the reorder paints.
  const id = row.id
  setTimeout(() => document.querySelector(`[data-t3-thread-id="${CSS.escape(id)}"]`)?.focus(), 0)
}

/**
 * Where a drag over a row would drop: its upper half lands before, its lower half after.
 * @param {import('react').DragEvent<HTMLElement>} event - the drag event.
 * @returns {'before' | 'after'} the edge.
 */
function dropEdge(event) {
  const box = event.currentTarget.getBoundingClientRect()
  return event.clientY < box.top + box.height / 2 ? 'before' : 'after'
}

/**
 * @typedef {object} DragState
 * @property {string | null} movedId - the row being dragged.
 * @property {string | null} overId - the row it is over.
 * @property {'before' | 'after'} edge - which side of that row it would land on.
 */

/**
 * Render one row, at the density its shelf asks for.
 * @param {object} props - the row.
 * @param {Row} props.row - the row.
 * @param {readonly string[]} props.shelfIds - the row's shelf, drawn order.
 * @param {ListActions} props.actions - what the list can do.
 * @param {DragState} props.drag - the shelf's drag state.
 * @param {(next: DragState) => void} props.setDrag - update it.
 * @returns {import('react').ReactElement} the row.
 */
function Row({ row, shelfIds, actions, drag, setDrag }) {
  const project = projectLabel(row.workspace, row)
  const path = row.workspace?.cwd ?? null
  const card = row.density === 'card'
  const content = card ? h(CardContent, { row, project }) : h(SlimContent, { row, project })
  const renaming = actions.renamingId === row.id
  const draggable = row.section === 'pinned' && actions.reorderable && !renaming
  const hint = actions.hints.get(row.id)
  const dropping = drag.movedId !== null && drag.movedId !== row.id && drag.overId === row.id
  return h(
    'li',
    {
      className: styles.rowItem,
      draggable,
      'data-t3-editing': renaming ? '' : undefined,
      'data-t3-dragging': drag.movedId === row.id ? '' : undefined,
      'data-t3-drop': dropping ? drag.edge : undefined,
      onContextMenu: (event) => {
        event.preventDefault()
        const box = event.currentTarget.getBoundingClientRect()
        const keyboard = event.clientX === 0 && event.clientY === 0
        actions.openMenu(row.id, keyboard ? { x: box.left + 16, y: box.top + 16 } : { x: event.clientX, y: event.clientY })
      },
      onDragStart: (event) => {
        if (!draggable) return
        event.dataTransfer.setData('application/x-t3-sidebar-row', row.id)
        event.dataTransfer.effectAllowed = 'move'
        setDrag({ movedId: row.id, overId: null, edge: 'before' })
      },
      onDragOver: (event) => {
        if (drag.movedId === null || !shelfIds.includes(drag.movedId)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        const edge = dropEdge(event)
        if (drag.overId !== row.id || drag.edge !== edge) setDrag({ ...drag, overId: row.id, edge })
      },
      onDrop: (event) => {
        if (drag.movedId === null || !shelfIds.includes(drag.movedId)) return
        event.preventDefault()
        const at = shelfIds.indexOf(row.id)
        const before = dropEdge(event) === 'before' ? row.id : (shelfIds[at + 1] ?? null)
        actions.reorder(shelfIds, drag.movedId, before)
        setDrag({ movedId: null, overId: null, edge: 'before' })
      },
      onDragEnd: () => setDrag({ movedId: null, overId: null, edge: 'before' }),
    },
    renaming
      ? h(RenameField, {
          row,
          onDone: (title) => {
            actions.setRenaming(null)
            if (title !== null && title.trim() !== row.title) actions.run('rename', row.id, title)
          },
        })
      : h(
          'button',
          {
            type: 'button',
            className: `${styles.row} ${card ? styles.rowCard : styles.rowSlim}`,
            'data-t3-thread-id': row.id,
            'data-t3-thread-title': row.title,
            'data-t3-row-density': row.density,
            'data-t3-status': row.status.kind,
            'data-t3-thread-blank': String(row.blank),
            'data-t3-row-outcome': row.status.kind === 'failed' || row.status.kind === 'limited' ? 'failed' : 'ok',
            'data-t3-thread-subagent': String(row.isSubagent),
            'data-t3-jump-hint': hint,
            'aria-label': rowText(row),
            'aria-keyshortcuts': hint === undefined ? undefined : `Meta+${hint} Control+${hint}`,
            onClick: () => actions.open(row.id),
            onDoubleClick: () => actions.setRenaming(row.id),
            onKeyDown: (event) => onRowKeyDown(event, row, shelfIds, actions),
          },
          content,
        ),
    h(
      'span',
      {
        className: styles.hoverCard,
        role: 'tooltip',
        'data-t3-hover-card': '',
        'aria-hidden': 'true',
      },
      h('span', { className: `${styles.hoverCardTitle}`, 'data-t3-hover-title': '' }, row.view.title),
      project === '' ? null : h('span', { className: styles.hoverCardRow }, project),
      path === null ? null : h('span', { className: `${styles.hoverCardRow} ${styles.hoverCardPath}`, 'data-t3-hover-path': '' }, path),
      h(
        'span',
        { className: styles.hoverCardRow },
        h(StatusGlyph, { name: STATUS_PRESENTATION[row.status.kind]?.glyph ?? 'waiting' }),
        h('span', { 'data-t3-hover-status': '' }, row.status.visible ? row.status.label : 'Idle'),
      ),
      row.view.stack === '' ? null : h('span', { className: styles.hoverCardRow }, row.view.stack),
    ),
    renaming ? null : h(HoverActions, { row, actions }),
    hint !== undefined && actions.showHints
      ? h('span', { className: styles.jumpHint, 'aria-hidden': 'true', 'data-t3-jump-badge': '' }, hint)
      : null,
  )
}

/**
 * One shelf: a 32 px header with the live count, then its rows.
 * @param {object} props - the shelf.
 * @param {Section} props.section - which shelf and what it holds.
 * @param {ListActions} props.actions - what the list can do.
 * @returns {import('react').ReactElement} the shelf.
 */
function Shelf({ section, actions }) {
  const id = `t3s-shelf-${section.key}`
  const expanded = section.expanded !== false
  const [drag, setDrag] = useState(/** @type {DragState} */ ({ movedId: null, overId: null, edge: 'before' }))
  const shelfIds = section.rows.map((row) => row.id)
  return h(
    'section',
    {
      className: styles.section,
      'data-t3-section': section.key,
      'data-t3-section-count': String(section.rows.length),
      'aria-labelledby': id,
    },
    h(
      'div',
      { className: styles.sectionHeader, 'data-t3-section-header': '' },
      h('span', { id, className: styles.sectionLabel }, section.label),
      h('span', { className: styles.sectionRule, 'aria-hidden': 'true' }),
      h('span', { className: styles.sectionCount, 'data-t3-section-header-count': '' }, String(section.rows.length)),
      h('span', { className: expanded ? styles.chevronOpen : styles.chevronClosed, 'aria-hidden': 'true' }, h(ChevronIcon, {})),
    ),
    section.rows.length === 0
      ? null
      : h(
          'ul',
          { className: styles.list, 'aria-labelledby': id },
          section.rows.map((row) => h(Row, { key: row.id, row, shelfIds, actions, drag, setDrag })),
        ),
  )
}

/**
 * Render the shelves, with the settled tail's own reveal row.
 * @param {object} props - shelves to draw.
 * @param {readonly Section[]} props.sections - shelves in render order; empty means no rows.
 * @param {boolean} props.wide - wide draws the list; the rail keeps only headings and counts.
 * @param {string} props.phase - host list phase, for the empty-state copy.
 * @param {number} props.hiddenSettled - settled rows past the tail.
 * @param {boolean} props.matchedNothing - a search removed every row.
 * @param {() => void} props.onShowMore - reveal the next 25 settled rows.
 * @param {ListActions} props.actions - what the list can do.
 * @returns {import('react').ReactElement} the shelves.
 */
export function Sections({ sections, wide, phase, hiddenSettled = 0, matchedNothing = false, onShowMore = () => {}, actions }) {
  if (matchedNothing) {
    return h('div', { className: styles.empty, 'data-t3-sections-empty': 'search', role: 'status' }, 'No matching sessions')
  }
  if (sections.length === 0 || (sections.every((section) => section.rows.length === 0) && phase !== 'ready')) {
    return h(
      'div',
      { className: styles.empty, 'data-t3-sections-empty': '', role: 'status' },
      phase === 'ready' ? 'No sessions here yet' : 'Loading sessions…',
    )
  }

  return h(
    'div',
    { className: styles.sections, 'data-t3-sections': '' },
    sections.map((section) =>
      wide
        ? h(Shelf, { key: section.key, section, actions })
        : h(
            'div',
            {
              key: section.key,
              className: styles.empty,
              'data-t3-section': section.key,
              'data-t3-section-count': String(section.rows.length),
              'data-t3-section-rail': '',
            },
            `${section.label} · ${section.rows.length}`,
          ),
    ),
    hiddenSettled > 0
      ? h(
          'button',
          { type: 'button', className: styles.showMore, 'data-t3-show-more': String(hiddenSettled), onClick: onShowMore },
          `Show ${Math.min(hiddenSettled, 25)} more`,
        )
      : null,
  )
}
