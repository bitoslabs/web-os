'use strict';
/* ============================================================================
   BITOS WEB / PACKAGE FORMAT v1
   Canonical JSON container validation and hashing. Dependency-free and usable
   from the browser and from Node scripts, so the same fixtures pass or fail in
   both. Spec: docs/PACKAGE_FORMAT.md. Identity is bound elsewhere, by a signed
   release and the package digest; this module never trusts self-asserted facts.
   ========================================================================== */

export const PACKAGE_FORMAT = 'bitos-app';
export const PACKAGE_VERSION = 1;
export const API_VERSION = 1;

export const LIMITS = Object.freeze({
  maxPackageBytes: 512 * 1024,
  maxManifestBytes: 64 * 1024,
  maxFiles: 64,
  maxFileBytes: 128 * 1024,
  maxPathLength: 200,
});

export const PACKAGE_PERMISSIONS = Object.freeze(['app.storage', 'app.window']);
const BLOCKED_EXT = /\.(wasm|node|so|dll|dylib|exe|bin)$/i;

const APP_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const PATH_RE = /^[A-Za-z0-9._/-]+$/;
const HEX64_RE = /^[0-9a-f]{64}$/;

/* ================= canonical JSON ================= */
function sortValue(v) {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === 'object') {
    const out = {};
    Object.keys(v).sort().forEach(k => { out[k] = sortValue(v[k]); });
    return out;
  }
  return v;
}
export function canonicalJson(value) { return JSON.stringify(sortValue(value)); }

/* The signed payload excludes the release envelope, so a publisher can sign a
 * digest and then attach `release` without changing that digest. */
export function canonicalPayload(pkg) {
  return canonicalJson({ format: pkg && pkg.format, version: pkg && pkg.version, manifest: pkg && pkg.manifest, files: pkg && pkg.files });
}
export function payloadDigest(pkg) { return sha256Hex(utf8Bytes(canonicalPayload(pkg))); }

/* ================= hashing ================= */
const enc = new TextEncoder();
export function utf8Bytes(text) { return enc.encode(text); }
export function base64Bytes(data) {
  let bin;
  if (typeof atob === 'function') bin = atob(data);
  else bin = Buffer.from(data, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesForFile(file) {
  if (!file || typeof file.data !== 'string') return null;
  if (file.encoding === 'utf8') return utf8Bytes(file.data);
  if (file.encoding === 'base64') return base64Bytes(file.data);
  return null;
}
export async function sha256Hex(bytes) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error('SHA-256 is unavailable in this environment');
  const buf = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function sha256File(file) { return sha256Hex(bytesForFile(file)); }

/* ================= paths ================= */
export function pathError(p) {
  if (typeof p !== 'string' || !p.length) return 'E_PATH';
  if (p.length > LIMITS.maxPathLength) return 'E_PATH';
  if (p.startsWith('/') || p.includes('\\') || p.includes('\0')) return 'E_PATH';
  if (/^[A-Za-z]:/.test(p)) return 'E_PATH';
  if (!PATH_RE.test(p)) return 'E_PATH';
  const segs = p.split('/');
  if (segs.some(s => s === '' || s === '.' || s === '..')) return 'E_PATH';
  if (BLOCKED_EXT.test(p)) return 'E_PAYLOAD';
  return null;
}

/* ================= validate ================= */
function manifestErrors(m) {
  const errors = [];
  const add = (code, message, path) => errors.push({ code, message, path });
  if (!m || typeof m !== 'object' || Array.isArray(m)) { add('E_MANIFEST', 'manifest must be an object'); return errors; }
  if (m.schema !== 1) add('E_MANIFEST', 'manifest schema must be 1');
  if (!APP_ID_RE.test(m.id || '')) add('E_ID', 'id must be lowercase kebab-case (1-64)');
  if (!SEMVER_RE.test(m.version || '')) add('E_SEMVER', 'version must be MAJOR.MINOR.PATCH');
  if (!m.name || typeof m.name !== 'string' || m.name.length > 64) add('E_MANIFEST', 'name is required (max 64)');
  if (m.minBitosApi != null && !(Number.isInteger(m.minBitosApi) && m.minBitosApi <= API_VERSION)) add('E_API', 'minBitosApi unsupported (max ' + API_VERSION + ')');
  const perms = m.permissions == null ? [] : m.permissions;
  if (!Array.isArray(perms) || perms.some(p => !PACKAGE_PERMISSIONS.includes(p))) add('E_PERMISSION', 'unknown permission requested');
  if (!m.files || typeof m.files !== 'object' || Array.isArray(m.files)) add('E_MANIFEST', 'manifest.files must be an object');
  return errors;
}

export async function validatePackage(pkg, opts) {
  opts = opts || {};
  const errors = [];
  const add = (code, message, path) => errors.push({ code, message, path });
  const finish = async () => {
    if (errors.length) return { ok: false, errors };
    const digest = await payloadDigest(pkg);
    return { ok: true, errors: [], manifest: pkg.manifest, digest };
  };
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) { add('E_FORMAT', 'package must be an object'); return { ok: false, errors }; }
  if (pkg.format !== PACKAGE_FORMAT) add('E_FORMAT', 'format must be "' + PACKAGE_FORMAT + '"');
  if (pkg.version !== PACKAGE_VERSION) add('E_VERSION', 'package version must be ' + PACKAGE_VERSION);
  errors.push(...manifestErrors(pkg.manifest));
  if (errors.length) return { ok: false, errors };
  const m = pkg.manifest;
  const files = pkg.files;
  if (pkg.files == null || typeof pkg.files !== 'object' || Array.isArray(pkg.files)) {
    add('E_MANIFEST', 'files must be an object');
    return { ok: false, errors };
  }
  if (manifestSize(m) > LIMITS.maxManifestBytes) add('E_LIMIT', 'manifest exceeds ' + LIMITS.maxManifestBytes + ' bytes');
  if (canonicalJson(pkg).length > LIMITS.maxPackageBytes) add('E_LIMIT', 'package exceeds ' + LIMITS.maxPackageBytes + ' bytes');

  const listed = Object.keys(m.files);
  const present = Object.keys(files);
  if (listed.length > LIMITS.maxFiles) add('E_LIMIT', 'more than ' + LIMITS.maxFiles + ' files');
  const normalized = new Set();
  for (const p of listed) {
    const pe = pathError(p);
    if (pe) add(pe, 'invalid path', p);
    /* Case-insensitive and NFC-normalized collisions break case-insensitive
     * filesystems and identity even though JSON keys are unique. */
    const key = p.normalize('NFC').toLowerCase();
    if (normalized.has(key)) add('E_DUPLICATE', 'path collides after normalization', p);
    else normalized.add(key);
  }
  for (const p of present) {
    const pe = pathError(p);
    if (pe) add(pe, 'invalid path', p);
  }
  const listedSet = new Set(listed), presentSet = new Set(present);
  for (const p of listed) if (!presentSet.has(p)) add('E_FILE_MISSING', 'listed file is missing', p);
  for (const p of present) if (!listedSet.has(p)) add('E_FILE_UNLISTED', 'file is not listed', p);

  for (const p of present) {
    if (!listedSet.has(p)) continue;
    const file = files[p];
    if (!file || typeof file !== 'object') { add('E_ENCODING', 'file entry must be an object', p); continue; }
    if (file.encoding !== 'utf8' && file.encoding !== 'base64') { add('E_ENCODING', 'encoding must be utf8 or base64', p); continue; }
    const bytes = bytesForFile(file);
    if (bytes == null) { add('E_ENCODING', 'file data must be a string', p); continue; }
    if (bytes.length > LIMITS.maxFileBytes) { add('E_LIMIT', 'file exceeds ' + LIMITS.maxFileBytes + ' bytes', p); continue; }
    const want = m.files[p];
    if (typeof want !== 'string' || !/^sha256-[0-9a-f]{64}$/.test(want)) { add('E_MANIFEST', 'invalid file digest', p); continue; }
    const got = 'sha256-' + await sha256Hex(bytes);
    if (got !== want) add('E_FILE_HASH', 'file hash mismatch', p);
  }

  if (m.entry == null || !listedSet.has(m.entry)) add('E_ENTRY', 'entry must list a packaged file', m.entry);
  if (m.icon != null && !listedSet.has(m.icon)) add('E_ENTRY', 'icon must list a packaged file', m.icon);

  if (errors.length) return { ok: false, errors };
  return finish();
}

function manifestSize(m) {
  try { return canonicalJson(m).length; } catch (e) { return Infinity; }
}

/* Convenience for callers that only need a boolean and a first error. */
export async function packageIsValid(pkg) {
  const r = await validatePackage(pkg);
  return r.ok ? r : Object.assign(r, { first: r.errors[0] });
}

export function isHex64(v) { return HEX64_RE.test(v); }
