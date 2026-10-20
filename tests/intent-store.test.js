/**
 * The intent writer: commands persist through the real storage contract, apply
 * to the freshest record, and degrade to memory when storage cannot be written.
 * @module deepseek-harness-t3-sidebar/tests/intent-store
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readIntent, STORE_KEY } from '../src/adapter/store.ts'
import { createIntentStore } from '../src/ui/intentStore.js'

const NOW = '2026-01-02T12:00:00.000Z'

const memoryStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  }
}

test('a command is written, and a new page reading the same storage sees it', () => {
  const storage = memoryStorage()
  createIntentStore(storage).dispatch({ type: 'pin', key: 'dsh:a' }, NOW)
  assert.ok(storage.data.has(STORE_KEY))
  const reloaded = createIntentStore(storage)
  assert.equal(readIntent(reloaded.get(), 'dsh:a').pinOverride, 'pinned')
})

test('a command applies to what another window already stored, not to a stale copy', () => {
  const storage = memoryStorage()
  const mine = createIntentStore(storage)
  const theirs = createIntentStore(storage)
  theirs.dispatch({ type: 'pin', key: 'dsh:a' }, NOW)
  mine.dispatch({ type: 'snooze', key: 'dsh:b', until: '2026-01-02T18:00:00.000Z' }, NOW)
  const stored = createIntentStore(storage).get()
  assert.equal(readIntent(stored, 'dsh:a').pinOverride, 'pinned')
  assert.equal(readIntent(stored, 'dsh:b').snoozedUntil, '2026-01-02T18:00:00.000Z')
})

test('listeners hear a change once, and not a command that changes nothing', () => {
  const store = createIntentStore(memoryStorage())
  let heard = 0
  const stop = store.subscribe(() => (heard += 1))
  store.dispatch({ type: 'settle', key: 'dsh:a' }, NOW)
  assert.equal(heard, 1)
  const before = store.get()
  store.dispatch({ type: 'settle', key: 'dsh:a' }, NOW)
  assert.equal(heard, 1)
  assert.equal(store.get(), before)
  stop()
  store.dispatch({ type: 'unsettle', key: 'dsh:a' }, NOW)
  assert.equal(heard, 1)
})

test('without storage, or when a write is refused, the action still holds in memory', () => {
  const none = createIntentStore(null)
  none.dispatch({ type: 'archive', key: 'dsh:a' }, NOW)
  assert.equal(readIntent(none.get(), 'dsh:a').archivedAt, NOW)
  const full = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
  }
  const store = createIntentStore(full)
  store.dispatch({ type: 'rename', key: 'dsh:a', title: 'Mine' }, NOW)
  assert.equal(readIntent(store.get(), 'dsh:a').titleOverride, 'Mine')
})

test('a corrupt record reads as empty and the next command replaces it', () => {
  const storage = memoryStorage({ [STORE_KEY]: '{not json' })
  const store = createIntentStore(storage)
  assert.equal(store.get().threads.size, 0)
  store.dispatch({ type: 'pin', key: 'dsh:a' }, NOW)
  assert.equal(readIntent(createIntentStore(storage).get(), 'dsh:a').pinOverride, 'pinned')
})

test('refresh picks up a record another window wrote', () => {
  const storage = memoryStorage()
  const mine = createIntentStore(storage)
  createIntentStore(storage).dispatch({ type: 'archive', key: 'dsh:a' }, NOW)
  assert.equal(readIntent(mine.get(), 'dsh:a').archivedAt, null)
  mine.refresh()
  assert.equal(readIntent(mine.get(), 'dsh:a').archivedAt, NOW)
})
