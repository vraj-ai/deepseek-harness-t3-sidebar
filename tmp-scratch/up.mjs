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
const ids = await page.$$eval('[data-t3-section-row="active"]', (n) => n.slice(1, 4).map((x) => x.getAttribute('data-t3-thread-id')))
const l2 = page.locator(`[data-t3-thread-id="${ids[1]}"]`)
await l2.scrollIntoViewIfNeeded()
const box = await l2.boundingBox()
await page.evaluate(() => { window.__ups = []; document.addEventListener('pointerup', (e) => window.__ups.push({ t: e.type, target: e.target?.tagName, btn: e.button }), true); document.addEventListener('pointerdown', (e) => window.__ups.push({ t: 'down', target: e.target?.tagName }), true) })
await page.mouse.move(box.x + 10, box.y + 20)
await page.mouse.down()
await page.mouse.move(box.x + 10, box.y + 60, { steps: 4 })
await page.mouse.up()
await page.waitForTimeout(700)
console.log(await page.evaluate(() => JSON.stringify({ ups: window.__ups, t3up: window.__t3up ?? null, mv: window.__t3mv ?? null, dragSrc: !!document.querySelector('[data-t3-drag-source]') })))
await browser.close()
