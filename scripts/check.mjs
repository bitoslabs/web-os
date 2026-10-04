#!/usr/bin/env node
/* Dependency-free structural check for os-web.
 * - parses every .js file as an ES module (node --check)
 * - verifies every relative import specifier resolves to a real file
 * Mirrors the intent of the upstream `make ui-check`, without a build step.
 * Usage: node scripts/check.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) { if (name === 'node_modules' || name === '.git') continue; walk(p); }
    else if (name.endsWith('.js')) files.push(p);
  }
})(root);

let syntaxErrors = 0;
const tmp = mkdtempSync(join(tmpdir(), 'bitos-esm-'));
for (const f of files) {
  const tmpFile = join(tmp, relative(root, f).replace(/[\\/]/g, '_') + '.mjs');
  writeFileSync(tmpFile, readFileSync(f, 'utf8'));
  try { execFileSync(process.execPath, ['--check', tmpFile], { stdio: 'pipe' }); }
  catch (e) { syntaxErrors++; console.error('SYNTAX FAIL', relative(root, f)); console.error(String(e.stderr)); }
}

let missing = 0;
const importRe = /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
for (const f of files) {
  const code = readFileSync(f, 'utf8'); let m;
  while ((m = importRe.exec(code))) {
    const spec = m[1] || m[2];
    if (!spec || !spec.startsWith('.')) continue;
    if (!existsSync(resolve(dirname(f), spec))) { missing++; console.error('MISSING IMPORT', relative(root, f), '->', spec); }
  }
}

console.log(`checked ${files.length} modules · ${syntaxErrors} syntax errors · ${missing} unresolved imports`);
process.exit(syntaxErrors || missing ? 1 : 0);
