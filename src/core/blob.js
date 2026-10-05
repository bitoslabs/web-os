'use strict';
/* ============================================================================
   BITOS WEB / BLOSSOM BLOB CLIENT
   Content-addressed media transport (Blossom BUD-01/02/11): PUT /upload and
   GET /<sha256>, authorized by a Schnorr-signed kind:24242 token. The bytes a
   caller hands to upload() are already encrypted by src/core/cloudfile.js, so a
   server only ever sees ciphertext addressed by its hash. The HTTP implementation
   is injectable for tests and for the local simulated store used when no server
   is configured. See docs/NATIVE_API.md for the native boundary.
   ========================================================================== */
import { sha256Hex } from './package.js';
import { eventId } from './nostr-event.js';
import { signSchnorr, xOnlyPubkey } from './schnorr.js';
import { base64UrlFromUtf8, hexToBytes } from './crypt.js';
import { idbPutIn, idbAllIn } from './idb.js';

export const AUTH_KIND = 24242;
export const AUTH_TTL_SECONDS = 300;

function fail(code, message) { throw { code, message }; }

export function normalizeServer(url) {
  let s = String(url || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  if (!/^https?:\/\//.test(s)) s = 'https://' + s;
  return s;
}
function serverHost(url) {
  return normalizeServer(url).replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
}

/* A signed BUD-11 authorization token. `sha256` scopes it to one blob (required
 * by PUT /upload). `servers` adds lowercase `server` tags so a leaked token
 * cannot be replayed against another host. */
export async function signAuthEvent({ seckey, verb, sha256, servers, content, now, ttl = AUTH_TTL_SECONDS }) {
  if (!seckey) fail('DENIED', 'no signing key for cloud uploads');
  if (!['get', 'upload', 'list', 'delete', 'media'].includes(verb)) fail('INVALID_ARGUMENT', 'unknown blossom verb');
  const created_at = now || Math.floor(Date.now() / 1000);
  const tags = [['t', verb], ['expiration', String(created_at + ttl)]];
  if (sha256) tags.push(['x', String(sha256).toLowerCase()]);
  for (const s of servers || []) { const h = serverHost(s); if (h) tags.push(['server', h]); }
  const unsigned = {
    pubkey: xOnlyPubkey(seckey), created_at, kind: AUTH_KIND, tags,
    content: content || ('Bitos ' + verb + ' blob'),
  };
  const id = await eventId(unsigned);
  const sig = await signSchnorr(seckey, hexToBytes(id));
  return { ...unsigned, id, sig };
}

export function authorizationHeader(ev) { return 'Nostr ' + base64UrlFromUtf8(JSON.stringify(ev)); }

/* Real Blossom client. Tries the configured servers in order for reads and the
 * first server for writes, unless a specific server is passed. */
export function createBlossomClient(opts = {}) {
  const servers = (opts.servers || []).map(normalizeServer).filter(Boolean);
  const fetchImpl = opts.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  const seckey = opts.seckey || '';
  const now = opts.now || (() => Math.floor(Date.now() / 1000));
  if (!servers.length) fail('INVALID_ARGUMENT', 'at least one blossom server is required');

  async function auth(verb, sha) {
    const ev = await signAuthEvent({ seckey, verb, sha256: sha, servers, now: now() });
    return authorizationHeader(ev);
  }
  async function upload(bytes, type, server) {
    if (!(bytes instanceof Uint8Array)) fail('INVALID_ARGUMENT', 'blob must be bytes');
    if (!fetchImpl) fail('UNAVAILABLE', 'network is unavailable');
    const sha = await sha256Hex(bytes);
    const base = server ? normalizeServer(server) : servers[0];
    const res = await fetchImpl(base + '/upload', {
      method: 'PUT',
      headers: {
        'Content-Type': type || 'application/octet-stream',
        'Content-Length': String(bytes.length),
        'X-SHA-256': sha,
        'Authorization': await auth('upload', sha),
      },
      body: bytes,
    });
    if (!res.ok) fail('UNAVAILABLE', `upload failed (${res.status})`);
    const descriptor = await res.json();
    if (!descriptor || descriptor.sha256 !== sha) fail('INTERNAL', 'server returned a mismatched digest');
    return descriptor;
  }
  async function has(sha, server) {
    if (!fetchImpl) return false;
    const base = server ? normalizeServer(server) : servers[0];
    try { const res = await fetchImpl(base + '/' + sha, { method: 'HEAD' }); return !!res.ok; }
    catch (e) { return false; }
  }
  async function download(sha) {
    if (!fetchImpl) fail('UNAVAILABLE', 'network is unavailable');
    let last = '';
    for (const base of servers) {
      try {
        const res = await fetchImpl(base + '/' + sha, { method: 'GET' });
        if (!res.ok) { last = 'HTTP ' + res.status; continue; }
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (await sha256Hex(bytes) !== sha) { last = 'digest mismatch'; continue; }
        return bytes;
      } catch (e) { last = String((e && e.message) || e); }
    }
    fail('UNAVAILABLE', 'could not fetch blob — ' + (last || 'no server reachable'));
  }
  return { servers, upload, download, has };
}

/* Offline/local store used by the browser preview and tests. Bytes live in
 * IndexedDB under their sha256, so the same address rules apply. */
export function createMemoryBlossom() {
  return {
    servers: ['memory://local'],
    simulated: true,
    async upload(bytes, type) {
      if (!(bytes instanceof Uint8Array)) fail('INVALID_ARGUMENT', 'blob must be bytes');
      const sha = await sha256Hex(bytes);
      const uploaded = Math.floor(Date.now() / 1000);
      const mime = type || 'application/octet-stream';
      await idbPutIn('blobs', sha, { bytes, type: mime, uploaded });
      return { url: 'memory://local/' + sha, sha256: sha, size: bytes.length, type: mime, uploaded };
    },
    async has(sha) { return (await idbAllIn('blobs')).some(([k]) => k === sha); },
    async download(sha) {
      const hit = (await idbAllIn('blobs')).find(([k]) => k === sha);
      if (!hit) fail('UNAVAILABLE', 'blob not found in the local store');
      return hit[1].bytes;
    },
  };
}

/* Convenience for the app: a real client when a server + key are configured,
 * otherwise the local simulated store. Kept here so callers do not litter. */
export function selectBlossomClient(cfg) {
  if (cfg && cfg.server && cfg.seckey) return createBlossomClient({ servers: [cfg.server], seckey: cfg.seckey });
  return createMemoryBlossom();
}
