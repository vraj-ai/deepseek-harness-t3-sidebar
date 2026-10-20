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
await page.waitForTimeout(2000)
const out = await page.evaluate(() => {
  const shell = document.querySelector('[data-t3-sidebar-shell]')
  const key = Object.keys(shell).find((k) => k.startsWith('__reactFiber$'))
  let fiber = shell[key]
  const chain = []
  const nameOf = (fiber) => {
    const r = fiber.return
    if (!r) return 'root'
    const t = r.type
    if (typeof t === 'function') return t.name || t.displayName || 'anon'
    if (typeof t === 'string') return t
    if (t && typeof t === 'object') return t.displayName || t.render?.name || 'obj'
    return String(t)
  }
  // walk up collecting fiber type names and props keys of function components
  let node = fiber
  let depth = 0
  while (node && depth < 60) {
    const r = node.return
    if (!r) break
    chain.push({ name: nameOf(node), props: r.memoizedProps && typeof r.memoizedProps === 'object' ? Object.keys(r.memoizedProps).slice(0, 40) : null })
    node = r
    depth++
  }
  return chain
})
console.log(JSON.stringify(out, null, 2))
await browser.close()
