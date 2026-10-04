'use strict';
/* ============================================================================
   BITOS WEB / BIP-340 SCHNORR VERIFICATION
   Pure-JS secp256k1 x-only Schnorr verification, validated against the official
   BIP-340 test vectors (see scripts/test-schnorr.mjs). It exists so NIP-01
   events and Nostr listings can be verified without a build step or native
   dependency. This is a preview implementation: it is unaudited and should be
   replaced by a vetted library before device release. Verification only —
   signing is not implemented here.
   ========================================================================== */
import { sha256Bytes, utf8Bytes } from './package.js';

const FIELD = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
const ORDER = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n;
const GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n;

function mod(a, m) { const r = a % m; return r < 0n ? r + m : r; }
function modInv(a, m) {
  let [oldR, r] = [mod(a, m), m];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) { const q = oldR / r; [oldR, r] = [r, oldR - q * r]; [oldS, s] = [s, oldS - q * s]; }
  return mod(oldS, m);
}
function modPow(b, e, m) { b = mod(b, m); let r = 1n; while (e > 0n) { if (e & 1n) r = mod(r * b, m); b = mod(b * b, m); e >>= 1n; } return r; }

/* Affine point ops; null is the point at infinity. */
function add(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.x === b.x && mod(a.y + b.y, FIELD) === 0n) return null;
  const lam = (a.x === b.x && a.y === b.y)
    ? mod(3n * a.x * a.x * modInv(2n * a.y, FIELD), FIELD)
    : mod((b.y - a.y) * modInv(b.x - a.x, FIELD), FIELD);
  const x = mod(lam * lam - a.x - b.x, FIELD);
  return { x, y: mod(lam * (a.x - x) - a.y, FIELD) };
}
function mul(k, p) {
  let r = null, q = p; k = mod(k, ORDER);
  while (k > 0n) { if (k & 1n) r = add(r, q); q = add(q, q); k >>= 1n; }
  return r;
}
function liftX(x) {
  if (x >= FIELD) return null;
  const c = mod(x * x * x + 7n, FIELD);
  const y = modPow(c, (FIELD + 1n) / 4n, FIELD);
  if (mod(y * y, FIELD) !== c) return null;
  return { x, y: y % 2n === 0n ? y : mod(FIELD - y, FIELD) };
}

function hexToBytes(hex) {
  const h = String(hex || '');
  if (h.length % 2 || !/^[0-9a-f]*$/i.test(h)) return null;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToBig(bytes) { let n = 0n; for (const b of bytes) n = (n << 8n) | BigInt(b); return n; }
function bigToBytes(n, len) { const out = new Uint8Array(len); for (let i = len - 1; i >= 0; i--) { out[i] = Number(n & 0xffn); n >>= 8n; } return out; }
function bytesToHex(bytes) { return [...bytes].map(b => b.toString(16).padStart(2, '0')).join(''); }
function concat(...parts) { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; }
function xorBytes(a, b) { const out = new Uint8Array(a.length); for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i]; return out; }

async function taggedHash(tag, msg) {
  const t = await sha256Bytes(utf8Bytes(tag));
  return sha256Bytes(concat(t, t, msg));
}

/* Verify a BIP-340 signature. pubkeyHex/sigHex are hex; msg is bytes. */
export async function verifySchnorr(pubkeyHex, msg, sigHex) {
  const pk = hexToBytes(pubkeyHex);
  const sig = hexToBytes(sigHex);
  if (!pk || pk.length !== 32 || !sig || sig.length !== 64 || !(msg instanceof Uint8Array)) return false;
  const px = bytesToBig(pk);
  const r = bytesToBig(sig.subarray(0, 32));
  const s = bytesToBig(sig.subarray(32, 64));
  if (r >= FIELD || s >= ORDER) return false;
  const P = liftX(px);
  if (!P) return false;
  const e = bytesToBig(await taggedHash('BIP0340/challenge', concat(sig.subarray(0, 32), pk, msg))) % ORDER;
  const R = add(mul(s, { x: GX, y: GY }), mul(ORDER - e, P));
  if (!R || R.y % 2n !== 0n) return false;
  return R.x === r;
}

/* x-only public key (32-byte hex) for a secret key. */
export function xOnlyPubkey(seckeyHex) {
  const sk = hexToBytes(seckeyHex);
  if (!sk || sk.length !== 32) throw new Error('secret key must be 32 bytes');
  const d = bytesToBig(sk);
  if (d === 0n || d >= ORDER) throw new Error('secret key out of range');
  return bytesToHex(bigToBytes(mul(d, { x: GX, y: GY }).x, 32));
}

/* BIP-340 signing. `aux` is 32 bytes of hex (random when omitted). Exported for
 * publisher tooling; it is the riskiest part of this preview module. */
export async function signSchnorr(seckeyHex, msg, auxHex) {
  const sk = hexToBytes(seckeyHex);
  if (!sk || sk.length !== 32 || !(msg instanceof Uint8Array)) throw new Error('secret key must be 32 bytes');
  const d0 = bytesToBig(sk);
  if (d0 === 0n || d0 >= ORDER) throw new Error('secret key out of range');
  const P = mul(d0, { x: GX, y: GY });
  const d = P.y % 2n === 0n ? d0 : ORDER - d0;
  let aux = auxHex ? hexToBytes(auxHex) : null;
  if (!aux) { aux = new Uint8Array(32); if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(aux); }
  if (aux.length !== 32) throw new Error('aux must be 32 bytes');
  const t = xorBytes(bigToBytes(d, 32), await taggedHash('BIP0340/aux', aux));
  const k0 = bytesToBig(await taggedHash('BIP0340/nonce', concat(t, bigToBytes(P.x, 32), msg))) % ORDER;
  if (k0 === 0n) throw new Error('nonce is zero');
  const R = mul(k0, { x: GX, y: GY });
  const k = R.y % 2n === 0n ? k0 : ORDER - k0;
  const e = bytesToBig(await taggedHash('BIP0340/challenge', concat(bigToBytes(R.x, 32), bigToBytes(P.x, 32), msg))) % ORDER;
  return bytesToHex(concat(bigToBytes(R.x, 32), bigToBytes(mod(k + e * d, ORDER), 32)));
}

/* NIP-01 verifier: ev.sig over ev.pubkey and the event id. */
export async function schnorrEventVerifier(ev, idHex) {
  const msg = hexToBytes(idHex);
  return msg ? verifySchnorr(ev.pubkey, msg, ev.sig) : false;
}
