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
page.on('pageerror', (e) => console.log('pageerror:', String(e).slice(0, 200)))
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-t3-thread-id]', { timeout: 30000 })
await page.waitForTimeout(1000)
const ids = await page.$$eval('[data-t3-section-row="active"]', (n) => n.slice(0, 4).map((x) => x.getAttribute('data-t3-thread-id')))
const s = page.locator(`[data-t3-thread-id="${ids[0]}"]`)
const t = page.locator(`[data-t3-thread-id="${ids[2]}"]`)
const sb = await s.boundingBox(); const tb = await t.boundingBox()
console.log('source', sb, 'target', tb)
await s.scrollIntoViewIfNeeded()
await page.mouse.move(sb.x + 60, sb.y + sb.height / 2)
await page.mouse.down()
await page.mouse.move(sb.x + 62, sb.y + sb.height / 2 + 10, { steps: 3 })
await page.mouse.move(tb.x + 60, tb.y + tb.height * 0.8, { steps: 6 })
console.log('drop attr', await page.locator(`[data-t3-row-item="${ids[2]}"]`).getAttribute('data-t3-drop'))
await page.mouse.up()
await page.waitForTimeout(900)
console.log(JSON.stringify(await page.evaluate(() => {
  const store = JSON.parse(localStorage.getItem('t3Sidebar.state') ?? '{"threads":{}}')
  return { keys: Object.entries(store.threads).filter(([, v]) => v.activeOrderKey).map(([k, v]) => [k.slice(-8), v.activeOrderKey]), titles: [...document.querySelectorAll('[data-t3-thread-id]')].slice(0, 4).map((r) => r.getAttribute('data-t3-thread-title')) }
})))
await browser.close()
