/**
 * Meta resolver tests: git/gh argv, degradation, TTL cache, bounds, dedupe.
 * Tests drive a scripted `exec`; only the cwd-handling tests at the end run real `git` in a temp directory.
 * @module deepseek-harness-t3-sidebar/tests/meta
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createMetaResolver, createSessionMeta } from '../src/meta.js'

/** A scripted exec: `script(file, args)` returns stdout or throws the error to reject with. */
function scripted(script) {
  const calls = []
  const exec = async (file, args, options) => {
    calls.push({ file, args, options })
    return { stdout: script(file, args), stderr: '' }
  }
  return { exec, calls }
}

const failure = (code, stderr = '') => Object.assign(new Error(`exit ${code}`), { code, stderr })

const pr = (number, state, extra = {}) => ({ number, title: `pr ${number}`, url: `https://example.test/pull/${number}`, state, isDraft: false, ...extra })

const onBranch = (branch, prs = []) =>
  scripted((file) => {
    if (file === 'git') return `${branch}\n`
    return JSON.stringify(prs)
  })

test('resolves the branch and the pull request for a git checkout', async () => {
  const { exec, calls } = onBranch('feature/x', [pr(7, 'OPEN', { isDraft: true })])
  const result = await createMetaResolver({ exec }).resolve('/work/repo')
  assert.deepEqual(result.meta, {
    branch: 'feature/x',
    pullRequest: { number: 7, title: 'pr 7', url: 'https://example.test/pull/7', state: 'open', draft: true },
  })
  assert.deepEqual(result.notes, [])
  assert.equal(result.cached, false)
  assert.deepEqual(
    calls.map((call) => [call.file, call.args]),
    [
      ['git', ['branch', '--show-current']],
      ['gh', ['pr', 'list', '--head=feature/x', '--state', 'all', '--limit', '10', '--json', 'number,title,url,state,isDraft,isCrossRepository']],
    ],
  )
  assert.ok(calls.every((call) => call.options.cwd === '/work/repo'))
})

test('a fork pull request whose head branch shares the name is not this checkout\'s', async () => {
  const { exec } = onBranch('main', [pr(9, 'OPEN', { isCrossRepository: true }), pr(3, 'MERGED', { isCrossRepository: false })])
  assert.equal((await createMetaResolver({ exec }).resolve('/w')).meta.pullRequest.number, 3)
  const onlyFork = onBranch('main', [pr(9, 'OPEN', { isCrossRepository: true })])
  assert.equal((await createMetaResolver({ exec: onlyFork.exec }).resolve('/w')).meta.pullRequest, null)
})

test('a state outside open, closed and merged is unreadable output, not a wire value', async () => {
  const { exec } = onBranch('feature/x', [pr(7, 'REOPENED')])
  const result = await createMetaResolver({ exec }).resolve('/w')
  assert.equal(result.meta.pullRequest, null)
  assert.match(result.notes[0], /cannot read/)
})

test('a branch name that looks like a flag stays one argument value', async () => {
  const { exec, calls } = onBranch('-x', [])
  await createMetaResolver({ exec }).resolve('/w')
  assert.deepEqual(calls[1].args.slice(0, 3), ['pr', 'list', '--head=-x'])
})

test('prefers an open pull request over a newer merged or closed one', async () => {
  const { exec } = onBranch('feature/x', [pr(9, 'MERGED'), pr(8, 'CLOSED'), pr(7, 'OPEN')])
  assert.equal((await createMetaResolver({ exec }).resolve('/w')).meta.pullRequest.number, 7)
})

test('falls back to the most recent pull request when none is open', async () => {
  const { exec } = onBranch('feature/x', [pr(9, 'MERGED'), pr(8, 'CLOSED')])
  const { pullRequest } = (await createMetaResolver({ exec }).resolve('/w')).meta
  assert.deepEqual([pullRequest.number, pullRequest.state], [9, 'merged'])
})

test('a branch with no pull request is null without a note', async () => {
  const { exec } = onBranch('feature/x', [])
  const result = await createMetaResolver({ exec }).resolve('/w')
  assert.deepEqual([result.meta.branch, result.meta.pullRequest, result.notes], ['feature/x', null, []])
})

test('a non-git directory is a null branch, never asks gh, and says nothing', async () => {
  const { exec, calls } = scripted(() => {
    throw failure(128, 'fatal: not a git repository (or any of the parent directories): .git')
  })
  const result = await createMetaResolver({ exec }).resolve('/tmp')
  assert.deepEqual(result.meta, { branch: null, pullRequest: null })
  assert.deepEqual(result.notes, [])
  assert.deepEqual(calls.map((call) => call.file), ['git'])
})

test('a detached HEAD has no branch and never asks gh', async () => {
  const { exec, calls } = scripted(() => '\n')
  assert.deepEqual((await createMetaResolver({ exec }).resolve('/w')).meta, { branch: null, pullRequest: null })
  assert.deepEqual(calls.map((call) => call.file), ['git'])
})

test('a missing git is a null branch with one explanatory note', async () => {
  const { exec } = scripted(() => {
    throw failure('ENOENT')
  })
  const result = await createMetaResolver({ exec }).resolve('/w')
  assert.deepEqual(result.meta, { branch: null, pullRequest: null })
  assert.equal(result.notes.length, 1)
  assert.match(result.notes[0], /git is not installed/)
})

test('a missing gh keeps the branch, nulls the pull request, and says why once', async () => {
  const { exec } = scripted((file) => {
    if (file === 'git') return 'main\n'
    throw failure('ENOENT')
  })
  const result = await createMetaResolver({ exec }).resolve('/w')
  assert.deepEqual(result.meta, { branch: 'main', pullRequest: null })
  assert.equal(result.notes.length, 1)
  assert.match(result.notes[0], /gh is not installed/)
})

test('an unauthenticated gh keeps the branch, nulls the pull request, and says why once', async () => {
  const { exec } = scripted((file) => {
    if (file === 'git') return 'main\n'
    throw failure(4, 'To get started with GitHub CLI, please run:  gh auth login')
  })
  const result = await createMetaResolver({ exec }).resolve('/w')
  assert.deepEqual(result.meta, { branch: 'main', pullRequest: null })
  assert.equal(result.notes.length, 1)
  assert.match(result.notes[0], /gh is not authenticated/)
})

test('any other gh failure is a null pull request with the first stderr line', async () => {
  const { exec } = scripted((file) => {
    if (file === 'git') return 'main\n'
    throw failure(1, 'none of the git remotes configured for this repository point to a known GitHub host\nsecond line')
  })
  const result = await createMetaResolver({ exec }).resolve('/w')
  assert.equal(result.meta.pullRequest, null)
  assert.equal(result.notes.length, 1)
  assert.match(result.notes[0], /gh pr list failed: none of the git remotes/)
  assert.doesNotMatch(result.notes[0], /second line/)
})

test('malformed gh output is a null pull request, not a throw', async () => {
  for (const stdout of ['not json', '{"number":1}', '[{"number":"x"}]', '[null]']) {
    const { exec } = scripted((file) => (file === 'git' ? 'main\n' : stdout))
    const result = await createMetaResolver({ exec }).resolve('/w')
    assert.equal(result.meta.pullRequest, null, stdout)
    assert.equal(result.notes.length, 1, stdout)
  }
})

test('a second resolve inside the TTL shells out to neither git nor gh', async () => {
  const { exec, calls } = onBranch('main', [pr(1, 'OPEN')])
  let clock = 1000
  const resolver = createMetaResolver({ exec, ttlMs: 500, now: () => clock })
  const first = await resolver.resolve('/w')
  clock += 499
  const second = await resolver.resolve('/w')
  assert.equal(calls.length, 2)
  assert.deepEqual([first.cached, second.cached], [false, true])
  assert.deepEqual(second.meta, first.meta)
})

test('a cache hit repeats the notes that explained the miss', async () => {
  const { exec } = scripted((file) => {
    if (file === 'git') return 'main\n'
    throw failure('ENOENT')
  })
  const resolver = createMetaResolver({ exec })
  const first = await resolver.resolve('/w')
  assert.deepEqual((await resolver.resolve('/w')).notes, first.notes)
})

test('a resolve after the TTL probes again', async () => {
  const { exec, calls } = onBranch('main', [])
  let clock = 0
  const resolver = createMetaResolver({ exec, ttlMs: 500, now: () => clock })
  await resolver.resolve('/w')
  clock = 500
  assert.equal((await resolver.resolve('/w')).cached, false)
  assert.equal(calls.length, 4)
})

test('the cache is keyed by directory', async () => {
  const { exec, calls } = onBranch('main', [])
  const resolver = createMetaResolver({ exec })
  await resolver.resolve('/a')
  assert.equal((await resolver.resolve('/b')).cached, false)
  assert.equal(calls.length, 4)
})

test('the cache is bounded and evicts the least recently used directory', async () => {
  const { exec, calls } = onBranch('main', [])
  const resolver = createMetaResolver({ exec, maxEntries: 2 })
  await resolver.resolve('/a')
  await resolver.resolve('/b')
  await resolver.resolve('/a')
  await resolver.resolve('/c')
  assert.equal(resolver.size, 2)
  const before = calls.length
  assert.equal((await resolver.resolve('/a')).cached, true)
  assert.equal((await resolver.resolve('/b')).cached, false)
  assert.equal(calls.length, before + 2)
})

test('concurrent resolves of one directory share one probe', async () => {
  const { exec, calls } = onBranch('main', [])
  const resolver = createMetaResolver({ exec })
  const [a, b] = await Promise.all([resolver.resolve('/w'), resolver.resolve('/w')])
  assert.equal(calls.length, 2)
  assert.deepEqual(a.meta, b.meta)
})

test('a failed probe is cached too, so a broken gh is not retried on every event', async () => {
  const { exec, calls } = scripted((file) => {
    if (file === 'git') return 'main\n'
    throw failure(4, 'gh auth login')
  })
  const resolver = createMetaResolver({ exec })
  await resolver.resolve('/w')
  await resolver.resolve('/w')
  assert.equal(calls.length, 2)
})

test('a cwd that no longer exists is a failed git with a reason, not a missing binary', async () => {
  const result = await createMetaResolver().resolve('/nonexistent/t3-sidebar-meta-test')
  assert.deepEqual(result.meta, { branch: null, pullRequest: null })
  assert.equal(result.notes.length, 1)
  assert.match(result.notes[0], /git branch failed: working directory .* does not exist/)
})

test('the default exec reaches real git read-only and is quiet outside a checkout', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'meta-test-'))
  try {
    const result = await createMetaResolver().resolve(dir)
    assert.deepEqual(result.meta, { branch: null, pullRequest: null })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

const stub = (meta) => ({ resolve: async () => ({ meta, notes: [], cached: false }), size: 0 })
const withPr = { branch: 'main', pullRequest: { number: 1, title: 't', url: 'u', state: 'open', draft: false } }

const track = (options = {}) => createSessionMeta({ resolver: stub(withPr), epoch: 'e', ...options })

test('a session with no tracked meta reads null fields at revision 0', () => {
  const sessionMeta = track()
  assert.deepEqual(sessionMeta.get('s1'), { branch: null, pullRequest: null })
  assert.equal(sessionMeta.revision('s1'), 0)
})

test('tracking stores the resolved meta and bumps the revision once per change', async () => {
  const sessionMeta = track()
  await sessionMeta.track('s1', '/w')
  assert.deepEqual(sessionMeta.get('s1'), withPr)
  assert.equal(sessionMeta.revision('s1'), 'e:1')
  await sessionMeta.track('s1', '/w')
  assert.equal(sessionMeta.revision('s1'), 'e:1')
})

test('a changed branch bumps the revision again', async () => {
  let current = withPr
  const sessionMeta = createSessionMeta({ resolver: { resolve: async () => ({ meta: current, notes: [], cached: false }), size: 0 }, epoch: 'e' })
  await sessionMeta.track('s1', '/w')
  current = { branch: 'other', pullRequest: null }
  await sessionMeta.track('s1', '/w')
  assert.deepEqual([sessionMeta.get('s1').branch, sessionMeta.revision('s1')], ['other', 'e:2'])
})

test('forgetting a session drops its meta and revision', async () => {
  const sessionMeta = track()
  await sessionMeta.track('s1', '/w')
  sessionMeta.forget('s1')
  assert.deepEqual([sessionMeta.get('s1').branch, sessionMeta.revision('s1')], [null, 0])
})

test('a session without a cwd is never probed', async () => {
  let probed = false
  const sessionMeta = createSessionMeta({ resolver: { resolve: async () => ((probed = true), { meta: withPr, notes: [], cached: false }), size: 0 } })
  assert.equal(await sessionMeta.track('s1', undefined), null)
  assert.equal(probed, false)
})

test('tracked sessions are bounded; the oldest is forgotten first', async () => {
  const sessionMeta = createSessionMeta({ resolver: stub(withPr), maxSessions: 2 })
  for (const id of ['a', 'b', 'c']) await sessionMeta.track(id, '/w')
  assert.deepEqual(['a', 'b', 'c'].map((id) => sessionMeta.revision(id) !== 0), [false, true, true])
})

test('a re-tracked session never reuses a revision its old state may still hold', async () => {
  const sessionMeta = createSessionMeta({ resolver: stub(withPr) })
  await sessionMeta.track('s1', '/w')
  const before = sessionMeta.revision('s1')
  sessionMeta.forget('s1')
  await sessionMeta.track('s1', '/w')
  assert.notEqual(sessionMeta.revision('s1'), before)
})

test('a restarted store never reissues a revision a checkpointed state may still hold', async () => {
  const before = track({ epoch: 'boot-1' })
  await before.track('s1', '/w')
  const after = track({ epoch: 'boot-2' })
  await after.track('s1', '/w')
  assert.notEqual(after.revision('s1'), before.revision('s1'))
})

test('two stores without an explicit epoch draw different ones', async () => {
  const [a, b] = [createSessionMeta({ resolver: stub(withPr) }), createSessionMeta({ resolver: stub(withPr) })]
  await Promise.all([a.track('s1', '/w'), b.track('s1', '/w')])
  assert.notEqual(a.revision('s1'), b.revision('s1'))
})
