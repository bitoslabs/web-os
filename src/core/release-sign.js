'use strict';
/* ============================================================================
   BITOS WEB / RELEASE MANIFEST SIGNATURES
   A publisher signs the canonical release manifest — identity, app ID, version,
   payload digest, permissions, and minimum API — with Ed25519. The installer
   verifies it before activation, binding the exact bytes to one version. This
   proves integrity against the embedded signer; a trusted-key registry that
   maps publishers to keys arrives with Nostr (APP-13/14).
   ========================================================================== */
import { canonicalJson, utf8Bytes } from './package.js';

export function releaseManifest(manifest, digest, publisherKey) {
  return {
    schema: 1,
    publisherKey: publisherKey || 'local',
    appId: manifest.id,
    version: manifest.version,
    digest,
    permissions: manifest.permissions || [],
    minBitosApi: manifest.minBitosApi || 1,
  };
}
export function releaseBytes(m) { return utf8Bytes(canonicalJson(m)); }

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

export async function signRelease(manifest, digest, publisherKey, privateKey) {
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, releaseBytes(releaseManifest(manifest, digest, publisherKey)));
  return bytesToB64(new Uint8Array(sig));
}

/* release = { publisherKey?, publicKey, signature }.
 * trustedKeys (optional) maps a publisherKey to allowed public keys; when
 * supplied, a signature from an unlisted key is `untrusted` and rejected. */
export async function verifyRelease(manifest, digest, release, trustedKeys) {
  if (!release || !release.publicKey || !release.signature) return { ok: false, status: 'missing', reason: 'no release signature' };
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle || typeof subtle.importKey !== 'function') return { ok: false, status: 'unsupported', reason: 'Ed25519 is unavailable here' };
  try {
    const key = await subtle.importKey('raw', b64ToBytes(release.publicKey), { name: 'Ed25519' }, false, ['verify']);
    const msg = releaseBytes(releaseManifest(manifest, digest, release.publisherKey));
    const ok = await subtle.verify({ name: 'Ed25519' }, key, b64ToBytes(release.signature), msg);
    if (!ok) return { ok: false, status: 'invalid', reason: 'release signature does not match' };
    if (trustedKeys) {
      const list = trustedKeys[release.publisherKey];
      if (!Array.isArray(list) || !list.includes(release.publicKey))
        return { ok: false, status: 'untrusted', reason: 'signer is not a trusted key for ' + release.publisherKey };
      return { ok: true, status: 'verified', trusted: true, signer: release.publicKey };
    }
    return { ok: true, status: 'verified', trusted: false, signer: release.publicKey };
  } catch (e) {
    return { ok: false, status: 'invalid', reason: String((e && e.message) || e) };
  }
}
