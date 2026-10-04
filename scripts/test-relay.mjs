#!/usr/bin/env node
/* Relay listing-client fixtures (APP-13 groundwork). The collector is pure and
 * the fetch loop is driven by an injected socket, so no network is used.
 * Usage: node scripts/test-relay.mjs */
import { eventId, LISTING_KIND } from '../src/core/nostr-event.js';
import { collectListingMessages, fetchListings, selectReadRelays, selectWriteRelays, filterTrustedRelays, publishListing } from '../src/core/relay.js';

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
  const s = {
    sent: [],
    addEventListener: (t, f) => { (h[t] = h[t] || []).push(f); },
    emit: (t, d) => { (h[t] || []).forEach(f => f(d)); },
    close() { }, send(m) { s.sent.push(m); },
  };
  return s;
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

/* NIP-65 role selection. */
const roles = [
  { host: 'a', on: true, read: true, write: false },
  { host: 'b', on: true, read: false, write: true },
  { host: 'c', on: false, read: true, write: true },
  'wss://d',
];
ok('read relays selected', JSON.stringify(selectReadRelays(roles)) === JSON.stringify(['wss://a', 'wss://d']));
ok('write relays selected', JSON.stringify(selectWriteRelays(roles)) === JSON.stringify(['wss://b', 'wss://d']));

/* Multi-relay quorum trust policy. */
function fetchWith(minRelays) {
  const socks = [];
  const p = fetchListings(['wss://a', 'wss://b'], { socketFactory: () => { const s = fakeSocket(); socks.push(s); return s; }, subId: 's', timeoutMs: 300, minRelays });
  return { p, socks };
}
const q1 = fetchWith(2);
q1.socks[0].emit('message', { data: JSON.stringify(['EVENT', 's', ev]) });
q1.socks[1].emit('message', { data: JSON.stringify(['EVENT', 's', ev]) });
q1.socks.forEach(s => s.emit('message', { data: JSON.stringify(['EOSE', 's']) }));
ok('quorum 2/2 keeps the listing', (await q1.p).length === 1);
const q2 = fetchWith(2);
q2.socks[0].emit('message', { data: JSON.stringify(['EVENT', 's', ev]) });
q2.socks.forEach(s => s.emit('message', { data: JSON.stringify(['EOSE', 's']) }));
ok('quorum 1/2 drops the listing', (await q2.p).length === 0);

/* Broadcast to write relays only. */
const pubSocks = [];
const pubRes = await publishListing(
  { id: 'x', kind: LISTING_KIND, tags: [], content: '{}', pubkey: 'ab'.repeat(32), created_at: 1, sig: '00'.repeat(64) },
  [{ host: 'w', read: false, write: true }, { host: 'v', read: true, write: false }],
  { socketFactory: () => { const s = fakeSocket(); pubSocks.push(s); return s; } });
ok('publish targets write relays only', pubRes.sent === 1 && pubSocks.length === 1 && pubSocks[0].sent[0].includes('EVENT'));

/* Curated trust list restricts relays. */
const tSocks = [];
await fetchListings(['wss://a', 'wss://b'], { socketFactory: () => { const s = fakeSocket(); tSocks.push(s); return s; }, subId: 's', timeoutMs: 50, trustedRelays: ['a'] });
ok('trust list restricts read relays', tSocks.length === 1);
ok('filterTrustedRelays drops untrusted', JSON.stringify(filterTrustedRelays(['wss://a', 'wss://b'], ['b'])) === JSON.stringify(['wss://b']));

/* OK/ack handling. */
const ackSocks = [];
const ackP = publishListing(
  { id: 'feed'.repeat(16), kind: LISTING_KIND, tags: [], content: '{}', pubkey: 'ab'.repeat(32), created_at: 1, sig: '00'.repeat(64) },
  ['wss://r'], { socketFactory: () => { const s = fakeSocket(); ackSocks.push(s); return s; }, waitForAck: true, timeoutMs: 200 });
ackSocks[0].emit('message', { data: JSON.stringify(['OK', 'feed'.repeat(16), true, '']) });
const ackRes = await ackP;
ok('publish records an OK ack', ackRes.acked.length === 1 && ackRes.acked[0] === 'wss://r');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
