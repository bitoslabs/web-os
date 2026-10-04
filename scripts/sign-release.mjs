#!/usr/bin/env node
/* Sign a packaged release in place: validates the .bitos-app, signs its release
 * manifest, and embeds `release` without changing the payload digest. A fresh
 * Ed25519 keypair is generated and the private key is discarded.
 *   node scripts/sign-release.mjs <file.bitos-app> [publisherKey] */
import { readFileSync, writeFileSync } from 'node:fs';
import { validatePackage, canonicalJson } from '../src/core/package.js';
import { signRelease, verifyRelease } from '../src/core/release-sign.js';

const file = process.argv[2];
const publisherKey = process.argv[3] || 'local';
if (!file) { console.error('usage: node scripts/sign-release.mjs <file.bitos-app> [publisherKey]'); process.exit(2); }

const pkg = JSON.parse(readFileSync(file, 'utf8'));
const res = await validatePackage(pkg);
if (!res.ok) {
  console.error('package is invalid:');
  res.errors.forEach(e => console.error('  ' + e.code + ' ' + e.message));
  process.exit(1);
}

const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const signature = await signRelease(res.manifest, res.digest, publisherKey, pair.privateKey);
const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64');
pkg.release = { publisherKey, publicKey, signature };

const check = await validatePackage(pkg);
if (!check.ok || check.digest !== res.digest) { console.error('signing changed the payload digest'); process.exit(1); }
const verified = await verifyRelease(check.manifest, check.digest, pkg.release);
if (!verified.ok) { console.error('self-verification failed: ' + (verified.reason || verified.status)); process.exit(1); }

writeFileSync(file, canonicalJson(pkg));
console.log('signed ' + file);
console.log('  digest  ' + check.digest);
console.log('  signer  ' + publicKey);
