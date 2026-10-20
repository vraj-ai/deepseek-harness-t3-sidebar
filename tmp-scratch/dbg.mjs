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
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text().slice(0, 300)) })
page.on('pageerror', (e) => console.log('pageerror:', String(e).slice(0, 400)))
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-t3-sidebar-shell]', { timeout: 30000 })
await page.waitForTimeout(1200)
const first = await page.locator('[data-t3-thread-id]').first().getAttribute('data-t3-thread-id')
await page.locator(`[data-t3-row-menu="${first}"]`).click()
await page.waitForSelector('[data-t3-menu]')
await page.locator('[data-t3-menu] [data-t3-interaction="rename"]').click()
await page.waitForTimeout(800)
console.log(await page.evaluate(() => ({
  menu: document.querySelectorAll('[data-t3-menu]').length,
  input: document.querySelectorAll('[data-t3-rename-input]').length,
  items: [...document.querySelectorAll('[data-t3-menu] [data-t3-interaction]')].map((n) => n.getAttribute('data-t3-interaction')),
})))
await browser.close()
