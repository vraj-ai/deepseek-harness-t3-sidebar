/**
 * The actions this plugin injects into its `sidebar.workspaces` registration.
 *
 * The seat's standard kit carries hooks only; the shipped occupant gets its
 * navigation from its own registration's `inject`, so replacing it means
 * supplying the same entry points from the host's `uiWorkspace` service.
 * @module deepseek-harness-t3-sidebar/ui/seat
 */

/**
 * The slice of the host's `uiWorkspace` service the shell calls.
 * @typedef {object} WorkspaceNavigation
 * @property {(workspaceId?: string) => void} startSession - new session, in the given workspace or the current one.
 * @property {(sessionId: string) => void} openSession - show a session in the main view.
 */

/**
 * @typedef {object} SeatActions
 * @property {(workspaceId?: string) => void} startSession - create a session.
 * @property {(sessionId: string) => void} openSession - open a row's session.
 */

/**
 * Build the registration's `inject` factory.
 * @param {WorkspaceNavigation} uiWorkspace - the host navigation service.
 * @returns {() => SeatActions} the factory the slot runner calls.
 */
export function seatActions(uiWorkspace) {
  return () => ({
    startSession: (workspaceId) => uiWorkspace.startSession(workspaceId),
    openSession: (sessionId) => uiWorkspace.openSession(sessionId),
  })
}
