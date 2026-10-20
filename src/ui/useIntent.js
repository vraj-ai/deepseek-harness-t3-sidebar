/**
 * The shell's view of the durable intent: the current state, re-read when it
 * changes here or in another window, and the dispatcher that changes it.
 * @module deepseek-harness-t3-sidebar/ui/useIntent
 */

import { useEffect, useMemo, useState } from 'react'
import { STORE_KEY } from '../adapter/store.ts'
import { createIntentStore } from './intentStore.js'

/**
 * `localStorage`, or null where a page has none or the browser denies it.
 * @returns {Storage | null} the storage.
 */
function pageStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/**
 * @returns {import('./intentStore.js').IntentStore & { state: import('../adapter/store.ts').SidebarIntentState }} the store plus the state this render draws.
 */
export function useIntent() {
  const store = useMemo(() => createIntentStore(pageStorage()), [])
  const [state, setState] = useState(store.get)
  useEffect(() => {
    const unsubscribe = store.subscribe(() => setState(store.get()))
    // A write between the first render and this effect is not lost.
    setState(store.get())
    const onStorage = (/** @type {StorageEvent} */ event) => {
      if (event.key === STORE_KEY || event.key === null) store.refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      unsubscribe()
      window.removeEventListener('storage', onStorage)
    }
  }, [store])
  return { ...store, state }
}
