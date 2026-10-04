#!/usr/bin/env node
/* Relay listing-client fixtures (APP-13 groundwork). The collector is pure and
 * the fetch loop is driven by an injected socket, so no network is used.
 * Usage: node scripts/test-relay.mjs */
import { eventId, LISTING_KIND } from '../src/core/nostr-event.js';
import { collectListingMessages, fetchListings } from '../src/core/relay.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : (fail++, console.error('FAIL ' + name + (extra ? ' — ' + extra : ''))); };

function event(over) {
  const ev = {
    pubkey: 'ab'.repeat(32), created_at: 1760000000, kind: LISTING_KIND,
    tags: [['d', 'counter']],
    content: JSON.stringify({ appId: 'counter', version: '1.1.0', digest: 'cd'.repeat(32), name: 'Counter', permissions: [] }),
    ...over,
  };
  return ev;
}
let ev = event(); ev.id = await eventId(ev);

const collected = await collectListingMessages([['EVENT', 's', ev], ['EVENT', 's', ev]], null, 'wss://a');
ok('collector dedupes by id', collected.length === 1);
ok('collector reports unsupported without verifier', collected[0].status === 'unsupported' && collected[0].relay === 'wss://a');

const withVerifier = await collectListingMessages([['EVENT', 's', ev]], () => true);
ok('collector verifies with an injected verifier', withVerifier[0].status === 'verified');

const wrongKind = await collectListingMessages([['EVENT', 's', event({ kind: 1 })]], null);
ok('collector drops non-listing events', wrongKind.length === 0);

function fakeSocket() {
  const h = {};
  return {
    addEventListener: (t, f) => { (h[t] = h[t] || []).push(f); },
    emit: (t, d) => { (h[t] || []).forEach(f => f(d)); },
    close() { }, send() { },
  };
}
const sockets = [];
const pending = fetchListings(['wss://a', 'wss://b'], { socketFactory: () => { const s = fakeSocket(); sockets.push(s); return s; }, subId: 's', timeoutMs: 300 });
ok('fetch opens one socket per relay', sockets.length === 2);
sockets[0].emit('message', { data: JSON.stringify(['EVENT', 's', ev]) });
sockets[0].emit('message', { data: JSON.stringify(['EOSE', 's']) });
sockets[1].emit('message', { data: JSON.stringify(['EOSE', 's']) });
const fetched = await pending;
ok('fetch returns the listing', fetched.length === 1 && fetched[0].descriptor.appId === 'counter');

const empty = await fetchListings([], {});
ok('fetch with no relays resolves empty', Array.isArray(empty) && empty.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
