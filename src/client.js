/**
 * Client half — TEMPORARY STUB.
 *
 * The real sidebar (issues #2+) replaces this body. Until then this stub exists
 * to prove one thing: that the `t3Sidebar` projection registered by the host
 * half reaches a live browser through the session list rows. It reads the list
 * the sidebar will read and mirrors each session's value onto `<html>` so a
 * probe can inspect it without a UI.
 *
 * It publishes on list changes only — never on mount — so "the attribute exists
 * and carries values" also reports that live host frames actually arrived.
 *
 * ponytail: delete this body, not the file, when the sidebar shell lands.
 * @module deepseek-harness-t3-sidebar/client
 */

/** The client session list: the same rows the real sidebar will draw. */
export const inject = ['sessions']

/**
 * Mirror every listed session's `t3Sidebar` projection value onto `<html>`.
 * @param ctx - client root context carrying `sessions`.
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.sessions.list.subscribe(() => {
        const map = {}
        for (const [id, row] of Object.entries(ctx.sessions.list.getSnapshot().byId)) {
          const value = row.projectionValues?.t3Sidebar
          if (value !== undefined) map[id] = value
        }
        document.documentElement.dataset.t3Sidebar = JSON.stringify(map)
        document.documentElement.dataset.t3SidebarCount = String(Object.keys(map).length)
      }),
    't3-sidebar: publish projections',
  )
}
