import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs'
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
const seen = []
page.on('response', (r) => { const u = r.url(); if (/plugins/.test(u)) seen.push(`${r.status()} ${u.length} ${u.slice(0, 80)}...`) })
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-t3-sidebar-shell]', { timeout: 30000 })
console.log(seen.join('\n'))
const urls = await page.evaluate(() => [...document.querySelectorAll('script[src]')].map((s) => s.src))
console.log(urls.length)
await browser.close()
