'use strict';
/* ============================================================================
   BITOS WEB / APP ECOSYSTEM RECORDS
   Persistent installation, grant, and app-data records for installable apps,
   modeled on docs/ECOSYSTEM_DATA_MODEL.md. This is the preview-grade store: it
   uses localStorage for metadata and does not yet hold package bytes or run
   installed code. Built-in programs are not persisted here; they stay in the
   registry and are treated as system-managed.
   ========================================================================== */
import { toast } from './ui.js';
import { idbPut, idbDel, idbAll, idbReadState, idbWriteState, idbPutIn, idbAllIn, idbDelIn } from './idb.js';

export const ECOSYSTEM_KEY = 'bitos.apps.v1';
export const ECOSYSTEM_SCHEMA = 1;
export const CURRENT_API = 1;
export const DATA_QUOTA = 64 * 1024;
export const PACKAGE_MAX = 600 * 1024;

/* Versioned host capabilities an app may request. New names appear here first. */
export const PERMISSIONS = Object.freeze(['app.storage', 'app.window']);
export const PERMISSION_LABELS = Object.freeze({
  'app.storage': 'private storage — quota-limited app data',
  'app.window': 'window controls — title and size',
});

const APP_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const HEX64_RE = /^[0-9a-f]{64}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const ENTRY_RE = /^(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]+$/;
const HTTPS_RE = /^https:\/\/[^\s]+$/;
export const CONTENT_MAX = 256 * 1024;

/* A runtime source is either an inline document or a safe entry URL. */
function safeEntryUrl(v) { return ENTRY_RE.test(v) || HTTPS_RE.test(v); }

const listeners = new Set();
let db = null;
let hydrated = false;   /* metadata loaded from IndexedDB */
let writing = null;     /* serializes IndexedDB writes */

function blank() { return { schema: ECOSYSTEM_SCHEMA, installs: {}, grants: {}, data: {}, packages: {} }; }

function read() {
  let raw;
  try { raw = JSON.parse(localStorage.getItem(ECOSYSTEM_KEY)); } catch (e) { raw = null; }
  if (!raw || typeof raw !== 'object') return blank();
  if (raw.schema === ECOSYSTEM_SCHEMA && raw.installs && typeof raw.installs === 'object') {
    return { schema: ECOSYSTEM_SCHEMA, installs: raw.installs, grants: raw.grants || {}, data: raw.data || {}, packages: raw.packages || {} };
  }
  /* Unknown schema: keep only records with a recognizable shape. */
  const out = blank();
  Object.assign(out.installs, raw.installs || {});
  Object.assign(out.grants, raw.grants || {});
  Object.assign(out.data, raw.data || {});
  Object.assign(out.packages, raw.packages || {});
  return out;
}

function ensure() { if (!db) db = read(); return db; }

function persist() {
  let ok = true;
  try { localStorage.setItem(ECOSYSTEM_KEY, JSON.stringify(db)); }
  catch (e) { toast('could not save app state — storage is full or blocked', 'err'); ok = false; }
  /* Once hydrated, IndexedDB is authoritative; localStorage is a mirror. */
  if (hydrated) {
    writing = (writing || Promise.resolve())
      .then(() => idbWriteState({ installs: db.installs, grants: db.grants, data: db.data }))
      .catch(() => toast('could not persist app state to the local database', 'err'));
  }
  return ok;
}

function emit(change) { listeners.forEach(fn => { try { fn(change); } catch (e) { } }); }

/* Subscribe to install/grant/data changes. Returns an unsubscribe function. */
export function onEcosystemChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/* ================= identity ================= */
export function appKey(publisherKey, appId) { return publisherKey + '/' + appId; }
export function systemKey(appId) { return 'system/' + appId; }
export function isSystemKey(key) { return String(key).startsWith('system/'); }
export function parseKey(key) {
  const i = String(key).indexOf('/');
  return i < 0 ? { publisherKey: 'local', appId: String(key) } : { publisherKey: key.slice(0, i), appId: key.slice(i + 1) };
}
export function publisherLabel(publisherKey) { return publisherKey === 'local' ? 'local — unverified' : publisherKey; }

/* ================= versioning ================= */
function parts(v) { const m = String(v).split('-')[0].split('.'); return [Number(m[0]) || 0, Number(m[1]) || 0, Number(m[2]) || 0]; }
export function compareVersions(a, b) {
  const A = parts(a), B = parts(b);
  for (let i = 0; i < 3; i++) { if (A[i] !== B[i]) return A[i] < B[i] ? -1 : 1; }
  const preA = String(a).includes('-'), preB = String(b).includes('-');
  if (preA !== preB) return preA ? -1 : 1;
  return String(a).localeCompare(String(b));
}
export function isNewer(candidate, current) { return compareVersions(candidate, current) > 0; }

/* ================= validation =================
   Preview-grade descriptor check. Does not verify package bytes or hashes;
   that arrives with the package validator (APP-02). A descriptor is the
   metadata an install record is built from, whether catalog or local file. */
export function validateDescriptor(d) {
  const errors = [];
  if (!d || typeof d !== 'object') return { ok: false, errors: ['not an object'] };
  if (d.schema !== 1) errors.push('schema must be 1');
  if (!APP_ID_RE.test(d.appId || '')) errors.push('appId must be lowercase kebab-case (1–64)');
  if (!SEMVER_RE.test(d.version || '')) errors.push('version must be MAJOR.MINOR.PATCH');
  if (!d.name || String(d.name).length > 64) errors.push('name is required (max 64 characters)');
  const pk = d.publisherKey == null ? 'local' : String(d.publisherKey);
  if (pk !== 'local' && !HEX64_RE.test(pk)) errors.push('publisherKey must be 64 lowercase hex or "local"');
  if (d.minBitosApi != null && !(Number.isInteger(d.minBitosApi) && d.minBitosApi <= CURRENT_API))
    errors.push('minBitosApi is unsupported (max ' + CURRENT_API + ')');
  const perms = d.permissions == null ? [] : d.permissions;
  if (!Array.isArray(perms) || perms.some(p => !PERMISSIONS.includes(p))) errors.push('unknown permission requested');
  if (d.entry != null && !ENTRY_RE.test(d.entry)) errors.push('entry must be a safe relative path');
  if (d.icon != null && !/^[a-z0-9]{1,16}$/i.test(d.icon)) errors.push('icon must be an icon name');
  if (d.entryUrl != null && !safeEntryUrl(String(d.entryUrl))) errors.push('entryUrl must be a safe relative path or https URL');
  if (d.content != null && (typeof d.content !== 'string' || d.content.length > CONTENT_MAX)) errors.push('content must be a string under ' + CONTENT_MAX + ' bytes');
  if (d.packageDigest != null && !HEX64_RE.test(String(d.packageDigest))) errors.push('packageDigest must be 64 lowercase hex');
  return { ok: errors.length === 0, errors };
}

/* ================= installations ================= */
export function listInstalls() {
  const d = ensure();
  return Object.entries(d.installs).map(([key, rec]) => ({ key, ...rec }));
}
export function getInstall(key) {
  const rec = ensure().installs[key];
  return rec ? { key, ...rec } : null;
}
export function findInstall(publisherKey, appId) { return getInstall(appKey(publisherKey, appId)); }

/* The package digest doubles as the installed digest; a descriptor may carry it
 * as `packageDigest` (validated package) or `digest` (catalog tuple). */
function digestOf(desc) { return desc.packageDigest || desc.digest || ''; }

function recordFrom(desc, opts, now) {
  const publisherKey = desc.publisherKey == null ? 'local' : String(desc.publisherKey);
  const dg = digestOf(desc);
  return {
    publisherKey, appId: desc.appId, name: String(desc.name),
    summary: desc.summary || '', icon: desc.icon || 'grid', entry: desc.entry || 'index.html',
    version: desc.version, installedVersion: desc.version, installedDigest: dg,
    previousVersion: null, previousDigest: null,
    permissions: [...(desc.permissions || [])], minBitosApi: desc.minBitosApi || 1,
    packageUrl: desc.packageUrl || '', entryUrl: desc.entryUrl || '', content: desc.content || '',
    packageDigest: dg, releaseVerified: !!desc.releaseVerified, releaseTrusted: !!desc.releaseTrusted, releaseKey: desc.releaseKey || '',
    pinned: !!desc.pinned,
    source: opts.source || 'catalog',
    state: 'installing', installedAt: now, updatedAt: now,
    validation: { ok: true, at: now },
  };
}

export function install(desc, opts) {
  opts = opts || {};
  const v = validateDescriptor(desc);
  if (!v.ok) throw new Error('invalid package — ' + v.errors.join('; '));
  const d = ensure();
  const publisherKey = desc.publisherKey == null ? 'local' : String(desc.publisherKey);
  const key = appKey(publisherKey, desc.appId);
  if (d.installs[key] && d.installs[key].state === 'ready') throw new Error('already installed');
  const now = Date.now();
  const previous = d.installs[key] || null;
  const rec = recordFrom(desc, opts, now);
  if (previous && previous.state === 'ready') {
    rec.installedVersion = desc.version;
    rec.previousVersion = previous.installedVersion;
    rec.previousDigest = previous.installedDigest;
  }
  d.installs[key] = rec;
  const g = {};
  rec.permissions.forEach(p => { g[p] = (d.grants[key] && d.grants[key][p]) || { granted: false, at: now }; });
  d.grants[key] = { ...(d.grants[key] || {}), ...g };
  if (!persist()) { delete d.installs[key]; return null; }
  emit({ type: 'install', key });
  rec.state = 'ready'; rec.updatedAt = Date.now();
  if (!persist()) { rec.state = 'installing'; return null; }
  emit({ type: 'ready', key });
  const done = getInstall(key);
  recordRelease(done);
  return done;
}

export function updateInstall(key, desc, opts) {
  const existing = getInstall(key);
  if (!existing) throw new Error('not installed');
  if (existing.state !== 'ready') throw new Error('app is not ready to update');
  const v = validateDescriptor(desc);
  if (!v.ok) throw new Error('invalid package — ' + v.errors.join('; '));
  const publisherKey = desc.publisherKey == null ? 'local' : String(desc.publisherKey);
  if (appKey(publisherKey, desc.appId) !== key) throw new Error('identity mismatch');
  if (!isNewer(desc.version, existing.installedVersion)) throw new Error('not a newer version');
  const d = ensure();
  const now = Date.now();
  const rec = d.installs[key];
  /* Stage: snapshot so a failed write restores the working version. */
  const before = { rec: JSON.parse(JSON.stringify(rec)), grants: JSON.parse(JSON.stringify(d.grants[key] || {})) };
  rec.previousVersion = existing.installedVersion;
  rec.previousDigest = existing.installedDigest;
  rec.installedVersion = desc.version;
  rec.installedDigest = digestOf(desc) || existing.installedDigest;
  rec.packageDigest = rec.installedDigest;
  rec.name = String(desc.name);
  rec.summary = desc.summary || rec.summary;
  rec.icon = desc.icon || rec.icon;
  rec.entry = desc.entry || rec.entry;
  rec.packageUrl = desc.packageUrl || rec.packageUrl;
  rec.entryUrl = desc.entryUrl || rec.entryUrl;
  rec.content = desc.content || rec.content;
  if (desc.releaseVerified != null) { rec.releaseVerified = !!desc.releaseVerified; rec.releaseTrusted = !!desc.releaseTrusted; rec.releaseKey = desc.releaseKey || ''; }
  rec.permissions = [...new Set([...(existing.permissions || []), ...(desc.permissions || [])])];
  rec.minBitosApi = desc.minBitosApi || rec.minBitosApi;
  rec.source = (opts && opts.source) || rec.source;
  rec.state = 'updating'; rec.updatedAt = now;
  /* Newly requested permissions start denied; existing grants are preserved. */
  const g = d.grants[key] || (d.grants[key] = {});
  rec.permissions.forEach(p => { if (!g[p]) g[p] = { granted: false, at: now }; });
  if (!persist()) { d.installs[key] = before.rec; d.grants[key] = before.grants; throw new Error('could not stage the update'); }
  emit({ type: 'updating', key });
  rec.state = 'ready'; rec.updatedAt = Date.now();
  persist(); emit({ type: 'ready', key });
  const done = getInstall(key);
  recordRelease(done);
  return done;
}

export function rollbackInstall(key) {
  const rec = ensure().installs[key];
  if (!rec || rec.previousVersion == null) throw new Error('nothing to roll back to');
  const now = Date.now();
  const v = rec.installedVersion, dg = rec.installedDigest;
  rec.installedVersion = rec.previousVersion; rec.installedDigest = rec.previousDigest;
  rec.previousVersion = v; rec.previousDigest = dg;
  rec.packageDigest = rec.installedDigest;
  rec.state = 'ready'; rec.updatedAt = now;
  persist(); emit({ type: 'rollback', key });
  const done = getInstall(key);
  recordRelease(done);
  return done;
}

export function uninstall(key, opts) {
  opts = opts || {};
  if (isSystemKey(key)) throw new Error('built-in apps are system managed');
  const d = ensure();
  if (!d.installs[key]) throw new Error('not installed');
  const rec = d.installs[key];
  const digests = [...new Set([rec.packageDigest, rec.previousDigest].filter(Boolean))];
  delete d.installs[key];
  delete d.grants[key];
  if (!opts.keepData) delete d.data[key];
  /* Drop current and rollback bytes only when no other install references them. */
  digests.forEach(dg => removePackage(dg));
  (releaseIndex.get(key) || []).forEach(r => idbDelIn('releases', releaseId(key, r.version, r.digest)).catch(() => { }));
  releaseIndex.delete(key);
  persist(); emit({ type: 'uninstall', key });
}

export function listPinned() { return listInstalls().filter(r => r.pinned && r.state === 'ready'); }
export function setPinned(key, pinned) {
  const rec = ensure().installs[key];
  if (!rec) throw new Error('not installed');
  rec.pinned = !!pinned;
  rec.updatedAt = Date.now();
  persist(); emit({ type: 'pin', key, pinned: rec.pinned });
  return rec.pinned;
}

/* ================= grants ================= */
export function grantsOf(key) { return { ...(ensure().grants[key] || {}) }; }
export function isGranted(key, permission) {
  const g = ensure().grants[key];
  return !!(g && g[permission] && g[permission].granted);
}
export function setGrant(key, permission, granted) {
  if (!PERMISSIONS.includes(permission)) throw new Error('unknown permission: ' + permission);
  const d = ensure();
  (d.grants[key] || (d.grants[key] = {}))[permission] = { granted: !!granted, at: Date.now() };
  persist(); emit({ type: 'grant', key, permission, granted: !!granted });
}
export function revokeGrant(key, permission) { setGrant(key, permission, false); }

/* ================= app data ================= */
export function readAppData(key, dataKey) {
  const ns = ensure().data[key];
  return ns ? ns[dataKey] : undefined;
}
export function listAppDataKeys(key) { return Object.keys(ensure().data[key] || {}); }
export function writeAppData(key, dataKey, value) {
  const d = ensure();
  const ns = d.data[key] || (d.data[key] = {});
  const prev = ns[dataKey];
  ns[dataKey] = value;
  if (JSON.stringify(ns).length > DATA_QUOTA) {
    if (prev === undefined) delete ns[dataKey]; else ns[dataKey] = prev;
    throw new Error('app data quota exceeded');
  }
  persist(); emit({ type: 'data', key });
  return value;
}
export function removeAppData(key, dataKey) {
  const ns = ensure().data[key];
  if (!ns) return;
  delete ns[dataKey];
  persist(); emit({ type: 'data', key });
}
export function dataUsage(key) { return JSON.stringify(ensure().data[key] || {}).length; }
export function clearAppData(key) { delete ensure().data[key]; persist(); emit({ type: 'data', key }); }

/* ================= package cache =================
   Package bytes for validated containers, keyed by package digest, persisted in
   IndexedDB (src/core/idb.js) with an in-memory mirror so the sync preview APIs
   stay simple. Metadata records stay in localStorage for now (APP-03 continues).
   Removing a package is refused while an install references it. */
const packageIndex = new Set();
const packageCache = new Map();

export function putPackage(digest, files, manifest) {
  if (!HEX64_RE.test(String(digest))) throw new Error('invalid package digest');
  if (!files || typeof files !== 'object') throw new Error('invalid package files');
  const payload = { files, manifest: manifest || null, at: Date.now() };
  if (JSON.stringify(payload).length > PACKAGE_MAX) throw new Error('package exceeds the preview storage limit');
  packageIndex.add(digest);
  packageCache.set(digest, payload);
  idbPut(digest, payload).catch(() => toast('could not persist package bytes — they last for this session only', 'err'));
  emit({ type: 'package', digest });
  return digest;
}
export function getPackage(digest) { return packageCache.get(digest) || null; }
export function hasPackage(digest) { return packageIndex.has(digest) || packageCache.has(digest); }
export function removePackage(digest) {
  if (!hasPackage(digest)) return false;
  if (Object.values(ensure().installs).some(r => r.packageDigest === digest)) return false;
  packageIndex.delete(digest);
  packageCache.delete(digest);
  idbDel(digest).catch(() => { });
  emit({ type: 'package', digest });
  return true;
}
export function listPackages() { return [...packageIndex]; }

/* Load install/grant/app-data metadata from IndexedDB. Migrates the older
 * localStorage record on first run, then treats IndexedDB as authoritative.
 * Call after hydratePackages() and before the desktop starts. */
export async function hydrateEcosystem() {
  const local = ensure();
  let state = null;
  try { state = await idbReadState(); } catch (e) { return false; }
  const empty = !state || (!Object.keys(state.installs || {}).length && !Object.keys(state.grants || {}).length && !Object.keys(state.data || {}).length);
  const localHas = !!(local && (Object.keys(local.installs || {}).length || Object.keys(local.grants || {}).length || Object.keys(local.data || {}).length));
  if (empty && localHas) {
    state = { installs: local.installs || {}, grants: local.grants || {}, data: local.data || {} };
    try { await idbWriteState(state); } catch (e) { }
  }
  db = {
    schema: ECOSYSTEM_SCHEMA,
    installs: (state && state.installs) || {},
    grants: (state && state.grants) || {},
    data: (state && state.data) || {},
    packages: {},
  };
  hydrated = true;
  recoverInterrupted();
  try {
    for (const [, rel] of await idbAllIn('releases')) {
      if (!rel || !rel.key) continue;
      const list = releaseIndex.get(rel.key) || [];
      if (!list.some(r => r.version === rel.version && r.digest === rel.digest)) list.push(rel);
      releaseIndex.set(rel.key, list);
    }
  } catch (e) { }
  for (const rec of Object.values(db.installs)) if (rec.state === 'ready') recordRelease(rec);
  return true;
}

/* A write interrupted mid-install/update leaves a non-ready record. Restore the
 * previous version when one exists, else mark the app broken. Only ready
 * installs launch, so recovery never exposes partially verified code. */
function recoverInterrupted() {
  const d = ensure();
  let changed = false;
  for (const rec of Object.values(d.installs)) {
    if (!rec || rec.state === 'ready') continue;
    if (rec.previousVersion != null) {
      const v = rec.installedVersion, dg = rec.installedDigest;
      rec.installedVersion = rec.previousVersion; rec.installedDigest = rec.previousDigest;
      rec.previousVersion = v; rec.previousDigest = dg;
      rec.packageDigest = rec.installedDigest;
      rec.state = 'ready';
    } else {
      rec.state = 'broken';
    }
    rec.updatedAt = Date.now();
    changed = true;
  }
  if (changed) persist();
}

/* Load persisted packages into memory. Call once before the desktop starts;
 * migrates any packages left in the older localStorage record. */
export async function hydratePackages() {
  const d = ensure();
  const legacy = d.packages || null;
  let migrated = false;
  if (legacy) {
    for (const [digest, payload] of Object.entries(legacy)) {
      if (!packageCache.has(digest)) { packageIndex.add(digest); packageCache.set(digest, payload); }
      idbPut(digest, payload).catch(() => { });
      migrated = true;
    }
    delete d.packages;
  }
  try {
    for (const [digest, payload] of await idbAll()) {
      if (!packageIndex.has(digest)) { packageIndex.add(digest); packageCache.set(digest, payload); }
    }
  } catch (e) { /* IndexedDB blocked: keep the in-memory mirror only */ }
  if (migrated) persist();
}

/* ================= release history =================
   One record per installed (version, digest), persisted in the `releases`
   store so the Store can show version history and a rollback target. */
const releaseIndex = new Map();

function releaseId(key, version, digest) { return key + '@' + version + '#' + String(digest || '').slice(0, 16); }

function recordRelease(rec) {
  if (!rec || isSystemKey(rec.key) || !rec.installedVersion) return;
  const rel = {
    key: rec.key, version: rec.installedVersion, digest: rec.installedDigest || '',
    source: rec.source || 'catalog', permissions: [...(rec.permissions || [])], at: Date.now(),
  };
  const list = releaseIndex.get(rec.key) || [];
  if (list.some(r => r.version === rel.version && r.digest === rel.digest)) return;
  list.push(rel);
  releaseIndex.set(rec.key, list);
  idbPutIn('releases', releaseId(rec.key, rel.version, rel.digest), rel).catch(() => { });
}

export function listReleases(key) { return (releaseIndex.get(key) || []).slice().sort((a, b) => b.at - a.at); }

/* ================= diagnostics ================= */
export function ecosystemSnapshot() { return JSON.parse(JSON.stringify(ensure())); }
