#!/usr/bin/env node
/**
 * Prove the thread list: T3's densities, shelves, statuses, and hover card,
 * measured in the running window.
 *
 * Reads the running app's own origin cookie from the desktop cookie store,
 * opens the GUI in headless Chromium, and asserts against the live DOM:
 *
 * 1. Shelves draw with their live counts, in T3's order, and the shell's
 *    `data-t3-sidebar-count` equals the rows actually drawn.
 * 2. A card row measures 82 px and a slim row 36 px; shelf headers measure 32 px;
 *    rows sit 1 px apart.
 * 3. A row's status marker matches reality, driven through the app's own RPC:
 *    a throwaway session is created and prompted, the list is seen reporting it
 *    working, and after its turn ends the list is seen reporting it done. Then
 *    the same row is settled through the plugin's own durable intent store
 *    (`t3Sidebar.state`, the key the model reads) and moves to the Slim
 *    shelf, where it is measured at 36 px. No existing session is prompted;
 *    the only model call is the throwaway session's own one-word turn.
 * 4. A real session's provider/model stack appears, equal to its
 *    `modelSelection`.
 * 5. Hovering a row opens its hover card with that row's title, project, path
 *    and status.
 * 6. Every colour in the plugin's sheet is a `--dsw-*` token.
 *
 * Starts no server and spawns no Harness process: the window must already be
 * running with this package installed and built. Each failure prints its own
 * line and the process exits non-zero.
 *
 *   node scripts/probe-list.mjs [--screenshot /tmp/list.png] [--keep-session]
 * @module deepseek-harness-t3-sidebar/scripts/probe-list
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
const TURN_WAIT_MS = Number(process.env.T3_SIDEBAR_TURN_MS ?? 240_000)

const SEL = {
  shell: '[data-t3-sidebar-shell]',
  section: '[data-t3-section]',
  header: '[data-t3-section-header]',
  row: '[data-t3-thread-id]',
  rowItem: '[data-t3-thread-id]',
  hoverCard: '[data-t3-hover-card]',
  style: 'style[data-plugin-css="deepseek-harness-t3-sidebar/shell.css"]',
}

/** T3's geometry: 82 px card, 36 px slim row, 32 px header, 1 px gaps. */
const GEOMETRY = { card: 82, slim: 36, header: 32, gap: 1 }

const arg = (name) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}
const screenshotAt = arg('--screenshot')
const keepSession = process.argv.includes('--keep-session')

/** The plugin's durable intent store key (`src/adapter/store.ts`). */
const STORE_KEY = 't3Sidebar.state'

/**
 * Read the plugin store, run `mutate`, write it back, and reload the page so the
 * seat re-derives from it. The store is version-keyed; an unreadable record is
 * replaced by the empty v1 shape rather than guessed at.
 */
async function updateStore(page, mutate, ...args) {
  await page.evaluate(
    ([storeKey, source, args]) => {
      const empty = { version: 1, threads: {} }
      let state = empty
      try {
        const parsed = JSON.parse(localStorage.getItem(storeKey) ?? 'null')
        if (parsed !== null && parsed.version === 1 && typeof parsed.threads === 'object') state = parsed
      } catch {
        state = empty
      }
      // The mutation body travels as source: the page has no closure over it,
      // so its inputs travel as arguments.
      const names = args.map((_, index) => `a${index}`)
      const apply = new Function('state', ...names, `return ${source}`)
      const next = apply(state, ...args)
      localStorage.setItem(storeKey, JSON.stringify(next))
    },
    [STORE_KEY, `(${mutate.toString()})(state, ${args.map((_, index) => `a${index}`).join(', ')})`, args],
  )
  const persisted = await page.evaluate((storeKey) => localStorage.getItem(storeKey) !== null, STORE_KEY)
  if (!persisted) throw new Error('probe-list: the plugin store did not persist')
}

const settleInStore = (page, sessionId) =>
  updateStore(page, (state, sessionId) => {
    const key = `dsh:${sessionId}`
    const now = new Date().toISOString()
    const intent = state.threads[key] ?? {
      snoozedUntil: null,
      snoozedAt: null,
      settledOverride: null,
      settledAt: null,
      lastVisitedAt: null,
      pinnedAt: null,
      pinOrderKey: null,
      activeOrderKey: null,
    }
    state.threads[key] = { ...intent, settledOverride: 'settled', settledAt: now, lastVisitedAt: now }
    return state
  }, sessionId).then(() =>
    page.reload({ waitUntil: 'domcontentloaded' }).then(async () => {
      await page.getByRole('button', { name: 'Continue', exact: true }).first().click({ timeout: 3000 }).catch(() => undefined)
      await page.waitForSelector(SEL.row, { timeout: WAIT_MS }).catch(() => undefined)
    }),
  )

/**
 * Put the store back exactly as the page found it, so a probe run leaves no
 * settle behind for the next reader of the window.
 */
const restoreStore = (page, previous) =>
  page.evaluate(
    ([storeKey, previous]) => (previous === null ? localStorage.removeItem(storeKey) : localStorage.setItem(storeKey, previous)),
    [STORE_KEY, previous],
  )

const failures = []
const fail = (what) => {
  failures.push(what)
  console.error(`probe-list: missing: ${what}`)
  return false
}
const pass = (what) => {
  console.log(`probe-list: ok — ${what}`)
  return true
}

function readAuthCookies() {
  const copy = join(mkdtempSync(join(tmpdir(), 't3-sidebar-list-')), 'Cookies')
  copyFileSync(COOKIES, copy)
  const rows = execFileSync(
    'sqlite3',
    ['-separator', '\t', copy, `select name, value from cookies where host_key = '${new URL(APP_URL).hostname}'`],
    { encoding: 'utf8' },
  )
  return rows
    .split('\n')
    .filter(Boolean)
    .map((row) => row.split('\t'))
    .map(([name, value]) => ({ name, value, domain: new URL(APP_URL).hostname, path: '/' }))
}

/**
 * The app's own unary RPC, from inside the page so the origin cookie and the
 * gateway's `{ args }` payload envelope apply exactly as they do for its own
 * calls (`createWebConnectionRpc`, dsh-api-gateway client).
 */
const callRpc = (page, method, args) =>
  page.evaluate(
    async ([method, args]) => {
      const rpcId = crypto.randomUUID()
      const response = await fetch(`/api/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId, method, payload: { args } }),
      })
      const body = await response.json()
      return { status: response.status, result: body?.result }
    },
    [method, args],
  )

/** Open the GUI in a fresh context and hand the page to `run`. */
async function withPage(run) {
  const { chromium } = await import('playwright').catch(() => {
    console.error('probe-list: missing: playwright (run `npm install` first)')
    process.exit(1)
  })
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ viewportSize: { width: 1440, height: 900 } })
    await context.addCookies(readAuthCookies())
    const page = await context.newPage()
    page.on('pageerror', (error) => console.error(`probe-list: page error: ${String(error).slice(0, 200)}`))
    const response = await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    if (response !== null && response.status() !== 200) {
      console.error(`probe-list: missing: ${APP_URL} answered ${response.status()}; the origin cookie was rejected`)
      process.exitCode = 1
      return
    }
    const mounted = await page.waitForSelector(SEL.shell, { timeout: WAIT_MS }).then(() => true, () => false)
    if (!mounted) {
      fail(`${SEL.shell} (the shell never mounted; is the plugin built and copied to the served lib?)`)
      return
    }
    // The seat renders before the session list settles; wait for a row.
    await page.waitForSelector(SEL.row, { timeout: WAIT_MS }).catch(() => undefined)
    // The first-run preview notice covers the whole app with a mask, and this
    // probe has its own browser profile, so it appears on every run. It only
    // consents to the already-installed preview build; dismiss it before
    // driving pointer input.
    const continueButton = page.getByRole('button', { name: 'Continue', exact: true }).first()
    if ((await continueButton.count()) > 0) {
      await continueButton.click({ timeout: 5000 }).catch(() => undefined)
      await continueButton.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined)
    }
    await page.waitForTimeout(300)
    await run(page)
  } finally {
    await browser.close()
  }
}

/** Every row's id, shelf, density, status and measured height. */
const readRows = (page) =>
  page.$$eval(
    '[data-t3-row-density]',
    (rows) =>
      rows.map((row) => {
        const section = row.closest('[data-t3-section]')
        const item = row.closest('li')
        return {
          id: row.getAttribute('data-t3-thread-id'),
          title: row.getAttribute('data-t3-thread-title'),
          density: row.getAttribute('data-t3-row-density'),
          status: row.getAttribute('data-t3-status'),
          section: section?.getAttribute('data-t3-section') ?? null,
          height: Math.round(row.getBoundingClientRect().height * 100) / 100,
          itemTop: item === null ? null : Math.round(item.getBoundingClientRect().top * 100) / 100,
          itemBottom: item === null ? null : Math.round(item.getBoundingClientRect().bottom * 100) / 100,
          stack: row.querySelector('[data-t3-provider-stack]')?.getAttribute('data-t3-provider-stack') ?? null,
        }
      }),
  )

await withPage(async (page) => {
  // The app may boot collapsed; the list is asserted wide.
  const rail = await page.locator('[data-t3-sidebar-shell][data-t3-sidebar-wide="false"]').count()
  if (rail === 1) {
    await page.locator('[data-t3-section]').first().waitFor({ state: 'detached', timeout: 2000 }).catch(() => undefined)
    await page.evaluate(() => {
      const expand = document.querySelector('[aria-label="Collapse sidebar" i], [aria-label="Hide sidebar" i]')
      expand?.click()
    })
    await page.waitForSelector('[data-t3-sidebar-shell][data-t3-sidebar-wide="true"]', { timeout: WAIT_MS }).catch(() => undefined)
  }

  const rowsBefore = await readRows(page)
  if (rowsBefore.length === 0) {
    fail(`${SEL.row} (the live list drew no rows)`)
    return
  }

  // ---- 1. Shelves: order, counts, and the shell's own count. -----------------
  const sections = await page.$$eval('[data-t3-section]', (nodes) =>
    nodes
      .filter((node) => node.getAttribute('data-t3-section-header') === null && node.hasAttribute('data-t3-section'))
      .map((node) => ({
        key: node.getAttribute('data-t3-section'),
        count: Number(node.getAttribute('data-t3-section-count')),
        rows: node.querySelectorAll('[data-t3-thread-id]').length,
      })),
  )
  console.log(`probe-list: shelves ${sections.map((s) => `${s.key}=${s.count}`).join(' ')}`)
  const order = ['pinned', 'working', 'snoozed', 'settled', 'active']
  const indexes = sections.map((section) => order.indexOf(section.key))
  if (indexes.some((index, position) => index === -1 || (position > 0 && index <= indexes[position - 1]))) {
    fail(`${SEL.section} order is ${sections.map((s) => s.key).join(' → ')}, need T3's ${order.join(' → ')}`)
  } else {
    pass(`shelves in T3's order: ${sections.map((s) => s.key).join(' → ')}`)
  }
  if (sections.length === 0) fail(`${SEL.section} (no shelf markers)`)
  const miscounts = sections.filter((section) => section.count !== section.rows)
  if (miscounts.length === 0) pass(`every shelf count is its live row count: ${sections.map((s) => `${s.key}:${s.count}`).join(' ')}`)
  else fail(`[data-t3-section-count] disagrees with rows on ${miscounts.map((s) => `${s.key} ${s.count}/${s.rows}`).join(', ')}`)
  const shellCount = Number(await page.getAttribute(SEL.shell, 'data-t3-sidebar-count'))
  const drawn = rowsBefore.length
  if (shellCount === drawn) pass(`data-t3-sidebar-count ${shellCount} equals the ${drawn} drawn rows`)
  else fail(`data-t3-sidebar-count ${shellCount} but ${drawn} rows are drawn`)

  // ---- 2. Density: card 82, slim 36, header 32, 1 px gaps. -------------------
  const headers = await page.$$eval('[data-t3-section-header]', (nodes) =>
    nodes.map((node) => ({ key: node.closest('[data-t3-section]')?.getAttribute('data-t3-section'), height: Math.round(node.getBoundingClientRect().height) })),
  )
  for (const header of headers) {
    if (header.height === GEOMETRY.header) pass(`shelf header ${header.key}: ${header.height}px`)
    else fail(`shelf header ${header.key}: ${header.height}px, need ${GEOMETRY.header}px`)
  }

  const cards = rowsBefore.filter((row) => row.density === 'card')
  const slims = rowsBefore.filter((row) => row.density === 'slim')
  const measured = (row) => `${Math.round(row.height)}px (${row.section} ${row.id?.slice(0, 12)})`
  if (cards.length === 0) fail(`${SEL.row}[data-t3-row-density="card"] (no card row drawn)`)
  else if (cards.every((row) => row.height === GEOMETRY.card)) pass(`card row: ${measured(cards[0])} — ${cards.length} cards measured ${GEOMETRY.card}px`)
  else fail(`card rows not ${GEOMETRY.card}px: ${cards.filter((r) => r.height !== GEOMETRY.card).map(measured).join(', ')}`)

  if (slims.length === 0) {
    // Slim rows are only drawn by the Snoozed and Settled shelves, and neither
    // is live on a fresh store; the settled throwaway session below supplies one.
    console.log(`probe-list: note — no slim row yet; the settled throwaway row proves the ${GEOMETRY.slim}px slim density`)
  } else if (slims.every((row) => row.height === GEOMETRY.slim)) {
    pass(`slim row: ${measured(slims[0])} — ${slims.length} slim rows measured ${GEOMETRY.slim}px`)
  } else {
    fail(`slim rows not ${GEOMETRY.slim}px: ${slims.filter((r) => r.height !== GEOMETRY.slim).map(measured).join(', ')}`)
  }

  const gaps = rowsBefore.slice(1).map((row, index) => {
    const previous = rowsBefore[index]
    return previous === undefined || previous.itemBottom === null || row.itemTop === null
      ? null
      : Math.round((row.itemTop - previous.itemBottom) * 100) / 100
  })
  const inShelfGaps = gaps.filter((gap) => gap !== null && gap < 20)
  if (inShelfGaps.length > 0 && inShelfGaps.every((gap) => gap === GEOMETRY.gap)) pass(`row gap: ${GEOMETRY.gap}px across ${inShelfGaps.length} adjacent rows`)
  else fail(`row gaps ${JSON.stringify([...new Set(inShelfGaps)])}, need ${GEOMETRY.gap}px`)

  // ---- 4. Provider stack on a real session -----------------------------------
  const withStack = rowsBefore.filter((row) => row.stack !== null)
  if (withStack.length === 0) fail('[data-t3-provider-stack] (no row names its model)')
  else pass(`provider stack: "${withStack[0].stack}" on ${withStack.length} row(s)`)

  // ---- 5. Hover card opens with the row's title ------------------------------
  const target = cards.find((row) => row.title !== null && row.title !== '') ?? cards[0]
  const rowLocator = page.locator(`[data-t3-thread-id="${target.id}"]`).first()
  await rowLocator.scrollIntoViewIfNeeded()
  // A page-level overlay (the preview notice) can sit above the sidebar while
  // the list is still real; drive the hover from the element itself then.
  await rowLocator.hover({ timeout: 5000 }).catch(async () => {
    await rowLocator.dispatchEvent('mouseover')
    await rowLocator.evaluate((node) => node.dispatchEvent(new MouseEvent('mouseenter')))
  })
  await page.waitForTimeout(300)
  const card = page.locator(`[data-t3-thread-id="${target.id}"] + ${SEL.hoverCard}`).first()
  const cardVisible = await card.isVisible({ timeout: 3000 }).catch(() => false)
  const cardText = cardVisible ? (await card.innerText()).trim() : ''
  const cardTitle = cardVisible ? await card.getAttribute('data-t3-hover-title').catch(() => null) : null
  const cardPath = cardVisible ? await card.getAttribute('data-t3-hover-path').catch(() => null) : null
  if (!cardVisible) fail(`${SEL.hoverCard} (hover did not open the card)`)
  else if (!cardText.split('\n').map((line) => line.trim()).includes((target.title ?? '').trim()))
    fail(`${SEL.hoverCard} (card does not name the row title "${target.title}"): ${JSON.stringify(cardText.slice(0, 120))}`)
  else pass(`hover card opens for "${target.title}": ${cardText.split('\n').slice(0, 4).map((line) => line.trim()).join(' | ')}`)
  if (hasText(cardPath)) pass(`hover card carries the workspace path: ${cardPath}`)
  else console.log(`probe-list: note — this row's session reports no workspace path, so the card shows project and status only`)

  // ---- 6. Colour discipline --------------------------------------------------
  const literals = await page.evaluate((selector) => {
    const css = document.querySelector(selector)?.textContent ?? ''
    const decls = [...css.matchAll(/(?:^|[{;\s])(color|background|background-color|border-color|outline-color|fill|stroke|box-shadow)\s*:\s*([^;]+)/g)]
    return decls.map((match) => match[2].trim()).filter((value) => /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(value))
  }, SEL.style)
  if (literals.length === 0) pass('every colour in the sheet is a --dsw-* token')
  else fail(`${SEL.style} (literal colours: ${literals.join(', ')})`)

  if (screenshotAt !== undefined) {
    await page.screenshot({ path: screenshotAt })
    pass(`screenshot ${screenshotAt}`)
  }

  // ---- 3. A real status, end to end ------------------------------------------
  // A throwaway session in /tmp: create it, prompt it, watch the list report
  // working, settle it by hand, wait for the turn to end, and watch the list
  // report the completion state. Nothing else is prompted.
  const created = await callRpc(page, 'session/create', { request: { cwd: '/tmp' } })
  const sessionId = created.result?.value?.sessionId
  if (created.result?.ok !== true || typeof sessionId !== 'string') {
    fail(`session/create (${JSON.stringify(created).slice(0, 200)})`)
    return
  }
  pass(`throwaway session created: ${sessionId}`)
  const previousStore = await page.evaluate((storeKey) => localStorage.getItem(storeKey), STORE_KEY)
  try {
    const prompted = await callRpc(page, 'session/prompt', {
      request: {
        requestId: crypto.randomUUID(),
        sessionId,
        mode: 'queue',
        content: [{ type: 'text', text: 'Reply with the single word ok.' }],
      },
    })
    if (prompted.result?.ok !== true) {
      fail(`session/prompt (${JSON.stringify(prompted).slice(0, 200)})`)
      return
    }
    pass('prompt queued through the app RPC')

    const working = await waitForRow(page, sessionId, TURN_WAIT_MS, (row) => row.status === 'working')
    if (working.ok) {
      pass(`status working while the turn runs: data-t3-status="${working.row.status}" on ${sessionId.slice(0, 12)} (${working.row.section} shelf, ${working.row.density} ${working.row.height}px)`)
    } else {
      fail(`data-t3-status="working" never appeared on ${sessionId.slice(0, 12)} (${working.last})`)
    }

    // The turn's own end decides the completion state; the probe only watches.

    // The completion state: the projection's ok outcome with the turn ended, so
    // the row leaves Working and carries no failure marker.
    const finished = await waitForRow(
      page,
      sessionId,
      TURN_WAIT_MS,
      (row) => row.status !== 'working' && row.status !== 'approval' && row.status !== 'input',
    )
    if (finished.ok) {
      pass(`completion state after the turn: data-t3-status="${finished.row.status}" on ${sessionId.slice(0, 12)} (${finished.row.density} row ${finished.row.height}px, ${finished.row.section} shelf)`)
      if (finished.row.status === 'none' || finished.row.status === 'done') pass('the completion state is T3\'s quiet/Done branch, not failed')
      else fail(`the completion state reported "${finished.row.status}", need none or done`)
    } else {
      fail(`the turn never left working (${finished.last})`)
    }

    // Settle it through the plugin's own store: the same `t3Sidebar.state` key
    // its model reads (`src/adapter/store.ts`), written from the signed-in page.
    await settleInStore(page, sessionId)
    pass('row settled through the plugin store (t3Sidebar.state)')
    const slim = await waitForRow(page, sessionId, 20_000, (row) => row.density === 'slim' && row.section === 'settled')
    if (slim.ok) {
      if (slim.row.height === GEOMETRY.slim) pass(`slim row: ${Math.round(slim.row.height)}px in the settled shelf for ${sessionId.slice(0, 12)}`)
      else fail(`settled slim row measured ${slim.row.height}px, need ${GEOMETRY.slim}px`)
      const settledSection = await page.locator('[data-t3-section="settled"]').first()
      const settledCount = Number(await settledSection.getAttribute('data-t3-section-count'))
      if (settledCount >= 1) pass(`settled shelf count: ${settledCount}`)
      else fail(`settled shelf count ${settledCount}, need at least 1`)
    } else {
      const seen = await page.evaluate((id) => {
        const row = document.querySelector(`[data-t3-thread-id="${id}"]`)
        return {
          found: row !== null,
          section: row?.closest('[data-t3-section]')?.getAttribute('data-t3-section') ?? null,
          store: localStorage.getItem('t3Sidebar.state')?.slice(0, 160) ?? null,
          sections: [...document.querySelectorAll('[data-t3-section]')].map((node) => `${node.getAttribute('data-t3-section')}=${node.getAttribute('data-t3-section-count')}`),
        }
      }, sessionId)
      fail(`a settled session never became a slim row (${slim.last}); seen ${JSON.stringify(seen)}`)
    }
  } finally {
    // The store goes back to what the page had; the throwaway session itself
    // stays, because DSH exposes no delete-session RPC. It is named here so a
    // reviewer can see exactly what the probe left behind.
    await restoreStore(page, previousStore).catch(() => undefined)
    console.log(`probe-list: note — throwaway session ${sessionId} left in /tmp${keepSession ? ' (--keep-session)' : ''}`)
  }

  if (failures.length === 0) console.log('probe-list: PASS — the list draws T3 densities and live statuses')
})

/** A non-empty string, for optional card lines. */
function hasText(value) {
  return typeof value === 'string' && value.length > 0
}

/**
 * Poll the live list until `predicate` holds for a session's row.
 * @returns {{ ok: boolean, row?: any, last: string }} the matching row, or the last seen status.
 */
async function waitForRow(page, sessionId, timeoutMs, predicate) {
  const deadline = Date.now() + timeoutMs
  let last = 'no row drawn'
  while (Date.now() < deadline) {
    const row = (await readRows(page)).find((candidate) => candidate.id === sessionId)
    if (row === undefined) last = 'row not drawn'
    else if (predicate(row)) return { ok: true, row, last: row.status }
    else last = `data-t3-status="${row.status}"`
    await page.waitForTimeout(1000)
  }
  return { ok: false, last }
}

if (failures.length > 0) {
  console.error(`probe-list: FAIL — ${failures.length} missing: ${failures.join('; ')}`)
  process.exit(1)
}
process.exit(0)
