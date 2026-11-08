/**
 * The manifest's DSH range is the plugin's compatibility contract.
 *
 * DSH evaluates `engines.dsh` with semver and `includePrerelease: true`
 * (`@deepseek-ai/dsh-app-boot`, `plugin-compatibility`), so one caret range can
 * admit a later release candidate while still excluding the next minor. The
 * 0.2.2-rc.1 refusal was an exact pin, not a code incompatibility; these tests
 * keep that mistake visible.
 * @module deepseek-harness-t3-sidebar/tests/compat
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import semver from 'semver'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const range = manifest.engines?.dsh
const admits = (version) =>
  typeof range === 'string' && semver.satisfies(version, range, { includePrerelease: true })

test('engines.dsh admits the runtimes this release supports', () => {
  assert.ok(admits('0.2.1-rc.5'), `${range} must admit 0.2.1-rc.5`)
  assert.ok(admits('0.2.2-rc.1'), `${range} must admit 0.2.2-rc.1`)
})

test('engines.dsh still gates the next minor and older pre-releases', () => {
  assert.equal(admits('0.2.1-alpha.5'), false, `${range} must not admit 0.2.1-alpha.5`)
  assert.equal(admits('0.3.0'), false, `${range} must not admit 0.3.0`)
})
