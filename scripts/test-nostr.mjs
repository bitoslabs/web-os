#!/usr/bin/env node
/* NIP-01 listing-event fixtures (APP-13 groundwork). Event IDs are recomputed,
 * so a tampered event is detected; signature verification is reported as
 * unsupported without a secp256k1 verifier and never silently trusted.
 * Usage: node scripts/test-nostr.mjs */
import { eventId, validateEvent, verifyEvent, parseListingEvent, buildListingEvent, LISTING_KIND } from '../src/core/nostr-event.js';
import { signSchnorr, xOnlyPubkey, schnorrEventVerifier } from '../src/core/schnorr.js';

function hexToBytes(hex) { const out = new Uint8Array(hex.length / 2); for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16); return out; }

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : (fail++, console.error('FAIL ' + name + (extra ? ' — ' + extra : ''))); };

const base = {
  pubkey: 'ab'.repeat(32),
  created_at: 1760000000,
  kind: LISTING_KIND,
  tags: [['d', 'counter']],
  content: JSON.stringify({ appId: 'counter', version: '1.1.0', digest: 'cd'.repeat(32), name: 'Counter', permissions: [], minBitosApi: 1 }),
};
base.id = await eventId(base);

const valid = await validateEvent(base);
ok('valid event passes', valid.ok && valid.hex === base.id);

const tampered = { ...base, content: base.content.replace('1.1.0', '2.0.0') };
const bad = await validateEvent(tampered);
ok('tampered content breaks the id', !bad.ok && bad.errors[0].includes('id'));

const noVerifier = await verifyEvent(base, null);
ok('missing verifier is unsupported', !noVerifier.ok && noVerifier.status === 'unsupported');
ok('verifier accepts a good event', (await verifyEvent(base, () => true)).status === 'verified');
ok('verifier rejects a bad event', (await verifyEvent(base, () => false)).status === 'invalid');

const parsed = parseListingEvent(base);
ok('listing parses to a descriptor', parsed.ok && parsed.descriptor.publisherKey === base.pubkey && parsed.descriptor.appId === 'counter');
ok('listing carries the digest', parsed.ok && parsed.descriptor.digest === 'cd'.repeat(32));
const withSigner = parseListingEvent({ ...base, content: JSON.stringify({ appId: 'counter', version: '1.1.0', name: 'Counter', releaseKey: 'A'.repeat(43) + '=' }) });
ok('listing carries a release signer key', withSigner.ok && withSigner.descriptor.releaseKey === 'A'.repeat(43) + '=');

const wrongKind = parseListingEvent({ ...base, kind: 1 });
ok('non-listing kind rejected', !wrongKind.ok);
const badPerm = parseListingEvent({ ...base, content: JSON.stringify({ appId: 'counter', version: '1.0.0', name: 'x', permissions: ['fs'] }) });
ok('unknown permission rejected', !badPerm.ok && badPerm.errors.some(e => e.includes('permission')));
const noName = parseListingEvent({ ...base, content: JSON.stringify({ appId: 'counter', version: '1.0.0' }) });
ok('missing name rejected', !noName.ok);

/* Build + sign a listing with the publisher tool math. */
const sk = '01'.repeat(32);
const pub = xOnlyPubkey(sk);
const built = buildListingEvent({ publisherKey: pub, appId: 'counter', version: '1.0.0', name: 'Counter', digest: 'cd'.repeat(32) });
built.id = await eventId(built);
built.sig = await signSchnorr(sk, hexToBytes(built.id), '00'.repeat(32));
ok('built listing id validates', (await validateEvent(built)).ok);
ok('built listing signature verifies', await schnorrEventVerifier(built, built.id));
ok('built listing parses', parseListingEvent(built).ok);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
