/**
 * Meta resolver: the git branch and pull request for a session's working directory.
 *
 * Harness has no source for either, so the host half asks `git` and `gh` from the
 * session's `cwd`. Both are read-only (`git branch --show-current`, `gh pr list`),
 * results are cached per directory with a TTL and an LRU bound, and every failure
 * degrades to a `null` field plus at most one explanatory note.
 *
 * @module deepseek-harness-t3-sidebar/meta
 */
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'

/** Default time a resolved directory is trusted before the next probe. */
export const DEFAULT_TTL_MS = 30_000
/** Default number of directories kept; the least recently used one is evicted first. */
export const DEFAULT_MAX_ENTRIES = 64
/** `gh` exits with this code when it has no credentials. */
const GH_AUTH_EXIT = 4
const PROBE_TIMEOUT_MS = 10_000
const PR_LIMIT = 10
const PR_STATES = new Set(['open', 'closed', 'merged'])

/**
 * @typedef {{ number: number, title: string, url: string, state: 'open' | 'closed' | 'merged', draft: boolean }} PullRequest
 * @typedef {{ branch: string | null, pullRequest: PullRequest | null }} Meta
 * @typedef {{ meta: Meta, notes: string[], cached: boolean }} Resolution
 * @typedef {(file: string, args: string[], options: { cwd: string }) => Promise<{ stdout: string, stderr?: string }>} Exec
 */

/**
 * Run a binary without a shell. `GIT_OPTIONAL_LOCKS=0` keeps git from taking the
 * index lock, and `GH_PROMPT_DISABLED` keeps gh from waiting on a terminal.
 * @type {Exec}
 */
export function defaultExec(file, args, { cwd }) {
  return new Promise((resolve, reject) => {
    // A missing cwd makes spawn report ENOENT for the binary, which would read as "git is not installed".
    if (!existsSync(cwd)) return reject(Object.assign(new Error(`working directory ${cwd} does not exist`), { code: 'ENOCWD' }))
    execFile(
      file,
      args,
      {
        cwd,
        encoding: 'utf8',
        timeout: PROBE_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1' },
      },
      (error, stdout, stderr) => (error === null ? resolve({ stdout, stderr }) : reject(Object.assign(error, { stderr }))),
    )
  })
}

const firstLine = (text) => String(text ?? '').split('\n', 1)[0].trim()

const isNotInstalled = (error) => error?.code === 'ENOENT'
const isNotRepository = (error) => /not a git repository/i.test(String(error?.stderr ?? ''))
const isUnauthenticated = (error) => error?.code === GH_AUTH_EXIT || /gh auth login|not logged in/i.test(String(error?.stderr ?? ''))
const reasonOf = (error) => (error?.killed === true ? 'timed out' : firstLine(error?.stderr) || firstLine(error?.message) || 'unknown error')

/** The current branch, or `null` for a non-repository, a detached HEAD, or a failing git. */
async function probeBranch(exec, cwd, notes) {
  try {
    const { stdout } = await exec('git', ['branch', '--show-current'], { cwd })
    return stdout.trim() === '' ? null : stdout.trim()
  } catch (error) {
    if (isNotInstalled(error)) notes.push('git is not installed; branch is unavailable')
    else if (!isNotRepository(error)) notes.push(`git branch failed: ${reasonOf(error)}`)
    return null
  }
}

/** Validate one `gh pr list` row into the wire shape; `null` when any field is off. */
function toPullRequest(row) {
  if (row === null || typeof row !== 'object') return null
  const { number, title, url, state, isDraft } = row
  if (!Number.isInteger(number) || typeof title !== 'string' || typeof url !== 'string' || typeof state !== 'string') return null
  const lowered = state.toLowerCase()
  return PR_STATES.has(lowered) ? { number, title, url, state: lowered, draft: isDraft === true } : null
}

/**
 * `gh pr list --head` matches the branch name alone, so a fork's pull request
 * from its own `main` would match a checkout on `main`; keep same-repo heads.
 * Prefer an open pull request; otherwise the newest, which is `gh`'s first row.
 */
function choosePullRequest(rows) {
  const pulls = rows.filter((row) => row?.isCrossRepository !== true).map(toPullRequest)
  if (pulls.includes(null)) throw new Error('unexpected shape')
  return pulls.find((pull) => pull.state === 'open') ?? pulls[0] ?? null
}

/** The branch's pull request, or `null` with a note saying why `gh` could not answer. */
async function probePullRequest(exec, cwd, branch, notes) {
  try {
    const args = ['pr', 'list', `--head=${branch}`, '--state', 'all', '--limit', String(PR_LIMIT), '--json', 'number,title,url,state,isDraft,isCrossRepository']
    const { stdout } = await exec('gh', args, { cwd })
    const rows = JSON.parse(stdout)
    if (!Array.isArray(rows)) throw new Error('unexpected shape')
    return choosePullRequest(rows)
  } catch (error) {
    if (isNotInstalled(error)) notes.push('gh is not installed; pull request is unavailable')
    else if (isUnauthenticated(error)) notes.push('gh is not authenticated; run `gh auth login` for pull request badges')
    else if (error instanceof SyntaxError || error?.message === 'unexpected shape') notes.push('gh pr list returned output this plugin cannot read')
    else notes.push(`gh pr list failed: ${reasonOf(error)}`)
    return null
  }
}

/** Probe one directory. Never throws: every failure becomes a `null` field and a note. */
async function probe(exec, cwd) {
  const notes = []
  const branch = await probeBranch(exec, cwd, notes)
  const pullRequest = branch === null ? null : await probePullRequest(exec, cwd, branch, notes)
  return { meta: { branch, pullRequest }, notes }
}

/**
 * @param {{ exec?: Exec, ttlMs?: number, maxEntries?: number, now?: () => number }} [options]
 * @returns {{ resolve(cwd: string): Promise<Resolution>, readonly size: number }}
 */
export function createMetaResolver({ exec = defaultExec, ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES, now = Date.now } = {}) {
  /** cwd -> { settledAt, promise }; Map order is recency, oldest first. `settledAt` is `null` while the probe is in flight. */
  const entries = new Map()

  function remember(cwd, entry) {
    entries.delete(cwd)
    entries.set(cwd, entry)
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value)
  }

  return {
    get size() {
      return entries.size
    },
    async resolve(cwd) {
      const hit = entries.get(cwd)
      if (hit !== undefined && (hit.settledAt === null || now() - hit.settledAt < ttlMs)) {
        remember(cwd, hit)
        const cached = hit.settledAt !== null
        const { meta, notes } = await hit.promise
        return { meta, notes, cached }
      }
      const entry = { settledAt: null, promise: probe(exec, cwd) }
      remember(cwd, entry)
      const result = await entry.promise
      entry.settledAt = now()
      return { ...result, cached: false }
    },
  }
}

/** What a session reads before its first probe lands, and when it has no cwd. */
const NO_META = Object.freeze({ branch: null, pullRequest: null })
export const DEFAULT_MAX_SESSIONS = 256

/**
 * Per-session store the projection reads. A revision is `<epoch>:<count>` from
 * one counter, so a state folded before a `forget` never matches a later entry,
 * and a checkpoint written by a previous process never matches this one's.
 * @param {{ resolver: ReturnType<typeof createMetaResolver>, maxSessions?: number, epoch?: string }} options
 */
export function createSessionMeta({ resolver, maxSessions = DEFAULT_MAX_SESSIONS, epoch = randomUUID() }) {
  /** sessionId -> { meta, revision }; Map order is insertion, oldest first. */
  const sessions = new Map()
  let counter = 0

  return {
    get: (sessionId) => sessions.get(sessionId)?.meta ?? NO_META,
    revision: (sessionId) => sessions.get(sessionId)?.revision ?? 0,
    forget: (sessionId) => void sessions.delete(sessionId),
    /**
     * Probe the session's directory and keep the answer. Resolves to `null`
     * without probing when the session has no cwd.
     */
    async track(sessionId, cwd) {
      if (typeof cwd !== 'string' || cwd === '') return null
      const resolution = await resolver.resolve(cwd)
      const known = sessions.get(sessionId)
      if (known === undefined || JSON.stringify(known.meta) !== JSON.stringify(resolution.meta)) {
        sessions.delete(sessionId)
        sessions.set(sessionId, { meta: resolution.meta, revision: `${epoch}:${++counter}` })
        while (sessions.size > maxSessions) sessions.delete(sessions.keys().next().value)
      }
      return resolution
    },
  }
}
