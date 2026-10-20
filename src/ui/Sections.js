/**
 * The list: T3's shelves, and the rows inside them at T3's densities.
 *
 * A card is 82 px (78 px of content plus 4 px of vertical padding) and carries
 * the project and status line, the title, then branch and provider stack. A slim
 * row is 36 px on one line. Shelves are 32 px headers, rows are 1 px apart, and
 * the section order and headings are T3's (`Sidebar.tsx:2278`, `#2110`, `#4782`,
 * `ui/collapsible-section-header.tsx:31`, `Sidebar.tsx:3526-3565`).
 *
 * Rows carry issue #7's verbs (`Row.js`); this file owns the shelf — its header,
 * its id for `aria-labelledby`, and the keyboard reorder shortcut.
 *
 * The markers are the verification contract:
 * - `data-t3-section` + `data-t3-section-count` on each shelf,
 * - `data-t3-thread-id` on each row,
 * - `data-t3-row-density="card|slim"` on each row,
 * - `data-t3-status="<status>"` on each row (the same value on its status line),
 * - `data-t3-jump-hint="<1-9>"` on each numbered row (`data-t3-jump-order` on
 *   the list spells the order out).
 * @module deepseek-harness-t3-sidebar/ui/Sections
 */

import { createElement as h, useEffect, useState } from 'react'
import { ChevronIcon } from './icons.js'
import { Row, rowText, workspaceOf, projectLabel } from './Row.js'
import { styles } from './styles.js'

/**
 * @typedef {import('./types.js').Section} Section
 * @typedef {import('./types.js').DrawnRow} Row
 * @typedef {import('../model/rowStatus.ts').RowDensity} RowDensity
 */

/** Milliseconds between two re-derivations while a row is working. */
const TICK_MS = 1000

export { rowText, workspaceOf, projectLabel }

/**
 * The row contract every shelf passes through to `Row`.
 * @typedef {object} RowHandlers
 * @property {(row: Row, event: Event | null) => void} onOpen - open the session.
 * @property {(row: Row, trigger: HTMLElement | null) => void} onMenu - open the row's menu.
 * @property {string | null} editingId - the row being renamed.
 * @property {string} draft - the rename draft.
 * @property {(value: string) => void} onDraft - draft change.
 * @property {() => void} onCommit - Enter.
 * @property {() => void} onCancel - Escape.
 * @property {(row: Row, direction: 'up' | 'down') => void} onMove - keyboard reorder.
 * @property {(event: PointerEvent, row: Row) => void} onDragStart - a press that may become a drag.
 * @property {string | null} draggingId - the row being dragged.
 * @property {{ id: string, half: 'before' | 'after' } | null} dropAt - where the drag would land.
 */

/**
 * One shelf: a 32 px header with the live count, then its rows.
 * @param {object} props - the shelf.
 * @param {Section} props.section - which shelf and what it holds.
 * @param {readonly import('./types.js').WorkspaceSummary[]} props.workspaces - for the project name.
 * @param {RowHandlers} props.handlers - the row verbs.
 * @returns {import('react').ReactElement} the shelf.
 */
function Shelf({ section, workspaces, handlers }) {
  const id = `t3s-shelf-${section.key}`
  const expanded = section.expanded !== false
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
          { className: styles.list, 'aria-labelledby': id, 'data-t3-section-list': section.key },
          section.rows.map((row) =>
            h(Row, {
              key: row.id,
              row,
              workspaces,
              editing: handlers.editingId === row.id,
              draft: handlers.draft,
              onDraft: handlers.onDraft,
              onCommit: handlers.onCommit,
              onCancel: handlers.onCancel,
              onOpen: handlers.onOpen,
              onMenu: handlers.onMenu,
              onMove: handlers.onMove,
              onDragStart: handlers.onDragStart,
              rowOrder: section.rows.map((candidate) => candidate.id),
              dragging: handlers.draggingId === row.id,
              dragOver: handlers.dropAt?.id === row.id ? handlers.dropAt.half : null,
            }),
          ),
        ),
  )
}

/**
 * Render the shelves, with the settled tail's own reveal row.
 * @param {object} props - shelves to draw.
 * @param {readonly Section[]} props.sections - shelves in render order; empty means no rows.
 * @param {boolean} props.wide - wide draws the list; the rail keeps only headings and counts.
 * @param {string} props.phase - host list phase, for the empty-state copy.
 * @param {readonly import('./types.js').WorkspaceSummary[]} props.workspaces - project names.
 * @param {number} props.hiddenSettled - settled rows past the tail.
 * @param {() => void} props.onShowMore - reveal the next 25 settled rows.
 * @param {RowHandlers} [props.handlers] - the row verbs (absent draws a read-only list).
 * @param {boolean} [props.searchActive] - the search field is narrowing the list.
 * @returns {import('react').ReactElement} the shelves.
 */
export function Sections({
  sections,
  wide,
  phase,
  workspaces = [],
  hiddenSettled = 0,
  onShowMore = () => {},
  handlers = {
    onOpen: () => {},
    onMenu: () => {},
    editingId: null,
    draft: '',
    onDraft: () => {},
    onCommit: () => {},
    onCancel: () => {},
    onMove: () => {},
    onDragStart: () => {},
    draggingId: null,
    dropAt: null,
  },
  searchActive = false,
}) {
  // ponytail: one second ticker while anything is working; T3 re-renders each
  // label instead. Replace with a per-label subscription if a long list janks.
  const working = sections.some((section) => section.rows.some((row) => row.status.kind === 'working'))
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!working) return undefined
    const timer = setInterval(() => setTick((value) => value + 1), TICK_MS)
    return () => clearInterval(timer)
  }, [working])

  const drawn = sections.reduce((total, section) => total + section.rows.length, 0)
  if (sections.length === 0 || (drawn === 0 && phase !== 'ready')) {
    return h(
      'div',
      { className: styles.empty, 'data-t3-sections-empty': '', role: 'status' },
      phase === 'ready' ? (searchActive ? 'No matching sessions' : 'No sessions here yet') : 'Loading sessions…',
    )
  }

  const jumpOrder = sections
    .flatMap((section) => section.rows)
    .filter((row) => row.jumpLabel !== null)
    .map((row) => `${row.jumpLabel}:${row.id}`)
    .join(',')

  return h(
    'div',
    {
      className: styles.sections,
      'data-t3-sections': '',
      'data-t3-jump-order': jumpOrder,
      'data-t3-search-narrowed': String(searchActive),
    },
    sections.map((section) =>
      wide
        ? h(Shelf, { key: section.key, section, workspaces, handlers })
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
          { type: 'button', className: styles.showMore, 'data-t3-show-more': String(hiddenSettled), 'data-t3-interaction': 'show-more', onClick: onShowMore },
          `Show ${Math.min(hiddenSettled, 25)} more`,
        )
      : null,
  )
}
