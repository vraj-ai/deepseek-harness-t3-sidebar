#!/usr/bin/env node
/**
 * Prove the shell occupies the `sidebar.workspaces` seat, with real rows.
 *
 * Reads the running app's own origin cookie from the desktop cookie store,
 * opens the GUI in headless Chromium, and asserts the shell contract: one seat,
 * one shell root, chrome controls resolved by accessible role inside the shell,
 * at least one real session row carrying its session title, sections drawn, a
 * collapse/expand round trip that restores the rows, a stylesheet whose every
 * colour is a `--dsw-*` token, and those tokens resolving on the shell element
 * in both colour schemes.
 *
 * Starts no server and spawns no Harness process: the window must already be
 * running with this package installed and built. Each failure prints its own
 * line and the process exits non-zero.
 *
 *   node scripts/probe-shell.mjs [--screenshot /tmp/shell.png]
 * @module deepseek-harness-t3-sidebar/scripts/probe-shell
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const APP_URL = process.env.T3_SIDEBAR_APP_URL ?? 'http://127.0.0.1:54645'
const COOKIES =
  process.env.T3_SIDEBAR_COOKIES ??
  join(homedir(), 'Library/Application Support/@deepseek-ai/dsh-desktop/Cookies')
const WAIT_MS = Number(process.env.T3_SIDEBAR_WAIT_MS ?? 30_000)

const SEL = {
  tree: '[data-slot="sidebar.workspaces"]',
  shell: '[data-t3-sidebar-shell]',
  section: '[data-t3-section]',
  row: '[data-t3-thread-id]',
  wide: '[data-t3-sidebar-shell][data-t3-sidebar-wide="true"]',
  rail: '[data-t3-sidebar-shell][data-t3-sidebar-wide="false"]',
  select: '[data-t3-control="workspace-selector"]',
  search: '[data-t3-control="search"]',
  newSession: '[data-t3-control="new-session"]',
  style: 'style[data-plugin-css="deepseek-harness-t3-sidebar/shell.css"]',
  collapse: '[aria-label="Collapse sidebar" i], [aria-label="Hide sidebar" i]',
  expand: '[aria-label="Open sidebar" i], [aria-label="Show sidebar" i]',
}

const screenshotAt = (() => {
  const index = process.argv.indexOf('--screenshot')
  return index === -1 ? undefined : process.argv[index + 1]
})()

const failures = []
const fail = (what) => {
  failures.push(what)
  console.error(`probe-shell: missing: ${what}`)
  return false
}
const pass = (what) => {
  console.log(`probe-shell: ok — ${what}`)
  return true
}

function readAuthCookie() {
  // sqlite3 refuses a live WAL database it does not own, so read a copy.
  const dir = mkdtempSync(join(tmpdir(), 't3-sidebar-'))
  const copy = join(dir, 'Cookies')
  // A hex literal cannot close its quotes, so the hostname cannot rewrite the query.
  const host = Buffer.from(new URL(APP_URL).hostname).toString('hex')
  let rows
  try {
    copyFileSync(COOKIES, copy)
    rows = execFileSync(
      'sqlite3',
      ['-separator', '\t', copy, `select name, value from cookies where host_key = cast(x'${host}' as text)`],
      { encoding: 'utf8' },
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  return rows
    .split('\n')
    .filter(Boolean)
    .map((row) => row.split('\t'))
    .map(([name, value]) => ({ name, value, domain: new URL(APP_URL).hostname, path: '/' }))
}

/** Open the GUI in a fresh context and hand the page to `run`. */
async function withPage(run, { colorScheme } = {}) {
  const { chromium } = await import('playwright').catch(() => {
    console.error('probe-shell: missing: playwright (run `npm install` first)')
    process.exit(1)
  })
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ viewportSize: { width: 1440, height: 900 }, colorScheme })
    await context.addCookies(readAuthCookie())
    const page = await context.newPage()
    const response = await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    if (response !== null && response.status() !== 200) {
      console.error(`probe-shell: missing: ${APP_URL} answered ${response.status()}; the origin cookie was rejected`)
      process.exitCode = 1
      return
    }
    await run(page)
  } finally {
    await browser.close()
  }
}

/** Assert exactly one match inside `scope`. */
async function exactlyOne(scope, selector, label) {
  const count = await scope.locator(selector).count()
  if (count === 1) return pass(`${label}: ${selector}`)
  return fail(`${selector} (${label}: found ${count}, need exactly 1)`)
}

/** Assert one role inside the shell resolves to the shell's own control. */
async function roleInShell(shell, role, selector, name) {
  const locator = shell.getByRole(role, { name, exact: true })
  const count = await locator.count()
  if (count !== 1) return fail(`role ${role} name "${name}" inside the shell (found ${count}, need exactly 1)`)
  const owned = await locator.first().evaluate((node, target) => node.matches(target), selector)
  return owned ? pass(`role=${role} name="${name}" is ${selector}`) : fail(`role ${role} "${name}" resolves to ${selector}`)
}

const readRows = (page) =>
  page.$$eval(SEL.row, (rows) =>
    rows.map((row) => ({ id: row.getAttribute('data-t3-thread-id'), text: row.innerText.trim(), label: row.getAttribute('aria-label') })),
  )

await withPage(async (page) => {
  const mounted = await page.waitForSelector(SEL.shell, { timeout: WAIT_MS }).then(() => true, () => false)
  if (!mounted) return fail(`${SEL.shell} (the shell never mounted; is the plugin row enabled and lib/client.js built?)`)
  pass(`${SEL.shell} mounted`)

  const trees = await page.locator(SEL.tree).count()
  if (trees === 1) pass(`exactly one session tree: ${SEL.tree}`)
  else fail(`${SEL.tree} (found ${trees} seats, need exactly 1)`)

  // The app may boot collapsed; the wide contract is asserted after expanding.
  if ((await page.locator(SEL.rail).count()) === 1) {
    await page.locator(SEL.expand).first().dispatchEvent('click').catch(() => undefined)
    await page.waitForSelector(SEL.wide, { timeout: WAIT_MS }).catch(() => undefined)
  }

  const rows = await page.waitForSelector(SEL.row, { timeout: WAIT_MS }).then(() => readRows(page), () => [])
  if (rows.length === 0) fail(`${SEL.row} (no session rows drawn)`)
  else pass(`${rows.length} session row(s): ${SEL.row}`)

  const sections = await page.$$eval(SEL.section, (nodes) =>
    nodes.map((node) => `${node.getAttribute('data-t3-section')}=${node.getAttribute('data-t3-section-count')}`),
  )
  if (sections.length === 0) fail(`${SEL.section} (no section scaffold drawn)`)
  else pass(`sections: ${sections.join(' ')}`)

  const shell = page.locator(SEL.shell).first()
  await exactlyOne(shell, SEL.select, 'workspace selector')
  await exactlyOne(shell, SEL.newSession, 'new-session control')
  await exactlyOne(shell, SEL.search, 'search control')
  await roleInShell(shell, 'combobox', SEL.select, 'Workspace')
  await roleInShell(shell, 'searchbox', SEL.search, 'Search sessions')
  await roleInShell(shell, 'button', SEL.newSession, 'New session')

  const titled = rows.find((row) => row.text !== '' && /[A-Za-z0-9]/.test(row.text))
  if (titled === undefined) fail(`${SEL.row} (no row draws a session title)`)
  else if (titled.label === null || titled.label.trim() === '') fail(`${SEL.row} (row has no accessible name)`)
  else pass(`real session title: "${titled.text}" (${titled.id})`)

  const tabbable = await page.$$eval(`${SEL.newSession}, ${SEL.select}, ${SEL.search}`, (nodes) =>
    nodes.every((node) => node.tabIndex >= 0),
  )
  if (tabbable) pass('chrome controls are in the tab order')
  else fail(`${SEL.newSession} (a chrome control is not keyboard reachable)`)

  if (screenshotAt !== undefined) {
    await page.screenshot({ path: screenshotAt })
    pass(`screenshot ${screenshotAt}`)
  }

  // Fold round trip: the shell survives both directions. The rail draws section
  // counts, not rows, so the rows are checked as restored on expand.
  const collapse = page.locator(SEL.collapse).first()
  if ((await collapse.count()) === 0) {
    fail(`${SEL.collapse} (no collapse control to drive the fold)`)
    return
  }
  await collapse.dispatchEvent('click')
  const collapsed = await page.waitForSelector(SEL.rail, { timeout: WAIT_MS }).then(() => true, () => false)
  if (collapsed) pass(`collapsed: ${SEL.rail}`)
  else fail(`${SEL.rail} (collapse left the shell wide or unmounted)`)

  const railSelect = page.locator(`${SEL.rail} ${SEL.select}`).first()
  if ((await railSelect.count()) === 1) {
    await railSelect.dispatchEvent('click')
    const expanded = await page.waitForSelector(`${SEL.wide} ${SEL.row}`, { timeout: WAIT_MS }).then(() => true, () => false)
    if (expanded) pass(`the rail's workspace control expands the column: ${SEL.wide} ${SEL.row}`)
    else fail(`${SEL.wide} ${SEL.row} (expand did not restore the rows)`)
  } else {
    fail(`${SEL.rail} ${SEL.select} (the rail lost its workspace control)`)
  }
  const after = await readRows(page)
  if (after.length !== rows.length) fail(`${SEL.row} (expand restored ${after.length} rows, ${rows.length} before the fold)`)
  else pass(`rows restored after the fold: ${after.length}`)

  // Colour discipline: every colour in the sheet is a --dsw-* token, and the
  // tokens resolve on the shell element (they are scoped below <html>).
  if (await exactlyOne(page, SEL.style, 'theme-token stylesheet')) {
    const { literals, uses } = await page.evaluate((selector) => {
      const css = document.querySelector(selector)?.textContent ?? ''
      const decls = [...css.matchAll(/(?:^|[{;\s])(color|background|background-color|border-color|outline-color|fill|stroke)\s*:\s*([^;]+)/g)]
      const values = decls.map((match) => match[2].trim())
      return { uses: values.length, literals: values.filter((value) => /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(value)) }
    }, SEL.style)
    if (literals.length === 0) pass(`every colour is a --dsw-* token (${uses} uses)`)
    else fail(`${SEL.style} (literal colours: ${literals.join(', ')})`)
  }
  const tokens = await page.evaluate(() => {
    const el = document.querySelector('[data-slot="sidebar"]') ?? document.body
    const read = (name) => getComputedStyle(el).getPropertyValue(name).trim()
    return { label: read('--dsw-alias-label-primary'), bg: read('--dsw-alias-bg-base') }
  })
  if (tokens.label !== '' && tokens.bg !== '') pass(`theme tokens resolve on the shell: label=${tokens.label} bg=${tokens.bg}`)
  else fail(`body (tokens unresolved: label="${tokens.label}" bg="${tokens.bg}")`)

  if (failures.length === 0) console.log('probe-shell: PASS — the shell owns the seat and draws real sessions')
}, {})

await withPage(async (page) => {
  const mounted = await page.waitForSelector(SEL.shell, { timeout: WAIT_MS }).then(() => true, () => false)
  if (!mounted) return fail(`${SEL.shell} (dark scheme: shell did not mount)`)
  const tokens = await page.evaluate(() => {
    const el = document.querySelector('[data-slot="sidebar"]') ?? document.body
    const read = (name) => getComputedStyle(el).getPropertyValue(name).trim()
    return { label: read('--dsw-alias-label-primary'), bg: read('--dsw-alias-bg-base') }
  })
  if (tokens.label !== '' && tokens.bg !== '') pass(`dark scheme tokens resolve: label=${tokens.label} bg=${tokens.bg}`)
  else fail(`body (dark scheme tokens unresolved: label="${tokens.label}" bg="${tokens.bg}")`)
}, { colorScheme: 'dark' })

if (failures.length > 0) {
  console.error(`probe-shell: FAIL — ${failures.length} missing: ${failures.join('; ')}`)
  process.exit(1)
}
process.exit(0)
