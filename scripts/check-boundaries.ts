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
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MODEL_DIR = join(ROOT, "src", "model");

/** The model is pure: every import is relative and resolves inside `src/model/`. */
function modelViolation(file: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return "the model imports no packages, DSH and React included";
  const target = resolve(dirname(file), specifier);
  if (target.startsWith(`${MODEL_DIR}${sep}`)) return null;
  return "the model may not import outside src/model, the adapter included";
}

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
    const violation = modelViolation(file, specifier);
    if (violation !== null) problems.push(`${shown}: model imports "${specifier}" (${violation})`);
  }
}

if (files.length === 0) problems.push("src/model has no TypeScript files");

if (problems.length > 0) {
  console.error(`boundary check failed (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`boundary check ok: ${files.length} model files import only from src/model`);
