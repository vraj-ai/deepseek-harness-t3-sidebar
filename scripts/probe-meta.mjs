#!/usr/bin/env node
/**
 * Prove the host half resolves a real session's git branch and pull request.
 *
 * Finds the session's `cwd` in its on-disk log header, then runs the same
 * resolver the plugin runs: once cold, once inside the TTL. Prints
 * `{ branch, pullRequest }` as JSON on stdout, then whether the second call was a
 * cache hit and how many `git`/`gh` processes each call started.
 *
 * Read-only: `git branch --show-current` and `gh pr list`. Starts no server and
 * writes nothing. A missing `gh` or a missing login is a `null` pull request, one
 * line on stderr, exit 0. Exit 1 means the session could not be found or the TTL
 * cache did not answer the second call.
 *
 * Usage: node scripts/probe-meta.mjs <sessionId>   (DSH_HOME overrides ~/.dsh)
 * @module deepseek-harness-t3-sidebar/scripts/probe-meta
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

import { createMetaResolver, defaultExec } from '../src/meta.js'

/** Fail with one actionable line; never a stack dump the reader has to decode. */
function fail(message) {
  console.error(`probe-meta: ${message}`)
  process.exit(1)
}

const requested = process.argv[2]
if (requested === undefined || requested.startsWith('-')) fail('usage: node scripts/probe-meta.mjs <sessionId>')
const sessionId = requested.startsWith('session-') ? requested : `session-${requested}`
const sessionsRoot = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'sessions')

/** The `cwd` recorded in the session log's header line. */
function readCwd() {
  if (!existsSync(sessionsRoot)) fail(`no sessions directory at ${sessionsRoot}; set DSH_HOME to the Harness home`)
  for (const project of readdirSync(sessionsRoot)) {
    const log = join(sessionsRoot, project, sessionId, 'session.v4.jsonl.zstd')
    if (!existsSync(log)) continue
    const header = JSON.parse(zstdDecompressSync(readFileSync(log)).toString('utf8').split('\n', 1)[0])
    if (typeof header.cwd !== 'string') fail(`${sessionId} has no cwd in its header`)
    return header.cwd
  }
  return fail(`no session ${sessionId} under ${sessionsRoot}`)
}

const cwd = readCwd()
let started = 0
const counting = (file, args, options) => {
  started += 1
  return defaultExec(file, args, options)
}
const resolver = createMetaResolver({ exec: counting })

const first = await resolver.resolve(cwd)
const firstStarted = started
console.log(JSON.stringify(first.meta, null, 2))
for (const note of first.notes) console.error(`probe-meta: ${note}`)

const second = await resolver.resolve(cwd)
console.log(`probe-meta: ${cwd} — first call ran ${firstStarted} process(es); second call ${second.cached ? 'cache hit' : 'MISSED the cache'}, ran ${started - firstStarted}`)
if (!second.cached || started !== firstStarted) fail('the second call inside the TTL started a process')
