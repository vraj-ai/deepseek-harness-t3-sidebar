/**
 * The two glyphs the chrome needs, drawn inline.
 *
 * Shipped icons live in `@deepseek-ai/dsh-client-ui-primitives`, which a plugin
 * may not require beyond the baseline modules, so these are hand-drawn to the
 * same 16px grid and take their colour from `currentColor`.
 * @module deepseek-harness-t3-sidebar/ui/icons
 */

import { createElement as h } from 'react'

/** @typedef {{ size?: number }} IconProps */

/**
 * Magnifier.
 * @param {IconProps} props - optional size in px.
 * @returns {import('react').ReactElement} the glyph.
 */
export function SearchIcon({ size = 14 }) {
  return h(
    'svg',
    { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    h('circle', { cx: 7, cy: 7, r: 4.25, stroke: 'currentColor', strokeWidth: 1.3 }),
    h('path', { d: 'M10.2 10.2 13.5 13.5', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
  )
}

/**
 * Plus.
 * @param {IconProps} props - optional size in px.
 * @returns {import('react').ReactElement} the glyph.
 */
export function PlusIcon({ size = 14 }) {
  return h(
    'svg',
    { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    h('path', {
      d: 'M8 3.5v9M3.5 8h9',
      stroke: 'currentColor',
      strokeWidth: 1.3,
      strokeLinecap: 'round',
    }),
  )
}

/**
 * Stacked cards, the collapsed rail's stand-in for the workspace selector.
 * @param {IconProps} props - optional size in px.
 * @returns {import('react').ReactElement} the glyph.
 */
export function WorkspacesIcon({ size = 16 }) {
  return h(
    'svg',
    { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    h('rect', { x: 2.5, y: 2.5, width: 11, height: 4, rx: 1.2, stroke: 'currentColor', strokeWidth: 1.3 }),
    h('rect', { x: 2.5, y: 9.5, width: 11, height: 4, rx: 1.2, stroke: 'currentColor', strokeWidth: 1.3 }),
  )
}
