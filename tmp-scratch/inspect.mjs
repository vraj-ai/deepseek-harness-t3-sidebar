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
page.on('pageerror', (e) => console.error('pageerror', String(e).slice(0, 300)))
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: 'Continue', exact: true }).first().click({ timeout: 3000 }).catch(() => {})
await page.waitForSelector('[data-t3-sidebar-shell]', { timeout: 30000 })
await page.waitForTimeout(2000)
const out = await page.evaluate(() => {
  const shell = document.querySelector('[data-t3-sidebar-shell]')
  const keys = Object.keys(shell ?? {})
  const rows = [...document.querySelectorAll('[data-t3-thread-id]')].slice(0, 5).map((r) => ({ id: r.getAttribute('data-t3-thread-id'), title: r.getAttribute('data-t3-thread-title'), label: r.getAttribute('aria-label') }))
  const buttons = [...document.querySelectorAll('[data-t3-sidebar-shell] button')].slice(0, 30).map((b) => b.getAttribute('aria-label') ?? b.innerText.slice(0, 40))
  return { keys, rows, buttons, bodyText: document.body.innerText.slice(0, 800) }
})
console.log(JSON.stringify(out, null, 2))
await browser.close()
