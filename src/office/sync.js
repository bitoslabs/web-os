'use strict';
/* ============================================================================
   BITOS OFFICE / SYNC
   Pushes a saved document to a server after it lands in the local IndexedDB
   store, and pulls it back when a document is missing locally. With no server
   configured it falls back to a local "remote" copy in the IndexedDB `office`
   store, so the sync path is exercised offline and in tests. A configured
   server is a plain JSON endpoint (PUT/GET <url>/office/<key>); the booted OS
   can point it at the identity's Blossom/relay transport instead.

   Security: syncing uploads the document as-is. Keep enabled only with a
   trusted, encrypted-in-transit endpoint; encrypting the payload (as
   src/core/cloudfile.js does for Files) is planned.
   ========================================================================== */

import { idbGetIn, idbPutIn } from '../core/idb.js';

const CFG_KEY = 'bitos.office.sync';
const SIM_PREFIX = 'sync:';
const STORE = 'office';

export function syncConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY));
    if (c && typeof c === 'object') return { url: String(c.url || ''), enabled: !!c.enabled };
  } catch (e) { /* ignore */ }
  return { url: '', enabled: false };
}

export function configureSync(patch) {
  const cur = syncConfig();
  const next = { url: patch && patch.url != null ? String(patch.url).trim() : cur.url, enabled: patch && patch.enabled != null ? !!patch.enabled : cur.enabled };
  if (!next.url) next.enabled = false;
  try { localStorage.setItem(CFG_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
  notify(null, { state: next.enabled ? 'idle' : 'off' });
  return next;
}

const status = new Map();
const listeners = new Set();

export function syncStatus(key) { return (key && status.get(key)) || { state: syncConfig().enabled ? 'idle' : 'off' }; }
export function onSyncChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function notify(key, state) {
  if (key) status.set(key, state);
  for (const cb of listeners) { try { cb(key, state); } catch (e) { /* ignore */ } }
}

const endpoint = (base, key) => String(base).replace(/\/+$/, '') + '/office/' + encodeURIComponent(key);

export async function push(key, record) {
  const cfg = syncConfig();
  notify(key, { state: 'syncing', at: Date.now() });
  const body = JSON.stringify({ key, updated: Date.now(), record });
  try {
    if (cfg.enabled && cfg.url) {
      const res = await fetch(endpoint(cfg.url, key), { method: 'PUT', headers: { 'content-type': 'application/json' }, body });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      notify(key, { state: 'synced', at: Date.now(), remote: cfg.url });
    } else {
      await idbPutIn(STORE, SIM_PREFIX + key, body);
      notify(key, { state: 'synced', at: Date.now(), simulated: true });
    }
    return { ok: true };
  } catch (e) {
    const error = (e && e.message) || 'sync failed';
    notify(key, { state: 'error', at: Date.now(), error });
    return { ok: false, error };
  }
}

export async function pull(key) {
  const cfg = syncConfig();
  try {
    let body = null;
    if (cfg.enabled && cfg.url) {
      const res = await fetch(endpoint(cfg.url, key));
      if (res.ok) body = await res.text();
    } else {
      body = await idbGetIn(STORE, SIM_PREFIX + key);
    }
    if (!body) return null;
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    return parsed && parsed.record ? parsed.record : null;
  } catch (e) { return null; }
}
