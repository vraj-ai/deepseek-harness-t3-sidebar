/**
 * The actions a row offers, and the command each one dispatches.
 * @module deepseek-harness-t3-sidebar/tests/row-actions
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { emptyIntentState, withIntent } from '../src/adapter/store.ts'
import { applyCommand } from '../src/adapter/intent.ts'
import { commandFor, customSnoozeUntil, jumpTarget, keyboardMoveTarget, menuEntries, reorderCommand } from '../src/ui/rowActions.js'
import { deriveShellData } from '../src/ui/adapter.js'

const NOW_MS = Date.parse('2026-01-02T12:00:00.000Z')
const NOW = new Date(NOW_MS).toISOString()
const row = (id, extra = {}) => ({ id, title: `Title ${id}`, blank: false, origin: 'user', updatedAt: 1, ...extra })
const rowsOf = (sessions, intent = emptyIntentState(), workspaces = {}) =>
  deriveShellData({
    sessions: { phase: 'ready', ids: sessions.map((s) => s.id), byId: Object.fromEntries(sessions.map((s) => [s.id, s])) },
    workspaces: { phase: 'ready', items: [], pinnedSessionIds: [], archivedSessionIds: [], ...workspaces },
    selectedWorkspaceId: null,
    unnamedWorkspaceLabel: 'Ungrouped',
    nowMs: NOW_MS,
    intent,
  }).rows
const ids = (entries) => entries.map((entry) => entry.id)

test('an idle row offers rename, pin, snooze, settle and archive', () => {
  const [r] = rowsOf([row('a')])
  assert.deepEqual(ids(menuEntries(r, NOW)), ['rename', 'pin', 'snooze', 'settle', 'archive'])
})

test('a pinned row offers unpin; a settled row unsettle; a snoozed row wake', () => {
  const [pinned] = rowsOf([row('a')], emptyIntentState(), { pinnedSessionIds: ['a'] })
  assert.ok(ids(menuEntries(pinned, NOW)).includes('unpin'))
  const [settled] = rowsOf([row('a')], withIntent(emptyIntentState(), 'dsh:a', { settledOverride: 'settled', settledAt: NOW }))
  assert.deepEqual(ids(menuEntries(settled, NOW)), ['rename', 'pin', 'snooze', 'unsettle', 'archive'])
  const [snoozed] = rowsOf([row('a')], withIntent(emptyIntentState(), 'dsh:a', { snoozedUntil: '2026-01-02T18:00:00.000Z', snoozedAt: NOW }))
  assert.deepEqual(ids(menuEntries(snoozed, NOW)), ['rename', 'pin', 'wake', 'settle', 'archive'])
})

test('a row mid-turn cannot be snoozed or settled out from under its own work', () => {
  const [working] = rowsOf([row('a', { running: true })])
  assert.deepEqual(ids(menuEntries(working, NOW)), ['rename', 'pin', 'archive'])
})

test('a row waiting on the user cannot be snoozed', () => {
  const [r] = rowsOf([row('a')])
  const waiting = { ...r, shell: { ...r.shell, hasPendingApprovals: true } }
  assert.equal(ids(menuEntries(waiting, NOW)).includes('snooze'), false)
})

test('each entry maps to the command on the row key', () => {
  assert.deepEqual(commandFor('pin', 'a'), { type: 'pin', key: 'dsh:a' })
  assert.deepEqual(commandFor('unpin', 'a'), { type: 'unpin', key: 'dsh:a' })
  assert.deepEqual(commandFor('settle', 'a'), { type: 'settle', key: 'dsh:a' })
  assert.deepEqual(commandFor('unsettle', 'a'), { type: 'unsettle', key: 'dsh:a' })
  assert.deepEqual(commandFor('wake', 'a'), { type: 'wake', key: 'dsh:a' })
  assert.deepEqual(commandFor('archive', 'a'), { type: 'archive', key: 'dsh:a' })
})

test('rename and snooze carry their argument; without it there is no command', () => {
  assert.deepEqual(commandFor('rename', 'a', 'Mine'), { type: 'rename', key: 'dsh:a', title: 'Mine' })
  assert.deepEqual(commandFor('snooze', 'a', '2026-01-02T18:00:00.000Z'), {
    type: 'snooze',
    key: 'dsh:a',
    until: '2026-01-02T18:00:00.000Z',
  })
  assert.equal(commandFor('rename', 'a'), null)
  assert.equal(commandFor('snooze', 'a'), null)
})

test('a custom snooze must land in the future', () => {
  const nowMs = Date.parse('2026-01-02T12:00:00.000Z')
  assert.equal(customSnoozeUntil('', nowMs), null)
  assert.equal(customSnoozeUntil('not a time', nowMs), null)
  assert.equal(customSnoozeUntil('2026-01-02T11:00:00.000Z', nowMs), null)
  assert.equal(customSnoozeUntil('2026-01-02T12:00:00.000Z', nowMs), null)
  assert.equal(customSnoozeUntil('2026-01-02T13:00:00.000Z', nowMs), '2026-01-02T13:00:00.000Z')
})

test('a drag lands a pinned row before its target, or last, and a no-op drag is no command', () => {
  const shelf = ['a', 'b', 'c']
  assert.deepEqual(reorderCommand(shelf, 'c', 'a'), { type: 'reorder', keys: ['dsh:c', 'dsh:a', 'dsh:b'] })
  assert.deepEqual(reorderCommand(shelf, 'a', null), { type: 'reorder', keys: ['dsh:b', 'dsh:c', 'dsh:a'] })
  assert.equal(reorderCommand(shelf, 'a', 'a'), null)
  assert.equal(reorderCommand(shelf, 'a', 'b'), null)
  assert.equal(reorderCommand(shelf, 'c', null), null)
  assert.equal(reorderCommand(shelf, 'zz', 'a'), null)
})

test('Alt+arrow moves a row one place and stops at the edges', () => {
  const shelf = ['a', 'b', 'c']
  assert.equal(keyboardMoveTarget(shelf, 'a', 'up'), undefined)
  assert.equal(keyboardMoveTarget(shelf, 'c', 'down'), undefined)
  assert.equal(keyboardMoveTarget(shelf, 'b', 'up'), 'a')
  assert.equal(keyboardMoveTarget(shelf, 'a', 'down'), 'c')
  assert.equal(keyboardMoveTarget(shelf, 'b', 'down'), null)
  assert.equal(keyboardMoveTarget(shelf, 'zz', 'down'), undefined)
  const down = reorderCommand(shelf, 'a', keyboardMoveTarget(shelf, 'a', 'down') ?? null)
  assert.deepEqual(down, { type: 'reorder', keys: ['dsh:b', 'dsh:a', 'dsh:c'] })
})

test('a reorder changes the order the shell draws, by rendered position', () => {
  const sessions = [row('a', { updatedAt: 1 }), row('b', { updatedAt: 2 }), row('c', { updatedAt: 3 })]
  const pinned = { pinnedSessionIds: ['a', 'b', 'c'] }
  const drawn = rowsOf(sessions, emptyIntentState(), pinned).map((r) => r.id)
  const command = reorderCommand(drawn, drawn[2], drawn[0])
  const intent = applyCommand(emptyIntentState(), command, NOW)
  assert.deepEqual(rowsOf(sessions, intent, pinned).map((r) => r.id), [drawn[2], drawn[0], drawn[1]])
})

test('⌘ or Ctrl plus 1-9 jumps to that hint; other keys do not', () => {
  const hints = [{ label: '1', id: 'a' }, { label: '2', id: 'b' }]
  const key = (extra) => ({ key: '1', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, ...extra })
  assert.equal(jumpTarget(key({}), hints), 'a')
  assert.equal(jumpTarget(key({ metaKey: false, ctrlKey: true, key: '2' }), hints), 'b')
  assert.equal(jumpTarget(key({ key: '3' }), hints), null)
  assert.equal(jumpTarget(key({ key: '0' }), hints), null)
  assert.equal(jumpTarget(key({ metaKey: false }), hints), null)
  assert.equal(jumpTarget(key({ shiftKey: true }), hints), null)
  assert.equal(jumpTarget(key({ altKey: true }), hints), null)
})
