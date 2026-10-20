/**
 * Contract test across the two halves: the host fold's wire view, fed to the
 * client adapter as a list row's `t3Sidebar`, must reach the model's run status.
 * @module deepseek-harness-t3-sidebar/tests/sail-wire
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { adaptSession } from '../src/adapter/dsh.ts'
import { emptyIntentState } from '../src/adapter/store.ts'
import { t3SidebarProjection as unit } from '../src/index.js'

let seq = 0
const at = (type, data, extra = {}) => ({ type, seq: seq++, time: 1_700_000_000_000 + seq, data, ...extra })
const wire = (events) => unit.wire.view(events.reduce(unit.apply, unit.init()))

const shellFor = (t3Sidebar) =>
  adaptSession({
    row: { sessionId: 's', updatedAt: 1_700_000_000_000, projections: { values: { t3Sidebar } } },
    status: undefined,
    pinned: false,
    archived: false,
    titleOverride: null,
    intent: emptyIntentState(),
    environmentId: 'dsh',
    now: '2026-01-01T00:00:00.000Z',
  })

const turn = (reason) => [at('user/message', { content: [] }), at('turn/start', { turn: 1 }), at('turn/end', { turn: 1, reason })]

test('a completed turn on the wire reads as a completed run', () => {
  const view = wire(turn({ kind: 'completed' }))
  const shell = shellFor(view)
  assert.equal(shell.latestRun?.status, 'completed')
  assert.equal(shell.sail.lastTurnCompletedAt, new Date(view.lastTurnCompletedAt).toISOString())
  assert.equal(shell.sail.lastUserMessageAt, new Date(view.lastUserMessageAt).toISOString())
})

test('a failed turn on the wire reads as a failed run with a model error class', () => {
  const shell = shellFor(wire(turn({ kind: 'error', error: { message: 'nope', code: 'RATE_LIMIT' } })))
  assert.equal(shell.latestRun?.status, 'failed')
  assert.equal(shell.sail.outcome, 'failed')
  assert.equal(shell.sail.errorClass, 'other')
})

test('an interrupted turn on the wire reads as cancelled', () => {
  const shell = shellFor(wire(turn({ kind: 'aborted' })))
  assert.equal(shell.latestRun?.status, 'cancelled')
})

test('a turn still running on the wire carries its start and no outcome', () => {
  const view = wire([at('user/message', { content: [] }), at('turn/start', { turn: 1 })])
  const shell = shellFor(view)
  assert.equal(shell.sail.outcome, 'none')
  assert.equal(shell.sail.lastTurnStartedAt, new Date(view.lastTurnStartedAt).toISOString())
})
