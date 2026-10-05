#!/usr/bin/env node
/* File-encryption fixtures: AES-256-GCM round-trip, PBKDF2 key wrap, and the
 * base64/base64url helpers. Usage: node scripts/test-crypt.mjs */
import {
  encrypt, decrypt, deriveKek, wrapKey, unwrapKey, generateFileKey, generateSalt,
  bytesToBase64, base64ToBytes, bytesToHex, hexToBytes, base64UrlFromUtf8, PBKDF2_DEFAULT_ITERATIONS,
} from '../src/core/crypt.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error('FAIL ' + name); } };

/* base64 round-trip across lengths, including non-multiples of 3. */
for (const n of [0, 1, 2, 3, 4, 5, 16, 31, 64]) {
  const bytes = new Uint8Array(n).map((_, i) => (i * 37 + 11) & 0xff);
  const back = base64ToBytes(bytesToBase64(bytes));
  ok(back.length === n && [...back].every((b, i) => b === bytes[i]), `base64 round-trip ${n}`);
}
ok(bytesToHex(hexToBytes('00ff10')) === '00ff10', 'hex round-trip');
ok(base64UrlFromUtf8('hi?') === 'aGk_', 'base64url has no padding and uses url alphabet');

/* Symmetric round-trip, then a wrong-key failure. */
const key = generateFileKey();
const plaintext = new TextEncoder().encode('bitos: the quiet fox, encrypted.');
const env = await encrypt(plaintext, key);
ok(env.v === 1 && env.alg === 'A256GCM' && env.iv && env.ct, 'envelope shape');
const out = await decrypt(env, key);
ok([...out].every((b, i) => b === plaintext[i]), 'decrypt restores plaintext');
ok(out.length === plaintext.length, 'decrypt length');

let wrongKey = false;
try { await decrypt(env, generateFileKey()); } catch (e) { wrongKey = e && e.code === 'INVALID_ARGUMENT'; }
ok(wrongKey, 'wrong key is rejected with INVALID_ARGUMENT');

/* Deterministic text fixtures must differ per run (random IV). */
ok((await encrypt(plaintext, key)).ct !== env.ct, 'random IV makes ciphertext unique');

/* Passphrase KEK + wrapped file key: same salt reproduces, different salt does not. */
const salt = generateSalt();
const kek = await deriveKek('correct horse battery staple', salt, PBKDF2_DEFAULT_ITERATIONS);
const kek2 = await deriveKek('correct horse battery staple', salt, PBKDF2_DEFAULT_ITERATIONS);
const kek3 = await deriveKek('correct horse battery staple', generateSalt(), PBKDF2_DEFAULT_ITERATIONS);
ok(bytesToHex(kek) === bytesToHex(kek2), 'PBKDF2 is deterministic for one salt');
ok(bytesToHex(kek) !== bytesToHex(kek3), 'PBKDF2 differs across salts');

const fileKey = generateFileKey();
const wrapped = await wrapKey(fileKey, kek);
ok((await unwrapKey(wrapped, kek3).catch(() => null)) === null, 'wrong KEK cannot unwrap the file key');
const unwrapped = await unwrapKey(wrapped, kek);
ok(bytesToHex(unwrapped) === bytesToHex(fileKey), 'correct KEK unwraps the file key');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
