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
  const nameOf = (f) => { const t = f.type; if (typeof t === 'function') return t.name || 'anon'; if (typeof t === 'object' && t) return t.displayName || 'obj'; return String(t) }
  let node = shell[key]
  while (node && nameOf(node) !== 'RootEntry') node = node.return
  const registrant = node.memoizedProps.entry.registrant
  const found = {}
  const seen = new Set()
  const walk = (obj, path, depth) => {
    if (obj === null || typeof obj !== 'object' || depth > 3 || seen.has(obj)) return
    seen.add(obj)
    for (const k of Object.keys(obj)) {
      if (/^(ctx|root|context|services|scope|app|host|container|parent)$/i.test(k) || /uiWorkspace/.test(k)) {
        found[path + '.' + k] = Object.getPrototypeOf(obj[k])?.constructor?.name + ' ' + (obj[k] && typeof obj[k] === 'object' ? Object.keys(obj[k]).slice(0, 8).join(',') : typeof obj[k])
      }
      const v = obj[k]
      if (v && typeof v === 'object') walk(v, path + '.' + k, depth + 1)
    }
  }
  walk(registrant, 'registrant', 0)
  const ownKeys = []
  let p = registrant
  while (p && p !== Object.prototype) { ownKeys.push(...Object.getOwnPropertyNames(p)); p = Object.getPrototypeOf(p) }
  return { found: Object.entries(found).slice(0, 40), ownKeys: [...new Set(ownKeys)].slice(0, 80) }
})
console.log(JSON.stringify(out, null, 1).slice(0, 4000))
await browser.close()
