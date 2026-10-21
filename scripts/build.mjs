/**
 * Build both halves into `lib/`.
 *
 * The host half is plain ESM for Node. The client half is one classic script
 * that registers a factory in the shape `dsh-client-modules` expects:
 * `window.__ModuleLoader__.load({ id, factory })`, where `id` is this package's
 * name (the browser module key) and `factory(require)` returns the module
 * exports. Only the module boundaries are hand-written, so the published code
 * stays readable; `lib/` is gitignored and rebuilt from `src/`.
 * @module deepseek-harness-t3-sidebar/scripts/build
 */
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { name } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const shared = { bundle: true, platform: 'neutral', target: 'es2023', logLevel: 'info', absWorkingDir: root }

/** Write one bundle's text, creating `lib/` on first use. */
function emit(relative, text) {
  mkdirSync(dirname(join(root, relative)), { recursive: true })
  writeFileSync(join(root, relative), text)
}

// The host half shells out to git and gh, so it targets node; the client bundle stays platform-neutral.
await build({ ...shared, platform: 'node', entryPoints: ['src/index.js'], format: 'esm', outfile: join(root, 'lib/index.js') })

const client = await build({
  ...shared,
  entryPoints: ['src/client.js'],
  format: 'iife',
  globalName: '__t3SidebarModule',
  write: false,
})
const global = '__t3SidebarModule'
emit(
  'lib/client.js',
  `window.__ModuleLoader__.load({
	id: ${JSON.stringify(name)},
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
${client.outputFiles[0].text.replace(/^/gm, '\t\t')}
		exports.apply = ${global}.apply;
		exports.inject = ${global}.inject;
		return module.exports;
	}
});
`,
)
