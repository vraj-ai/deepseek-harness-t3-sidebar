import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs'
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
const ctx = await browser.newContext()
await ctx.addCookies(cookies)
const page = await ctx.newPage()
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-t3-sidebar-shell]', { timeout: 30000 })
const candidates = [
 '@deepseek-ai/dsh-client-ui-sidebar',
 '@deepseek-ai/dsh-client-ui-session',
 '@deepseek-ai/dsh-client-store',
 'deepseek-harness-t3-sidebar',
 '@deepseek-ai/dsh-client-ui-workspace',
]
for (const id of candidates) {
  const out = await page.evaluate(async (id) => {
    const url = `/plugins/${encodeURIComponent(id)}/client.js`
    const res = await fetch(url)
    const body = await res.text()
    return { url, status: res.status, len: body.length }
  }, id)
  console.log(JSON.stringify(out))
}
await browser.close()
