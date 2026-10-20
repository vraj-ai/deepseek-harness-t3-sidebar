/**
 * Client half — the T3 sidebar shell.
 *
 * One seat is replaced: `sidebar.workspaces`, registered at `priority: -1` so it
 * shadows the shipped `WorkspaceBrowser`. Replacing the occupant removes every
 * child seat it declared, so this entry re-declares only what it renders —
 * nothing, in this slice. A fixed -1 also beats the page-local ranks the dynamic
 * package runner hands out (it counts down from 0), so we win in both load orders.
 *
 * The chrome (workspace selector, search field, new-session button) and the
 * section scaffolding draw real data from the standard hooks the seat hands every
 * occupant. Row interactions and the pure section model belong to later slices;
 * the local derivation is marked where later slices replace it.
 * @module deepseek-harness-t3-sidebar/client
 */

import { T3SidebarShell } from './ui/T3SidebarShell.js'
import { seatActions } from './ui/seat.js'
import { installStyles } from './ui/styles.js'

export const inject = ['slots', 'uiWorkspace']

/**
 * Register the browsing region. The `inject` gate means an app without the
 * slots or workspace navigation service leaves this plugin pending instead of
 * throwing.
 * @param ctx - client root context carrying `slots` and `uiWorkspace`.
 */
export function apply(ctx) {
  installStyles()
  const actions = seatActions(ctx.get('uiWorkspace'))
  ctx.slots.inject('sidebar.workspaces', () =>
    ctx.slots.register({ name: 'sidebar.workspaces', priority: -1, inject: actions }, T3SidebarShell),
  )
}
