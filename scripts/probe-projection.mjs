#!/usr/bin/env node
/**
 * Prove the `t3Sidebar` projection reaches a live Harness window.
 *
 * Reads the running app's own origin cookie out of the desktop app's cookie
 * store, opens the GUI in headless Chromium, waits for the shell to draw a loaded
 * list, and reads `data-t3-sidebar-projected` (listed sessions carrying a
 * `t3Sidebar` value, drawn or hidden) off the shell root.
 *
 * Starts no server and spawns no Harness process: the window must already be
 * running. Exit 0 means at least one session carries a `t3Sidebar` value; with
 * `--expect-absent` the check inverts, which is how we prove the key is ours and
 * not a built-in. A session that is mid-turn has no `turn/end` yet, so its row
 * reports no outcome until that turn ends.
 *
 * Needs `playwright` (installed browsers) resolvable from here.
 * @module deepseek-harness-t3-sidebar/scripts/probe-projection
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const APP_URL = process.env.T3_SIDEBAR_APP_URL ?? 'http://127.0.0.1:54645'
const COOKIES =
  process.env.T3_SIDEBAR_COOKIES ??
  join(homedir(), 'Library/Application Support/@deepseek-ai/dsh-desktop/Cookies')
const WAIT_MS = Number(process.env.T3_SIDEBAR_WAIT_MS ?? 30_000)
const expectAbsent = process.argv.includes('--expect-absent')

/** Fail with one actionable line; never a stack dump the reader has to decode. */
function fail(message) {
  console.error(`probe-projection: ${message}`)
  process.exit(1)
}

/** The origin cookie the app issues to itself, as a `name`/`value` pair. */
function readAuthCookie() {
  // sqlite3 refuses a live WAL database it does not own, so read a copy.
  const dir = mkdtempSync(join(tmpdir(), 't3-sidebar-'))
  const copy = join(dir, 'Cookies')
  // A hex literal cannot close its quotes, so the hostname cannot rewrite the query.
  const host = Buffer.from(new URL(APP_URL).hostname).toString('hex')
  let rows
  try {
    copyFileSync(COOKIES, copy)
    rows = execFileSync('sqlite3', ['-separator', '\t', copy, `select name, value from cookies where host_key = cast(x'${host}' as text)`], {
      encoding: 'utf8',
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  const cookies = rows
    .split('\n')
    .filter(Boolean)
    .map((row) => row.split('\t'))
  if (cookies.length === 0) fail(`no cookie for ${new URL(APP_URL).hostname} in ${COOKIES}; is the Harness desktop app running?`)
  return cookies.map(([name, value]) => ({ name, value }))
}

const playwright = await import('playwright').catch(() =>
  fail('playwright is not installed; run `npm i` (dev dependency) first'),
)

const browser = await playwright.chromium.launch({ headless: true })
let exitCode = 1
try {
  const context = await browser.newContext()
  await context.addCookies(readAuthCookie().map((cookie) => ({ ...cookie, domain: new URL(APP_URL).hostname, path: '/' })))
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error(`probe-projection: page error: ${error.message}`))
  const response = await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
  if (response !== null && response.status() !== 200) fail(`${APP_URL} answered ${response.status()}; the app's origin cookie was rejected`)

  // The shell draws `phase="ready"` once the host list has loaded, and the
  // projected count is read from that list. The `--expect-absent` control needs
  // the shell too: only a loaded client can witness that the key is missing.
  const ready = '[data-t3-sidebar-shell][data-t3-sidebar-phase="ready"]'
  const loaded = await page.waitForSelector(ready, { timeout: WAIT_MS }).then(
    () => true,
    () => false,
  )
  const count = loaded ? Number(await page.getAttribute(ready, 'data-t3-sidebar-projected')) : 0
  const outcomes = loaded
    ? await page.$$eval('[data-t3-thread-id]', (rows) =>
        Object.fromEntries(rows.map((row) => [row.getAttribute('data-t3-thread-id'), row.getAttribute('data-t3-row-outcome')])),
      )
    : {}
  console.log(`probe-projection: ${APP_URL} — ${count} session(s) carrying t3Sidebar${loaded ? '' : ' (the shell never loaded)'}`)
  console.log(JSON.stringify(outcomes, null, 2))

  if (expectAbsent) {
    if (!loaded) {
      console.error(`probe-projection: FAIL — the shell never drew a loaded list within ${WAIT_MS}ms, so absence is unproven; disable only the host row and keep lib/client.js loaded`)
    } else if (count === 0) {
      console.log('probe-projection: PASS — t3Sidebar is absent from every session, so the key is not a built-in')
      exitCode = 0
    } else {
      console.error(`probe-projection: FAIL — expected t3Sidebar to be absent, found ${count} session(s) carrying it`)
    }
  } else if (count > 0) {
    console.log('probe-projection: PASS — the host projection reached the client')
    exitCode = 0
  } else if (!loaded) {
    console.error(`probe-projection: FAIL — the shell never drew a loaded list within ${WAIT_MS}ms; is the plugin row in the profile and lib/client.js built?`)
  } else {
    console.error("probe-projection: FAIL — t3Sidebar is absent from every session; the key is the plugin's, so the host row is not loaded")
  }
} finally {
  await browser.close()
}
process.exit(exitCode)
