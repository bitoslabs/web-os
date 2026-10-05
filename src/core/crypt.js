'use strict';
/* ============================================================================
   BITOS WEB / FILE ENCRYPTION
   WebCrypto AES-256-GCM envelope encryption and a PBKDF2 key-wrap for files
   that leave the device (Blossom uploads). A random per-file data key encrypts
   the bytes; the data key is itself encrypted with a passphrase-derived KEK, so
   a manifest plus the passphrase is all a reader needs. No secret ever leaves
   this module. Dependency-free; runs in the browser and in Node's WebCrypto.
   ========================================================================== */
import { utf8Bytes } from './package.js';

export const CRYPT_VERSION = 1;
export const CRYPT_ALG = 'A256GCM';
export const PBKDF2_DEFAULT_ITERATIONS = 310000;

const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_REV = (() => { const m = new Uint8Array(128); for (let i = 0; i < B64.length; i++) m[B64.charCodeAt(i)] = i; return m; })();

function subtle() {
  const s = globalThis.crypto && globalThis.crypto.subtle;
  if (!s) throw { code: 'UNAVAILABLE', message: 'WebCrypto is unavailable' };
  return s;
}
function fail(code, message) { throw { code, message }; }

export function randomBytes(n) {
  const out = new Uint8Array(n);
  if (!(globalThis.crypto && globalThis.crypto.getRandomValues)) fail('UNAVAILABLE', 'secure randomness is unavailable');
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function bytesToBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    out += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    out += b2 === undefined ? '=' : B64[b2 & 63];
  }
  return out;
}

export function base64ToBytes(text) {
  const s = String(text || '').replace(/=+$/, '');
  const out = new Uint8Array((s.length * 3) >> 2);
  let o = 0, acc = 0, bits = 0;
  for (const ch of s) {
    const v = B64_REV[ch.charCodeAt(0)];
    if (v === undefined) fail('INVALID_ARGUMENT', 'invalid base64');
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 0xff; }
  }
  return out.subarray(0, o);
}

export function bytesToHex(bytes) { return [...bytes].map(b => b.toString(16).padStart(2, '0')).join(''); }

export function hexToBytes(hex) {
  const h = String(hex || '');
  if (h.length % 2 || !/^[0-9a-f]*$/i.test(h)) fail('INVALID_ARGUMENT', 'invalid hex');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/* base64url without padding — the Blossom/Nostr authorization header encoding. */
export function base64UrlFromBytes(bytes) { return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export function base64UrlFromUtf8(text) { return base64UrlFromBytes(utf8Bytes(text)); }

export function generateSalt() { return bytesToBase64(randomBytes(SALT_BYTES)); }
export function generateFileKey() { return randomBytes(KEY_BYTES); }

/* Passphrase -> 32-byte key-encryption key. The salt is stored with the file. */
export async function deriveKek(passphrase, saltB64, iterations = PBKDF2_DEFAULT_ITERATIONS) {
  if (typeof passphrase !== 'string' || !passphrase) fail('INVALID_ARGUMENT', 'passphrase required');
  const salt = base64ToBytes(saltB64);
  if (!salt.length) fail('INVALID_ARGUMENT', 'salt required');
  const base = await subtle().importKey('raw', utf8Bytes(passphrase), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, KEY_BYTES * 8);
  return new Uint8Array(bits);
}

async function importKey(raw, usage) {
  if (!(raw instanceof Uint8Array) || raw.length !== KEY_BYTES) fail('INVALID_ARGUMENT', 'key must be 32 bytes');
  return subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, [usage]);
}

export async function encrypt(plaintext, rawKey) {
  if (!(plaintext instanceof Uint8Array)) fail('INVALID_ARGUMENT', 'plaintext must be bytes');
  const key = await importKey(rawKey, 'encrypt');
  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return { v: CRYPT_VERSION, alg: CRYPT_ALG, iv: bytesToBase64(iv), ct: bytesToBase64(ct) };
}

export async function decrypt(envelope, rawKey) {
  if (!envelope || envelope.v !== CRYPT_VERSION || envelope.alg !== CRYPT_ALG) fail('INVALID_ARGUMENT', 'unsupported envelope');
  const key = await importKey(rawKey, 'decrypt');
  const iv = base64ToBytes(envelope.iv), ct = base64ToBytes(envelope.ct);
  if (!iv.length || !ct.length) fail('INVALID_ARGUMENT', 'malformed envelope');
  try { return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv }, key, ct)); }
  catch (e) { fail('INVALID_ARGUMENT', 'decryption failed — wrong passphrase or corrupt data'); }
}

/* Wrapping reuses the same AEAD: the file key is the plaintext. */
export const wrapKey = encrypt;
export const unwrapKey = decrypt;
