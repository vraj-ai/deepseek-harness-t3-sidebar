/**
 * One row and its verbs: opening, inline rename, the menu, pin/archive/snooze/
 * settle, and drag reorder inside the row's own shelf.
 *
 * T3's row is a press target with a hover action cluster and a "..."/context
 * menu (`Sidebar.tsx:2254-2500` card, `#2088-2243` slim, actions `#4226-4460`).
 * This row is the same shape with the verbs issue #7 owns:
 *
 * - press → open (visit watermark + reveal),
 * - rename → a `<input>` replaces the title; Enter commits, Escape cancels,
 *   blur commits (T3's inline edit, `Sidebar.tsx:1813-1830`),
 * - "..." button / right click → the menu (`ContextMenu.js`),
 * - pointer drag past 6 px inside the row's shelf → reorder (`Sidebar.tsx:3375-3382`).
 *
 * Interaction markers (the verification contract for `probe-interactions.mjs`):
 * `data-t3-interaction` names every control, `data-t3-rename-input` the editor,
 * `data-t3-drag-source` / `data-t3-drop` the drag, `data-t3-row-menu` the menu
 * trigger, and `data-t3-jump-hint` the ⌘ index.
 * @module deepseek-harness-t3-sidebar/ui/Row
 */

import { createElement as h, useEffect, useRef } from 'react'
import { STATUS_PRESENTATION } from '../model/rowText.ts'
import { ChevronIcon, GoalIcon, PinIcon, QueueIcon, StatusGlyph } from './icons.js'
import { styles } from './styles.js'

/**
 * @typedef {import('./types.js').DrawnRow} Row
 * @typedef {import('./types.js').WorkspaceSummary} WorkspaceSummary
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
 * The workspace a row belongs to: the one that lists its session, else the one
 * whose directory is the session's working directory.
 * @param {readonly WorkspaceSummary[]} workspaces - parsed workspaces.
 * @param {string} sessionId - the row's session.
 * @returns {WorkspaceSummary | null} its workspace, or null.
 */
export function workspaceOf(workspaces, sessionId) {
  const listed = workspaces.find((workspace) => workspace.sessionIds.includes(sessionId))
  if (listed !== undefined) return listed
  return null
}

/**
 * The project a row names on its top line: its workspace's title, else the
 * shell's own project (the session's directory name, or its title).
 * @param {WorkspaceSummary | null} workspace - owning workspace.
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
 * The ⌘1-9 hint T3 paints in the row's corner (`Sidebar.tsx:845`).
 * @param {{ label: string | null }} props - the hint.
 */
function JumpHint({ label }) {
  if (label === null) return null
  return h(
    'span',
    { className: styles.jump, 'data-t3-jump-hint': label, 'aria-label': `Command ${label}`, title: `⌘${label}` },
    label,
  )
}

/**
 * The inline title editor. Mounted in place of the title when the row is being
 * renamed, focused and selected on mount.
 * @param {object} props - the editor.
 * @param {string} props.value - current draft.
 * @param {(value: string) => void} props.onChange - draft change.
 * @param {() => void} props.onCommit - Enter or blur.
 * @param {() => void} props.onCancel - Escape.
 * @returns {import('react').ReactElement} the editor.
 */
export function RenameInput({ value, onChange, onCommit, onCancel }) {
  const input = useRef(/** @type {HTMLInputElement | null} */ (null))
  const committed = useRef(false)
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])
  const commit = () => {
    if (committed.current) return
    committed.current = true
    onCommit()
  }
  return h('input', {
    ref: input,
    type: 'text',
    className: styles.renameInput,
    value,
    'data-t3-rename-input': '',
    'aria-label': 'Session title',
    onClick: (event) => event.stopPropagation(),
    onChange: (event) => onChange(event.currentTarget.value),
    onBlur: commit,
    onKeyDown: (event) => {
      // The sidebar's own shortcuts must not see a keystroke meant for the field.
      event.stopPropagation()
      if (event.key === 'Enter') {
        event.preventDefault()
        commit()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        committed.current = true
        onCancel()
      }
    },
  })
}

/**
 * One card: project + status line, title, then goal/queue and the provider
 * stack (`Sidebar.tsx:2278-2497`).
 *
 * T3 puts the branch on this line; DSH's session list carries no branch, and
 * this seat gets no Git status (`useGitStatus` is a seat of its own), so the
 * line leads with the goal and queue markers until issue #2 supplies a branch.
 * @param {{ row: Row, project: string, editing: boolean, draft: string, onDraft: (v: string) => void, onCommit: () => void, onCancel: () => void }} props - the row, its project and editor state.
 * @returns {import('react').ReactElement} the card's content.
 */
function CardContent({ row, project, editing, draft, onDraft, onCommit, onCancel }) {
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
    editing
      ? h(RenameInput, { value: draft, onChange: onDraft, onCommit, onCancel })
      : h('span', { className: styles.cardTitle, 'data-t3-row-title': '' }, row.view.title),
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
 * @param {{ row: Row, project: string, editing: boolean, draft: string, onDraft: (v: string) => void, onCommit: () => void, onCancel: () => void }} props - the row.
 * @returns {import('react').ReactElement} the row's content.
 */
function SlimContent({ row, project, editing, draft, onDraft, onCommit, onCancel }) {
  return h(
    'span',
    { className: styles.slimInner },
    project === '' ? null : h('span', { className: `${styles.cardProject} ${styles.slimProject}`, 'data-t3-project': '' }, project),
    editing
      ? h(RenameInput, { value: draft, onChange: onDraft, onCommit, onCancel })
      : h('span', { className: styles.slimTitle, 'data-t3-row-title': '' }, row.view.title),
    row.pinned ? h('span', { className: styles.pin, 'aria-hidden': 'true', 'data-t3-pin': '' }, h(PinIcon, {})) : null,
    h(
      'span',
      { className: styles.slimTail, 'data-t3-status': row.status.kind },
      row.view.tailTime === null ? project : h('span', { className: styles.rowStatusDuration }, row.view.tailTime),
    ),
  )
}

/**
 * Render one row, at the density its shelf asks for, with its verbs.
 * @param {object} props - the row contract.
 * @param {Row} props.row - the drawn row.
 * @param {readonly WorkspaceSummary[]} props.workspaces - project names.
 * @param {string | null} [props.dragOver] - `before`/`after` when a drag hovers this row.
 * @param {boolean} [props.dragging] - this row is the drag source.
 * @param {(row: Row, event: KeyboardEvent | MouseEvent | null) => void} props.onOpen - open the session.
 * @param {(row: Row, trigger: HTMLElement) => void} props.onMenu - open the row's menu by its trigger.
 * @param {boolean} props.editing - the row is being renamed.
 * @param {string} props.draft - the rename draft.
 * @param {(value: string) => void} props.onDraft - draft change.
 * @param {() => void} props.onCommit - Enter.
 * @param {() => void} props.onCancel - Escape.
 * @param {(row: Row, direction: 'up' | 'down') => void} [props.onMove] - keyboard reorder.
 * @param {(event: PointerEvent, row: Row, order: readonly string[]) => void} [props.onDragStart] - a press that may become a drag.
 * @param {readonly string[]} [props.rowOrder] - the shelf's current order, handed to the drag.
 * @returns {import('react').ReactElement} the row.
 */
export function Row({
  row,
  workspaces,
  dragOver = null,
  dragging = false,
  onOpen,
  onMenu,
  editing,
  draft,
  onDraft,
  onCommit,
  onCancel,
  onMove,
  onDragStart,
  rowOrder = [],
}) {
  const workspace = workspaceOf(workspaces, row.id)
  const project = projectLabel(workspace, row)
  const path = workspace?.cwd ?? null
  const card = row.density === 'card'
  const content = card
    ? h(CardContent, { row, project, editing, draft, onDraft, onCommit, onCancel })
    : h(SlimContent, { row, project, editing, draft, onDraft, onCommit, onCancel })
  const onPointerDown = (event) => {
    if (event.button !== 0 || editing) return
    onDragStart?.(event, row, rowOrder)
  }

  const dropClass =
    dragOver === 'before' ? styles.dropBefore : dragOver === 'after' ? styles.dropAfter : ''
  return h(
    'li',
    {
      className: `${styles.rowItem} ${dragging ? styles.rowItemDragging : ''} ${dropClass}`,
      'data-t3-row-item': row.id,
      'data-t3-drag-source': dragging ? '' : undefined,
      'data-t3-drop': dragOver ?? undefined,
    },
    h(
      'button',
      {
        type: 'button',
        className: `${styles.row} ${card ? styles.rowCard : styles.rowSlim}`,
        'data-t3-thread-id': row.id,
        'data-t3-thread-title': editing ? draft : row.title,
        'data-t3-row-density': row.density,
        'data-t3-section-row': row.section,
        'data-t3-status': row.status.kind,
        'data-t3-thread-blank': String(row.blank),
        'data-t3-row-outcome': row.status.kind === 'failed' || row.status.kind === 'limited' ? 'failed' : 'ok',
        'data-t3-thread-subagent': String(row.isSubagent),
        'data-t3-interaction': 'open',
        draggable: false,
        'aria-label': rowText(row),
        onPointerDown,
        onDoubleClick: (event) => {
          if (editing) return
          event.preventDefault()
          onMenu(row, event.currentTarget)
        },
        onContextMenu: (event) => {
          event.preventDefault()
          onMenu(row, event.currentTarget)
        },
        onClick: (event) => {
          if (editing) return
          onOpen(row, event)
        },
        onKeyDown: (event) => {
          if (!event.altKey || editing) return
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            onMove?.(row, 'up')
          } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            onMove?.(row, 'down')
          }
        },
      },
      content,
      h(JumpHint, { label: row.jumpLabel }),
    ),
    h(
      'button',
      {
        type: 'button',
        className: styles.rowMenuButton,
        'aria-label': `More actions for ${rowText(row)}`,
        'data-t3-interaction': 'row-menu',
        'data-t3-row-menu': row.id,
        onClick: (event) => {
          event.stopPropagation()
          onMenu(row, event.currentTarget)
        },
        onPointerDown: (event) => event.stopPropagation(),
      },
      h('span', { 'aria-hidden': 'true' }, '⋯'),
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

/** The chevron a collapsed shelf would draw; exported for the shelf header. */
export { ChevronIcon }
