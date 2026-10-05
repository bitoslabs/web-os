#!/usr/bin/env node
/* Fixtures for the simulated home filesystem sync (src/core/filesync.js).
 * Runs under node with a localStorage stub and the in-memory IndexedDB
 * fallback, so push / restore / merge are exercised without a browser.
 * Usage: node scripts/test-filesync.mjs */
import { idbGetIn, idbPutIn, idbDelIn } from '../src/core/idb.js';
import {
  syncFilesOnLogin, filesSyncConfig, configureFilesSync, filesSyncStatus,
  hashState, stableStringify, mergeStates,
} from '../src/core/filesync.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error('FAIL ' + name); } };

/* localStorage stub: filesync treats an existing localStorage as authoritative,
   so a removed key stays gone (no stale in-memory mirror). */
const memLS = new Map();
globalThis.localStorage = {
  getItem: k => (memLS.has(k) ? memLS.get(k) : null),
  setItem: (k, v) => { memLS.set(k, String(v)); },
  removeItem: k => { memLS.delete(k); },
  clear: () => memLS.clear(),
};

const bytes = v => [...(v || new Uint8Array(0))];
const tree = () => JSON.parse(memLS.get('bitos.ui.fs.v1'));

/* --- config default and toggle -------------------------------------------- */
ok(filesSyncConfig().enabled === true, 'sync is enabled by default');
ok(configureFilesSync({ enabled: false }).enabled === false, 'configure turns sync off');
configureFilesSync({ enabled: true });

/* --- empty home with no remote is a no-op --------------------------------- */
memLS.clear();
await idbDelIn('sync', 'home');
ok((await syncFilesOnLogin()).state === 'idle', 'empty home with no remote does nothing');
ok((await idbGetIn('sync', 'home')) == null, 'no remote record is created for an empty home');

/* --- first push backs up the tree and blobs ------------------------------- */
memLS.set('bitos.ui.fs.v1', JSON.stringify({ f: { 'a.txt': 'hi' }, d: ['Documents'] }));
await idbPutIn('files', 'img.bin', new Uint8Array([7, 8, 9]));
let st = await syncFilesOnLogin();
ok(st.state === 'synced' && st.direction === 'push', 'local home is pushed to the simulated remote');
let rec = await idbGetIn('sync', 'home');
ok(rec && rec.tree.f['a.txt'] === 'hi', 'remote holds the tree');
ok(rec.blobs['img.bin'] && bytes(rec.blobs['img.bin']).join(',') === '7,8,9', 'remote holds the blob bytes');

/* --- unchanged home does not re-push -------------------------------------- */
ok((await syncFilesOnLogin()).state === 'idle', 'unchanged home does not re-push');

/* --- new device: empty local restores from the remote --------------------- */
memLS.delete('bitos.ui.fs.v1');
memLS.delete('bitos.files.sync.state');
await idbDelIn('files', 'img.bin');
st = await syncFilesOnLogin();
ok(st.state === 'pulled', 'empty local home restores from the remote');
ok(tree().f['a.txt'] === 'hi', 'tree restored into localStorage');
ok(bytes(await idbGetIn('files', 'img.bin')).join(',') === '7,8,9', 'blob restored into IndexedDB');

/* --- remote-only change is pulled ----------------------------------------- */
let r = await idbGetIn('sync', 'home');
await idbPutIn('sync', 'home', { ...r, updated: r.updated + 1000, tree: { f: { 'a.txt': 'hi', 'remote.txt': 'from remote' }, d: ['Documents'] } });
st = await syncFilesOnLogin();
ok(st.state === 'pulled', 'remote-only change is pulled');
ok(tree().f['remote.txt'] === 'from remote', 'pulled file is applied locally');

/* --- divergent local + remote changes merge ------------------------------- */
const localTree = tree();
localTree.f['local.txt'] = 'from local';
memLS.set('bitos.ui.fs.v1', JSON.stringify(localTree));
r = await idbGetIn('sync', 'home');
await idbPutIn('sync', 'home', { ...r, updated: r.updated + 1000, tree: { f: { 'a.txt': 'hi', 'remote2.txt': 'new remote' }, d: ['Documents'] } });
st = await syncFilesOnLogin();
ok(st.state === 'merged', 'divergent local and remote are merged');
ok(tree().f['local.txt'] === 'from local' && tree().f['remote2.txt'] === 'new remote', 'merge keeps both sides locally');
rec = await idbGetIn('sync', 'home');
ok(rec.tree.f['local.txt'] === 'from local' && rec.tree.f['remote2.txt'] === 'new remote', 'merged result is pushed to the remote');

/* --- disabled sync is a no-op --------------------------------------------- */
configureFilesSync({ enabled: false });
const remoteBefore = await idbGetIn('sync', 'home');
ok((await syncFilesOnLogin()).state === 'off', 'disabled sync reports off');
const remoteAfter = await idbGetIn('sync', 'home');
ok(remoteAfter.updated === remoteBefore.updated, 'disabled sync leaves the remote untouched');
ok(filesSyncStatus().state === 'off', 'status reflects the disabled config');
configureFilesSync({ enabled: true });

/* --- pure helpers --------------------------------------------------------- */
ok(hashState({ f: { a: '1' } }, {}) === hashState({ f: { a: '1' } }, {}), 'hash is stable across calls');
ok(hashState({ f: { a: '1' } }, {}) !== hashState({ f: { a: '2' } }, {}), 'hash changes with tree content');
ok(hashState({ f: {} }, { b: new Uint8Array([1]) }) !== hashState({ f: {} }, { b: new Uint8Array([2]) }), 'hash changes with blob content');
ok(stableStringify({ b: 1, a: 2 }) === stableStringify({ a: 2, b: 1 }), 'stable stringify ignores key order');
const merged = mergeStates({ tree: { f: { a: 'local' }, d: ['x'] }, blobs: {} }, { tree: { f: { a: 'remote', b: 'r' }, d: ['y'] }, blobs: {} });
ok(merged.tree.f.a === 'local' && merged.tree.f.b === 'r', 'merge prefers the local value on conflict and keeps both paths');
ok(merged.tree.d.includes('x') && merged.tree.d.includes('y'), 'merge unions directories');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
