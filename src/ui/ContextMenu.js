/**
 * The row menu: one menu, shared by the row button's context menu and its
 * keyboard "More actions" button.
 *
 * T3 assembles the same verbs in two places — the row's hover actions and the
 * "..."/context menu (`Sidebar.tsx:4226-4460` rows, `#4460-4520` menu, with the
 * menu items declared in ui-workspace's `sidebar.workspaces.session.menu.item`
 * slot). Here they are one list, so the two entry points can never disagree.
 *
 * Keyboard contract (what the probes drive):
 * - ArrowDown / ArrowUp move between items, Home / End jump, Escape closes and
 *   returns focus to the trigger, Tab closes.
 * - Enter and Space activate. Every item is a real `<button role="menuitem">`
 *   with an accessible name, carrying `data-t3-interaction="<action>"`.
 * @module deepseek-harness-t3-sidebar/ui/ContextMenu
 */

import { createElement as h, useEffect, useRef, useState } from 'react'
import { styles } from './styles.js'

/**
 * One menu item.
 * @typedef {object} MenuItem
 * @property {string} action - the interaction name (`data-t3-interaction`).
 * @property {string} label - visible and accessible name.
 * @property {string} [hint] - secondary text (a wake time, a shortcut).
 * @property {boolean} [checked] - drawn as a current choice.
 * @property {boolean} [disabled] - drawn but not activatable.
 * @property {(event: KeyboardEvent | MouseEvent) => void} run - activate.
 */

/**
 * The menu surface.
 * @param {object} props - the menu.
 * @param {MenuItem[]} props.items - in render order.
 * @param {() => void} props.onClose - Escape, Tab, outside click or after a run.
 * @param {string} props.label - accessible name of the menu.
 * @param {number} [props.width] - preferred width in px; it clamps to the viewport.
 * @returns {import('react').ReactElement | null} the menu, or a portalled-free
 *   absolutely positioned list.
 */
export function ContextMenu({ items, onClose, label, width = 224 }) {
  const list = useRef(/** @type {HTMLDivElement | null} */ (null))
  const trigger = useRef(/** @type {HTMLElement | null} */ (null))
  const [, force] = useState(0)

  useEffect(() => {
    // The button that opened the menu keeps focus until the menu mounts; park
    // it as the return target, then move focus onto the first item.
    trigger.current = typeof document === 'undefined' ? null : /** @type {HTMLElement | null} */ (document.activeElement)
    list.current?.querySelector('button:not([disabled])')?.focus()
    force((value) => value + 1)
  }, [])

  // Keep the menu inside the window: the row can sit near the bottom edge.
  useEffect(() => {
    const element = list.current
    if (element === null) return
    const rect = element.getBoundingClientRect()
    if (rect.bottom > window.innerHeight) element.style.top = `${Math.max(4, window.innerHeight - rect.height - 4)}px`
    if (rect.right > window.innerWidth) element.style.left = `${Math.max(4, window.innerWidth - rect.width - 4)}px`
  })

  useEffect(() => {
    const onPointerDown = (event) => {
      const target = /** @type {Node | null} */ (event.target)
      if (target !== null && list.current !== null && !list.current.contains(target)) {
        onClose()
        trigger.current?.focus()
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [onClose])

  const enabled = items.filter((item) => item.disabled !== true)
  const focusAt = (index) => {
    const buttons = /** @type {HTMLButtonElement[]} */ ([...list.current.querySelectorAll('button:not([disabled])')])
    const next = (index + buttons.length) % buttons.length
    buttons[next]?.focus()
  }
  const moveFocus = (delta) => {
    const buttons = /** @type {HTMLButtonElement[]} */ ([...list.current.querySelectorAll('button:not([disabled])')])
    const at = buttons.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement))
    focusAt(at === -1 ? 0 : at + delta)
  }

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(-1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusAt(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusAt(enabled.length - 1)
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      trigger.current?.focus()
    }
  }

  return h(
    'div',
    {
      ref: list,
      className: styles.menu,
      role: 'menu',
      'aria-label': label,
      'data-t3-menu': '',
      style: { width: `${width}px` },
      onKeyDown,
      onContextMenu: (event) => event.preventDefault(),
    },
    items.map((item) =>
      h(
        'button',
        {
          key: item.action,
          type: 'button',
          role: 'menuitem',
          className: styles.menuItem,
          'data-t3-interaction': item.action,
          'aria-label': item.label,
          'aria-checked': item.checked === true ? 'true' : undefined,
          disabled: item.disabled === true,
          onClick: () => {
            item.run(new MouseEvent('click'))
          },
        },
        h('span', { className: styles.menuLabel, 'aria-hidden': 'true' }, item.label),
        item.hint === undefined
          ? null
          : h('span', { className: styles.menuHint, 'aria-hidden': 'true', 'data-t3-menu-hint': '' }, item.hint),
        item.checked === true ? h('span', { className: styles.menuCheck, 'aria-hidden': 'true' }, '•') : null,
      ),
    ),
  )
}
