/**
 * Fold tests over the published contract: event stream in, wire view out, and
 * the same state reference for every event the sidebar does not read.
 * @module deepseek-harness-t3-sidebar/tests/fold
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { apply, createT3SidebarProjection, inject, name, register, t3SidebarProjection as unit } from '../src/index.js'
import { createSessionMeta } from '../src/meta.js'

/** Build one log event the way `Session.append` shapes it. */
let seq = 0
const at = (type, data, extra = {}) => ({ type, seq: seq++, time: 1_700_000_000_000 + seq, data, ...extra })
const fold = (events) => events.reduce(unit.apply, unit.init())
const view = (events) => unit.wire.view(fold(events))

test('apply is the cordis entry and register is its testable body', () => {
  assert.equal(typeof apply, 'function')
  assert.equal(apply.length, 1)
})

test('declares its cordis shape', () => {
  assert.equal(name, 't3-sidebar')
  assert.deepEqual(inject, ['sessionProjections'])
})



test('empty log serves nulls', () => {
  assert.deepEqual(view([]), {
    lastUserMessageAt: null,
    lastTurnStartedAt: null,
    lastTurnCompletedAt: null,
    outcome: null,
    errorClass: null,
    branch: null,
    pullRequest: null,
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
    branch: null,
    pullRequest: null,
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
  assert.deepEqual(shape, ['branch', 'errorClass', 'lastTurnCompletedAt', 'lastTurnStartedAt', 'lastUserMessageAt', 'outcome', 'pullRequest'])
})

const settle = () => new Promise((resolve) => setImmediate(resolve))
const pullRequest = { number: 7, title: 'pr', url: 'https://example.test/pull/7', state: 'open', draft: false }
const resolved = { branch: 'feature/x', pullRequest }

/** A projection over a scripted resolver, plus the store it reads. */
function withMeta(meta = resolved) {
  const sessionMeta = createSessionMeta({ resolver: { resolve: async () => ({ meta, notes: [], cached: false }), size: 0 } })
  return { sessionMeta, projection: createT3SidebarProjection(sessionMeta) }
}

test('state version 2 carries the session id and meta revision', () => {
  assert.equal(unit.stateVersion, 2)
  assert.deepEqual(
    [unit.init({ id: 's1', cwd: '/w' }).sessionId, unit.init({ id: 's1', cwd: '/w' }).metaRevision],
    ['s1', 0],
  )
})

test('a baseline view reads the store fresh, with no event needed', async () => {
  const { sessionMeta, projection } = withMeta()
  const state = projection.init({ id: 's1' })
  assert.equal(projection.wire.view(state).branch, null)
  await sessionMeta.track('s1', '/w')
  assert.deepEqual([projection.wire.view(state).branch, projection.wire.view(state).pullRequest], ['feature/x', pullRequest])
})

test('an event after the meta moved publishes a new state, and one after that does not', async () => {
  const { sessionMeta, projection } = withMeta()
  const state = projection.init({ id: 's1' })
  const quiet = at('assistant/message', {})
  assert.equal(projection.apply(state, quiet), state)
  await sessionMeta.track('s1', '/w')
  const moved = projection.apply(state, quiet)
  assert.notEqual(moved, state)
  assert.equal(projection.wire.view(moved).branch, 'feature/x')
  assert.equal(projection.apply(moved, quiet), moved)
})

test('meta for one session never leaks into another', async () => {
  const { sessionMeta, projection } = withMeta()
  await sessionMeta.track('s1', '/w')
  const other = projection.init({ id: 's2' })
  assert.equal(projection.apply(other, at('assistant/message', {})), other)
  assert.equal(projection.wire.view(other).branch, null)
})

test('init starts the probe for a session that has a cwd', async () => {
  const { sessionMeta, projection } = withMeta()
  projection.init({ id: 's1', cwd: '/w' })
  await settle()
  assert.equal(sessionMeta.get('s1').branch, 'feature/x')
})

test('registration also tracks live session events and forgets disposed sessions', async () => {
  const { sessionMeta, projection } = withMeta()
  const registered = []
  const listeners = {}
  const warnings = []
  register(
    {
      sessionProjections: { register: (definition) => registered.push(definition) },
      on: (event, listener) => (listeners[event] = listener),
      logger: { warn: (message) => warnings.push(message) },
    },
    { sessionMeta, projection },
  )
  assert.deepEqual(registered, [projection])
  const session = { id: 's1', header: { cwd: '/w' } }
  listeners['session/event'](session, at('turn/start', {}))
  await settle()
  assert.equal(sessionMeta.get('s1').branch, 'feature/x')
  listeners['session/disposed'](session)
  assert.equal(sessionMeta.get('s1').branch, null)
  assert.deepEqual(warnings, [])
})

test('probe notes are logged once, on the probe that produced them', async () => {
  const sessionMeta = createSessionMeta({
    resolver: { resolve: async (cwd) => ({ meta: { branch: 'main', pullRequest: null }, notes: ['gh is not authenticated'], cached: cwd === 'hit' }), size: 0 },
  })
  const projection = createT3SidebarProjection(sessionMeta)
  const listeners = {}
  const warnings = []
  register(
    { sessionProjections: { register() {} }, on: (event, listener) => (listeners[event] = listener), logger: { warn: (m) => warnings.push(m) } },
    { sessionMeta, projection },
  )
  listeners['session/event']({ id: 's1', header: { cwd: '/w' } }, at('turn/start', {}))
  listeners['session/event']({ id: 's2', header: { cwd: 'hit' } }, at('turn/start', {}))
  await settle()
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /gh is not authenticated/)
})
