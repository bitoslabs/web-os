#!/usr/bin/env node
/* Build a .bitos-app package from a folder containing app.json and its listed
 * files. Dependency-free. Usage:
 *   node scripts/pack.mjs <src-dir> [-o out.bitos-app]
 * The folder's app.json drives the metadata and the file list; the tool
 * computes every digest, then validates the result before writing. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  PACKAGE_FORMAT, PACKAGE_VERSION, canonicalJson, sha256Hex, utf8Bytes, pathError,
} from '../src/core/package.js';

const args = process.argv.slice(2);
const outIdx = args.indexOf('-o');
const outFlag = outIdx >= 0 ? args[outIdx + 1] : null;
const dirArg = args.find(a => !a.startsWith('-') && a !== outFlag);
if (!dirArg) {
  console.error('usage: node scripts/pack.mjs <src-dir> [-o out.bitos-app]');
  process.exit(2);
}
const dir = resolve(dirArg);

const TEXT_EXT = /\.(html?|css|js|mjs|json|svg|txt|md|xml|webmanifest|csv)$/i;

let meta;
try { meta = JSON.parse(readFileSync(join(dir, 'app.json'), 'utf8')); }
catch (e) { console.error('cannot read app.json in ' + dir + ': ' + e.message); process.exit(1); }
if (!meta.files || typeof meta.files !== 'object') { console.error('app.json needs a files map'); process.exit(1); }

const manifest = {
  schema: 1,
  id: meta.id,
  version: meta.version,
  name: meta.name,
  entry: meta.entry || 'index.html',
  minBitosApi: meta.minBitosApi == null ? 1 : meta.minBitosApi,
  permissions: meta.permissions || [],
  files: {},
};
if (meta.description) manifest.description = meta.description;
if (meta.icon) manifest.icon = meta.icon;

const files = {};
let failed = false;
for (const path of Object.keys(meta.files).sort()) {
  const pe = pathError(path);
  if (pe) { console.error(pe + ' ' + path); failed = true; continue; }
  let bytes;
  try { bytes = readFileSync(join(dir, path)); }
  catch (e) { console.error('E_FILE_MISSING cannot read ' + path); failed = true; continue; }
  const encoding = TEXT_EXT.test(path) ? 'utf8' : 'base64';
  manifest.files[path] = 'sha256-' + await sha256Hex(bytes);
  files[path] = { encoding, data: encoding === 'utf8' ? bytes.toString('utf8') : bytes.toString('base64') };
}
if (failed) process.exit(1);

const pkg = { format: PACKAGE_FORMAT, version: PACKAGE_VERSION, manifest, files };
const { validatePackage } = await import('../src/core/package.js');
const result = await validatePackage(pkg);
if (!result.ok) {
  console.error('package failed validation:');
  result.errors.forEach(e => console.error('  ' + e.code + (e.path ? ' [' + e.path + ']' : '') + ' ' + e.message));
  process.exit(1);
}

const out = outFlag || (meta.id + '-' + meta.version + '.bitos-app');
writeFileSync(out, canonicalJson(pkg));
console.log('packed ' + out);
console.log('  files    ' + Object.keys(files).length);
console.log('  digest   ' + result.digest);
console.log('  bytes    ' + canonicalJson(pkg).length);
