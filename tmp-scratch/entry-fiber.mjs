import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
const APP_URL = 'http://127.0.0.1:54645'
const COOKIES = join(homedir(), 'Library/Application Support/@deepseek-ai/dsh-desktop/Cookies')
const copy = join(mkdtempSync(join(tmpdir(), 't3x-')), 'Cookies')
copyFileSync(COOKIES, copy)
const host = new URL(APP_URL).hostname
const rows = execFileSync('sqlite3', ['-separator', '\t', copy, `select name, value from cookies where host_key = '${host}'`], { encoding: 'utf8' })
const cookies = rows.split('\n').filter(Boolean).map((r) => { const [name, value] = r.split('\t'); return { name, value, domain: host, path: '/' } })
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewportSize: { width: 1440, height: 900 } })
await ctx.addCookies(cookies)
const page = await ctx.newPage()
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: 'Continue', exact: true }).first().click({ timeout: 3000 }).catch(() => {})
await page.waitForSelector('[data-t3-sidebar-shell]', { timeout: 30000 })
await page.waitForTimeout(1500)
const out = await page.evaluate(() => {
  const shell = document.querySelector('[data-t3-sidebar-shell]')
  const key = Object.keys(shell).find((k) => k.startsWith('__reactFiber$'))
  const nameOf = (f) => { const t = f?.type; if (typeof t === 'function') return t.name || 'anon'; if (typeof t === 'object' && t) return t.displayName || 'obj'; return String(t) }
  let node = shell[key]
  const names = []
  let target = null
  while (node && names.length < 12) { names.push(nameOf(node)); if (nameOf(node) === 'RootEntry') { target = node; break } node = node.return }
  // climb *up* through fiber.return chain from target and look at sibling memoizedState objects
  const seen = []
  let p = target
  for (let i = 0; i < 4 && p; i++) { p = p.return; if (p) seen.push(nameOf(p)) }
  // search fiber tree for an object with ctx-like keys: walk children of the topmost fiber
  let top = shell[key]
  while (top.return) top = top.return
  const found = []
  const visit = (fiber, depth) => {
    if (!fiber || depth > 60) return
    const ms = fiber.memoizedState
    if (ms && typeof ms === 'object' && !Array.isArray(ms) && ('slots' in ms || 'sessions' in ms || 'workspaces' in ms)) {
      found.push({ type: nameOf(fiber), keys: Object.keys(ms).slice(0, 40) })
    }
    visit(fiber.child, depth + 1)
    visit(fiber.sibling, depth)
  }
  visit(top, 0)
  return { names, seen, found: found.slice(0, 6) }
})
console.log(JSON.stringify(out, null, 1).slice(0, 4000))
await browser.close()
