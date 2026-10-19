/**
 * T3's chrome: workspace selector, search field, new-session button.
 *
 * Wide renders all three; the collapsed rail renders their icon forms so the
 * controls never leave the column (the shipped browser does the same, and the
 * rail is the only way back to a session when the sidebar is narrow).
 *
 * The search field is visual only in this slice: issue #7 owns querying, the
 * results list and the shortcut that expands it.
 * @module deepseek-harness-t3-sidebar/ui/Chrome
 */

import { createElement as h } from 'react'
import { PlusIcon, SearchIcon, WorkspacesIcon } from './icons.js'
import { styles } from './styles.js'

/** Every-workspace scope, as a `<select>` value. */
export const ALL_WORKSPACES = '__t3_all_workspaces__'

/**
 * @typedef {object} ChromeProps
 * @property {readonly import('./types.js').WorkspaceSummary[]} workspaces - selector options.
 * @property {string | null} selectedWorkspaceId - current scope, null for all.
 * @property {(workspaceId: string | null) => void} onSelectWorkspace - scope change
 *   (a visual-only selection in this slice; issue #6 wires it to the rows).
 * @property {() => void} onStartSession - new session in the selected scope.
 * @property {boolean} wide - full chrome versus the rail's icon forms.
 * @property {boolean} busy - host list still loading; the new-session button waits.
 * @property {() => void} onExpand - rail control that reopens the column.
 */

/**
 * One labelled select value plus its visible label.
 * @typedef {object} Option
 * @property {string} value - `<option>` value.
 * @property {string} label - visible label.
 */

/**
 * The select's visible label, for the collapsed rail's accessible name.
 * @param {readonly Option[]} options - selector options.
 * @param {string} value - the option currently selected.
 * @returns {string} the label of that option.
 */
export function selectedLabel(options, value) {
  for (const option of options) {
    if (option.value === value) return option.label
  }
  return options.length > 0 ? options[0].label : ''
}

/**
 * Render the chrome.
 * @param {ChromeProps} props - scope, callbacks and rail state.
 * @returns {import('react').ReactElement} the chrome.
 */
export function Chrome({ workspaces, selectedWorkspaceId, onSelectWorkspace, onStartSession, wide, busy, onExpand }) {
  const scope = selectedWorkspaceId === null ? ALL_WORKSPACES : selectedWorkspaceId
  /** @type {readonly Option[]} */
  const options = [
    { value: ALL_WORKSPACES, label: 'All workspaces' },
    ...workspaces.map((workspace) => ({ value: workspace.workspaceId, label: workspace.title })),
  ]
  const scopeLabel = selectedLabel(options, scope)

  const choose = (event) => {
    const value = event.currentTarget.value
    onSelectWorkspace(value === ALL_WORKSPACES ? null : value)
  }

  const newSessionLabel = 'New session'
  const newSession = (props) =>
    h(
      'button',
      {
        type: 'button',
        className: props.className,
        'aria-label': newSessionLabel,
        'data-t3-control': 'new-session',
        disabled: busy,
        onClick: onStartSession,
      },
      h('span', { 'aria-hidden': 'true', className: styles.icon }, h(PlusIcon, { size: props.iconSize })),
      h('span', { 'aria-hidden': 'true' }, 'New'),
    )

  if (!wide) {
    return h(
      'div',
      { className: styles.rail, 'data-t3-rail': '' },
      h(
        'button',
        {
          type: 'button',
          className: `${styles.glyph}`,
          'aria-label': 'Workspace',
          'data-t3-control': 'workspace-selector',
          'data-t3-scope-label': scopeLabel,
          onClick: onExpand,
        },
        h('span', { 'aria-hidden': 'true', className: styles.icon }, h(WorkspacesIcon, { size: 16 })),
      ),
      newSession({ className: `${styles.glyph} ${styles.glyphNew}`, iconSize: 16 }),
      h(
        'button',
        {
          type: 'button',
          className: styles.glyph,
          'aria-label': 'Search sessions',
          'data-t3-control': 'search',
          onClick: onExpand,
        },
        h('span', { 'aria-hidden': 'true', className: styles.icon }, h(SearchIcon, { size: 16 })),
      ),
    )
  }

  return h(
    'div',
    { className: styles.chrome, 'data-t3-chrome': '' },
    h(
      'div',
      { className: styles.chromeRow },
      h(
        'select',
        {
          className: `${styles.control} ${styles.select}`,
          value: scope,
          onChange: choose,
          'aria-label': 'Workspace',
          'data-t3-control': 'workspace-selector',
        },
        options.map((option) => h('option', { key: option.value, value: option.value }, option.label)),
      ),
      newSession({ className: `${styles.control} ${styles.newSession}`, iconSize: 14 }),
    ),
    h(
      'div',
      { className: `${styles.chromeRow} ${styles.searchWrap}` },
      h('span', { className: styles.searchIcon, 'aria-hidden': 'true' }, h(SearchIcon, { size: 13 })),
      h('input', {
        type: 'search',
        className: styles.search,
        placeholder: 'Search sessions',
        'aria-label': 'Search sessions',
        'data-t3-control': 'search',
        tabIndex: 0,
        readOnly: true,
      }),
    ),
    h('span', { className: styles.visuallyHidden, 'data-t3-scope-label': '' }, scopeLabel),
  )
}
