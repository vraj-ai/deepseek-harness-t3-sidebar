/**
 * The writer for the plugin's durable intent.
 *
 * Every command is applied to the record as storage holds it right now, not to
 * the copy this page last read, so a second window's pin is not overwritten by
 * this window's snooze. Storage that is missing or refuses a write degrades to
 * in-memory state: the action still takes effect for the page's lifetime.
 * @module deepseek-harness-t3-sidebar/ui/intentStore
 */

import { applyCommand } from '../adapter/intent.ts'
import {
  emptyIntentState,
  parseSidebarIntentState,
  serializeSidebarIntentState,
  STORE_KEY,
} from '../adapter/store.ts'

/** @typedef {import('../adapter/store.ts').SidebarIntentState} IntentState */
/** @typedef {import('../adapter/intent.ts').IntentCommand} IntentCommand */
/** @typedef {Pick<Storage, 'getItem' | 'setItem'>} IntentStorage */

/**
 * @param {IntentStorage | null} storage - where the record lives, if anywhere.
 * @param {IntentState} fallback - what to answer without storage.
 * @returns {IntentState} the stored record, validated; empty when absent or corrupt.
 */
function load(storage, fallback) {
  if (storage === null) return fallback
  try {
    const raw = storage.getItem(STORE_KEY)
    return raw === null ? emptyIntentState() : parseSidebarIntentState(JSON.parse(raw))
  } catch {
    return emptyIntentState()
  }
}

/**
 * @param {IntentStorage | null} storage - where to write.
 * @param {IntentState} state - the record.
 */
function save(storage, state) {
  try {
    storage?.setItem(STORE_KEY, serializeSidebarIntentState(state))
  } catch {
    // Quota or a private window: the in-memory state still carries the action.
  }
}

/**
 * @typedef {object} IntentStore
 * @property {() => IntentState} get - the current state; the same reference until a command changes it.
 * @property {(command: IntentCommand, now: string) => void} dispatch - apply a command and persist the result.
 * @property {() => void} refresh - re-read storage, after another window wrote it.
 * @property {(listener: () => void) => () => void} subscribe - call back on change; returns the unsubscribe.
 */

/**
 * @param {IntentStorage | null} storage - the page's local storage, or null without one.
 * @returns {IntentStore} the store.
 */
export function createIntentStore(storage) {
  let state = load(storage, emptyIntentState())
  /** @type {Set<() => void>} */
  const listeners = new Set()
  const publish = (/** @type {IntentState} */ next) => {
    state = next
    for (const listener of listeners) listener()
  }
  return {
    get: () => state,
    dispatch(command, now) {
      const base = load(storage, state)
      const next = applyCommand(base, command, now)
      if (next === base) return
      save(storage, next)
      publish(next)
    },
    refresh() {
      publish(load(storage, state))
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
