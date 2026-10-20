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
const ctx = await browser.newContext({ viewportSize: { width: 1440, height: 960 } })
await ctx.addCookies(cookies)
const page = await ctx.newPage()
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-t3-thread-id]', { timeout: 30000 })
await page.waitForTimeout(1000)
const info = await page.evaluate(() => {
  const store = JSON.parse(localStorage.getItem('t3Sidebar.state') ?? '{"threads":{}}')
  const rows = [...document.querySelectorAll('[data-t3-thread-id]')]
  return {
    threads: Object.entries(store.threads).map(([k, v]) => [k, v.activeOrderKey, v.pinOrderKey]).filter(([, a, p]) => a || p),
    first: rows.slice(0, 3).map((r) => ({ id: r.getAttribute('data-t3-thread-id'), sec: r.getAttribute('data-t3-section-row'), title: r.getAttribute('data-t3-thread-title') })),
  }
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
