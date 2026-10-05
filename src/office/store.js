'use strict';
/* ============================================================================
   BITOS OFFICE / STORE
   Persistence for office documents. IndexedDB (src/core/idb.js, 'office' store)
   is the primary store so large documents and embedded images are not bounded by
   the ~5MB localStorage limit; a localStorage mirror is kept as a
   best-effort fallback and read when IndexedDB is empty. Writes are serialized
   so overlapping autosaves cannot interleave. When IndexedDB is absent (node
   tests, locked-down browsers) idb.js degrades to an in-memory Map and the
   localStorage mirror still works.
   ========================================================================== */

import { idbGetIn, idbPutIn, idbDelIn } from '../core/idb.js';
import { push, pull, syncStatus, onSyncChange } from './sync.js';

const STORE = 'office';
const LS_PREFIX = 'bitos.office.';

export async function loadDoc(key, fallback) {
  try {
    const record = await idbGetIn(STORE, key);
    if (record != null) return record;
  } catch (e) { /* fall through to the localStorage mirror */ }
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (raw != null) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  try {
    const legacy = localStorage.getItem(key);
    if (legacy != null) return JSON.parse(legacy);
  } catch (e) { /* ignore */ }
  try {
    const remote = await pull(key);
    if (remote != null) return remote;
  } catch (e) { /* ignore */ }
  return fallback;
}

/* Coalesce autosaves: wait for a quiet period before syncing a key. */
const pushTimers = {};
function schedulePush(key, snapshot) {
  clearTimeout(pushTimers[key]);
  pushTimers[key] = setTimeout(() => { delete pushTimers[key]; push(key, snapshot); }, 1500);
}

let queue = Promise.resolve();
export function saveDoc(key, data) {
  queue = queue.then(async () => {
    let snapshot = data;
    try { snapshot = JSON.parse(JSON.stringify(data)); } catch (e) { /* keep as-is */ }
    try { await idbPutIn(STORE, key, snapshot); } catch (e) { /* ignore */ }
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(snapshot));
    } catch (e) {
      try { localStorage.removeItem(LS_PREFIX + key); } catch (_) { /* ignore */ }
    }
    try { localStorage.removeItem(key); } catch (e) { /* legacy key */ }
    schedulePush(key, snapshot); // background sync; never blocks the local save
  });
  return queue;
}

export async function deleteDoc(key) {
  await Promise.allSettled([
    idbDelIn(STORE, key),
    Promise.resolve().then(() => { try { localStorage.removeItem(LS_PREFIX + key); } catch (e) { /* ignore */ } }),
  ]);
}

/* Namespaced store for one app, so package data is app-scoped (like the
 * ecosystem `app.storage`). Keys are prefixed `<namespace>:`, old unprefixed
 * records are migrated on first read, and sync status is filtered per app. */
export function createStore(namespace) {
  const prefix = namespace ? namespace + ':' : '';
  const scoped = key => prefix + key;
  return {
    key: scoped,
    async load(key, fallback) {
      const found = await loadDoc(scoped(key), null);
      if (found != null) return found;
      const legacy = await loadDoc(key, null); // pre-namespaced key
      if (legacy != null) { saveDoc(scoped(key), legacy); return legacy; }
      return fallback;
    },
    save(key, data) { return saveDoc(scoped(key), data); },
    remove(key) { return deleteDoc(scoped(key)); },
    status(key) { return syncStatus(scoped(key)); },
    onSync(cb) { return onSyncChange((k, st) => { if (!k || k.startsWith(prefix)) cb(k, st); }); },
    pushNow(key, data) { return push(scoped(key), data); },
  };
}
