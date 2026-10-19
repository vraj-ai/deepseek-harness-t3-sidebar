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

const root = join(import.meta.dirname, '..')
const { name } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const shared = { bundle: true, platform: 'neutral', target: 'es2023', logLevel: 'info', absWorkingDir: root }

/**
 * Modules the Harness client module loader seeds. The host prepends `react`
 * itself (it is forced for every client bundle), so `dsh.client.external` in
 * `package.json` carries the rest — keep the two lists equal: composition
 * rejects any external this manifest does not declare, and bundling a copy of
 * a seeded module gives the plugin a second React whose hooks throw.
 */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-slots',
]

/** Write one bundle's text, creating `lib/` on first use. */
function emit(relative, text) {
  mkdirSync(dirname(join(root, relative)), { recursive: true })
  writeFileSync(join(root, relative), text)
}

await build({ ...shared, entryPoints: ['src/index.js'], format: 'esm', outfile: join(root, 'lib/index.js') })

const client = await build({
  ...shared,
  entryPoints: ['src/client.js'],
  external: CLIENT_EXTERNALS,
  format: 'iife',
  globalName: '__t3SidebarModule',
  // The IIFE's body runs inside the factory, whose parameter is the page's own
  // module system; external calls must keep that exact name, so no helper shim
  // and no rename. esbuild's `__require` fallback is silenced by the host bundle
  // being an IIFE: there is no CommonJS caller to fall back to.
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
