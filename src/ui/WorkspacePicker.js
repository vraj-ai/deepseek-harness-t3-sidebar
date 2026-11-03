/**
 * The sidebar's workspace scope, as T3 draws a project scope: a quiet icon
 * button that opens a searchable list, never a native `<select>` in the header.
 *
 * The monogram is the workspace's identity in the row list. It is neutral by
 * design: the app's theme tokens supply every colour, and the letter carries the
 * name without introducing a second palette.
 * @module deepseek-harness-t3-sidebar/ui/WorkspacePicker
 */

import { createElement as h, useEffect, useRef, useState } from 'react'
import { CheckIcon, FilterIcon, SearchIcon } from './icons.js'
import { styles } from './styles.js'

/**
 * A workspace's first letter in a quiet badge.
 * @param {{ name: string, size?: number }} props - the label and badge edge in px.
 * @returns {import('react').ReactElement} the badge.
 */
export function WorkspaceBadge({ name, size = 16 }) {
  const letter = name.trim().charAt(0).toUpperCase() || '·'
  return h(
    'span',
    {
      className: styles.monogram,
      style: { width: `${size}px`, height: `${size}px`, fontSize: `${Math.max(8, Math.round(size * 0.55))}px` },
      'aria-hidden': 'true',
      'data-t3-workspace-badge': '',
    },
    letter,
  )
}

/**
 * The trigger's glyph: a monogram when scoped, the filter mark when every
 * workspace is in view.
 * @param {{ workspace: import('./types.js').WorkspaceSummary | null, size?: number }} props - scope and size.
 * @returns {import('react').ReactElement} the glyph.
 */
function TriggerGlyph({ workspace, size = 18 }) {
  return workspace === null
    ? h('span', { className: styles.scopeGlyph }, h(FilterIcon, { size: 15 }))
    : h(WorkspaceBadge, { name: workspace.title, size })
}

/**
 * @typedef {object} WorkspacePickerProps
 * @property {readonly import('./types.js').WorkspaceSummary[]} workspaces - the list to choose from.
 * @property {string | null} selectedWorkspaceId - the current scope, null for every workspace.
 * @property {(workspaceId: string | null) => void} onSelect - scope change.
 * @property {() => void} onExpand - the collapsed rail's route back to the wide column.
 * @property {boolean} wide - full picker versus the rail's single glyph.
 */

/**
 * Render the workspace scope picker.
 * @param {WorkspacePickerProps} props - scope, list and rail state.
 * @returns {import('react').ReactElement} the trigger and, when open, its list.
 */
export function WorkspacePicker({ workspaces, selectedWorkspaceId, onSelect, onExpand, wide }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef(/** @type {HTMLDivElement | null} */ (null))
  const trigger = useRef(/** @type {HTMLButtonElement | null} */ (null))
  const search = useRef(/** @type {HTMLInputElement | null} */ (null))
  const list = useRef(/** @type {HTMLDivElement | null} */ (null))

  const selected = workspaces.find((workspace) => workspace.workspaceId === selectedWorkspaceId) ?? null
  const label = selected?.title ?? 'All workspaces'
  const needle = query.trim().toLowerCase()
  const filtered = needle === ''
    ? workspaces
    : workspaces.filter((workspace) => workspace.title.toLowerCase().includes(needle))

  const close = (restoreFocus = true) => {
    setOpen(false)
    setQuery('')
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus())
  }

  const choose = (workspaceId) => {
    onSelect(workspaceId)
    close()
  }

  useEffect(() => {
    if (!open) return undefined
    const onPress = (event) => {
      if (root.current?.contains(/** @type {Node} */ (event.target))) return
      close(false)
    }
    document.addEventListener('pointerdown', onPress, true)
    const frame = requestAnimationFrame(() => search.current?.focus())
    return () => {
      document.removeEventListener('pointerdown', onPress, true)
      cancelAnimationFrame(frame)
    }
  }, [open])

  /** Move focus to the list's first or last option (the search field owns the top). */
  const focusOption = (edge) => {
    const options = [...(list.current?.querySelectorAll('button') ?? [])]
    const target = edge === 'first' ? options[0] : options.at(-1)
    /** @type {HTMLElement | undefined} */ (target)?.focus()
  }

  const onListKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return
    const options = [...(list.current?.querySelectorAll('button') ?? [])]
    if (options.length === 0) return
    event.preventDefault()
    const current = options.indexOf(/** @type {Element} */ (document.activeElement))
    const next =
      event.key === 'Home' ? 0
        : event.key === 'End' ? options.length - 1
          : current === -1
            ? (event.key === 'ArrowDown' ? 0 : options.length - 1)
            : event.key === 'ArrowDown' ? (current + 1) % options.length
              : (current - 1 + options.length) % options.length
    /** @type {HTMLElement} */ (options[next]).focus()
  }

  if (!wide) {
    return h(
      'button',
      {
        type: 'button',
        className: styles.glyph,
        'aria-label': `Workspace: ${label}`,
        title: `Workspace: ${label}`,
        'data-t3-control': 'workspace-selector',
        'data-t3-scope-label': label,
        onClick: onExpand,
      },
      h(TriggerGlyph, { workspace: selected, size: 18 }),
    )
  }

  return h(
    'div',
    { ref: root, className: styles.scope, 'data-t3-workspace-picker': '' },
    h(
      'button',
      {
        ref: trigger,
        type: 'button',
        className: `${styles.iconButton} ${styles.scopeTrigger}`,
        role: 'combobox',
        'aria-label': `Filter by workspace: ${label}`,
        'aria-haspopup': 'listbox',
        'aria-expanded': open,
        'aria-controls': 't3s-workspace-list',
        'data-t3-control': 'workspace-selector',
        'data-t3-scope-label': label,
        title: `Workspace: ${label}`,
        onClick: () => (open ? close() : setOpen(true)),
        onKeyDown: (event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
          } else if (event.key === 'Escape' && open) {
            event.preventDefault()
            close()
          }
        },
      },
      h(TriggerGlyph, { workspace: selected }),
    ),
    open
      ? h(
          'div',
          { className: styles.workspaceMenu, 'data-t3-workspace-menu': '' },
          h(
            'div',
            { className: styles.workspaceSearchWrap },
            h('span', { className: styles.workspaceSearchIcon, 'aria-hidden': 'true' }, h(SearchIcon, { size: 13 })),
            h('input', {
              ref: search,
              type: 'search',
              className: styles.workspaceSearch,
              placeholder: 'Search workspaces',
              'aria-label': 'Search workspaces',
              value: query,
              onChange: (event) => setQuery(event.currentTarget.value),
              onKeyDown: (event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  close()
                } else if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  focusOption('first')
                } else if (event.key === 'Enter') {
                  event.preventDefault()
                  if (query.trim() === '') choose(null)
                  else if (filtered[0] !== undefined) choose(filtered[0].workspaceId)
                }
              },
            }),
          ),
          h(
            'div',
            {
              ref: list,
              id: 't3s-workspace-list',
              className: styles.workspaceList,
              role: 'listbox',
              'aria-label': 'Workspaces',
              onKeyDown: onListKeyDown,
            },
            h(
              'button',
              {
                type: 'button',
                role: 'option',
                'aria-selected': selected === null,
                className: `${styles.workspaceOption} ${selected === null ? styles.workspaceOptionSelected : ''}`,
                onClick: () => choose(null),
                'data-t3-workspace-option': 'all',
              },
              h('span', { className: styles.workspaceOptionGlyph }, h(FilterIcon, { size: 14 })),
              h('span', { className: styles.workspaceOptionLabel }, 'All workspaces'),
              selected === null ? h('span', { className: styles.workspaceOptionCheck }, h(CheckIcon, {})) : null,
            ),
            filtered.map((workspace) =>
              h(
                'button',
                {
                  key: workspace.workspaceId,
                  type: 'button',
                  role: 'option',
                  'aria-selected': workspace.workspaceId === selectedWorkspaceId,
                  className: `${styles.workspaceOption} ${workspace.workspaceId === selectedWorkspaceId ? styles.workspaceOptionSelected : ''}`,
                  title: workspace.cwd ?? workspace.title,
                  onClick: () => choose(workspace.workspaceId),
                  'data-t3-workspace-option': workspace.workspaceId,
                },
                h(WorkspaceBadge, { name: workspace.title, size: 18 }),
                h('span', { className: styles.workspaceOptionLabel }, workspace.title),
                workspace.workspaceId === selectedWorkspaceId
                  ? h('span', { className: styles.workspaceOptionCheck }, h(CheckIcon, {}))
                  : null,
              ),
            ),
            filtered.length === 0
              ? h('div', { className: styles.workspaceEmpty }, 'No matching workspaces')
              : null,
          ),
        )
      : null,
  )
}
