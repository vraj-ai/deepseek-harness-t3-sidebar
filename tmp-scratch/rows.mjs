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
page.on('pageerror', (e) => console.log('pageerror:', String(e).slice(0, 300)))
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-t3-thread-id]', { timeout: 30000 })
await page.waitForTimeout(1200)
const ids = await page.$$eval('[data-t3-section-row="active"]', (n) => n.slice(0, 3).map((x) => x.getAttribute('data-t3-thread-id')))
const l2 = page.locator(`[data-t3-thread-id="${ids[2]}"]`)
await l2.scrollIntoViewIfNeeded()
const box = await l2.boundingBox()
console.log('box', JSON.stringify(box))
await page.mouse.move(box.x + 80, box.y + 10)
await page.mouse.down()
await page.mouse.move(box.x + 80, box.y + 40, { steps: 4 })
await page.mouse.move(box.x + 80, box.y + 90, { steps: 4 })
console.log('drag state', await page.evaluate(() => !!document.querySelector('[data-t3-drag-source]') + ' drop=' + (document.querySelector('[data-t3-drop]')?.getAttribute('data-t3-row-item') ?? 'none')))
console.log('up', await page.evaluate(() => JSON.stringify(window.__t3up ?? null)), 'listeners', await page.evaluate(() => window.__t3listeners ?? 0))
await page.mouse.up()
await page.waitForTimeout(900)
console.log('pd', await page.evaluate(() => JSON.stringify(window.__t3pd ?? null)))
console.log(JSON.stringify(await page.evaluate(() => {
  const store = JSON.parse(localStorage.getItem('t3Sidebar.state') ?? '{"threads":{}}')
  return { keys: Object.entries(store.threads).map(([k, v]) => [k.slice(-12), v.activeOrderKey]), titles: [...document.querySelectorAll('[data-t3-thread-id]')].slice(0, 5).map((r) => r.getAttribute('data-t3-thread-title')) }
}), null, 1))
await browser.close()
