import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const seen = []
page.on('response', (r) => { const u = r.url(); if (/plugins|assets/.test(u)) seen.push(`${r.status()} ${u.length} ${u.slice(0, 120)}`) })
await page.goto('http://127.0.0.1:54645/', { waitUntil: 'domcontentloaded' }).catch(() => {})
await page.waitForTimeout(4000)
console.log(seen.slice(0, 12).join('\n'))
await browser.close()
