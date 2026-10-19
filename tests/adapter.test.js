/**
 * Adapter tests: opaque host snapshots in, the shell's own rows and sections out.
 * @module deepseek-harness-t3-sidebar/tests/adapter
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { deriveShellData, parseSession, parseWorkspace } from '../src/ui/adapter.js'

const row = (id, extra = {}) => ({ id, title: `Title ${id}`, blank: false, origin: 'user', updatedAt: 1, ...extra })

const snapshot = (sessions, workspaces = {}) => ({
  sessions: {
    phase: 'ready',
    ids: sessions.map((s) => s.id),
    byId: Object.fromEntries(sessions.map((s) => [s.id, s])),
  },
  workspaces: { phase: 'ready', items: [], pinnedSessionIds: [], archivedSessionIds: [], ...workspaces },
  selectedWorkspaceId: null,
  unnamedWorkspaceLabel: 'Ungrouped',
})

test('a session with no identity is dropped, not guessed', () => {
  assert.equal(parseSession({ title: 'no id' }), null)
  assert.equal(parseSession(null), null)
})

test('an id-shaped title is the host fallback, not a title', () => {
  assert.equal(parseSession({ id: 'session-1', title: 'session-1' }).title, '')
  assert.equal(parseSession({ id: 'session-1', displayTitle: 'Real title' }).title, 'Real title')
})

test('the unnamed workspace draws the supplied label', () => {
  assert.equal(parseWorkspace({ workspaceId: 'w', title: 'default-workspace' }, 'Ungrouped').title, 'Ungrouped')
  assert.equal(parseWorkspace({ title: 'no id' }, 'Ungrouped'), null)
})

test('sections keep the host visibility rule and pin partition', () => {
  const data = deriveShellData(
    snapshot(
      [
        row('a', { updatedAt: 3 }),
        row('b', { updatedAt: 5 }),
        row('pin', { updatedAt: 1 }),
        row('kid', { origin: 'subagent' }),
        row('blank', { blank: true, updatedAt: 9, title: '' }),
        row('gone', { updatedAt: 9 }),
      ],
      { pinnedSessionIds: ['pin'], archivedSessionIds: ['gone'] },
    ),
  )
  assert.deepEqual(
    data.sections.map((section) => [section.key, section.rows.map((r) => r.id)]),
    [
      ['pinned', ['pin']],
      ['active', ['blank', 'b', 'a']],
    ],
  )
  assert.equal(data.sessionCount, 4)
  assert.equal(data.pinnedCount, 1)
  assert.equal(data.archivedCount, 1)
})

test('a workspace scope narrows the rows; an unknown scope falls back to every workspace', () => {
  const rows = [row('a', { updatedAt: 2 }), row('b', { updatedAt: 1 })]
  const items = [{ workspaceId: 'w1', title: 'Work', sessionIds: ['a'] }]
  assert.deepEqual(
    deriveShellData({ ...snapshot(rows, { items }), selectedWorkspaceId: 'w1' }).sessions.map((s) => s.id),
    ['a'],
  )
  assert.equal(deriveShellData({ ...snapshot(rows, { items }), selectedWorkspaceId: 'gone' }).selectedWorkspaceId, null)
  assert.equal(deriveShellData({ ...snapshot(rows, { items }), selectedWorkspaceId: 'gone' }).sessionCount, 2)
})

test('no rows means no sections, and the rail draws none either', () => {
  const data = deriveShellData(snapshot([]))
  assert.deepEqual(data.sections, [])
  assert.equal(data.sessionCount, 0)
})

test('a malformed projection degrades to no outcome', () => {
  assert.equal(parseSession(row('a', { projectionValues: { t3Sidebar: { outcome: 'weird' } } })).projection.outcome, null)
  assert.equal(parseSession(row('a', { projectionValues: {} })).projection, null)
})
