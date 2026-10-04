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

/* Collect listing candidates across relays. Resolves on EOSE/close or timeout. */
export function fetchListings(relays, opts) {
  opts = opts || {};
  const factory = opts.socketFactory || defaultSocket;
  const subId = opts.subId || 'bitos-listings';
  const timeoutMs = opts.timeoutMs || 2500;
  const filter = opts.filter || { kinds: [LISTING_KIND] };
  const verifier = opts.verifier || schnorrEventVerifier;
  return new Promise(resolve => {
    const sockets = [];
    const messages = [];
    let pending = relays.length, done = false;
    const finish = async () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sockets.forEach(s => { try { s.close && s.close(); } catch (e) { } });
      const all = new Map();
      for (const { data, url } of messages) {
        for (const candidate of await collectListingMessages([data], verifier, url)) {
          if (!all.has(candidate.id)) all.set(candidate.id, candidate);
        }
      }
      resolve([...all.values()]);
    };
    if (!relays.length) { done = true; resolve([]); return; }
    const timer = setTimeout(finish, timeoutMs);
    relays.forEach(url => {
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
