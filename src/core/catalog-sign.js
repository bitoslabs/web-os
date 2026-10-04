'use strict';
/* ============================================================================
   BITOS WEB / CATALOG SNAPSHOT SIGNATURES
   Authenticate a curated catalog snapshot with an Ed25519 signature verified
   through WebCrypto. The signed message is the canonical `{ meta, entries }`
   JSON, so any change to a listing invalidates the signature. Verification
   needs no dependency and works in Node and modern browsers; when Ed25519 is
   unavailable the result is reported as `unsupported` rather than trusted.
   ========================================================================== */
import { canonicalJson, sha256Hex, utf8Bytes } from './package.js';

export function catalogBytes(entries, meta) {
  return utf8Bytes(canonicalJson({ meta: meta || {}, entries: entries || [] }));
}
export function catalogDigest(entries, meta) { return sha256Hex(catalogBytes(entries, meta)); }

function b64ToBytes(b64) {
  let bin;
  if (typeof atob === 'function') bin = atob(b64);
  else bin = Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  if (typeof btoa === 'function') return btoa(s);
  return Buffer.from(s, 'binary').toString('base64');
}

/* Sign with an Ed25519 CryptoKey (build tooling only). */
export async function signCatalog(entries, meta, privateKey) {
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, catalogBytes(entries, meta));
  return bytesToB64(new Uint8Array(sig));
}

/* Returns { ok, status: verified|invalid|unsupported|missing, reason?, digest? }. */
export async function verifyCatalog(entries, meta, signer) {
  if (!signer || !signer.publicKey || !signer.signature) return { ok: false, status: 'missing', reason: 'no snapshot signature' };
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle || typeof subtle.importKey !== 'function') return { ok: false, status: 'unsupported', reason: 'Ed25519 is unavailable here' };
  try {
    const key = await subtle.importKey('raw', b64ToBytes(signer.publicKey), { name: 'Ed25519' }, false, ['verify']);
    const ok = await subtle.verify({ name: 'Ed25519' }, key, b64ToBytes(signer.signature), catalogBytes(entries, meta));
    if (!ok) return { ok: false, status: 'invalid', reason: 'signature does not match the snapshot' };
    return { ok: true, status: 'verified', digest: await catalogDigest(entries, meta) };
  } catch (e) {
    return { ok: false, status: 'invalid', reason: String((e && e.message) || e) };
  }
}
