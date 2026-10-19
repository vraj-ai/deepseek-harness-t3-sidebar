/**
 * Host half: the `t3Sidebar` session projection.
 *
 * Folds the session log into the four things the sidebar draws that Harness
 * does not project natively — prompt time, turn boundaries, and the last turn's
 * outcome plus the error class behind it. Delivery is the projection seam's:
 * registering the unit is all this plugin does, and every carrier (control
 * baseline, change feed, session list rows) picks the key up from there.
 *
 * The event vocabulary is the persisted one (`turn/start`, `turn/end`,
 * `user/message`, `llm/retry`); anything else returns the same state reference
 * so the registry's `Object.is` change detection stays quiet.
 *
 * @module deepseek-harness-t3-sidebar
 */

/** Cordis plugin name as the loader row spells it. */
export const name = 't3-sidebar'

/**
 * The projection registry is the plugin's whole purpose: without
 * `ctx.sessionProjections` the fiber stays pending instead of throwing.
 */
export const inject = ['sessionProjections']

/**
 * A duck-typed schema: the registry only ever calls `.parse`, and the fold
 * builds every value itself, so there is nothing left to validate.
 * ponytail: swap for a real validator if state ever accepts outside input.
 */
const passthrough = { parse: (value) => value }

/**
 * Fold a terminal turn reason into the sidebar's outcome vocabulary, with the
 * one failure the log names as an outcome: a turn that restart recovery closed
 * because the process exited is `interrupted`, not `failed`.
 */
function settle(reason, pendingErrorClasses) {
  switch (reason?.kind) {
    case 'completed':
    case 'blocked':
    case 'max-tokens':
      // A blocked turn still settles; the sidebar shows it as settled, not failed.
      return { outcome: 'ok', errorClass: null }
    case 'error':
      return { outcome: 'failed', errorClass: reason.error?.code ?? pendingErrorClasses.at(-1) ?? 'UNKNOWN' }
    case 'aborted':
      // A user stop carries no error class; a hook cancel is still an interruption.
      return { outcome: 'interrupted', errorClass: reason.reason?.kind === 'hook' ? 'HOOK_CANCELLED' : null }
    case 'interrupted':
      return { outcome: 'interrupted', errorClass: 'INTERRUPTED' }
    default:
      return { outcome: null, errorClass: null }
  }
}

export const t3SidebarProjection = {
  key: 't3Sidebar',
  stateVersion: 1,
  stateSchema: passthrough,
  init: () => ({
    lastUserMessageAt: null,
    lastTurnStartedAt: null,
    lastTurnCompletedAt: null,
    outcome: null,
    errorClass: null,
    /** Failures still waiting for a retry; drained by turn/end or step/start. */
    pendingErrorClasses: [],
  }),
  apply: (state, event) => {
    switch (event.type) {
      case 'user/message':
        // Compaction checkpoints are also `user/message`, but land as a surface
        // replacement; only an appended prompt moves the sidebar's clock.
        return event.surfaceOp === undefined || event.surfaceOp === 'append' ? { ...state, lastUserMessageAt: event.time } : state
      case 'turn/start':
        return { ...state, lastTurnStartedAt: event.time, pendingErrorClasses: [] }
      case 'turn/end':
        return { ...state, lastTurnCompletedAt: event.time, ...settle(event.data?.reason, state.pendingErrorClasses), pendingErrorClasses: [] }
      case 'llm/retry': {
        const code = event.data?.failure?.code
        return typeof code === 'string' && code !== '' ? { ...state, pendingErrorClasses: [...state.pendingErrorClasses, code] } : state
      }
      case 'step/start':
        // A completed step settles the failures it retried past.
        return state.pendingErrorClasses.length === 0 ? state : { ...state, pendingErrorClasses: [] }
      default:
        return state
    }
  },
  wire: {
    viewSchema: passthrough,
    view: (state) => ({
      lastUserMessageAt: state.lastUserMessageAt,
      lastTurnStartedAt: state.lastTurnStartedAt,
      lastTurnCompletedAt: state.lastTurnCompletedAt,
      outcome: state.outcome,
      errorClass: state.errorClass,
    }),
  },
}

/**
 * Register the unit; the registration is an effect on this plugin's fiber, so
 * unloading removes the key from every snapshot the client reads.
 * @param ctx - registrant context carrying the projection registry.
 */
export function apply(ctx) {
  ctx.sessionProjections.register(t3SidebarProjection)
}
