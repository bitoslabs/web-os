#!/usr/bin/env node
/* Publish a signed release as a NIP-89-style listing event. Builds the event
 * from the package's manifest and release envelope, signs it with the
 * publisher's Nostr secret key (BIP-340), self-verifies, and prints it.
 *   node scripts/list-release.mjs <file.bitos-app> --key <64-hex seckey> [--out file.json]
 * The secret key never leaves this process; it is not written to disk. */
import { readFileSync, writeFileSync } from 'node:fs';
import { validatePackage } from '../src/core/package.js';
import { buildListingEvent, eventId } from '../src/core/nostr-event.js';
import { signSchnorr, xOnlyPubkey, schnorrEventVerifier } from '../src/core/schnorr.js';

function hexToBytes(hex) { const out = new Uint8Array(hex.length / 2); for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16); return out; }

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const keyIdx = args.indexOf('--key');
const outIdx = args.indexOf('--out');
const seckey = keyIdx >= 0 ? args[keyIdx + 1] : null;
const out = outIdx >= 0 ? args[outIdx + 1] : null;
if (!file || !seckey || !/^[0-9a-f]{64}$/i.test(seckey)) {
  console.error('usage: node scripts/list-release.mjs <file.bitos-app> --key <64-hex seckey> [--out file.json]');
  process.exit(2);
}

const pkg = JSON.parse(readFileSync(file, 'utf8'));
const res = await validatePackage(pkg);
if (!res.ok) { res.errors.forEach(e => console.error('  ' + e.code + ' ' + e.message)); process.exit(1); }
if (!pkg.release || !/^[0-9a-f]{64}$/.test(pkg.release.publisherKey || '')) {
  console.error('package has no Nostr publisherKey; sign it with `make sign-release FILE=' + file + ' <publisherKey>`');
  process.exit(1);
}
const pub = xOnlyPubkey(seckey);
if (pub !== pkg.release.publisherKey) { console.error('secret key derives ' + pub + ', not the publisher ' + pkg.release.publisherKey); process.exit(1); }

const m = res.manifest;
const ev = buildListingEvent({
  publisherKey: pub, appId: m.id, version: m.version, digest: res.digest, name: m.name,
  permissions: m.permissions || [], minBitosApi: m.minBitosApi || 1,
  releaseKey: pkg.release.publicKey, entry: m.entry, icon: m.icon, packageUrl: pkg.packageUrl || '', summary: m.description || '',
});
ev.id = await eventId(ev);
ev.sig = await signSchnorr(seckey, hexToBytes(ev.id), null);
if (!await schnorrEventVerifier(ev, ev.id)) { console.error('self-verification failed'); process.exit(1); }

const json = JSON.stringify(ev, null, 2);
if (out) writeFileSync(out, json);
console.log(json);
