'use strict';
/* ============================================================================
   BITOS WEB / PUBLISHER TRUST REGISTRY (APP-14 groundwork)
   Derive a publisher -> release-signer binding from listings whose NIP-01
   signature already verified. Only verified events contribute, so the binding
   is as strong as the underlying Schnorr check. Bindings persist in the `trust`
   store and merge over the curated base map. This is identity binding only; it
   does not grant an app any capability.
   ========================================================================== */
import { idbPutIn, idbAllIn } from './idb.js';

const HEX64 = /^[0-9a-f]{64}$/;
const B64_32 = /^[A-Za-z0-9+/]{43}=$/;   /* base64 of a 32-byte Ed25519 key */

export function isReleaseKey(v) { return typeof v === 'string' && B64_32.test(v); }

/* candidates come from collectListingMessages/fetchListings. */
export function deriveTrustBindings(candidates) {
  const out = [];
  for (const c of candidates || []) {
    if (!c || c.status !== 'verified') continue;
    const pk = c.descriptor && c.descriptor.publisherKey;
    const rk = c.descriptor && c.descriptor.releaseKey;
    if (HEX64.test(pk || '') && isReleaseKey(rk)) out.push({ publisherKey: pk, releaseKey: rk });
  }
  return out;
}

export async function loadTrustMap() {
  const out = {};
  const rows = await idbAllIn('trust').catch(() => []);
  for (const [k, v] of rows) if (Array.isArray(v)) out[k] = v.slice();
  return out;
}

export async function saveTrustBindings(bindings) {
  const map = await loadTrustMap();
  for (const b of bindings || []) {
    if (!HEX64.test(b.publisherKey || '') || !isReleaseKey(b.releaseKey)) continue;
    const set = new Set(map[b.publisherKey] || []);
    set.add(b.releaseKey);
    map[b.publisherKey] = [...set];
    await idbPutIn('trust', b.publisherKey, map[b.publisherKey]).catch(() => { });
  }
  return map;
}

/* Base curated map plus derived bindings; a signer trusted by either counts. */
export function mergeTrust(base, derived) {
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(derived || {})) out[k] = [...new Set([...(out[k] || []), ...v])];
  return out;
}
