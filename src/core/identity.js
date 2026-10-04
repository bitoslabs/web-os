'use strict';
/* ============================================================================
   BITOS WEB / IDENTITY HELPERS
   bech32 encoding, prototype key generation, petnames, and identicons.
   Prototype cryptography only — entropy and bech32 are real, pubkey derivation
   is a stub until the native keysvc exists. See docs/NATIVE_API.md upstream.
   ========================================================================== */

export const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
export function polymod(v) {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; let c = 1;
  for (const x of v) { const b = c >> 25; c = ((c & 0x1ffffff) << 5) ^ x; for (let i = 0; i < 5; i++) if ((b >> i) & 1) c ^= G[i]; } return c;
}
export function hrpE(h) { const r = []; for (const c of h) r.push(c.charCodeAt(0) >> 5); r.push(0); for (const c of h) r.push(c.charCodeAt(0) & 31); return r; }
export function cbits(d, f, t) {
  let acc = 0, b = 0; const o = [], m = (1 << t) - 1;
  for (const v of d) { acc = (acc << f) | v; b += f; while (b >= t) { b -= t; o.push((acc >> b) & m); } }
  if (b) o.push((acc << (t - b)) & m); return o;
}
export function bech32(hrp, bytes) {
  const d = cbits(bytes, 8, 5); const t = hrpE(hrp).concat(d, [0, 0, 0, 0, 0, 0]);
  const mod = polymod(t) ^ 1; const c = []; for (let i = 0; i < 6; i++) c.push((mod >> 5 * (5 - i)) & 31);
  return hrp + '1' + d.concat(c).map(v => B32[v]).join('');
}
export function derivePub(sec) {
  const p = new Uint8Array(32); let x = 0;
  for (let r = 0; r < 4; r++) for (let i = 0; i < 32; i++) { x = (Math.imul(x ^ sec[i], 0x85ebca6b)) >>> 0; p[(i + r) % 32] ^= x & 255; } return p;
}
export function genKey(seed) {
  const sec = new Uint8Array(32); crypto.getRandomValues(sec);
  if (seed) for (let i = 0; i < 32; i++) sec[i] ^= seed[i];
  return { nsec: bech32('nsec', sec), npub: bech32('npub', derivePub(sec)) };
}

export const ADJ = ['quiet', 'violet', 'harsh', 'nimble', 'static', 'pale', 'hollow', 'rust', 'glass', 'iron', 'north', 'lunar', 'feral', 'teal', 'dry', 'swift'];
export const NOUN = ['mantis', 'otter', 'sparrow', 'cipher', 'ferry', 'kernel', 'lantern', 'vole', 'heron', 'raven', 'vector', 'meadow', 'kestrel', 'packet', 'juniper', 'relay'];
export function petname(s) {
  let h = 5381; for (const c of s) h = (Math.imul(h, 33) ^ c.charCodeAt(0)) >>> 0;
  return ADJ[h % ADJ.length] + '-' + NOUN[(h >> 8) % NOUN.length] + '-' + (h % 97);
}
export const trunc = k => k.slice(0, 10) + '…' + k.slice(-4);

export function drawIdenticon(cv, npub) {
  const x = cv.getContext('2d'); const S = cv.width; x.fillStyle = '#17171f'; x.fillRect(0, 0, S, S);
  let h = 2166136261; for (const c of npub) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
  const cell = S / 5; const g = [];
  for (let r = 0; r < 5; r++) { g[r] = []; for (let c = 0; c < 3; c++) g[r][c] = rnd(); }
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const v = g[r][c < 3 ? c : 4 - c];
    if (v > .45) { x.globalAlpha = v > .75 ? .95 : v > .6 ? .55 : .28; x.fillStyle = '#8b5cf6'; x.fillRect(c * cell, r * cell, cell - .5, cell - .5); }
  }
  x.globalAlpha = 1;
}
