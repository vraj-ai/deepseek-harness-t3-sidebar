/**
 * Seat tests: the actions our registration injects reach the host's own
 * navigation service, because the seat's standard kit carries none.
 * @module deepseek-harness-t3-sidebar/tests/seat
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { seatActions } from '../src/ui/seat.js'

const recorder = () => {
  const calls = []
  return {
    calls,
    uiWorkspace: {
      startSession: (...args) => calls.push(['startSession', ...args]),
      openSession: (...args) => calls.push(['openSession', ...args]),
    },
  }
}

test('new session forwards the chosen workspace, or none to inherit the current one', () => {
  const { calls, uiWorkspace } = recorder()
  const { startSession } = seatActions(uiWorkspace)()
  startSession('w1')
  startSession()
  assert.deepEqual(calls, [['startSession', 'w1'], ['startSession', undefined]])
})

test('opening a row asks the host to show that session', () => {
  const { calls, uiWorkspace } = recorder()
  seatActions(uiWorkspace)().openSession('s1')
  assert.deepEqual(calls, [['openSession', 's1']])
})
