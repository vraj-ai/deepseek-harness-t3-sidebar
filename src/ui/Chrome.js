/**
 * The sidebar's header: a quiet search field, the workspace scope filter and the
 * New Session action, in T3's single-row shape (`SidebarThreadHeader`).
 *
 * Search owns the row; the two actions are 28 px icon buttons, so the header
 * never turns into a form. The scope filter is a monogram trigger with a
 * searchable popover (`WorkspacePicker`), not a native `<select>`.
 * @module deepseek-harness-t3-sidebar/ui/Chrome
 */

import { createElement as h } from 'react'
import { CloseIcon, PenIcon, SearchIcon } from './icons.js'
import { WorkspacePicker } from './WorkspacePicker.js'
import { styles } from './styles.js'

/**
 * @typedef {object} ChromeProps
 * @property {readonly import('./types.js').WorkspaceSummary[]} workspaces - scope options.
 * @property {string | null} selectedWorkspaceId - current scope, null for every workspace.
 * @property {(workspaceId: string | null) => void} onSelectWorkspace - scope change.
 * @property {() => void} onStartSession - new session in the selected scope.
 * @property {boolean} wide - full chrome versus the rail's icon forms.
 * @property {boolean} busy - host list still loading; New Session waits.
 * @property {string} query - the search text.
 * @property {(query: string) => void} onQueryChange - the search text changed.
 * @property {() => void} onExpand - rail control that reopens the column.
 */

/**
 * Render the header.
 * @param {ChromeProps} props - scope, callbacks and rail state.
 * @returns {import('react').ReactElement} the header.
 */
export function Chrome({ workspaces, selectedWorkspaceId, onSelectWorkspace, onStartSession, wide, busy, onExpand, query, onQueryChange }) {
  const newSession = (className, iconSize) =>
    h(
      'button',
      {
        type: 'button',
        className,
        'aria-label': 'New session',
        title: 'New session',
        'data-t3-control': 'new-session',
        disabled: busy,
        onClick: onStartSession,
      },
      h('span', { className: styles.icon, 'aria-hidden': 'true' }, h(PenIcon, { size: iconSize })),
    )

  if (!wide) {
    return h(
      'div',
      { className: styles.rail, 'data-t3-rail': '' },
      h(WorkspacePicker, {
        workspaces,
        selectedWorkspaceId,
        onSelect: onSelectWorkspace,
        onExpand,
        wide: false,
      }),
      newSession(styles.glyph, 16),
      h(
        'button',
        {
          type: 'button',
          className: styles.glyph,
          'aria-label': 'Search sessions',
          title: 'Search sessions',
          'data-t3-control': 'search',
          onClick: onExpand,
        },
        h('span', { className: styles.icon, 'aria-hidden': 'true' }, h(SearchIcon, { size: 16 })),
      ),
    )
  }

  return h(
    'div',
    { className: styles.chrome, 'data-t3-chrome': '' },
    h(
      'div',
      { className: `${styles.searchWrap} ${query === '' ? '' : styles.searchWrapActive}` },
      h('span', { className: styles.searchIcon, 'aria-hidden': 'true' }, h(SearchIcon, { size: 14 })),
      h('input', {
        type: 'search',
        className: styles.search,
        placeholder: 'Search',
        'aria-label': 'Search sessions',
        'data-t3-control': 'search',
        value: query,
        onChange: (event) => onQueryChange(event.currentTarget.value),
        onKeyDown: (event) => {
          if (event.key === 'Escape' && query !== '') {
            event.preventDefault()
            onQueryChange('')
          }
        },
      }),
      query === ''
        ? null
        : h(
            'button',
            {
              type: 'button',
              className: styles.searchClear,
              'aria-label': 'Clear search',
              'data-t3-control': 'search-clear',
              onClick: () => onQueryChange(''),
            },
            h(CloseIcon, { size: 12 }),
          ),
    ),
    h(WorkspacePicker, {
      workspaces,
      selectedWorkspaceId,
      onSelect: onSelectWorkspace,
      onExpand,
      wide: true,
    }),
    newSession(`${styles.iconButton} ${styles.newSession}`, 16),
  )
}
