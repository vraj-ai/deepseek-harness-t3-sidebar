/**
 * The actions this plugin injects into its `sidebar.workspaces` registration.
 *
 * The seat's standard kit carries hooks only; the shipped occupant gets its
 * navigation from its own registration's `inject`, so replacing it means
 * supplying the same entry points from the host's `uiWorkspace` service. The
 * session service adds one read the seat's standard kit does not expose: a
 * refresh of a listed Session's projection values, used to fill a working row's
 * outcome when the page was open before this bundle was installed.
 * @module deepseek-harness-t3-sidebar/ui/seat
 */

/**
 * The slice of the host's `uiWorkspace` service the shell calls.
 * @typedef {object} WorkspaceNavigation
 * @property {(workspaceId?: string) => void} startSession - new session, in the given workspace or the current one.
 * @property {(sessionId: string) => void} openSession - show a session in the main view.
 */

/**
 * The slice of the host's `sessions` client service the shell calls.
 * @typedef {object} SessionProjections
 * @property {(sessionId: string) => Promise<void>} refreshProjections - reload one Session's projection values.
 */

/**
 * @typedef {object} SeatActions
 * @property {(workspaceId?: string) => void} startSession - create a session.
 * @property {(sessionId: string) => void} openSession - open a row's session.
 * @property {(sessionId: string) => void} refreshProjections - ask the host for one Session's projections.
 */

/**
 * Build the registration's `inject` factory.
 * @param {WorkspaceNavigation} uiWorkspace - the host navigation service.
 * @param {SessionProjections} [sessions] - the host session service, when composed.
 * @returns {() => SeatActions} the factory the slot runner calls.
 */
export function seatActions(uiWorkspace, sessions) {
  return () => ({
    startSession: (workspaceId) => uiWorkspace.startSession(workspaceId),
    openSession: (sessionId) => uiWorkspace.openSession(sessionId),
    refreshProjections: (sessionId) => {
      // A page composed without the session service still renders; the working
      // row then falls back to the list baseline until the next reload.
      sessions?.refreshProjections(sessionId).catch((error) => {
        console.warn('t3-sidebar: refreshProjections failed', error)
      })
    },
  })
}
