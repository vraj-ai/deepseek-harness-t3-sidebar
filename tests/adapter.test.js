/**
 * Adapter tests: opaque host snapshots in, the shell's own rows and sections out.
 * @module deepseek-harness-t3-sidebar/tests/adapter
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { emptyIntentState, withIntent } from '../src/adapter/store.ts'
import { deriveShellData, nextTickDelay, parseSession, parseWorkspace } from '../src/ui/adapter.js'

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

test('sections keep T3 visibility: no subagents, archived dropped, pinned first, newest first', () => {
  const data = deriveShellData(
    snapshot(
      [
        row('a', { updatedAt: 3 }),
        row('b', { updatedAt: 5 }),
        row('pin', { updatedAt: 1 }),
        row('kid', { origin: 'subagent' }),
        row('blank', { blank: true, updatedAt: 9, title: '', retainedBy: { mainView: 1 } }),
        row('gone', { updatedAt: 9 }),
      ],
      { pinnedSessionIds: ['pin'], archivedSessionIds: ['gone'] },
    ),
  )
  // T3's shelves: pinned then active, empty shelves omitted, each sorted by
  // its own rule — pinned by pin order key, active by return time (newest first).
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

test('no rows leaves the empty Active shelf and no rows', () => {
  const data = deriveShellData(snapshot([]))
  // T3 always draws Active as the fall-through bucket (Sidebar.tsx:3558-3565).
  assert.deepEqual(
    data.sections.map((section) => [section.key, section.rows.length]),
    [['active', 0]],
  )
  assert.equal(data.sessionCount, 0)
})

test('a malformed projection degrades to no outcome', () => {
  assert.equal(parseSession(row('a', { projectionValues: { t3Sidebar: { outcome: 'weird' } } })).projection.outcome, null)
  assert.equal(parseSession(row('a', { projectionValues: {} })).projection, null)
})

test('the current blank is the one the main view holds, not the first listed', () => {
  const data = deriveShellData(
    snapshot(
      [
        row('old', { blank: true, title: '', updatedAt: 1 }),
        row('new', { blank: true, title: '', updatedAt: 2, retainedBy: { mainView: 1 } }),
      ],
      { archivedSessionIds: ['old'] },
    ),
  )
  assert.deepEqual(data.sessions.map((s) => s.id), ['new'])
})

test('no blank row is drawn while the main view holds an ordinary session', () => {
  const data = deriveShellData(
    snapshot([row('a', { retainedBy: { mainView: 1 } }), row('spare', { blank: true, title: '' })]),
  )
  assert.deepEqual(data.sessions.map((s) => s.id), ['a'])
})

test('the projection map carries every listed session and its full value, drawn or hidden', () => {
  const value = { lastUserMessageAt: 1, lastTurnStartedAt: 2, lastTurnCompletedAt: 3, outcome: 'failed', errorClass: 'RATE_LIMIT' }
  const projected = { projectionValues: { t3Sidebar: value } }
  const data = deriveShellData({
    ...snapshot(
      [row('a', projected), row('kid', { origin: 'subagent', ...projected }), row('gone', projected), row('plain')],
      { archivedSessionIds: ['gone'], items: [{ workspaceId: 'w1', title: 'Work', sessionIds: ['plain'] }] },
    ),
    selectedWorkspaceId: 'w1',
  })
  assert.equal(data.sessionCount, 1)
  assert.deepEqual(data.projections, { a: value, kid: value, gone: value })
})

test('a seat row draws its own display title when no title is projected', () => {
  const data = deriveShellData(snapshot([row('a', { displayTitle: 'Fix login', cwd: '/work/app' })]))
  assert.deepEqual(data.rows.map((r) => r.view.title), ['Fix login'])
})

const NOW_MS = Date.parse('2026-01-02T12:00:00.000Z')
const snoozedUntil = (iso) =>
  withIntent(emptyIntentState(), 'dsh:a', { snoozedAt: '2026-01-02T11:00:00.000Z', snoozedUntil: iso })

test('the list re-derives every second while a row is working', () => {
  const data = deriveShellData({ ...snapshot([row('a', { running: true })]), nowMs: NOW_MS })
  assert.equal(nextTickDelay(data.rows, NOW_MS), 1000)
})

test('a quiet list re-derives when its nearest snooze wakes', () => {
  const intent = snoozedUntil('2026-01-02T12:00:05.000Z')
  const before = deriveShellData({ ...snapshot([row('a')]), nowMs: NOW_MS, intent })
  assert.deepEqual(before.sections.map((s) => s.key), ['snoozed', 'active'])
  assert.equal(nextTickDelay(before.rows, NOW_MS), 5000)
  const after = deriveShellData({ ...snapshot([row('a')]), nowMs: NOW_MS + 5000, intent })
  assert.equal(after.sections.some((s) => s.key === 'snoozed'), false)
})

test('a quiet list with no snooze re-derives each minute for its relative times', () => {
  const data = deriveShellData({ ...snapshot([row('a')]), nowMs: NOW_MS })
  assert.equal(nextTickDelay(data.rows, NOW_MS), 60_000)
})

test('a row finds its workspace by listing, else by its working directory', () => {
  const items = [
    { workspaceId: 'w1', title: 'App', cwd: '/work/app', sessionIds: [] },
    { workspaceId: 'w2', title: 'Docs', cwd: '/work/docs', sessionIds: ['listed'] },
  ]
  const data = deriveShellData(
    snapshot([row('by-dir', { cwd: '/work/app', updatedAt: 2 }), row('listed', { cwd: '/elsewhere' }), row('loose')], { items }),
  )
  assert.deepEqual(
    data.rows.map((r) => [r.id, r.workspace?.workspaceId ?? null]),
    [['by-dir', 'w1'], ['listed', 'w2'], ['loose', null]],
  )
})
