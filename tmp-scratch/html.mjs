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
page.on('request', (r) => { if (r.url().includes('/plugins')) console.log('REQ', r.url().slice(0, 160)) })
page.on('response', (r) => { if (r.url().includes('/plugins')) console.log('RES', r.status(), r.url().slice(0, 160)) })
const r = await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
console.log('status', r.status())
await page.waitForTimeout(2500)
console.log('body:', (await page.evaluate(() => document.body.innerText)).slice(0, 500)); console.log('render', await page.evaluate(() => window.__t3render ?? null)); console.log('sidebars:', await page.locator('[data-t3-sidebar]').count(), 'rows', await page.locator('[data-t3-thread-id]').count())
await browser.close()
