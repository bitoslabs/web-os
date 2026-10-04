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
const DB_VERSION = 1;
const STORE = 'packages';

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
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
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

export function idbAvailable() { return available(); }
