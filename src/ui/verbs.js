/**
 * The browser half's verb module: one place that talks to the harness, one
 * place that reads and writes the plugin's durable store.
 *
 * Verbs are the app's own RPCs, exactly as the shipped workspace browser calls
 * them (`packages/api/workspace-controller`, `packages/api/session-controller`):
 *
 * | action   | call                                                       |
 * |----------|------------------------------------------------------------|
 * | rename   | `session/rename { request: { sessionId, title } }`         |
 * | pin      | `workspace/pinSession { request: { sessionId } }`          |
 * | unpin    | `workspace/unpinSession { request: { sessionId } }`        |
 * | archive  | `workspace/archiveSession { request: { sessionId } }`      |
 * | restore  | `workspace/unarchiveSession { request: { sessionId } }`    |
 *
 * Each verb resolves to `{ ok, value?, code? }`; the caller never sees a throw.
 * A verb that fails leaves the store untouched, so the row keeps its old state.
 *
 * @module deepseek-harness-t3-sidebar/ui/verbs
 */

import {
  emptyIntentState,
  parseSidebarIntentState,
  serializeSidebarIntentState,
  STORE_KEY,
} from '../adapter/store.ts'

/**
 * @typedef {{ ok: true } | { ok: false, code: string }} VerbResult
 */

/**
 * One gateway RPC, shaped like the app's own client (`{ type, rpcId, method,
 * payload: { args } }`). The origin cookie is the page's, so nothing is
 * re-authenticated here.
 * @param {string} method - gateway method, e.g. `session/rename`.
 * @param {unknown} args - the payload's `args` object.
 * @returns {Promise<VerbResult>} ok, or the failure code.
 */
async function call(method, args) {
  try {
    const response = await fetch(`/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args } }),
    })
    if (!response.ok) return { ok: false, code: `http-${response.status}` }
    const body = await response.json()
    const result = body?.result
    if (result?.ok === true) return { ok: true }
    return { ok: false, code: String(result?.error?.code ?? 'unknown') }
  } catch (error) {
    return { ok: false, code: `transport:${String(error).slice(0, 80)}` }
  }
}

/**
 * The verbs the sidebar drives, each keyed by the name its control carries in
 * `data-t3-interaction`.
 * @type {Readonly<Record<string, (sessionId: string, arg?: string) => Promise<VerbResult>>>}
 */
export const VERBS = {
  rename: (sessionId, title) => call('session/rename', { request: { sessionId, title } }),
  pin: (sessionId) => call('workspace/pinSession', { request: { sessionId } }),
  unpin: (sessionId) => call('workspace/unpinSession', { request: { sessionId } }),
  archive: (sessionId) => call('workspace/archiveSession', { request: { sessionId } }),
  unarchive: (sessionId) => call('workspace/unarchiveSession', { request: { sessionId } }),
  /** Reorder inside a workspace account (`insertSessionBefore(workspaceId, sessionId, before)`). */
  move: (sessionId, beforeSessionId) =>
    call('workspace/insertSessionBefore', { request: { sessionId, beforeSessionId } }),
}

/** Read and validate the durable store. A page without storage reads empty. */
export function loadStore() {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORE_KEY)
    return raw === null ? emptyIntentState() : parseSidebarIntentState(JSON.parse(raw))
  } catch {
    return emptyIntentState()
  }
}

/**
 * Write the store, then tell this page's listeners. The write is synchronous and
 * throws only when storage refuses (quota, private mode); callers treat that as
 * a failed action rather than a silent one.
 * @param {SidebarIntentState} state - the next state.
 * @returns {boolean} whether it reached storage.
 */
export function saveStore(state) {
  try {
    localStorage.setItem(STORE_KEY, serializeSidebarIntentState(state))
  } catch {
    return false
  }
  for (const listener of listeners) listener(state)
  return true
}

/** @type {Set<(state: SidebarIntentState) => void>} */
const listeners = new Set()

/**
 * Subscribe to writes made through {@link saveStore} in this page.
 * @param {(state: SidebarIntentState) => void} listener - called after each write.
 * @returns {() => void} unsubscribe.
 */
export function subscribeStore(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
