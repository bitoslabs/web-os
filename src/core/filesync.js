'use strict';
/* ============================================================================
   BITOS WEB / HOME FILESYSTEM SYNC (preview)

   Backs up and restores the simulated home filesystem — the localStorage tree
   `bitos.ui.fs.v1` plus the binary blobs in the IndexedDB `files` store — to a
   simulated remote in the IndexedDB `sync` store. It mirrors src/office/sync.js:
   with no server configured the "remote" is a local copy, so the whole push /
   pull / merge path runs offline and in tests. The booted OS can point this at
   the identity's Blossom/relay transport instead (see src/core/cloudfile.js).

   The sync runs once on login (lock-screen unlock, src/session.js). It is a
   last-writer-wins union merge: on a first contact the remote is authoritative,
   and when both sides changed every path is kept with the local value winning a
   same-path conflict. Deletions are not tombstoned, so a path removed locally
   can be restored from the remote on the next merge.

   Security: the simulated remote is plaintext and device-local. Encrypting the
   payload (as src/core/cloudfile.js does for Files) is required before a real
   endpoint is used.
   ========================================================================== */

import { idbGetIn, idbPutIn, idbDelIn, idbAllIn } from './idb.js';

const TREE_KEY = 'bitos.ui.fs.v1';
const CFG_KEY = 'bitos.files.sync';
const STATE_KEY = 'bitos.files.sync.state';
const REMOTE_STORE = 'sync';
const REMOTE_KEY = 'home';
const REMOTE_SCHEMA = 1;

/* localStorage may be absent (node tests) or throw (locked-down browsers): fall
   back to a module-level Map so callers and fixtures behave the same. When
   localStorage exists it is authoritative, so a key removed there stays gone. */
const mem = new Map();
function hasLS() { try { return !!globalThis.localStorage; } catch (e) { return false; } }
function lsGet(k) {
  if (hasLS()) { try { return globalThis.localStorage.getItem(k); } catch (e) { /* fall through */ } }
  return mem.has(k) ? mem.get(k) : null;
}
function lsSet(k, v) {
  if (hasLS()) { try { globalThis.localStorage.setItem(k, v); return; } catch (e) { /* fall through */ } }
  mem.set(k, v);
}
function lsDel(k) {
  if (hasLS()) { try { globalThis.localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  mem.delete(k);
}

/* Coerce any stored blob representation back to bytes. */
function toBytes(v) {
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  if (Array.isArray(v)) return Uint8Array.from(v);
  return new Uint8Array(0);
}

/* Deterministic JSON so a state hash does not depend on key insertion order. */
export function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

/* FNV-1a over the canonical tree and every blob's path and bytes. */
export function hashState(tree, blobs) {
  let h = 0x811c9dc5 >>> 0;
  const mix = s => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
  mix(stableStringify(tree || {}));
  Object.keys(blobs || {}).sort().forEach(p => {
    mix(p);
    const b = toBytes(blobs[p]);
    for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 16777619) >>> 0; }
  });
  return h.toString(16).padStart(8, '0');
}

/* Deep copy so the simulated remote never aliases the live tree/blobs. */
function cloneTree(t) { try { return JSON.parse(stableStringify(t || { f: {}, d: [] })); } catch (e) { return { f: {}, d: [] }; } }
function cloneBlobs(blobs) { const out = {}; Object.keys(blobs || {}).forEach(k => { out[k] = toBytes(blobs[k]).slice(); }); return out; }

/* Pure union merge: every path is kept, the local value wins a same-path
   conflict, and directories are unioned. */
export function mergeStates(local, remote) {
  const lt = (local && local.tree) || {}, rt = (remote && remote.tree) || {};
  const f = { ...(rt.f || {}), ...(lt.f || {}) };
  const d = [...new Set([...(rt.d || []), ...(lt.d || [])])];
  const blobs = { ...cloneBlobs(rt.blobs || {}), ...cloneBlobs(lt.blobs || {}) };
  return { tree: { f, d }, blobs };
}

export function filesSyncConfig() {
  try {
    const c = JSON.parse(lsGet(CFG_KEY));
    if (c && typeof c === 'object') return { enabled: c.enabled !== false };
  } catch (e) { /* ignore */ }
  return { enabled: true };
}

export function configureFilesSync(patch) {
  const cur = filesSyncConfig();
  const next = { enabled: patch && patch.enabled != null ? !!patch.enabled : cur.enabled };
  lsSet(CFG_KEY, JSON.stringify(next));
  notify({ state: next.enabled ? 'idle' : 'off' });
  return next;
}

const status = new Map();
const listeners = new Set();

export function filesSyncStatus() { return status.get(REMOTE_KEY) || { state: filesSyncConfig().enabled ? 'idle' : 'off' }; }
export function onFilesSyncChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function notify(state) {
  status.set(REMOTE_KEY, state);
  for (const cb of listeners) { try { cb(state); } catch (e) { /* ignore */ } }
}

function readBaseline() {
  try {
    const b = JSON.parse(lsGet(STATE_KEY));
    if (b && typeof b === 'object') return { localHash: String(b.localHash || ''), remoteUpdated: Number(b.remoteUpdated) || 0 };
  } catch (e) { /* ignore */ }
  return null;
}
function writeBaseline(localHash, remoteUpdated) {
  lsSet(STATE_KEY, JSON.stringify({ localHash, remoteUpdated, at: Date.now() }));
}

async function readLocal() {
  let tree = null;
  const raw = lsGet(TREE_KEY);
  if (raw) { try { tree = JSON.parse(raw); } catch (e) { tree = null; } }
  let blobs = {};
  try { for (const [k, v] of await idbAllIn('files')) blobs[k] = toBytes(v); } catch (e) { /* empty */ }
  const empty = !tree && Object.keys(blobs).length === 0;
  return { tree: tree || { f: {}, d: ['Documents', 'Downloads', 'Pictures'] }, blobs, empty, hash: hashState(tree || {}, blobs) };
}

async function readRemote() {
  try {
    const rec = await idbGetIn(REMOTE_STORE, REMOTE_KEY);
    if (!rec || rec.schema !== REMOTE_SCHEMA) return null;
    return { schema: REMOTE_SCHEMA, updated: Number(rec.updated) || 0, tree: cloneTree(rec.tree), blobs: cloneBlobs(rec.blobs) };
  } catch (e) { return null; }
}

async function writeRemote(tree, blobs) {
  const updated = Date.now();
  try {
    await idbPutIn(REMOTE_STORE, REMOTE_KEY, { schema: REMOTE_SCHEMA, key: REMOTE_KEY, updated, tree: cloneTree(tree), blobs: cloneBlobs(blobs) });
  } catch (e) { return { ok: false, error: (e && e.message) || 'remote write failed' }; }
  return { ok: true, updated };
}

/* Make the local store match the given tree and blob set. */
async function applyLocal(tree, blobs) {
  lsSet(TREE_KEY, JSON.stringify(cloneTree(tree)));
  try {
    for (const [k] of await idbAllIn('files')) if (!(k in blobs)) await idbDelIn('files', k);
    for (const [k, v] of Object.entries(blobs)) await idbPutIn('files', k, toBytes(v));
  } catch (e) { /* blobs are best-effort */ }
}

/* The booted OS exposes a native bridge and uses the identity transport for
   real sync; this simulated store must not run there. Checked without importing
   core/native.js so the module still loads under node (no `window`). */
function inNativeOS() { try { return !!(globalThis.window && globalThis.window.__bitosNative); } catch (e) { return false; } }

/* Run one login sync. Never throws; returns the resulting status object. */
export async function syncFilesOnLogin() {
  if (inNativeOS()) { const st = { state: 'off', reason: 'native' }; notify(st); return st; }
  const cfg = filesSyncConfig();
  if (!cfg.enabled) { const st = { state: 'off' }; notify(st); return st; }
  notify({ state: 'syncing', at: Date.now() });
  try {
    const local = await readLocal();
    const remote = await readRemote();
    const base = readBaseline();

    if (!remote) {
      if (local.empty) { const st = { state: 'idle', at: Date.now() }; notify(st); return st; }
      const res = await writeRemote(local.tree, local.blobs);
      if (!res.ok) throw new Error(res.error);
      writeBaseline(local.hash, res.updated);
      const st = { state: 'synced', at: Date.now(), direction: 'push' };
      notify(st); return st;
    }

    /* First contact on this device, or an empty local home: the remote wins. */
    if (!base || local.empty) {
      await applyLocal(remote.tree, remote.blobs);
      writeBaseline(hashState(remote.tree, remote.blobs), remote.updated);
      const st = { state: 'pulled', at: Date.now() };
      notify(st); return st;
    }

    const localChanged = base.localHash !== local.hash;
    const remoteChanged = base.remoteUpdated !== remote.updated;

    if (remoteChanged && !localChanged) {
      await applyLocal(remote.tree, remote.blobs);
      writeBaseline(hashState(remote.tree, remote.blobs), remote.updated);
      const st = { state: 'pulled', at: Date.now() };
      notify(st); return st;
    }
    if (localChanged && !remoteChanged) {
      const res = await writeRemote(local.tree, local.blobs);
      if (!res.ok) throw new Error(res.error);
      writeBaseline(local.hash, res.updated);
      const st = { state: 'synced', at: Date.now(), direction: 'push' };
      notify(st); return st;
    }
    if (localChanged && remoteChanged) {
      const merged = mergeStates(local, remote);
      await applyLocal(merged.tree, merged.blobs);
      const res = await writeRemote(merged.tree, merged.blobs);
      if (!res.ok) throw new Error(res.error);
      writeBaseline(hashState(merged.tree, merged.blobs), res.updated);
      const st = { state: 'merged', at: Date.now(), conflicts: true };
      notify(st); return st;
    }

    const st = { state: 'idle', at: Date.now() };
    notify(st); return st;
  } catch (e) {
    const st = { state: 'error', at: Date.now(), error: (e && e.message) || 'sync failed' };
    notify(st); return st;
  }
}
