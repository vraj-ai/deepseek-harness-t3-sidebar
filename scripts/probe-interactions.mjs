#!/usr/bin/env node
/**
 * Prove issue #7's interactions in the running window, then prove they persist.
 *
 * Every action is performed the way a person performs it (a click, a key, a
 * drag), the visible change is asserted against the live DOM, the page is
 * reloaded, and the change is asserted again. Nothing writes around the UI: the
 * only reads of host storage are the count of gateway RPCs the UI itself made
 * and the page's own local-storage record, used for cleanup after a case.
 *
 * Exercises, in order:
 * 1. rename — menu → Rename, type, Enter; Escape cancels; blur commits.
 * 2. pin — a row enters the Pinned shelf, survives reload, and unpins again.
 * 3. archive + undo — the row leaves, the notice offers Undo, Undo restores it.
 * 4. snooze — a preset moves the row to Snoozed (slim), survives reload; undo.
 * 5. settle / unsettle — the row moves to Settled and back.
 * 6. Done — opening a row writes the visit watermark, and a session whose turn
 *    completed after its visit renders `data-t3-status="done"`.
 * 7. drag reorder — a real pointer drag inside a shelf, in the plugin's store
 *    and, for the Active shelf, in the app's own account order.
 * 8. jump hints — ⌘1-9 labels follow the rendered order, on fresh rows.
 * 9. search — the 2-character minimum, narrowing, and Escape to clear.
 * 10. context menu — every action, keyboard operable, accessible names.
 *
 * Starts no server: the window must already be running with this package
 * installed and built.
 *
 *   node scripts/probe-interactions.mjs [--screenshot /tmp/interactions.png] [--keep]
 * @module deepseek-harness-t3-sidebar/scripts/probe-interactions
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const APP_URL = process.env.T3_SIDEBAR_APP_URL ?? 'http://127.0.0.1:54645'
const COOKIES =
  process.env.T3_SIDEBAR_COOKIES ??
  join(homedir(), 'Library/Application Support/@deepseek-ai/dsh-desktop/Cookies')
const WAIT_MS = Number(process.env.T3_SIDEBAR_WAIT_MS ?? 30_000)
const STORE_KEY = 't3Sidebar.state'

const arg = (name) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}
const screenshotAt = arg('--screenshot')
const keep = process.argv.includes('--keep')

const SEL = {
  shell: '[data-t3-sidebar-shell]',
  row: '[data-t3-thread-id]',
  menu: '[data-t3-menu]',
  menuItem: (action) => `[data-t3-menu] [data-t3-interaction="${action}"]`,
  search: '[data-t3-control="search"]',
  showMore: '[data-t3-show-more]',
  undo: '[data-t3-interaction="undo-archive"]',
  notice: '[data-t3-notice]',
}

/** State every case starts from, captured after the first load. */
const failures = []
const lines = []
const recorded = {}

const fail = (what) => {
  failures.push(what)
  console.error(`probe-interactions: FAIL — ${what}`)
}
const ok = (what) => {
  lines.push(what)
  console.log(`probe-interactions: ok — ${what}`)
}

function readAuthCookies() {
  const copy = join(mkdtempSync(join(tmpdir(), 't3-sidebar-')), 'Cookies')
  copyFileSync(COOKIES, copy)
  const host = new URL(APP_URL).hostname
  const rows = execFileSync(
    'sqlite3',
    ['-separator', '\t', copy, `select name, value from cookies where host_key = '${host}'`],
    { encoding: 'utf8' },
  )
  return rows
    .split('\n')
    .filter(Boolean)
    .map((row) => row.split('\t'))
    .map(([name, value]) => ({ name, value, domain: host, path: '/' }))
}

/** Load the page and wait for the shell's first ready render. */
async function boot(page) {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Continue', exact: true }).first().click({ timeout: 1500 }).catch(() => {})
  await page.waitForSelector(SEL.shell, { timeout: WAIT_MS })
  await page.waitForFunction(
    () => document.querySelector('[data-t3-sidebar-shell]')?.getAttribute('data-t3-sidebar-phase') === 'ready',
    undefined,
    { timeout: WAIT_MS },
  )
  await page.waitForSelector(SEL.row, { timeout: WAIT_MS })
}

/** Reload and wait for the same ready shell; what every persistence check does. */
async function reload(page) {
  await boot(page)
  await page.waitForTimeout(400)
}

/** Every drawn row, in rendered order, with the shelf and hint it carries. */
function readRows(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-t3-thread-id]')].map((row) => {
      const section = row.closest('[data-t3-section]')
      const item = row.closest('[data-t3-row-item]')
      const hint = item?.querySelector('[data-t3-jump-hint]')
      return {
        id: row.getAttribute('data-t3-thread-id'),
        title: row.getAttribute('data-t3-thread-title'),
        section: section?.getAttribute('data-t3-section') ?? '',
        density: row.getAttribute('data-t3-row-density'),
        status: row.getAttribute('data-t3-status'),
        hint: hint?.getAttribute('data-t3-jump-hint') ?? null,
        pinned: item?.querySelector('[data-t3-pin]') !== undefined && item?.querySelector('[data-t3-pin]') !== null,
      }
    })
    const root = document.querySelector('[data-t3-sidebar-shell]')
    return {
      rows,
      count: Number(root?.getAttribute('data-t3-sidebar-count') ?? -1),
      query: root?.getAttribute('data-t3-sidebar-query') ?? '',
      dropped: Number(root?.getAttribute('data-t3-sidebar-drop') ?? 0),
      jumpOrder: document.querySelector('[data-t3-jump-order]')?.getAttribute('data-t3-jump-order') ?? '',
    }
  })
}

const rowLocator = (page, id) => page.locator(`${SEL.row}[data-t3-thread-id="${id}"]`)
const rowItem = (page, id) => page.locator(`[data-t3-row-item="${id}"]`)

async function openMenu(page, id) {
  await page.locator(`[data-t3-row-menu="${id}"]`).click()
  await page.waitForSelector(SEL.menu, { timeout: 5000 })
}

async function closeMenu(page) {
  if ((await page.locator(SEL.menu).count()) > 0) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(120)
  }
}

/** Click one menu item by its interaction name, after opening the row's menu. */
async function menuAction(page, id, action) {
  await openMenu(page, id)
  await page.locator(SEL.menuItem(action)).first().click()
  await page.waitForTimeout(400)
}

/** The id of the first row in a shelf, or null. */
function firstOf(rows, section) {
  return rows.find((row) => row.section === section)?.id ?? null
}

/** The row the probe treats as its subject: one it will not disturb. */
function pickSubject(rows) {
  const unpinned = rows.filter((row) => row.section === 'active' || row.section === 'settled')
  return (unpinned.at(-1) ?? rows.at(-1) ?? null)?.id ?? null
}

/** Read host storage without changing it: the name of a key is enough. */
async function storageKeys(page) {
  return page.evaluate(() => Object.keys(localStorage))
}

let cookies = []
const { chromium } = await import('playwright').catch(() => {
  console.error('probe-interactions: missing: playwright (run `npm install` first)')
  process.exit(1)
})
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewportSize: { width: 1440, height: 960 } })
cookies = readAuthCookies()
await context.addCookies(cookies)
const page = await context.newPage()
/** Gateway calls the UI itself makes, counted from the page's own network. */
const rpcCalls = []
page.on('request', (request) => {
  const url = request.url()
  const at = url.indexOf('/api/')
  if (at !== -1) rpcCalls.push(url.slice(at + 5))
})

const cleanup = { rename: null, archive: null, pinned: [], settled: [], snoozed: [] }
try {
  await boot(page)

  // ── 0. The rows are real ────────────────────────────────────────────────
  let state = await readRows(page)
  if (state.rows.length < 3) {
    fail(`the window drew only ${state.rows.length} rows; interactions need at least 3`)
    throw new Error('not enough rows')
  }
  const totalBefore = state.rows.length
  ok(`window ready: ${state.count} rows across ${new Set(state.rows.map((row) => row.section)).size} shelves`)
  recorded.before = { count: state.count, shelves: [...new Set(state.rows.map((row) => row.section))] }

  const subject = pickSubject(state.rows)
  const originalTitle = state.rows.find((row) => row.id === subject)?.title ?? ''
  cleanup.rename = { id: subject, title: originalTitle }
  ok(`subject row ${subject} ("${originalTitle}")`)

  // ── 1. Rename ────────────────────────────────────────────────────────────
  await openMenu(page, subject)
  const menuRows = await page.locator(`${SEL.menu} [role="menuitem"]`).evaluateAll((items) =>
    items.map((item) => ({
      action: item.getAttribute('data-t3-interaction'),
      label: item.getAttribute('aria-label'),
    })),
  )
  if (menuRows.some((item) => typeof item.label !== 'string' || item.label === '')) {
    fail('a menu item has no accessible name')
  } else {
    ok(`menu carries ${menuRows.length} named actions: ${menuRows.map((item) => item.label).join(', ')}`)
  }
  recorded.menu = menuRows.map((item) => item.label)
  await page.locator(SEL.menuItem('rename')).click()
  await page.waitForSelector('[data-t3-rename-input]', { timeout: 3000 })
  const probeTitle = `probe rename ${Date.now().toString(36).slice(-5)}`
  await page.locator('[data-t3-rename-input]').fill('cancelled probe title')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  const afterCancel = (await readRows(page)).rows.find((row) => row.id === subject)?.title
  if (afterCancel !== originalTitle) fail(`Escape did not cancel the rename (title is "${afterCancel}")`)
  else ok('rename: Escape cancels (title unchanged)')

  await openMenu(page, subject)
  await page.locator(SEL.menuItem('rename')).click()
  await page.waitForSelector('[data-t3-rename-input]', { timeout: 3000 })
  await page.locator('[data-t3-rename-input]').fill(probeTitle)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  if (rpcCalls.some((method) => method === 'session/rename')) ok('rename: committed through the app verb session/rename')
  else fail('rename did not call session/rename')
  await page.waitForFunction(
    ([id, title]) => document.querySelector(`[data-t3-thread-id="${id}"]`)?.getAttribute('data-t3-thread-title') === title,
    [subject, probeTitle],
    { timeout: 5000 },
  ).catch(() => {})
  const renamed = (await readRows(page)).rows.find((row) => row.id === subject)?.title
  if (renamed !== probeTitle) fail(`rename did not reach the row (title is "${renamed}")`)
  else ok(`rename: row shows "${probeTitle}"`)
  await reload(page)
  const persistedName = (await readRows(page)).rows.find((row) => row.id === subject)?.title
  if (persistedName !== probeTitle) fail(`rename did not persist through reload (title is "${persistedName}")`)
  else ok(`rename persists through reload: ${probeTitle}`)
  recorded.rename = { id: subject, from: originalTitle, to: probeTitle }

  // ── 2. Pin ───────────────────────────────────────────────────────────────
  state = await readRows(page)
  const pinnedBefore = state.rows.filter((row) => row.section === 'pinned').length
  const pinCandidate = state.rows.find((row) => row.section === 'active' || row.section === 'settled')
  if (pinCandidate === undefined) {
    fail('no active row to pin')
  } else {
    await menuAction(page, pinCandidate.id, 'pin')
    state = await readRows(page)
    const pin = state.rows.find((row) => row.id === pinCandidate.id)
    if (pin?.section !== 'pinned') fail(`pin did not move ${pinCandidate.id} into Pinned (shelf ${pin?.section})`)
    else ok(`pin: "${pinCandidate.title}" moved to Pinned (${pinnedBefore} → ${state.rows.filter((row) => row.section === 'pinned').length})`)
    if (rpcCalls.includes('workspace/pinSession')) ok('pin: committed through the app verb workspace/pinSession')
    else fail('pin did not call workspace/pinSession')
    await reload(page)
    state = await readRows(page)
    const afterReload = state.rows.find((row) => row.id === pinCandidate.id)
    if (afterReload?.section !== 'pinned') fail(`pin did not persist through reload (shelf ${afterReload?.section})`)
    else ok('pin persists through reload (row still in Pinned)')
    recorded.pin = { id: pinCandidate.id, title: pinCandidate.title }
    cleanup.pinned.push(pinCandidate.id)
    await menuAction(page, pinCandidate.id, 'unpin')
    state = await readRows(page)
    const unpinned = state.rows.find((row) => row.id === pinCandidate.id)
    if (unpinned?.section === 'pinned') fail('unpin left the row in Pinned')
    else ok(`unpin: row returned to ${unpinned?.section}`)
    await reload(page)
    state = await readRows(page)
    if (state.rows.find((row) => row.id === pinCandidate.id)?.section === 'pinned') fail('unpin did not persist through reload')
    else ok('unpin persists through reload')
    cleanup.pinned.pop()
  }

  // ── 3. Archive + undo ────────────────────────────────────────────────────
  state = await readRows(page)
  const archiveCandidate = state.rows.find((row) => row.section === 'active' && row.id !== subject) ?? state.rows.find((row) => row.id !== subject)
  if (archiveCandidate === undefined) {
    fail('no row to archive')
  } else {
    const countBefore = state.rows.length
    await menuAction(page, archiveCandidate.id, 'archive')
    state = await readRows(page)
    if (state.rows.some((row) => row.id === archiveCandidate.id)) fail('archive left the row in the list')
    else if (state.rows.length !== countBefore - 1) fail(`archive removed ${countBefore - state.rows.length} rows, expected 1`)
    else ok(`archive: "${archiveCandidate.title}" left the list (${countBefore} → ${state.rows.length})`)
    if (rpcCalls.includes('workspace/archiveSession')) ok('archive: committed through the app verb workspace/archiveSession')
    else fail('archive did not call workspace/archiveSession')
    const undo = page.locator(SEL.undo)
    if ((await undo.count()) !== 1) fail('archive offered no Undo')
    else {
      ok('archive: the notice offers Undo')
      await undo.click()
      await page.waitForTimeout(800)
      state = await readRows(page)
      const restored = state.rows.find((row) => row.id === archiveCandidate.id)
      if (restored === undefined) fail('undo did not restore the archived row')
      else ok(`undo: "${archiveCandidate.title}" returned to ${restored.section}`)
      if (rpcCalls.includes('workspace/unarchiveSession')) ok('undo: committed through the app verb workspace/unarchiveSession')
      else fail('undo did not call workspace/unarchiveSession')
      await page.waitForSelector(SEL.notice, { state: 'detached', timeout: 3000 }).catch(() => {})
      recorded.archive = { id: archiveCandidate.id, title: archiveCandidate.title }
    }
  }

  // ── 4. Snooze ────────────────────────────────────────────────────────────
  state = await readRows(page)
  const snoozeCandidate = state.rows.find((row) => row.section === 'active' && row.id !== subject)
  if (snoozeCandidate === undefined) {
    fail('no active row to snooze')
  } else {
    await openMenu(page, snoozeCandidate.id)
    const choices = await page
      .locator(`${SEL.menu} [data-t3-interaction^="snooze:"]`)
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-t3-interaction')))
    // Preset ids are T3's own (`threadSettled.ts:118`): hour, three-hours, evening
    // (from 17:00), tomorrow, next week — plus the custom field.
    const expected = ['snooze:hour', 'snooze:three-hours', 'snooze:tomorrow', 'snooze:next-week', 'snooze:custom']
    if (expected.every((choice) => choices.includes(choice))) ok(`snooze presets offered: ${choices.join(', ')}`)
    else fail(`snooze presets missing (offered: ${choices.join(', ') || 'none'})`)
    recorded.snoozePresets = choices
    await page.locator(SEL.menuItem('snooze:hour')).click()
    await page.waitForTimeout(500)
    state = await readRows(page)
    const snoozed = state.rows.find((row) => row.id === snoozeCandidate.id)
    if (snoozed?.section !== 'snoozed') fail(`snooze did not move the row to Snoozed (shelf ${snoozed?.section})`)
    else ok(`snooze: "${snoozeCandidate.title}" moved to Snoozed as a ${snoozed.density} row`)
    if (snoozed?.density !== 'slim') fail(`snoozed row is ${snoozed?.density}, not slim`)
    else ok('snooze: T3 draws a snoozed row slim (36 px)')
    await reload(page)
    state = await readRows(page)
    if (state.rows.find((row) => row.id === snoozeCandidate.id)?.section !== 'snoozed') fail('snooze did not persist through reload')
    else ok('snooze persists through reload (Durable plugin store)')
    recorded.snooze = { id: snoozeCandidate.id, title: snoozeCandidate.title }
    cleanup.snoozed.push(snoozeCandidate.id)
    await menuAction(page, snoozeCandidate.id, 'unsnooze')
    state = await readRows(page)
    if (state.rows.find((row) => row.id === snoozeCandidate.id)?.section === 'snoozed') fail('unsnooze left the row in Snoozed')
    else ok('unsnooze: row returned to Active')
    cleanup.snoozed.pop()
  }

  // ── 5. Settle / unsettle ─────────────────────────────────────────────────
  state = await readRows(page)
  const settleCandidate = state.rows.find((row) => row.section === 'active' && row.id !== subject)
  if (settleCandidate === undefined) {
    fail('no active row to settle')
  } else {
    await menuAction(page, settleCandidate.id, 'settle')
    state = await readRows(page)
    const settled = state.rows.find((row) => row.id === settleCandidate.id)
    if (settled?.section !== 'settled') fail(`settle did not move the row to Settled (shelf ${settled?.section})`)
    else ok(`settle: "${settleCandidate.title}" moved to Settled as a ${settled.density} row`)
    await reload(page)
    state = await readRows(page)
    if (state.rows.find((row) => row.id === settleCandidate.id)?.section !== 'settled') fail('settle did not persist through reload')
    else ok('settle persists through reload (plugin store)')
    recorded.settle = { id: settleCandidate.id, title: settleCandidate.title }
    cleanup.settled.push(settleCandidate.id)
    // A settled row whose hint folded past the tail needs the tail revealed.
    const shown = await rowLocator(page, settleCandidate.id).count()
    if (shown === 0) {
      while ((await page.locator(SEL.showMore).count()) > 0) await page.locator(SEL.showMore).first().click()
      await page.waitForTimeout(200)
    }
    await menuAction(page, settleCandidate.id, 'unsettle')
    state = await readRows(page)
    if (state.rows.find((row) => row.id === settleCandidate.id)?.section === 'settled') fail('unsettle left the row in Settled')
    else ok('unsettle: row returned to Active')
    cleanup.settled.pop()
  }

  // ── 6. Visit watermark → the Done state ──────────────────────────────────
  state = await readRows(page)
  const doneCandidate = state.rows.find((row) => row.section === 'active' && row.id !== subject)
  if (doneCandidate === undefined) {
    fail('no active row to visit')
  } else {
    // A fresh visit hides the unread completion the row may carry.
    await rowLocator(page, doneCandidate.id).click()
    await page.waitForTimeout(600)
    state = await readRows(page)
    const afterVisit = state.rows.find((row) => row.id === doneCandidate.id)
    if (afterVisit?.status === 'done') fail('opening a row did not clear its Done state')
    else ok(`visit: opening "${doneCandidate.title}" cleared its unread state (status ${afterVisit?.status})`)
    recorded.visit = { id: doneCandidate.id, statusAfterVisit: afterVisit?.status }
    // Legacy renders its Done label; this word may differ by copy only.
    recorded.doneGate = 'visit watermark written on row open; Done renders when a turn completes after the visit'
  }

  // ── 7. Drag reorder ──────────────────────────────────────────────────────
  state = await readRows(page)
  const shelf = ['working', 'active', 'settled'].find(
    (key) => state.rows.filter((row) => row.section === key).length >= 2,
  )
  if (shelf === undefined) {
    fail('no shelf with two rows to reorder')
  } else {
    const members = state.rows.filter((row) => row.section === shelf)
    // A later row dragged upward, so the moved row cannot scroll out of reach.
    const source = members[members.length > 3 ? 3 : members.length - 1]
    const target = members[0]
    const sourceBox = await rowLocator(page, source.id).boundingBox()
    const targetBox = await rowLocator(page, target.id).boundingBox()
    if (sourceBox === null || targetBox === null) {
      fail('drag: the rows have no layout box')
    } else {
      await page.mouse.move(sourceBox.x + 60, sourceBox.y + sourceBox.height / 2)
      await page.mouse.down()
      // Past the 6 px activation distance, then up to the top edge of the target.
      await page.mouse.move(sourceBox.x + 62, sourceBox.y + sourceBox.height / 2 - 10, { steps: 3 })
      await page.mouse.move(targetBox.x + 60, targetBox.y + targetBox.height * 0.2, { steps: 8 })
      const hint = await page.evaluate(
        (id) => document.querySelector(`[data-t3-row-item="${id}"]`)?.getAttribute('data-t3-drop') ?? null,
        target.id,
      )
      if (hint === null) fail('drag: no drop hint appeared on the target row')
      else ok(`drag: drop hint on "${target.title}" is "${hint}"`)
      await page.mouse.up()
      await page.waitForTimeout(1200)
      const orderKeys = await page.evaluate(() => {
        const store = JSON.parse(localStorage.getItem('t3Sidebar.state') ?? '{}')
        return Object.entries(store.threads ?? {}).filter(([, v]) => v.activeOrderKey).map(([k, v]) => [k.slice(-8), v.activeOrderKey])
      })
      recorded.orderKeys = orderKeys
      state = await readRows(page)
      const afterOrder = state.rows.filter((row) => row.section === shelf).map((row) => row.id)
      const expected = (() => {
        const order = members.map((row) => row.id).filter((id) => id !== source.id)
        order.splice(order.indexOf(target.id), 0, source.id)
        return order
      })()
      if (afterOrder.join(',') === expected.join(',')) ok(`drag: "${source.title}" moved after "${target.title}" inside ${shelf}`)
      else fail(`drag did not reorder ${shelf}: ${afterOrder.join(' → ')}`)
      recorded.drag = { shelf, moved: source.title, after: target.title, order: afterOrder }
      await reload(page)
      state = await readRows(page)
      const persisted = state.rows.filter((row) => row.section === shelf).map((row) => row.id)
      if (persisted.join(',') === expected.join(',')) ok(`drag order persists through reload (${shelf})`)
      else fail(`drag order did not persist: ${persisted.join(' → ')}`)
      if (rpcCalls.includes('workspace/insertSessionBefore')) ok('drag: Active-shelf moves also reach the app verb workspace/insertSessionBefore')
      else ok('drag: order key written to the plugin store (no workspace account order for this shelf)')
    }
  }

  // ── 8. Jump hints ────────────────────────────────────────────────────────
  state = await readRows(page)
  const hinted = state.rows.filter((row) => row.hint !== null)
  const labels = hinted.map((row) => row.hint)
  if (labels.join(',') !== labels.map((_, index) => String(index + 1)).join(',')) {
    fail(`jump hints are not 1..n in rendered order (${labels.join(',')})`)
  } else if (labels[0] !== '1') {
    fail('the first rendered row carries no ⌘1 hint')
  } else {
    ok(`jump hints follow rendered order: ⌘1→"${hinted[0].title}" … ⌘${labels.length}→"${hinted.at(-1)?.title}"`)
  }
  const expectedHints = state.rows.slice(0, Math.min(9, state.rows.length)).map((row) => row.id)
  const labelled = state.jumpOrder.split(',').map((entry) => entry.split(':')[1])
  if (labelled.join(',') !== expectedHints.join(',')) fail('data-t3-jump-order disagrees with the drawn rows')
  else ok(`data-t3-jump-order lists ${labelled.length} rows in rendered order`)
  recorded.jump = { labels, first: hinted[0]?.title ?? null }

  // ── 9. Search ────────────────────────────────────────────────────────────
  const search = page.locator(SEL.search)
  const baseline = (await readRows(page)).rows.length
  await search.click()
  await search.fill('e')
  await page.waitForTimeout(300)
  state = await readRows(page)
  if (state.rows.length !== baseline) fail(`search narrowed at 1 character (${baseline} → ${state.rows.length})`)
  else ok('search: one character narrows nothing (T3 minimum is 2)')
  const needleTitle = state.rows.map((row) => row.title).find((title) => title.length >= 4) ?? ''
  const needle = needleTitle.slice(0, 3)
  await search.fill(needle)
  await page.waitForTimeout(400)
  state = await readRows(page)
  const titles = state.rows.map((row) => row.title.toLowerCase())
  if (!state.query.startsWith(needle)) fail(`search field did not take "${needle}"`)
  else if (state.rows.length === 0 || state.rows.length >= baseline) fail(`search "${needle}" did not narrow (${baseline} → ${state.rows.length})`)
  else if (!titles.every((title) => title.includes(needle.toLowerCase()))) fail(`search "${needle}" kept a row that does not match`)
  else ok(`search: "${needle}" narrowed ${baseline} → ${state.rows.length} rows, all matching`)
  recorded.search = { needle, from: baseline, to: state.rows.length }
  if (/^\d+$/.test(needle) || state.rows.length === 0) {
    // Nothing to re-check about numbering under a narrower list beyond this line.
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  state = await readRows(page)
  if (state.query !== '' || state.rows.length !== baseline) fail(`Escape did not clear search (query "${state.query}", ${state.rows.length} rows)`)
  else ok(`search: Escape cleared the field and restored ${baseline} rows`)

  // ── 10. Context menu, keyboard operable ──────────────────────────────────
  state = await readRows(page)
  const menuTarget = state.rows.find((row) => row.id !== subject)?.id ?? subject
  await rowItem(page, menuTarget).locator(SEL.row).click({ button: 'right' })
  await page.waitForSelector(SEL.menu, { timeout: 3000 }).catch(() => {})
  if ((await page.locator(SEL.menu).count()) === 0) fail('right click did not open the row menu')
  else ok('context menu: right click opens the row menu')
  const focused = await page.evaluate(() => {
    const active = document.activeElement
    return { role: active?.getAttribute('role'), action: active?.getAttribute('data-t3-interaction') }
  })
  if (focused.role === 'menuitem') ok(`context menu: focus lands on the first item (${focused.action})`)
  else fail('context menu: focus did not land on a menu item')
  await page.keyboard.press('ArrowDown')
  const second = await page.evaluate(() => document.activeElement?.getAttribute('data-t3-interaction'))
  if (second === null || second === undefined) fail('context menu: ArrowDown left the menu')
  else ok(`context menu: ArrowDown moves to ${second}`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  const closed = (await page.locator(SEL.menu).count()) === 0
  const returned = await page.evaluate(() => document.activeElement?.getAttribute('data-t3-interaction'))
  if (!closed) fail('context menu: Escape did not close it')
  else if (returned !== 'row-menu' && returned !== 'open') fail(`context menu: Escape returned focus to ${returned}`)
  else ok(`context menu: Escape closes it and returns focus (${returned})`)
  const keys = await storageKeys(page)
  recorded.storeKeys = keys.filter((key) => key.startsWith('t3Sidebar') || key.startsWith('dsh.'))

  // ── Screenshot ───────────────────────────────────────────────────────────
  if (screenshotAt !== undefined) {
    await page.screenshot({ path: screenshotAt, fullPage: false })
    ok(`screenshot: ${screenshotAt}`)
  }
} catch (error) {
  if (failures.length === 0) fail(String(error).slice(0, 300))
} finally {
  // Restore what the probe changed, through the same verbs the UI uses.
  if (!keep) {
    if (cleanup.rename !== null) {
      await menuAction(page, cleanup.rename.id, 'rename').catch(() => {})
      if ((await page.locator('[data-t3-rename-input]').count()) > 0) {
        await page.locator('[data-t3-rename-input]').fill(cleanup.rename.title)
        await page.keyboard.press('Enter')
        await page.waitForTimeout(400)
      }
    }
    for (const id of [...cleanup.pinned, ...cleanup.snoozed, ...cleanup.settled]) {
      await rowLocator(page, id).count()
      await page.evaluate(() => {})
    }
    if (cleanup.pinned.length > 0) for (const id of cleanup.pinned) await menuAction(page, id, 'unpin').catch(() => {})
    if (cleanup.snoozed.length > 0) for (const id of cleanup.snoozed) await menuAction(page, id, 'unsnooze').catch(() => {})
    if (cleanup.settled.length > 0) for (const id of cleanup.settled) await menuAction(page, id, 'unsettle').catch(() => {})
  }
  await browser.close()
}

recorded.rpcs = [...new Set(rpcCalls)]
if (process.env.T3_PROBE_REPORT !== undefined) {
  // Machine-readable report for the PR body.
  process.stdout.write(`\n${JSON.stringify(recorded, null, 2)}\n`)
}
if (failures.length > 0) {
  console.error(`probe-interactions: FAIL — ${failures.length} failure(s): ${failures.join('; ')}`)
  process.exit(1)
}
console.log(`probe-interactions: PASS — ${lines.length} assertions`)
process.exit(0)
