'use strict';
/* ============================================================================
   BITOS WEB / RELAY LISTING CLIENT (APP-13 groundwork)
   Subscribe to relays for NIP-89-style listing events, keep only structurally
   valid and parseable ones, and report each with its signature status. Until a
   secp256k1 verifier is injected, results are `unsupported` and never trusted or
   auto-installed. The socket factory is injectable so this is testable without
   a network; the default uses the browser WebSocket. Relay trust policy, NIP-65
   routing, reconnect, and a real verifier are still open.
   ========================================================================== */
import { verifyEvent, parseListingEvent, LISTING_KIND } from './nostr-event.js';
import { schnorrEventVerifier } from './schnorr.js';

/* Pure: map raw relay messages to deduped listing candidates. */
export async function collectListingMessages(messages, verifier, relay) {
  const out = new Map();
  for (const m of messages) {
    if (!Array.isArray(m) || m[0] !== 'EVENT' || !m[2]) continue;
    const ev = m[2];
    const parsed = parseListingEvent(ev);
    if (!parsed.ok) continue;
    const id = ev.id || parsed.descriptor.appId;
    if (out.has(id)) continue;
    const v = await verifyEvent(ev, verifier);
    out.set(id, { id: ev.id || '', status: v.status, relay: relay || '', descriptor: parsed.descriptor, event: ev });
  }
  return [...out.values()];
}

function defaultSocket(url) {
  return typeof WebSocket !== 'undefined' ? new WebSocket(url) : null;
}

/* NIP-65 role selection. Accepts plain URLs or { host, on, read, write } records
 * (as in src/data/sim.js). A relay is on unless explicitly `on: false`. */
function relayUrl(r) {
  if (typeof r === 'string') return /^wss?:\/\//.test(r) ? r : 'wss://' + r;
  if (r && r.host) return 'wss://' + String(r.host).replace(/^wss?:\/\//, '');
  return null;
}
export function selectReadRelays(relays) {
  return (relays || [])
    .filter(r => (typeof r === 'string' ? true : r && r.on !== false) && (typeof r === 'string' || r.read !== false))
    .map(relayUrl).filter(Boolean);
}
export function selectWriteRelays(relays) {
  return (relays || [])
    .filter(r => (typeof r === 'string' ? true : r && r.on !== false) && (typeof r === 'string' || r.write !== false))
    .map(relayUrl).filter(Boolean);
}

/* When a trust list is supplied, only those relays are used. */
function hostOf(url) { return String(url || '').replace(/^wss?:\/\//, '').replace(/\/+$/, '').toLowerCase(); }
export function filterTrustedRelays(urls, trustedRelays) {
  if (!trustedRelays) return urls;
  const set = new Set((trustedRelays || []).map(hostOf));
  return urls.filter(u => set.has(hostOf(u)));
}

/* Collect listing candidates across relays. Resolves on EOSE/close or timeout. */
export function fetchListings(relays, opts) {
  opts = opts || {};
  const factory = opts.socketFactory || defaultSocket;
  const subId = opts.subId || 'bitos-listings';
  const timeoutMs = opts.timeoutMs || 2500;
  const filter = opts.filter || { kinds: [LISTING_KIND] };
  const verifier = opts.verifier || schnorrEventVerifier;
  const minRelays = Math.max(1, opts.minRelays || 1);
  const urls = filterTrustedRelays(opts.readRelays || selectReadRelays(relays), opts.trustedRelays);
  return new Promise(resolve => {
    const sockets = [];
    const messages = [];
    let pending = urls.length, done = false;
    const finish = async () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sockets.forEach(s => { try { s.close && s.close(); } catch (e) { } });
      const byId = new Map();
      for (const { data, url } of messages) {
        if (!Array.isArray(data) || data[0] !== 'EVENT' || !data[2]) continue;
        const ev = data[2];
        const parsed = parseListingEvent(ev);
        if (!parsed.ok) continue;
        const id = ev.id || parsed.descriptor.appId;
        const v = await verifyEvent(ev, verifier);
        const cur = byId.get(id) || { id: ev.id || '', status: v.status, descriptor: parsed.descriptor, event: ev, relays: [] };
        if (!cur.relays.includes(url)) cur.relays.push(url);
        byId.set(id, cur);
      }
      /* Relay trust policy: require agreement from minRelays distinct relays. */
      resolve([...byId.values()].filter(c => c.relays.length >= minRelays));
    };
    if (!urls.length) { done = true; resolve([]); return; }
    const timer = setTimeout(finish, timeoutMs);
    urls.forEach(url => {
      let sock;
      try { sock = factory(url); } catch (e) { sock = null; }
      if (!sock) { if (--pending <= 0) finish(); return; }
      sockets.push(sock);
      const onMessage = e => {
        let data;
        try { data = JSON.parse(e && e.data != null ? e.data : e); } catch (err) { return; }
        if (!Array.isArray(data)) return;
        if (data[0] === 'EVENT' && data[2]) messages.push({ data, url });
        else if (data[0] === 'EOSE' || data[0] === 'CLOSED') { if (--pending <= 0) finish(); }
      };
      const onClose = () => { if (--pending <= 0) finish(); };
      if (typeof sock.addEventListener === 'function') { sock.addEventListener('message', onMessage); sock.addEventListener('close', onClose); }
      else if (typeof sock.on === 'function') { sock.on('message', onMessage); sock.on('close', onClose); }
      try { sock.send && sock.send(JSON.stringify(['REQ', subId, filter])); } catch (e) { }
    });
  });
}

/* Broadcast a listing event to write relays. Resolves once sends are attempted;
 * OK/ack handling is left to the caller (a vetted relay layer). */
export function publishListing(event, relays, opts) {
  opts = opts || {};
  const factory = opts.socketFactory || defaultSocket;
  const urls = filterTrustedRelays(opts.writeRelays || selectWriteRelays(relays), opts.trustedRelays);
  return new Promise(resolve => {
    const sockets = [];
    const sent = [];
    const acked = [];
    let remaining = 0, done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sockets.forEach(s => { try { s.close && s.close(); } catch (e) { } });
      resolve({ sent: sent.length, relays: sent, acked });
    };
    const timer = setTimeout(finish, opts.waitForAck ? (opts.timeoutMs || 4000) : 0);
    urls.forEach(url => {
      let sock;
      try { sock = factory(url); } catch (e) { sock = null; }
      if (!sock) return;
      sockets.push(sock);
      if (opts.waitForAck && typeof sock.addEventListener === 'function') {
        remaining++;
        sock.addEventListener('message', e => {
          let data; try { data = JSON.parse(e && e.data != null ? e.data : e); } catch (err) { return; }
          if (Array.isArray(data) && data[0] === 'OK' && data[1] === event.id) {
            if (!acked.includes(url)) acked.push(url);
            if (--remaining <= 0) finish();
          }
        });
      }
      try { sock.send && sock.send(JSON.stringify(['EVENT', event])); sent.push(url); } catch (e) { }
    });
    if (!opts.waitForAck || remaining === 0) finish();
  });
}
