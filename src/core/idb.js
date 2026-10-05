'use strict';
/* ============================================================================
   BITOS WEB / INDEXEDDB PACKAGE STORE
   Minimal promise wrapper over one object store. Package bytes are the only
   payload here; install/grant/app-data metadata stays in the localStorage
   ecosystem records for now (APP-03 moves those too). When IndexedDB is absent
   — Node tests, locked-down browsers — it degrades to an in-memory Map with the
   same API so callers and fixtures behave identically.
   ========================================================================== */

const DB_NAME = 'bitos-apps';
const DB_VERSION = 6;
const STORE = 'packages';
const META_STORES = ['installs', 'grants', 'appData'];
const EXTRA_STORES = ['releases', 'listings', 'catalog', 'trust', 'blobs', 'files', 'office'];

const memory = new Map();
let opening = null;

function available() { return typeof indexedDB !== 'undefined'; }

function open() {
  if (!available()) return Promise.resolve(null);
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [STORE, ...META_STORES, ...EXTRA_STORES]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

export async function idbPut(key, value) {
  if (!available()) { memory.set(key, value); return key; }
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve(key);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function idbDel(key) {
  if (!available()) { memory.delete(key); return; }
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* Read the whole install/grant/app-data state in one pass. */
const memState = { installs: new Map(), grants: new Map(), appData: new Map() };
function memReadState() {
  const out = { installs: {}, grants: {}, data: {} };
  memState.installs.forEach((v, k) => { out.installs[k] = v; });
  memState.grants.forEach((v, k) => { out.grants[k] = v; });
  memState.appData.forEach((v, k) => { out.data[k] = v; });
  return out;
}
export async function idbReadState() {
  if (!available()) return memReadState();
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORES, 'readonly');
    const out = { installs: {}, grants: {}, data: {} };
    const pk = tx.objectStore('installs').getAllKeys(), pv = tx.objectStore('installs').getAll();
    const gk = tx.objectStore('grants').getAllKeys(), gv = tx.objectStore('grants').getAll();
    const dk = tx.objectStore('appData').getAllKeys(), dv = tx.objectStore('appData').getAll();
    tx.oncomplete = () => {
      pk.result.forEach((k, i) => { out.installs[k] = pv.result[i]; });
      gk.result.forEach((k, i) => { out.grants[k] = gv.result[i]; });
      dk.result.forEach((k, i) => { out.data[k] = dv.result[i]; });
      resolve(out);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/* Replace the whole state atomically across the three stores. */
export async function idbWriteState(state) {
  state = state || {};
  if (!available()) {
    memState.installs = new Map(Object.entries(state.installs || {}));
    memState.grants = new Map(Object.entries(state.grants || {}));
    memState.appData = new Map(Object.entries(state.data || {}));
    return;
  }
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORES, 'readwrite');
    const put = (name, obj) => {
      const store = tx.objectStore(name);
      store.clear();
      Object.entries(obj || {}).forEach(([k, v]) => store.put(v, k));
    };
    put('installs', state.installs);
    put('grants', state.grants);
    put('appData', state.data);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbAll() {
  if (!available()) return [...memory.entries()];
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const keys = tx.objectStore(STORE).getAllKeys();
    const vals = tx.objectStore(STORE).getAll();
    tx.oncomplete = () => resolve(keys.result.map((k, i) => [k, vals.result[i]]));
    tx.onerror = () => reject(tx.error);
  });
}

/* Generic per-store helpers for the extra stores (releases, listings, catalog). */
const extraMemory = { releases: new Map(), listings: new Map(), catalog: new Map(), trust: new Map(), blobs: new Map(), files: new Map(), office: new Map() };
function extraMem(store) { return extraMemory[store] || (extraMemory[store] = new Map()); }

export async function idbPutIn(store, key, value) {
  if (!available()) { extraMem(store).set(key, value); return key; }
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve(key);
    tx.onerror = () => reject(tx.error);
  });
}
export async function idbAllIn(store) {
  if (!available()) return [...extraMem(store).entries()];
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const keys = tx.objectStore(store).getAllKeys();
    const vals = tx.objectStore(store).getAll();
    tx.oncomplete = () => resolve(keys.result.map((k, i) => [k, vals.result[i]]));
    tx.onerror = () => reject(tx.error);
  });
}
export async function idbGetIn(store, key) {
  if (!available()) return extraMem(store).get(key);
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}
export async function idbDelIn(store, key) {
  if (!available()) { extraMem(store).delete(key); return; }
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function idbAvailable() { return available(); }
