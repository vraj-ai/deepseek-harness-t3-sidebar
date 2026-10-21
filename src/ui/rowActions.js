/**
 * What a row offers and what each choice dispatches. Pure: no React, no storage,
 * so the whole interaction table is testable without a page.
 * @module deepseek-harness-t3-sidebar/ui/rowActions
 */

import { threadKey } from '../adapter/dsh.ts'
import { moveBefore } from '../adapter/intent.ts'
import { canSearchThreadMessages } from '../model/sidebar.ts'
import { canSnooze } from '../model/threadSettled.ts'

/**
 * @typedef {object} MenuEntry
 * @property {'rename' | 'pin' | 'unpin' | 'snooze' | 'wake' | 'settle' | 'unsettle' | 'archive'} id - the action.
 * @property {string} label - the visible text.
 */

/** @typedef {import('../adapter/intent.ts').IntentCommand} IntentCommand */

const LABELS = /** @type {const} */ ({
  rename: 'Rename',
  pin: 'Pin',
  unpin: 'Unpin',
  snooze: 'Snooze…',
  wake: 'Wake now',
  settle: 'Settle',
  unsettle: 'Unsettle',
  archive: 'Archive',
})

/**
 * The store key of a session's intent.
 * @param {string} sessionId - Harness session id.
 * @returns {string} the key.
 */
export function intentKey(sessionId) {
  return threadKey({ environmentId: 'dsh', sessionId })
}

/**
 * The actions a row's context menu and hover buttons draw, in T3's order.
 * A row mid-turn is neither snoozed nor settled out from under its own work;
 * a row waiting on the user cannot be snoozed past the question it holds.
 * @param {import('./types.js').DrawnRow} row - the row.
 * @param {string} now - ISO instant.
 * @returns {MenuEntry[]} the entries.
 */
export function menuEntries(row, now) {
  const working = row.section === 'working'
  /** @type {MenuEntry['id'][]} */
  const ids = ['rename', row.pinned ? 'unpin' : 'pin']
  if (row.section === 'snoozed') ids.push('wake')
  else if (!working && canSnooze(row.shell, { now })) ids.push('snooze')
  if (!working) ids.push(row.section === 'settled' ? 'unsettle' : 'settle')
  ids.push('archive')
  return ids.map((id) => ({ id, label: LABELS[id] }))
}

/**
 * The command one menu choice dispatches.
 * @param {MenuEntry['id']} id - the chosen action.
 * @param {string} sessionId - the row's session.
 * @param {string} [arg] - the new title for `rename`, the wake instant for `snooze`.
 * @returns {IntentCommand | null} the command, or null when a needed argument is missing.
 */
export function commandFor(id, sessionId, arg) {
  const key = intentKey(sessionId)
  switch (id) {
    case 'rename':
      return arg === undefined ? null : { type: 'rename', key, title: arg }
    case 'snooze':
      return arg === undefined ? null : { type: 'snooze', key, until: arg }
    default:
      return { type: id, key }
  }
}

/**
 * The wake instant for a `datetime-local` value, or null when it is not a
 * future time. A past instant would snooze a row into its own wake.
 * @param {string} value - the input's value, local time.
 * @param {number} nowMs - the current instant.
 * @returns {string | null} ISO instant.
 */
export function customSnoozeUntil(value, nowMs) {
  const at = Date.parse(value)
  return Number.isNaN(at) || at <= nowMs ? null : new Date(at).toISOString()
}

/**
 * Whether the pinned shelf may be reordered. The stored keys order the whole
 * pinned list, so a scope or a search that draws part of it cannot rewrite it.
 * @param {{ query: string, selectedWorkspaceId: string | null }} view - what the list is narrowed by.
 * @returns {boolean} true when the shelf drawn is the whole pinned shelf.
 */
export function canReorder({ query, selectedWorkspaceId }) {
  return selectedWorkspaceId === null && !canSearchThreadMessages(query)
}

/**
 * The reorder a drag (or an Alt+arrow) asks for inside the pinned shelf.
 * @param {readonly string[]} shelfIds - the shelf's rows, drawn order.
 * @param {string} movedId - the row moved.
 * @param {string | null} beforeId - the row it lands before; null lands it last.
 * @returns {IntentCommand | null} the command, or null when the order would not change.
 */
export function reorderCommand(shelfIds, movedId, beforeId) {
  const next = moveBefore(shelfIds, movedId, beforeId)
  return next.every((id, index) => id === shelfIds[index]) ? null : { type: 'reorder', keys: next.map(intentKey) }
}

/**
 * Where an Alt+arrow moves a row: the row it should land before.
 * @param {readonly string[]} shelfIds - the shelf's rows, drawn order.
 * @param {string} id - the focused row.
 * @param {'up' | 'down'} direction - the arrow.
 * @returns {string | null | undefined} the neighbour to land before (null: last), or undefined at an edge.
 */
export function keyboardMoveTarget(shelfIds, id, direction) {
  const at = shelfIds.indexOf(id)
  if (at === -1) return undefined
  if (direction === 'up') return at === 0 ? undefined : shelfIds[at - 1]
  return at === shelfIds.length - 1 ? undefined : (shelfIds[at + 2] ?? null)
}

/**
 * The session a ⌘/Ctrl+digit key jumps to. The hints are the first nine rows in
 * drawn order, so the digit is an index into the list the user sees.
 * @param {{ key: string, metaKey: boolean, ctrlKey: boolean, altKey: boolean, shiftKey: boolean }} event - the key.
 * @param {ReadonlyArray<{ label: string, id: string }>} hints - `jumpHints`.
 * @returns {string | null} session id, or null when the key is not a jump.
 */
export function jumpTarget(event, hints) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return null
  return hints.find((hint) => hint.label === event.key)?.id ?? null
}
