/**
 * Host half: the `t3Sidebar` session projection.
 *
 * Folds the session log into what the sidebar draws that Harness does not
 * project natively — prompt time, turn boundaries, the last turn's outcome plus
 * the error class behind it — and serves the session's git branch and pull
 * request, which no log event carries. Delivery is the projection seam's: every
 * carrier (control baseline, change feed, session list rows) picks the key up
 * from the registered unit.
 *
 * Branch and pull request come from `git`/`gh` (see `meta.js`), outside the fold.
 * A probe lands in a side store; `wire.view` reads the store on every snapshot,
 * and the fold moves the state reference on the next committed event after the
 * store changed, which is what makes the change feed publish. Harness offers no
 * way to publish a projection without an event, so a refresh with no event
 * behind it reaches the client at the next baseline read or the next event.
 *
 * The event vocabulary is the persisted one (`turn/start`, `turn/end`,
 * `user/message`, `llm/retry`); anything else returns the same state reference
 * so the registry's `Object.is` change detection stays quiet.
 *
 * @module deepseek-harness-t3-sidebar
 */
import { createMetaResolver, createSessionMeta } from './meta.js'

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

/** Fold one committed event into the log-derived state; the same reference when the event is not read. */
function fold(state, event) {
  switch (event.type) {
    case 'user/message':
      // Compaction checkpoints are also `user/message`, but land as a surface
      // replacement; only an appended prompt moves the sidebar's clock.
      return event.surfaceOp === undefined || event.surfaceOp === 'append' ? { ...state, lastUserMessageAt: event.time } : state
    case 'turn/start':
      return { ...state, lastTurnStartedAt: event.time, outcome: null, errorClass: null, pendingErrorClasses: [] }
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
}

/**
 * Build the unit over a session-meta store. The shared instance below is the one
 * the plugin registers; tests build their own over a scripted resolver.
 * @param sessionMeta - store of per-session branch and pull request.
 */
export function createT3SidebarProjection(sessionMeta) {
  /** The state reference moves only when the store's revision for this session did. */
  const syncMeta = (state) => {
    const metaRevision = sessionMeta.revision(state.sessionId)
    return metaRevision === state.metaRevision ? state : { ...state, metaRevision }
  }

  return {
    key: 't3Sidebar',
    stateVersion: 2,
    stateSchema: passthrough,
    init: (header) => {
      // A baseline read is the first moment a session is known, so probe now
      // rather than waiting for its first live event.
      if (header?.id !== undefined) void sessionMeta.track(header.id, header.cwd).catch(() => {})
      return {
        sessionId: header?.id ?? null,
        metaRevision: sessionMeta.revision(header?.id ?? null),
        lastUserMessageAt: null,
        lastTurnStartedAt: null,
        lastTurnCompletedAt: null,
        outcome: null,
        errorClass: null,
        /** Failures still waiting for a retry; drained by turn/end or step/start. */
        pendingErrorClasses: [],
      }
    },
    apply: (state, event) => syncMeta(fold(state, event)),
    wire: {
      viewSchema: passthrough,
      view: (state) => ({
        lastUserMessageAt: state.lastUserMessageAt,
        lastTurnStartedAt: state.lastTurnStartedAt,
        lastTurnCompletedAt: state.lastTurnCompletedAt,
        outcome: state.outcome,
        errorClass: state.errorClass,
        ...sessionMeta.get(state.sessionId),
      }),
    },
  }
}

const sharedSessionMeta = createSessionMeta({ resolver: createMetaResolver() })
export const t3SidebarProjection = createT3SidebarProjection(sharedSessionMeta)

/**
 * Register the unit and keep the session meta current: every live session event
 * re-asks the resolver (the TTL cache makes that a map lookup), and a disposed
 * session is forgotten so the store stays bounded.
 * @param ctx - registrant context carrying the projection registry.
 * @param wiring - the store and unit to register; tests substitute a scripted one.
 */
export function register(ctx, { sessionMeta, projection }) {
  ctx.sessionProjections.register(projection)
  ctx.on('session/event', (session) => {
    sessionMeta
      .track(session.id, session.header.cwd)
      .then((resolution) => {
        if (resolution !== null && !resolution.cached) for (const note of resolution.notes) ctx.logger.warn(`session "${session.id}": ${note}`)
      })
      .catch((error) => ctx.logger.warn(`session "${session.id}": meta probe failed: ${String(error)}`))
  })
  ctx.on('session/disposed', (session) => sessionMeta.forget(session.id))
}

/**
 * Register the unit; the registration is an effect on this plugin's fiber, so
 * unloading removes the key from every snapshot the client reads.
 * @param ctx - registrant context carrying the projection registry.
 */
export function apply(ctx) {
  register(ctx, { sessionMeta: sharedSessionMeta, projection: t3SidebarProjection })
}
