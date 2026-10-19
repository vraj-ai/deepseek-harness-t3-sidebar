/**
 * The section scaffolding: one heading with its real count over real session rows.
 *
 * Rows are deliberately thin — a status dot, the session title — because issue
 * #6 owns row fidelity (card and slim densities, hover actions, menus). They are
 * real `<button>`s inside a `<ul>`, so every row already has a role and an
 * accessible name the verification harness can resolve, and the row carries its
 * session id as `data-t3-thread-id`.
 * @module deepseek-harness-t3-sidebar/ui/Sections
 */

import { createElement as h } from 'react'
import { styles } from './styles.js'

/** @typedef {import('./types.js').SidebarSession} SidebarSession */
/** @typedef {import('./types.js').Section} Section */

/**
 * The dot's state marker, which is also how the theme colours it.
 * @param {SidebarSession} session - the session.
 * @returns {string} `ok`, `failed`, `interrupted` or `none`.
 */
function outcomeMarker(session) {
  return session.projection?.outcome ?? 'none'
}

/**
 * The text a row paints: the host title, or the placeholder for a session that
 * has none yet.
 * @param {SidebarSession} session - the session.
 * @returns {string} the visible text.
 */
export function rowText(session) {
  return session.title !== '' ? session.title : 'Untitled session'
}

/**
 * Render one row.
 * @param {SidebarSession} session - the session.
 * @returns {import('react').ReactElement} the row.
 */
function Row({ session }) {
  return h(
    'li',
    null,
    h(
      'button',
      {
        type: 'button',
        className: session.isSubagent ? `${styles.row} ${styles.rowSubagent}` : styles.row,
        'data-t3-thread-id': session.id,
        'data-t3-thread-title': session.title,
        'data-t3-thread-subagent': String(session.isSubagent),
        'data-t3-thread-blank': String(session.blank),
        'data-t3-row-outcome': outcomeMarker(session),
        'aria-label': rowText(session),
      },
      h('span', {
        className: styles.dot,
        'data-t3-row-outcome': outcomeMarker(session),
        'data-t3-row-blank': String(session.blank),
        'aria-hidden': 'true',
      }),
      h('span', { className: styles.rowTitle }, rowText(session)),
    ),
  )
}

/**
 * Render the sections.
 * @param {object} props - sections to draw.
 * @param {readonly Section[]} props.sections - sections in render order; empty means no rows.
 * @param {boolean} props.wide - wide draws lists; the rail keeps only headings and counts.
 * @param {string} props.phase - host list phase, for the empty-state copy.
 * @returns {import('react').ReactElement} the sections.
 */
export function Sections({ sections, wide, phase }) {
  if (sections.length === 0) {
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
      h(
        'section',
        {
          key: section.key,
          className: styles.section,
          'data-t3-section': section.key,
          'data-t3-section-count': String(section.rows.length),
          'aria-labelledby': `t3s-section-${section.key}`,
        },
        h(
          'div',
          { className: styles.sectionHeader },
          h('h2', { id: `t3s-section-${section.key}`, className: styles.sectionLabel }, section.label),
          h('span', { className: styles.sectionCount }, String(section.rows.length)),
        ),
        wide
          ? h('ul', { className: styles.list, 'aria-labelledby': `t3s-section-${section.key}` },
              section.rows.map((session) => h(Row, { key: session.id, session })))
          : h(
              'div',
              { className: styles.empty, 'data-t3-section-rail': '' },
              `${section.label} · ${section.rows.length}`,
            ),
      ),
    ),
  )
}
