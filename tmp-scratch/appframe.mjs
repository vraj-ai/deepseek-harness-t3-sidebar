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
await page.waitForTimeout(2000)
const out = await page.evaluate(() => {
  const shell = document.querySelector('[data-t3-sidebar-shell]')
  const key = Object.keys(shell).find((k) => k.startsWith('__reactFiber$'))
  let node = shell[key]
  const nameOf = (f) => { const t = f.type; if (typeof t === 'function') return t.name || 'anon'; if (typeof t === 'object' && t) return t.displayName || 'obj'; return String(t) }
  while (node && nameOf(node) !== 'AppFrame') node = node.return
  const props = node.memoizedProps
  const store = null
  const describe = (v, d = 0) => {
    if (v === null || v === undefined) return String(v)
    if (typeof v === 'function') return `fn(${v.length})`
    if (typeof v !== 'object') return `${typeof v}:${String(v).slice(0, 60)}`
    if (Array.isArray(v)) return `array(${v.length})`
    return `obj{${Object.keys(v).slice(0, 30).join(',')}}`
  }
  return {
    actions: props.actions ? Object.keys(props.actions).map((k) => `${k}: ${describe(props.actions[k])}`) : null,
    store: store ? Object.keys(store).map((k) => `${k}: ${describe(store[k])}`) : null,
  }
})
console.log(JSON.stringify(out, null, 2))
await browser.close()
