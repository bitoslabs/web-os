'use strict';
/* ============================================================================
   BITOS WEB / ENCRYPTED CLOUD FILES
   Composes src/core/crypt.js (AES-256-GCM + PBKDF2 key wrap) with
   src/core/blob.js (Blossom transport) into one manifest. A file is encrypted
   with a random data key, the data key is wrapped with the passphrase-derived
   KEK, and only the ciphertext is uploaded. The manifest is a small JSON
   sidecar (`<name>.cloud.json`) holding everything but the passphrase, so a
   manifest plus the passphrase is enough to restore the file anywhere.
   ========================================================================== */
import { sha256Hex } from './package.js';
import {
  CRYPT_VERSION, CRYPT_ALG, PBKDF2_DEFAULT_ITERATIONS,
  base64ToBytes, bytesToBase64, decrypt, deriveKek, encrypt,
  generateFileKey, generateSalt, unwrapKey, wrapKey,
} from './crypt.js';

export const MANIFEST_SCHEMA = 1;
export const MANIFEST_SUFFIX = '.cloud.json';
const HEX64 = /^[0-9a-f]{64}$/;

function fail(code, message) { throw { code, message }; }

export function manifestName(name) { return String(name) + MANIFEST_SUFFIX; }
export function isManifestName(name) { return /\.cloud\.json$/i.test(String(name || '')); }

/* Encrypt bytes with a fresh data key wrapped by the passphrase. Returns the
 * ciphertext (to upload) and the manifest (to keep/share). No I/O. */
export async function encryptFile({ bytes, name, mime, passphrase, iterations = PBKDF2_DEFAULT_ITERATIONS }) {
  if (!(bytes instanceof Uint8Array) || !bytes.length) fail('INVALID_ARGUMENT', 'file is empty');
  if (!name) fail('INVALID_ARGUMENT', 'file name required');
  const salt = generateSalt();
  const kek = await deriveKek(passphrase, salt, iterations);
  const fileKey = generateFileKey();
  const envelope = await encrypt(bytes, fileKey);
  const wrapped = await wrapKey(fileKey, kek);
  const ciphertext = base64ToBytes(envelope.ct);
  const sha256 = await sha256Hex(ciphertext);
  const manifest = {
    schema: MANIFEST_SCHEMA,
    alg: CRYPT_ALG,
    name: String(name),
    mime: mime || 'application/octet-stream',
    size: bytes.length,
    sha256,
    iv: envelope.iv,
    kdf: { salt, iterations },
    key: wrapped,
    servers: [],
    url: '',
    uploaded: 0,
  };
  return { ciphertext, manifest };
}

/* Upload ciphertext, then stamp the manifest with its address and server list. */
export async function encryptAndUpload({ bytes, name, mime, passphrase, client, iterations }) {
  if (!client || typeof client.upload !== 'function') fail('INVALID_ARGUMENT', 'a blob client is required');
  const { ciphertext, manifest } = await encryptFile({ bytes, name, mime, passphrase, iterations });
  const descriptor = await client.upload(ciphertext, 'application/octet-stream');
  manifest.sha256 = descriptor.sha256 || manifest.sha256;
  manifest.url = descriptor.url || '';
  manifest.servers = client.servers ? client.servers.slice() : [];
  manifest.uploaded = descriptor.uploaded || Math.floor(Date.now() / 1000);
  return { manifest, descriptor };
}

/* Fetch + verify + decrypt from a parsed manifest. */
export async function decryptFile({ manifest, passphrase, client }) {
  if (!client || typeof client.download !== 'function') fail('INVALID_ARGUMENT', 'a blob client is required');
  const check = parseManifest(manifest);
  if (!check.ok) fail('INVALID_ARGUMENT', check.error);
  const kek = await deriveKek(passphrase, check.manifest.kdf.salt, check.manifest.kdf.iterations);
  const fileKey = await unwrapKey(check.manifest.key, kek);
  const ciphertext = await client.download(check.manifest.sha256);
  const bytes = await decrypt({ v: CRYPT_VERSION, alg: check.manifest.alg, iv: check.manifest.iv, ct: bytesToBase64(ciphertext) }, fileKey);
  return { bytes, name: check.manifest.name, mime: check.manifest.mime };
}

export function serializeManifest(manifest) { return JSON.stringify(manifest, null, 2); }

export function parseManifest(input) {
  const m = typeof input === 'string' ? safeJson(input) : input;
  if (!m) return { ok: false, error: 'manifest is not valid JSON' };
  if (m.schema !== MANIFEST_SCHEMA) return { ok: false, error: 'unsupported manifest schema' };
  if (m.alg !== CRYPT_ALG) return { ok: false, error: 'unsupported cipher' };
  if (!HEX64.test(String(m.sha256 || ''))) return { ok: false, error: 'manifest sha256 must be 64 hex' };
  if (typeof m.iv !== 'string' || !m.iv) return { ok: false, error: 'manifest iv missing' };
  if (!m.kdf || typeof m.kdf.salt !== 'string' || !Number.isInteger(m.kdf.iterations) || m.kdf.iterations < 1000) return { ok: false, error: 'manifest kdf missing' };
  if (!m.key || m.key.v !== CRYPT_VERSION || m.key.alg !== CRYPT_ALG || typeof m.key.iv !== 'string' || typeof m.key.ct !== 'string') return { ok: false, error: 'wrapped key missing' };
  if (typeof m.name !== 'string' || !m.name || m.name === '.' || m.name === '..'
    || m.name.includes('/') || m.name.includes('\\')) return { ok: false, error: 'manifest name invalid' };
  return { ok: true, manifest: m };
}

function safeJson(text) { try { return JSON.parse(text); } catch (e) { return null; } }
