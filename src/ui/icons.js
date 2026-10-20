/**
 * The chrome's glyphs plus the row's status glyphs, drawn inline.
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

/**
 * T3's row glyphs (`lucide-react` in `Sidebar.tsx:1666-1715`): dashed circle for
 * working, dotted circle for waiting/approval, sparkle for input, diamond-alert
 * for a failure, check for done, bell for a wake, and the status dot.
 * @typedef {'working' | 'waiting' | 'approval' | 'input' | 'failed' | 'woke' | 'done'} StatusGlyphName
 */

const CIRCLE = { cx: 8, cy: 8, r: 5 }
const STROKE = { stroke: 'currentColor', strokeWidth: 1.3, fill: 'none' }

/**
 * One status glyph, on the same 16px grid as the chrome's icons.
 * @param {{ name: StatusGlyphName, size?: number }} props - which glyph, and its size.
 * @returns {import('react').ReactElement} the glyph.
 */
export function StatusGlyph({ name, size = 12 }) {
  const svg = (...children) =>
    h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' }, ...children)
  switch (name) {
    case 'working':
      return svg(h('circle', { ...CIRCLE, ...STROKE, strokeDasharray: '2.6 2.2', strokeLinecap: 'round' }))
    case 'waiting':
      return svg(h('circle', { ...CIRCLE, ...STROKE, strokeDasharray: '0.8 2.2', strokeLinecap: 'round' }))
    case 'approval':
      return svg(
        h('circle', { ...CIRCLE, ...STROKE }),
        h('path', { d: 'M8 5.4v3.4', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
        h('circle', { cx: 8, cy: 11, r: 0.65, fill: 'currentColor' }),
      )
    case 'input':
      return svg(
        h('path', { d: 'M8 2.6 9.5 6 13 7.5 9.5 9 8 12.4 6.5 9 3 7.5 6.5 6Z', ...STROKE, strokeLinejoin: 'round' }),
        h('path', { d: 'M12 11.5 12.6 12.9 14 13.5 12.6 14.1 12 15.5 11.4 14.1 10 13.5 11.4 12.9Z', fill: 'currentColor' }),
      )
    case 'failed':
      return svg(
        h('path', { d: 'M8 2.8 13.2 8 8 13.2 2.8 8Z', ...STROKE, strokeLinejoin: 'round' }),
        h('path', { d: 'M8 5.8v3.6', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
        h('circle', { cx: 8, cy: 11.2, r: 0.65, fill: 'currentColor' }),
      )
    case 'woke':
      return svg(
        h('path', { d: 'M4 11.2V7.4a4 4 0 0 1 8 0v3.8l1 1.2H3Z', ...STROKE, strokeLinejoin: 'round' }),
        h('path', { d: 'M6.6 14a1.5 1.5 0 0 0 2.8 0', ...STROKE, strokeLinecap: 'round' }),
      )
    case 'done':
      return svg(
        h('circle', { ...CIRCLE, ...STROKE }),
        h('path', { d: 'M5.6 8.2 7.2 9.8 10.5 6.5', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      )
  }
}

/**
 * Pin, drawn only for a pinned card (`Sidebar.tsx:2064`).
 * @param {IconProps} props - optional size in px.
 * @returns {import('react').ReactElement} the glyph.
 */
export function PinIcon({ size = 11 }) {
  return h(
    'svg',
    { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    h('path', {
      d: 'M9.4 2.6 13.4 6.6 12 7.2 11.4 10.8 8.6 8 5.2 11.4 4.6 10.8 8 7.4 5.2 4.6 8.8 4Z',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinejoin: 'round',
    }),
  )
}

/**
 * Branch, for the meta line and the hover card (`Sidebar.tsx:2449`).
 * @param {IconProps} props - optional size in px.
 * @returns {import('react').ReactElement} the glyph.
 */
export function BranchIcon({ size = 11 }) {
  return h(
    'svg',
    { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    h('circle', { cx: 5, cy: 4, r: 1.6, stroke: 'currentColor', strokeWidth: 1.2 }),
    h('circle', { cx: 5, cy: 12, r: 1.6, stroke: 'currentColor', strokeWidth: 1.2 }),
    h('circle', { cx: 11, cy: 5.5, r: 1.6, stroke: 'currentColor', strokeWidth: 1.2 }),
    h('path', { d: 'M5 5.6v4.8M11 7.1c0 2.2-1.6 2.6-4.6 2.9', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
  )
}

/**
 * Queue mark, for prompts waiting behind the running turn.
 * @param {IconProps} props - optional size in px.
 * @returns {import('react').ReactElement} the glyph.
 */
export function QueueIcon({ size = 11 }) {
  return h(
    'svg',
    { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    h('path', { d: 'M3 5h10M3 8h10M3 11h6', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
  )
}

/**
 * Goal, for the row whose working state carries an active goal.
 * @param {IconProps} props - optional size in px.
 * @returns {import('react').ReactElement} the glyph.
 */
export function GoalIcon({ size = 11 }) {
  return h(
    'svg',
    { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    h('circle', { cx: 8, cy: 8, r: 5, stroke: 'currentColor', strokeWidth: 1.2 }),
    h('circle', { cx: 8, cy: 8, r: 1.6, fill: 'currentColor' }),
  )
}

/**
 * Chevron, for a shelf header.
 * @param {{ size?: number }} props - optional size in px.
 * @returns {import('react').ReactElement} the glyph.
 */
export function ChevronIcon({ size = 12 }) {
  return h(
    'svg',
    { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    h('path', { d: 'M4 6.2 8 10.2 12 6.2', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
  )
}

/**
 * Archive box, for the row's hover action.
 * @param {IconProps} props - optional size in px.
 * @returns {import('react').ReactElement} the glyph.
 */
export function ArchiveIcon({ size = 12 }) {
  return h(
    'svg',
    { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    h('path', {
      d: 'M2.5 4.5h11v2h-11zM3.5 6.5v6h9v-6M6.5 9h3',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  )
}

/**
 * Cross, for clearing the search field.
 * @param {IconProps} props - optional size in px.
 * @returns {import('react').ReactElement} the glyph.
 */
export function CloseIcon({ size = 12 }) {
  return h(
    'svg',
    { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    h('path', { d: 'M4 4 12 12M12 4 4 12', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
  )
}
