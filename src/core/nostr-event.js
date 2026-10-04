'use strict';
/* ============================================================================
   BITOS WEB / NOSTR LISTING EVENTS
   Structural handling for NIP-01 events and a NIP-89-style app listing. Event
   IDs are the real NIP-01 hash and are recomputed on every read, so tampering
   is detected without trusting the relay. Signature verification needs
   secp256k1 Schnorr (BIP-340), which no dependency here provides, so it is a
   pluggable verifier: absent a verifier the result is `unsupported`, never
   silently trusted. Relay discovery and a verifier are APP-13.
   ========================================================================== */
import { sha256Hex, utf8Bytes, PACKAGE_PERMISSIONS } from './package.js';

export const LISTING_KIND = 31990;   /* parameterized replaceable app listing */

/* NIP-01 canonical serialization: [0, pubkey, created_at, kind, tags, content]. */
export function serializeEvent(ev) {
  return JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags || [], ev.content || '']);
}
export function eventId(ev) { return sha256Hex(utf8Bytes(serializeEvent(ev))); }

const HEX64 = /^[0-9a-f]{64}$/;
const APP_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export async function validateEvent(ev) {
  const errors = [];
  if (!ev || typeof ev !== 'object') return { ok: false, errors: ['not an object'] };
  if (!HEX64.test(ev.pubkey || '')) errors.push('pubkey must be 64 lowercase hex');
  if (!Number.isInteger(ev.created_at)) errors.push('created_at must be an integer');
  if (!Number.isInteger(ev.kind)) errors.push('kind must be an integer');
  if (!Array.isArray(ev.tags) || ev.tags.some(t => !Array.isArray(t) || t.some(x => typeof x !== 'string'))) errors.push('tags must be arrays of strings');
  if (typeof ev.content !== 'string') errors.push('content must be a string');
  if (errors.length) return { ok: false, errors };
  const hex = await eventId(ev);
  if (ev.id != null && ev.id !== hex) return { ok: false, errors: ['id does not match the event hash'] };
  return { ok: true, hex, errors: [] };
}

/* verifier(ev, idHex) -> truthy when the BIP-340 signature is valid. */
export async function verifyEvent(ev, verifier) {
  const check = await validateEvent(ev);
  if (!check.ok) return { ok: false, status: 'invalid', reason: check.errors[0], id: check.hex || '' };
  if (typeof verifier !== 'function') return { ok: false, status: 'unsupported', reason: 'no secp256k1 verifier available', id: check.hex };
  try {
    const ok = await verifier(ev, check.hex);
    return ok ? { ok: true, status: 'verified', id: check.hex } : { ok: false, status: 'invalid', reason: 'signature does not verify', id: check.hex };
  } catch (e) {
    return { ok: false, status: 'invalid', reason: String((e && e.message) || e), id: check.hex };
  }
}

/* Build an unsigned listing event for a release (publisher tooling). */
export function buildListingEvent(fields) {
  const content = JSON.stringify({
    appId: fields.appId, version: fields.version, digest: fields.digest || '', name: fields.name,
    permissions: fields.permissions || [], minBitosApi: fields.minBitosApi || 1,
    releaseKey: fields.releaseKey || '', entry: fields.entry || 'index.html', icon: fields.icon || 'grid',
    packageUrl: fields.packageUrl || '', summary: fields.summary || '',
  });
  return {
    pubkey: fields.publisherKey,
    created_at: fields.createdAt || Math.floor(Date.now() / 1000),
    kind: LISTING_KIND,
    tags: [['d', fields.appId], ['version', fields.version]],
    content,
  };
}

function tag(tags, name) {
  const t = (tags || []).find(x => x[0] === name);
  return t ? t[1] : null;
}

/* Map a listing event to the descriptor fields the installer uses, or errors. */
export function parseListingEvent(ev) {
  const errors = [];
  if (!ev || ev.kind !== LISTING_KIND) return { ok: false, errors: ['not a listing event'] };
  let meta = {};
  try { meta = ev.content ? JSON.parse(ev.content) : {}; } catch (e) { errors.push('content is not JSON'); }
  const appId = tag(ev.tags, 'd') || meta.appId;
  if (!APP_ID.test(appId || '')) errors.push('appId (d tag or content) must be lowercase kebab-case');
  if (!SEMVER.test(meta.version || '')) errors.push('version must be MAJOR.MINOR.PATCH');
  if (meta.digest != null && !/^[0-9a-f]{64}$/.test(String(meta.digest))) errors.push('digest must be 64 lowercase hex');
  const perms = meta.permissions == null ? [] : meta.permissions;
  if (!Array.isArray(perms) || perms.some(p => !PACKAGE_PERMISSIONS.includes(p))) errors.push('unknown permission');
  if (meta.minBitosApi != null && !(Number.isInteger(meta.minBitosApi) && meta.minBitosApi <= 1)) errors.push('minBitosApi unsupported');
  if (!meta.name || String(meta.name).length > 64) errors.push('name is required (max 64)');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    descriptor: {
      schema: 1, publisherKey: ev.pubkey, appId, version: meta.version, name: String(meta.name),
      digest: meta.digest || '', permissions: perms, minBitosApi: meta.minBitosApi || 1,
      entry: meta.entry || 'index.html', icon: meta.icon || 'grid',
      packageUrl: meta.packageUrl || '', summary: meta.summary || '',
      releaseKey: typeof meta.releaseKey === 'string' ? meta.releaseKey : '',
    },
  };
}
