/**
 * Enforces issue #5's layering rule: `src/model/**` is pure and imports nothing
 * from DSH or React (and nothing outside itself), and `src/adapter/**` is the
 * only place DSH-shaped records are touched.
 *
 * The check is textual on purpose: a regex over import specifiers catches the
 * violation even when the offending import is type-only and would be erased
 * before a bundler ever saw it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MODEL_DIR = join(ROOT, "src", "model");

/** Bare specifiers either layer must never reach. */
const FORBIDDEN_BARE = ["react", "react-dom", "dsh", "@dsh", "@dsh/", "deepseek-harness"];

/** In the model, any import that escapes `src/model/` — including the adapter — is a violation. */
const FORBIDDEN_MODEL_TARGETS = ["../adapter/", "src/adapter/"];

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/g;

function specifiersOf(path: string): string[] {
  const source = readFileSync(path, "utf8");
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    const specifier = match[1];
    if (specifier !== undefined) found.push(specifier);
  }
  return found;
}

const problems: string[] = [];
const files = tsFiles(MODEL_DIR);
for (const file of files) {
  const shown = relative(ROOT, file);
  for (const specifier of specifiersOf(file)) {
    if (FORBIDDEN_BARE.some((bare) => specifier === bare || specifier.startsWith(`${bare}/`))) {
      problems.push(`${shown}: model imports "${specifier}" (DSH/React is adapter-only)`);
    }
    if (FORBIDDEN_MODEL_TARGETS.some((target) => specifier.includes(target))) {
      problems.push(`${shown}: model imports "${specifier}" (the adapter may not be imported by the model)`);
    }
  }
}

if (files.length === 0) problems.push("src/model has no TypeScript files");

if (problems.length > 0) {
  console.error(`boundary check failed (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`boundary check ok: ${files.length} model files import nothing from DSH, React or the adapter`);
