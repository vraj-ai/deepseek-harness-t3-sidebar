/**
 * The list: T3's shelves, and the rows inside them at T3's densities.
 *
 * A card is 82 px (78 px of content plus 4 px of vertical padding) and carries
 * the project and status line, the title, then branch and provider stack. A slim
 * row is 36 px on one line. Shelves are 32 px headers, rows are 1 px apart, and
 * the section order and headings are T3's (`Sidebar.tsx:2278`, `#2110`, `#4782`,
 * `ui/collapsible-section-header.tsx:31`, `Sidebar.tsx:3526-3565`).
 *
 * Rows are deliberately thin in behaviour — no actions, no drag — because issues
 * #7 and #2 own those. Every row is a real `<button>` inside its section, so it
 * already has a role and an accessible name the verification harness resolves.
 *
 * The markers are the verification contract:
 * - `data-t3-section` + `data-t3-section-count` on each shelf,
 * - `data-t3-thread-id` on each row,
 * - `data-t3-row-density="card|slim"` on each row,
 * - `data-t3-status="<status>"` on each row (the same value on its status line).
 * @module deepseek-harness-t3-sidebar/ui/Sections
 */

import { createElement as h } from 'react'
import { STATUS_PRESENTATION } from '../model/rowText.ts'
import { ChevronIcon, GoalIcon, PinIcon, QueueIcon, StatusGlyph } from './icons.js'
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
 * Render one row, at the density its shelf asks for.
 * @param {{ row: Row, onOpen: (sessionId: string) => void }} props - the row and its action.
 * @returns {import('react').ReactElement} the row.
 */
function Row({ row, onOpen }) {
  const project = projectLabel(row.workspace, row)
  const path = row.workspace?.cwd ?? null
  const card = row.density === 'card'
  const content = card ? h(CardContent, { row, project }) : h(SlimContent, { row, project })
  return h(
    'li',
    { className: styles.rowItem },
    h(
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
        'aria-label': rowText(row),
        onClick: () => onOpen(row.id),
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
  )
}

/**
 * One shelf: a 32 px header with the live count, then its rows.
 * @param {object} props - the shelf.
 * @param {Section} props.section - which shelf and what it holds.
 * @param {(sessionId: string) => void} props.onOpen - show a row's session.
 * @returns {import('react').ReactElement} the shelf.
 */
function Shelf({ section, onOpen }) {
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
          { className: styles.list, 'aria-labelledby': id },
          section.rows.map((row) => h(Row, { key: row.id, row, onOpen })),
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
 * @param {() => void} props.onShowMore - reveal the next 25 settled rows.
 * @param {(sessionId: string) => void} props.onOpen - show a row's session.
 * @returns {import('react').ReactElement} the shelves.
 */
export function Sections({ sections, wide, phase, hiddenSettled = 0, onShowMore = () => {}, onOpen }) {
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
        ? h(Shelf, { key: section.key, section, onOpen })
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
