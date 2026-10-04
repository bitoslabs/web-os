#!/usr/bin/env node
/* Deterministic package-format fixtures (APP-02). Every case asserts a stable
 * error code, and a valid package must pass in both this runner and the pack
 * tool. Usage: node scripts/test-package.mjs */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validatePackage, canonicalJson, sha256Hex, utf8Bytes, PACKAGE_FORMAT, PACKAGE_VERSION,
} from '../src/core/package.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : (fail++, console.error('FAIL ' + name + (extra ? ' — ' + extra : ''))); };
const codes = r => r.errors.map(e => e.code);
const has = (r, code) => codes(r).includes(code);

const ENC = new TextEncoder();
async function makeValid() {
  const body = { 'index.html': '<h1>hi</h1>', 'app.js': 'console.log(1)' };
  const manifest = { schema: 1, id: 'example-counter', version: '0.1.0', name: 'Example Counter', entry: 'index.html', minBitosApi: 1, permissions: [], files: {} };
  const files = {};
  for (const [p, text] of Object.entries(body)) {
    files[p] = { encoding: 'utf8', data: text };
    manifest.files[p] = 'sha256-' + await sha256Hex(ENC.encode(text));
  }
  return { format: PACKAGE_FORMAT, version: PACKAGE_VERSION, manifest, files };
}

/* ---- valid ---- */
const base = await makeValid();
const valid = await validatePackage(base);
ok('valid passes', valid.ok, JSON.stringify(valid.errors));
ok('digest is 64 hex', valid.ok && /^[0-9a-f]{64}$/.test(valid.digest));
const again = await validatePackage(structuredClone(base));
ok('digest deterministic', again.digest === valid.digest);

const shuffled = { files: base.files, version: base.version, manifest: base.manifest, format: base.format };
ok('canonical json order-independent', canonicalJson(base) === canonicalJson(shuffled));

/* ---- format/version ---- */
ok('E_FORMAT on bad format', has(await validatePackage({ ...base, format: 'zip' }), 'E_FORMAT'));
ok('E_VERSION on bad version', has(await validatePackage({ ...base, version: 2 }), 'E_VERSION'));

/* ---- manifest fields ---- */
const badId = structuredClone(base); badId.manifest.id = 'Bad_ID';
ok('E_ID', has(await validatePackage(badId), 'E_ID'));
const badSem = structuredClone(base); badSem.manifest.version = '1.0';
ok('E_SEMVER', has(await validatePackage(badSem), 'E_SEMVER'));
const badPerm = structuredClone(base); badPerm.manifest.permissions = ['fs.all'];
ok('E_PERMISSION', has(await validatePackage(badPerm), 'E_PERMISSION'));
const badApi = structuredClone(base); badApi.manifest.minBitosApi = 99;
ok('E_API', has(await validatePackage(badApi), 'E_API'));

/* ---- paths and sets ---- */
const traversal = structuredClone(base);
traversal.manifest.files['../evil.js'] = traversal.manifest.files['app.js']; delete traversal.manifest.files['app.js'];
traversal.files['../evil.js'] = traversal.files['app.js']; delete traversal.files['app.js'];
ok('E_PATH traversal', has(await validatePackage(traversal), 'E_PATH'));

const missing = structuredClone(base);
delete missing.files['app.js'];
ok('E_FILE_MISSING', has(await validatePackage(missing), 'E_FILE_MISSING'));

const unlisted = structuredClone(base);
unlisted.files['extra.txt'] = { encoding: 'utf8', data: 'x' };
ok('E_FILE_UNLISTED', has(await validatePackage(unlisted), 'E_FILE_UNLISTED'));

const tampered = structuredClone(base);
tampered.files['app.js'].data = 'console.log(2)';
ok('E_FILE_HASH', has(await validatePackage(tampered), 'E_FILE_HASH'));

const badEnc = structuredClone(base);
badEnc.files['app.js'].encoding = 'hex';
ok('E_ENCODING', has(await validatePackage(badEnc), 'E_ENCODING'));

const dup = structuredClone(base);
dup.manifest.files['APP.JS'] = dup.manifest.files['app.js'];
dup.files['APP.JS'] = { encoding: 'utf8', data: dup.files['app.js'].data };
ok('E_DUPLICATE case collision', has(await validatePackage(dup), 'E_DUPLICATE'));

const payload = structuredClone(base);
payload.manifest.files['evil.wasm'] = payload.manifest.files['app.js']; delete payload.manifest.files['app.js'];
payload.files['evil.wasm'] = payload.files['app.js']; delete payload.files['app.js'];
ok('E_PAYLOAD', has(await validatePackage(payload), 'E_PAYLOAD'));

const badEntry = structuredClone(base);
badEntry.manifest.entry = 'nope.html';
ok('E_ENTRY', has(await validatePackage(badEntry), 'E_ENTRY'));

const badDigest = structuredClone(base);
badDigest.manifest.files['app.js'] = 'sha256-nothex';
ok('E_MANIFEST bad digest', has(await validatePackage(badDigest), 'E_MANIFEST'));

/* ---- limits ---- */
const bigFile = structuredClone(base);
bigFile.manifest.files['big.bin'] = 'sha256-' + await sha256Hex(new Uint8Array(0));
bigFile.files['big.bin'] = { encoding: 'base64', data: Buffer.alloc(140 * 1024).toString('base64') };
ok('E_LIMIT file size', has(await validatePackage(bigFile), 'E_LIMIT'));

const bigPkg = { format: PACKAGE_FORMAT, version: PACKAGE_VERSION, manifest: { schema: 1, id: 'big', version: '1.0.0', name: 'Big', entry: 'f0.txt', permissions: [], files: {} }, files: {} };
for (let i = 0; i < 60; i++) {
  const p = 'f' + i + '.txt', text = 'x'.repeat(16 * 1024);
  bigPkg.manifest.files[p] = 'sha256-' + await sha256Hex(ENC.encode(text));
  bigPkg.files[p] = { encoding: 'utf8', data: text };
}
ok('E_LIMIT package size', has(await validatePackage(bigPkg), 'E_LIMIT'));

/* ---- pack tool end to end ---- */
const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'bitos-pack-'));
try {
  const out = join(tmp, 'example.bitos-app');
  execFileSync(process.execPath, [join(root, 'scripts', 'pack.mjs'), join(root, 'templates', 'installable-app'), '-o', out], { stdio: 'pipe' });
  const packed = JSON.parse(readFileSync(out, 'utf8'));
  const res = await validatePackage(packed);
  ok('packed template validates', res.ok, JSON.stringify(res.errors));
  ok('packed template hashes match', res.ok && packed.manifest.files['index.html'] && packed.files['index.html']);
  ok('packed template digest', res.ok && /^[0-9a-f]{64}$/.test(res.digest));
} catch (e) {
  fail++; console.error('FAIL pack tool — ' + (e.stderr ? e.stderr.toString() : e.message));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
