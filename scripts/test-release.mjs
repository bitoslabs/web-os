#!/usr/bin/env node
/* Release-signature fixtures (APP-14 preview). Packs the template, signs the
 * release manifest, and checks the installer accepts a valid signature and
 * refuses a tampered one. Usage: node scripts/test-release.mjs */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};

const { validatePackage } = await import('../src/core/package.js');
const { signRelease, verifyRelease } = await import('../src/core/release-sign.js');
const { install, getInstall, remove } = await import('../src/core/installer.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : (fail++, console.error('FAIL ' + name + (extra ? ' — ' + extra : ''))); };

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'bitos-rel-'));
const file = join(tmp, 'example.bitos-app');
execFileSync(process.execPath, [join(root, 'scripts', 'pack.mjs'), join(root, 'templates', 'installable-app'), '-o', file], { stdio: 'pipe' });

const pkg = JSON.parse(readFileSync(file, 'utf8'));
const base = await validatePackage(pkg);
ok('unsigned package validates', base.ok);

const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64');
const signature = await signRelease(base.manifest, base.digest, 'local', pair.privateKey);
pkg.release = { publisherKey: 'local', publicKey, signature };

const signed = await validatePackage(pkg);
ok('release envelope keeps the digest', signed.ok && signed.digest === base.digest);
const good = await verifyRelease(signed.manifest, signed.digest, pkg.release);
ok('valid release verifies', good.ok && good.status === 'verified', JSON.stringify(good));
const tampered = await verifyRelease({ ...signed.manifest, version: '9.9.9' }, signed.digest, pkg.release);
ok('tampered manifest is invalid', !tampered.ok && tampered.status === 'invalid');
ok('missing signature reported', (await verifyRelease(signed.manifest, signed.digest, {})).status === 'missing');

const otherPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const otherKey = Buffer.from(await crypto.subtle.exportKey('raw', otherPair.publicKey)).toString('base64');
const trusted = await verifyRelease(signed.manifest, signed.digest, pkg.release, { local: [publicKey] });
ok('registered signer is trusted', trusted.ok && trusted.trusted === true);
const untrusted = await verifyRelease(signed.manifest, signed.digest, pkg.release, { local: [otherKey] });
ok('unregistered signer is untrusted', !untrusted.ok && untrusted.status === 'untrusted');
let trustRefused = false;
try { await install(pkg, { source: 'local-file', trustedKeys: { local: [otherKey] } }); } catch (e) { trustRefused = true; }
ok('registry refuses an untrusted signer', trustRefused);

const rec = await install(pkg, { source: 'local-file' });
ok('installer accepts a signed release', !!(rec && rec.releaseVerified === true && rec.releaseKey === publicKey));
remove(rec.key, { keepData: false });

let refused = false;
try { await install({ ...pkg, release: { ...pkg.release, signature: 'AAAA' } }, { source: 'local-file' }); }
catch (e) { refused = true; }
ok('installer refuses a bad signature', refused);
ok('refused install is not recorded', getInstall(rec.key) === null);

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
