#!/usr/bin/env node
/* Publisher trust-binding fixtures (APP-14 groundwork). Only Schnorr-verified
 * listings with a release signer key contribute a binding. Usage: node scripts/test-trust.mjs */
import { deriveTrustBindings, loadTrustMap, saveTrustBindings, mergeTrust, isReleaseKey } from '../src/core/trust-registry.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : (fail++, console.error('FAIL ' + name + (extra ? ' — ' + extra : ''))); };

const rk = 'A'.repeat(43) + '=';
const P1 = 'ab'.repeat(32), P2 = 'cd'.repeat(32), P3 = 'ef'.repeat(32);
ok('valid base64 key', isReleaseKey(rk));
ok('rejects a short key', !isReleaseKey('abc'));

const candidates = [
  { status: 'verified', descriptor: { publisherKey: P1, releaseKey: rk } },
  { status: 'invalid', descriptor: { publisherKey: P2, releaseKey: rk } },
  { status: 'verified', descriptor: { publisherKey: P3, releaseKey: '' } },
];
const bindings = deriveTrustBindings(candidates);
ok('only verified listings with a signer bind', bindings.length === 1 && bindings[0].publisherKey === P1);
ok('binding carries the release key', bindings[0].releaseKey === rk);

await saveTrustBindings(bindings);
const map = await loadTrustMap();
ok('binding persists', (map[P1] || []).includes(rk));
ok('unverified publisher absent', !map[P2]);

const merged = mergeTrust({ [P1]: ['base-key'] }, map);
ok('merge unions base and derived', merged[P1].length === 2 && merged[P1].includes('base-key') && merged[P1].includes(rk));

/* Discovery merge. */
const { mergeCandidates, listingKey, verifiedBindings } = await import('../src/core/discovery.js');
const a1 = { id: '1', status: 'verified', descriptor: { publisherKey: P1, appId: 'a', releaseKey: rk } };
const a2 = { id: '2', status: 'invalid', descriptor: { publisherKey: P1, appId: 'a' } };
const b1 = { id: '3', status: 'verified', descriptor: { publisherKey: P2, appId: 'b', releaseKey: rk } };
ok('listing key is publisher/app', listingKey(a1) === P1 + '/a');
const list = mergeCandidates([a1], [a2, b1]);
ok('merge dedupes by publisher/app', list.length === 2 && list.find(c => c.descriptor.appId === 'a').id === '2');
ok('verifiedBindings keeps only verified', verifiedBindings(list).length === 1 && verifiedBindings(list)[0].publisherKey === P2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
