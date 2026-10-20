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
const out = await page.evaluate(() => ({
  keys: Object.keys(localStorage).filter((k) => k.startsWith('dsh')),
  ws: localStorage.getItem('dsh.workspace.view.v5')?.slice(0, 300),
}))
console.log(JSON.stringify(out, null, 1))
const call = (method, args) => page.evaluate(async ([method, args]) => {
  const rpcId = crypto.randomUUID()
  const res = await fetch(`/api/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId, method, payload: { args } }) })
  return { status: res.status, body: (await res.text()).slice(0, 300) }
}, [method, args])
const sid = await page.locator('[data-t3-thread-id]').nth(3).getAttribute('data-t3-thread-id')
console.log('sid', sid)
console.log(JSON.stringify(await call('session/rename', { sessionId: sid, title: 'probe rename transient' })))
console.log(JSON.stringify(await call('session/rename', { sessionId: sid, title: 'ok' })))
console.log(JSON.stringify(await call('workspace/pin-session', { sessionId: sid })))
await browser.close()
