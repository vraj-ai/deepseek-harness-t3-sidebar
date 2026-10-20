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
const ctx = await browser.newContext()
await ctx.addCookies(cookies)
const page = await ctx.newPage()
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
const text = await page.evaluate(async () => {
  const urls = [...document.querySelectorAll('script[src]')].map((s) => s.src)
  const out = []
  for (const url of urls) {
    const body = await fetch(url).then((r) => r.text()).catch(() => '')
    out.push({ url, len: body.length, hasRename: /sessions\.binding|renameSession|archiveSession/.test(body) })
  }
  // also try each plugin client
  const pluginScripts = urls.filter((u) => u.includes('/plugins/'))
  return { urls, out, pluginScripts }
})
console.log(JSON.stringify(text, null, 1).slice(0, 3000))
await browser.close()
