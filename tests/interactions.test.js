/**
 * Interactions through the shell's derivation: what a stored command makes the
 * list draw, in the order it draws it. The commands themselves are pinned in
 * `test/intent.test.ts`; this file pins that the list honours their result.
 * @module deepseek-harness-t3-sidebar/tests/interactions
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyCommand } from '../src/adapter/intent.ts'
import { emptyIntentState, parseSidebarIntentState, serializeSidebarIntentState } from '../src/adapter/store.ts'
import { deriveShellData } from '../src/ui/adapter.js'

const NOW_MS = Date.parse('2026-01-02T12:00:00.000Z')
const NOW = new Date(NOW_MS).toISOString()

const row = (id, extra = {}) => ({ id, title: `Title ${id}`, blank: false, origin: 'user', updatedAt: 1, ...extra })

const snapshot = (sessions, workspaces = {}) => ({
  sessions: { phase: 'ready', ids: sessions.map((s) => s.id), byId: Object.fromEntries(sessions.map((s) => [s.id, s])) },
  workspaces: { phase: 'ready', items: [], pinnedSessionIds: [], archivedSessionIds: [], ...workspaces },
  selectedWorkspaceId: null,
  unnamedWorkspaceLabel: 'Ungrouped',
  nowMs: NOW_MS,
})

const apply = (state, command) => applyCommand(state, command, NOW)
const reload = (state) => parseSidebarIntentState(JSON.parse(serializeSidebarIntentState(state)))
const shelves = (data) => data.sections.filter((s) => s.rows.length > 0).map((s) => [s.key, s.rows.map((r) => r.id)])

test('a renamed row draws the new title everywhere it draws one, after a reload', () => {
  const intent = reload(apply(emptyIntentState(), { type: 'rename', key: 'dsh:a', title: 'Mine' }))
  const data = deriveShellData({ ...snapshot([row('a'), row('b')]), intent })
  assert.deepEqual(data.rows.map((r) => [r.id, r.title, r.view.title]).sort(), [
    ['a', 'Mine', 'Mine'],
    ['b', 'Title b', 'Title b'],
  ])
})

test('pin lifts an unpinned row; unpin drops a row the host pinned', () => {
  const pinned = reload(apply(emptyIntentState(), { type: 'pin', key: 'dsh:a' }))
  assert.deepEqual(shelves(deriveShellData({ ...snapshot([row('a'), row('b')]), intent: pinned })), [
    ['pinned', ['a']],
    ['active', ['b']],
  ])
  const unpinned = reload(apply(emptyIntentState(), { type: 'unpin', key: 'dsh:a' }))
  assert.deepEqual(
    shelves(deriveShellData({ ...snapshot([row('a'), row('b')], { pinnedSessionIds: ['a'] }), intent: unpinned })),
    [['active', ['a', 'b']]],
  )
})

test('archive hides the row and counts it; undo brings it back', () => {
  const archived = apply(emptyIntentState(), { type: 'archive', key: 'dsh:a' })
  const hidden = deriveShellData({ ...snapshot([row('a'), row('b')]), intent: reload(archived) })
  assert.deepEqual(hidden.rows.map((r) => r.id), ['b'])
  assert.equal(hidden.archivedCount, 1)
  const restored = deriveShellData({ ...snapshot([row('a'), row('b')]), intent: apply(archived, { type: 'unarchive', key: 'dsh:a' }) })
  assert.deepEqual(restored.rows.map((r) => r.id).sort(), ['a', 'b'])
  assert.equal(restored.archivedCount, 0)
})

test('snooze, settle and unsettle move the row between shelves and survive a reload', () => {
  const snoozed = reload(apply(emptyIntentState(), { type: 'snooze', key: 'dsh:a', until: '2026-01-02T18:00:00.000Z' }))
  assert.deepEqual(shelves(deriveShellData({ ...snapshot([row('a')]), intent: snoozed })), [['snoozed', ['a']]])
  const woken = apply(snoozed, { type: 'wake', key: 'dsh:a' })
  assert.deepEqual(shelves(deriveShellData({ ...snapshot([row('a')]), intent: woken })), [['active', ['a']]])
  const settled = reload(apply(emptyIntentState(), { type: 'settle', key: 'dsh:a' }))
  assert.deepEqual(shelves(deriveShellData({ ...snapshot([row('a')]), intent: settled })), [['settled', ['a']]])
  const back = apply(settled, { type: 'unsettle', key: 'dsh:a' })
  assert.deepEqual(shelves(deriveShellData({ ...snapshot([row('a')]), intent: back })), [['active', ['a']]])
})

test('a pinned reorder changes the drawn order and survives a reload', () => {
  const sessions = [row('a', { updatedAt: 1 }), row('b', { updatedAt: 2 }), row('c', { updatedAt: 3 })]
  const base = snapshot(sessions, { pinnedSessionIds: ['a', 'b', 'c'] })
  const before = deriveShellData(base)
  const order = before.sections[0].rows.map((r) => r.id)
  const reordered = reload(apply(emptyIntentState(), { type: 'reorder', keys: [...order].reverse().map((id) => `dsh:${id}`) }))
  const after = deriveShellData({ ...base, intent: reordered })
  assert.deepEqual(after.sections[0].rows.map((r) => r.id), [...order].reverse())
})

test('search narrows by title from two characters and clears cleanly', () => {
  const sessions = [row('a', { title: 'Fix the build' }), row('b', { title: 'Write docs' }), row('c', { title: 'Build menu' })]
  const ids = (query) => deriveShellData({ ...snapshot(sessions), query }).rows.map((r) => r.id).sort()
  assert.deepEqual(ids(''), ['a', 'b', 'c'])
  assert.deepEqual(ids('b'), ['a', 'b', 'c'])
  assert.deepEqual(ids(' b '), ['a', 'b', 'c'])
  assert.deepEqual(ids('bu'), ['a', 'c'])
  assert.deepEqual(ids('BUILD'), ['a', 'c'])
  assert.deepEqual(ids('zzz'), [])
  assert.deepEqual(ids(''), ['a', 'b', 'c'])
})

test('a search with no match is not the empty-account state', () => {
  const data = deriveShellData({ ...snapshot([row('a')]), query: 'zz' })
  assert.equal(data.sessionCount, 0)
  assert.equal(data.matchedNothing, true)
  assert.equal(deriveShellData({ ...snapshot([row('a')]), query: '' }).matchedNothing, false)
})

test('jump hints number the first nine rows in the order they are drawn', () => {
  const sessions = Array.from({ length: 11 }, (_, index) => row(`s${index}`, { updatedAt: index + 1 }))
  const data = deriveShellData({ ...snapshot(sessions) })
  assert.equal(data.jumpHints.length, 9)
  assert.deepEqual(data.jumpHints.map((hint) => hint.label), ['1', '2', '3', '4', '5', '6', '7', '8', '9'])
  assert.deepEqual(data.jumpHints.map((hint) => hint.id), data.rows.slice(0, 9).map((r) => r.id))
})

test('jump hints follow a narrowed list, not the full one', () => {
  const sessions = [row('a', { title: 'alpha', updatedAt: 3 }), row('b', { title: 'beta', updatedAt: 2 }), row('c', { title: 'alpine', updatedAt: 1 })]
  const data = deriveShellData({ ...snapshot(sessions), query: 'al' })
  assert.deepEqual(data.jumpHints.map((hint) => [hint.label, hint.id]), [['1', 'a'], ['2', 'c']])
})

test('settling a snoozed row moves it to Settled, and it stays there when the snooze would have ended', () => {
  const snoozed = apply(emptyIntentState(), { type: 'snooze', key: 'dsh:a', until: '2026-01-02T18:00:00.000Z' })
  const settled = apply(snoozed, { type: 'settle', key: 'dsh:a' })
  assert.deepEqual(shelves(deriveShellData({ ...snapshot([row('a')]), intent: settled })), [['settled', ['a']]])
  const later = { ...snapshot([row('a')]), intent: settled, nowMs: Date.parse('2026-01-02T19:00:00.000Z') }
  assert.deepEqual(shelves(deriveShellData(later)), [['settled', ['a']]])
})

test('snoozing a settled row, once it wakes, lands in Active', () => {
  const settled = apply(emptyIntentState(), { type: 'settle', key: 'dsh:a' })
  const snoozed = apply(settled, { type: 'snooze', key: 'dsh:a', until: '2026-01-02T18:00:00.000Z' })
  assert.deepEqual(shelves(deriveShellData({ ...snapshot([row('a')]), intent: snoozed })), [['snoozed', ['a']]])
  const woke = { ...snapshot([row('a')]), intent: snoozed, nowMs: Date.parse('2026-01-02T19:00:00.000Z') }
  assert.deepEqual(shelves(deriveShellData(woke)), [['active', ['a']]])
})

test('an unsettled row rises above a newer active row, as T3 sorts it', () => {
  const sessions = [row('old', { updatedAt: Date.parse('2026-01-01T00:00:00.000Z') }), row('new', { updatedAt: Date.parse('2026-01-02T11:00:00.000Z') })]
  const intent = apply(apply(emptyIntentState(), { type: 'settle', key: 'dsh:old' }), { type: 'unsettle', key: 'dsh:old' })
  const [[, active]] = shelves(deriveShellData({ ...snapshot(sessions), intent }))
  assert.deepEqual(active, ['old', 'new'])
})
