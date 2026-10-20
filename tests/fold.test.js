/**
 * Fold tests over the published contract: event stream in, wire view out, and
 * the same state reference for every event the sidebar does not read.
 * @module deepseek-harness-t3-sidebar/tests/fold
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { apply, inject, name, t3SidebarProjection as unit } from '../src/index.js'

/** Build one log event the way `Session.append` shapes it. */
let seq = 0
const at = (type, data, extra = {}) => ({ type, seq: seq++, time: 1_700_000_000_000 + seq, data, ...extra })
const fold = (events) => events.reduce(unit.apply, unit.init())
const view = (events) => unit.wire.view(fold(events))

test('declares its cordis shape', () => {
  assert.equal(name, 't3-sidebar')
  assert.deepEqual(inject, ['sessionProjections'])
})

test('registration is the whole plugin body', () => {
  const registered = []
  apply({ sessionProjections: { register: (definition) => registered.push(definition) } })
  assert.deepEqual(registered, [unit])
})

test('empty log serves nulls', () => {
  assert.deepEqual(view([]), {
    lastUserMessageAt: null,
    lastTurnStartedAt: null,
    lastTurnCompletedAt: null,
    outcome: null,
    errorClass: null,
  })
})

test('a completed turn records prompt, boundaries and ok', () => {
  const prompt = at('user/message', { content: [] })
  const start = at('turn/start', { turn: 1 })
  const end = at('turn/end', { turn: 1, reason: { kind: 'completed' } })
  assert.deepEqual(view([prompt, start, end]), {
    lastUserMessageAt: prompt.time,
    lastTurnStartedAt: start.time,
    lastTurnCompletedAt: end.time,
    outcome: 'ok',
    errorClass: null,
  })
})

test('a failed turn carries the error class', () => {
  const end = at('turn/end', { turn: 1, reason: { kind: 'error', error: { message: 'nope', code: 'RATE_LIMIT' } } })
  assert.equal(view([at('turn/start', { turn: 1 }), end]).outcome, 'failed')
  assert.equal(view([at('turn/start', { turn: 1 }), end]).errorClass, 'RATE_LIMIT')
})

test('a retried failure that still ends the turn keeps the retried class', () => {
  const retry = at('llm/retry', { failure: { message: 'slow down', code: 'RATE_LIMIT' } })
  const end = at('turn/end', { turn: 1, reason: { kind: 'error', error: { message: 'gave up' } } })
  assert.equal(view([at('turn/start', { turn: 1 }), retry, end]).errorClass, 'RATE_LIMIT')
})

test('a new turn clears the previous turn outcome until it ends', () => {
  const failed = at('turn/end', { turn: 1, reason: { kind: 'error', error: { message: 'nope', code: 'RATE_LIMIT' } } })
  const next = at('turn/start', { turn: 2 })
  const mid = view([at('turn/start', { turn: 1 }), failed, next])
  assert.deepEqual([mid.lastTurnStartedAt, mid.lastTurnCompletedAt, mid.outcome, mid.errorClass], [next.time, failed.time, null, null])
  const done = at('turn/end', { turn: 2, reason: { kind: 'completed' } })
  assert.deepEqual([view([at('turn/start', { turn: 1 }), failed, next, done]).outcome, view([failed, next, done]).errorClass], ['ok', null])
})

test('a retried failure that recovers leaves no error class', () => {
  const retry = at('llm/retry', { failure: { message: 'slow down', code: 'RATE_LIMIT' } })
  const end = at('turn/end', { turn: 1, reason: { kind: 'completed' } })
  assert.deepEqual(
    [view([at('turn/start', { turn: 1 }), retry, end]).outcome, view([at('turn/start', { turn: 1 }), retry, end]).errorClass],
    ['ok', null],
  )
})

test('a user stop is interrupted without an error class', () => {
  const end = at('turn/end', { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } })
  assert.deepEqual([view([end]).outcome, view([end]).errorClass], ['interrupted', null])
})

test('a restart-closed turn is interrupted', () => {
  const end = at('turn/end', { turn: 1, reason: { kind: 'interrupted' } })
  assert.deepEqual([view([end]).outcome, view([end]).errorClass], ['interrupted', 'INTERRUPTED'])
})

test('a compaction checkpoint does not move the prompt clock', () => {
  const prompt = at('user/message', { content: [] })
  const checkpoint = at('user/message', { content: [] }, { surfaceOp: { op: 'replace', startSeq: 0, endSeq: 0 } })
  assert.equal(view([prompt, checkpoint]).lastUserMessageAt, prompt.time)
})

test('unrelated events keep the state reference', () => {
  const state = fold([at('turn/start', { turn: 1 })])
  for (const event of [at('step/start', { turn: 1, step: 1 }), at('assistant/message', {}), at('tool/call', {}), at('goal/change', {})]) {
    assert.equal(unit.apply(state, event), state, event.type)
  }
})

test('the wire view is the stable contract shape', () => {
  const shape = Object.keys(view([at('user/message', {})])).sort()
  assert.deepEqual(shape, ['errorClass', 'lastTurnCompletedAt', 'lastTurnStartedAt', 'lastUserMessageAt', 'outcome'])
})
