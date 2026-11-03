/**
 * The two surfaces that float over the list: a row's context menu (with the
 * snooze picker) and the undo toast an archive leaves behind.
 *
 * Markers for verification: `data-t3-menu` on the menu, `data-t3-menu-item="<id>"`
 * on each entry, `data-t3-snooze-preset="<id>"` / `data-t3-snooze-custom` in the
 * picker, and `data-t3-toast` with `data-t3-undo` on the toast.
 * @module deepseek-harness-t3-sidebar/ui/Overlays
 */

import { createElement as h, useEffect, useRef, useState } from 'react'
import { resolveSnoozePresets } from '../model/threadSettled.ts'
import { customSnoozeUntil } from './rowActions.js'
import { styles } from './styles.js'

/** How long an undo stays offered. */
export const TOAST_MS = 8000

const MENU_WIDTH = 240
const MENU_HEIGHT = 280

/**
 * @typedef {object} MenuState
 * @property {string} sessionId - the row the menu acts on.
 * @property {number} x - viewport x of the pointer (or the row, for a keyboard open).
 * @property {number} y - viewport y.
 */

/**
 * A menu position that keeps the box inside the viewport.
 * @param {MenuState} menu - the requested position.
 * @returns {{ left: number, top: number }} the clamped position.
 */
function clampToViewport({ x, y }) {
  const width = typeof window === 'undefined' ? MENU_WIDTH : window.innerWidth
  const height = typeof window === 'undefined' ? MENU_HEIGHT : window.innerHeight
  return { left: Math.max(4, Math.min(x, width - MENU_WIDTH - 4)), top: Math.max(4, Math.min(y, height - MENU_HEIGHT - 4)) }
}

/**
 * Move focus between a menu's items with the arrow keys.
 * @param {import('react').KeyboardEvent<HTMLElement>} event - the key.
 */
function roveFocus(event) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const items = Array.from(event.currentTarget.querySelectorAll('button:not(:disabled), input'))
  const at = items.indexOf(/** @type {Element} */ (document.activeElement))
  const next = event.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length
  event.preventDefault()
  /** @type {HTMLElement} */ (items[next]).focus()
}

/**
 * The snooze picker: T3's presets plus a custom time.
 * @param {{ nowMs: number, onPick: (until: string) => void, onBack: () => void }} props - the picker.
 * @returns {import('react').ReactElement} the picker's content.
 */
function SnoozePicker({ nowMs, onPick, onBack }) {
  const [custom, setCustom] = useState('')
  const until = customSnoozeUntil(custom, nowMs)
  return h(
    'div',
    { role: 'group', 'aria-label': 'Snooze until' },
    h('button', { type: 'button', role: 'menuitem', className: styles.menuItem, onClick: onBack }, '‹ Back'),
    h('div', { className: styles.menuSeparator, role: 'separator' }),
    resolveSnoozePresets(new Date(nowMs)).map((preset) =>
      h(
        'button',
        {
          key: preset.id,
          type: 'button',
          role: 'menuitem',
          className: styles.menuItem,
          'data-t3-snooze-preset': preset.id,
          onClick: () => onPick(preset.snoozedUntil),
        },
        h('span', {}, preset.label),
        h('span', { className: styles.menuWhen }, preset.whenLabel),
      ),
    ),
    h('div', { className: styles.menuSeparator, role: 'separator' }),
    h(
      'div',
      { className: styles.menuCustom, 'data-t3-snooze-custom': '' },
      h('input', {
        type: 'datetime-local',
        'aria-label': 'Custom snooze time',
        value: custom,
        onChange: (event) => setCustom(event.currentTarget.value),
      }),
      h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          className: styles.menuItem,
          disabled: until === null,
          'data-t3-snooze-confirm': '',
          onClick: () => until !== null && onPick(until),
        },
        'Snooze until then',
      ),
    ),
  )
}

/**
 * A row's context menu. Closes on Escape, an outside press, scroll or a blur of
 * the window, and returns focus to the row it came from.
 * @param {object} props - the menu.
 * @param {MenuState} props.menu - where it is and whose it is.
 * @param {ReadonlyArray<import('./rowActions.js').MenuEntry>} props.entries - what the row offers.
 * @param {number} props.nowMs - the instant the presets are resolved against.
 * @param {(id: import('./rowActions.js').MenuEntry['id']) => void} props.onChoose - an entry without a picker.
 * @param {(until: string) => void} props.onSnooze - a snooze time was chosen.
 * @param {() => void} props.onClose - dismiss.
 * @returns {import('react').ReactElement} the menu.
 */
export function ContextMenu({ menu, entries, nowMs, onChoose, onSnooze, onClose }) {
  const [picking, setPicking] = useState(false)
  const ref = useRef(/** @type {HTMLDivElement | null} */ (null))
  useEffect(() => {
    const opener = document.activeElement
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected && document.activeElement === document.body) opener.focus()
    }
  }, [])
  useEffect(() => {
    const first = ref.current?.querySelector('button:not(:disabled)')
    if (first instanceof HTMLElement) first.focus()
  }, [picking])
  useEffect(() => {
    const onKey = (/** @type {KeyboardEvent} */ event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    const onPress = (/** @type {Event} */ event) => {
      if (!ref.current?.contains(/** @type {Node} */ (event.target))) onClose()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPress, true)
    document.addEventListener('scroll', onClose, true)
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPress, true)
      document.removeEventListener('scroll', onClose, true)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  return h(
    'div',
    {
      ref,
      className: styles.menu,
      role: 'menu',
      'aria-label': 'Session actions',
      'data-t3-menu': menu.sessionId,
      style: clampToViewport(menu),
      onKeyDown: roveFocus,
    },
    picking
      ? h(SnoozePicker, { nowMs, onPick: onSnooze, onBack: () => setPicking(false) })
      : entries.map((entry) =>
          h(
            'button',
            {
              key: entry.id,
              type: 'button',
              role: 'menuitem',
              className: styles.menuItem,
              'data-t3-menu-item': entry.id,
              onClick: () => (entry.id === 'snooze' ? setPicking(true) : onChoose(entry.id)),
            },
            entry.label,
          ),
        ),
  )
}

/**
 * The toast an archive leaves: what happened, and the one-press way back.
 * @param {object} props - the toast.
 * @param {{ message: string, serial: number }} props.toast - what to say; `serial` restarts the timer for a new toast.
 * @param {() => void} props.onUndo - restore what the action replaced.
 * @param {() => void} props.onDismiss - hide the toast.
 * @returns {import('react').ReactElement} the toast.
 */
export function UndoToast({ toast, onUndo, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast.serial, onDismiss])
  return h(
    'div',
    { className: styles.toast, role: 'status', 'data-t3-toast': '' },
    h('span', { className: styles.toastText }, toast.message),
    h('button', { type: 'button', className: styles.toastAction, 'data-t3-undo': '', onClick: onUndo }, 'Undo'),
  )
}
