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
const probe = async (label) => {
  const out = await page.evaluate(() => {
    const shell = document.querySelector('[data-t3-sidebar-shell]')
    const key = Object.keys(shell).find((k) => k.startsWith('__reactFiber$'))
    let node = shell[key]
    const nameOf = (f) => { const t = f.type; if (typeof t === 'function') return t.name || 'anon'; if (typeof t === 'object' && t) return t.displayName || 'obj'; return String(t) }
    let myFiber = null
    while (node) { const n = nameOf(node.return ?? {}); if (node.return && nameOf(node.return) === 'RootEntry') { myFiber = node; break } node = node.return }
    const props = myFiber?.memoizedProps
    const hookContext = myFiber?.return?.memoizedProps?.hookContext
    const describe = (v) => {
      if (v === null || v === undefined) return String(v)
      if (typeof v === 'function') return `fn(${v.length})`
      if (typeof v !== 'object') return String(v)
      const proto = Object.getPrototypeOf(v)
      return `obj{${Object.keys(v).slice(0, 40).join(',')}} proto=${proto?.constructor?.name}`
    }
    const injected = myFiber?.return?.memoizedProps?.slotInjected
    return {
      propsKeys: props ? Object.keys(props) : null,
      propsDesc: props ? Object.fromEntries(Object.entries(props).map(([k, v]) => [k, k.startsWith('use') ? 'hook' : describe(v)])) : null,
      hookContext: describe(hookContext),
      hookCtxKeys: hookContext && typeof hookContext === 'object' ? Object.keys(hookContext).map((k) => `${k}=${describe(hookContext[k])}`) : null,
      injected: describe(injected),
      injectedKeys: injected && typeof injected === 'object' ? Object.keys(injected).map((k) => `${k}=${describe(injected[k])}`) : null,
    }
  })
  console.log('---', label, JSON.stringify(out, null, 1).slice(0, 2500))
}
await probe('initial')
const firstRow = page.locator('[data-t3-thread-id]').first()
const id = await firstRow.getAttribute('data-t3-thread-id')
await firstRow.click()
await page.waitForTimeout(1500)
await probe(`after click ${id}`)
await browser.close()
