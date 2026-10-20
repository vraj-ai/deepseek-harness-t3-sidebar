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
  let node = shell[key]
  const nameOf = (f) => { const t = f.type; if (typeof t === 'function') return t.name || 'anon'; if (typeof t === 'object' && t) return t.displayName || 'obj'; return String(t) }
  let rootEntry = node; while (rootEntry && nameOf(rootEntry) !== "RootEntry") rootEntry = rootEntry.return
  const props = rootEntry?.memoizedProps ?? {}
  const entry = props.entry
  const describe = (v) => { if (v === null || v === undefined) return String(v); if (typeof v === 'function') return `fn(${v.length})`; if (typeof v !== 'object') return String(v); return `obj{${Object.keys(v).join(',')}}` }
  return {
    entryKeys: entry ? Object.keys(entry) : null,
    entryDesc: entry ? Object.fromEntries(Object.entries(entry).map(([k, v]) => [k, describe(v)])) : null,
    entryPropsKeys: entry?.props ? Object.keys(entry.props) : null,
    entryModule: entry?.module ? Object.keys(entry.module) : null,
    entryId: entry?.id ?? entry?.name ?? null,
  }
})
console.log(JSON.stringify(out, null, 1).slice(0, 3000))
await browser.close()
