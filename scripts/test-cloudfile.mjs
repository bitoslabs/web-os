#!/usr/bin/env node
/* Encrypted-file manifest fixtures over the local Blossom simulation.
 * Usage: node scripts/test-cloudfile.mjs */
import { createMemoryBlossom, signAuthEvent, authorizationHeader, createBlossomClient } from '../src/core/blob.js';
import { verifySchnorr, generateSecretKey } from '../src/core/schnorr.js';
import { eventId } from '../src/core/nostr-event.js';
import { hexToBytes } from '../src/core/crypt.js';
import {
  encryptAndUpload, decryptFile, serializeManifest, parseManifest, manifestName, isManifestName,
} from '../src/core/cloudfile.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error('FAIL ' + name); } };

/* Simulated store: upload -> parse manifest -> download -> decrypt. */
const client = createMemoryBlossom();
const bytes = new TextEncoder().encode('a secret field note — ‘quotes’, emoji 🔒, and newlines\n\n');
const uploaded = await encryptAndUpload({ bytes, name: 'note.txt', mime: 'text/plain', passphrase: 'hunter2hunter2', client });
const manifest = uploaded.manifest;
ok(manifest.schema === 1 && /^[0-9a-f]{64}$/.test(manifest.sha256), 'manifest has a content address');
ok(manifest.size === bytes.length, 'manifest records plaintext size');
ok(manifest.servers.length === 1 && manifest.servers[0] === 'memory://local', 'manifest records the server list');
ok(manifestName('note.txt') === 'note.txt.cloud.json' && isManifestName('note.txt.cloud.json'), 'sidecar naming');
ok(!isManifestName('note.txt'), 'plain file is not a manifest');

const reparsed = parseManifest(serializeManifest(manifest));
ok(reparsed.ok, 'serialized manifest parses');

const restored = await decryptFile({ manifest: reparsed.manifest, passphrase: 'hunter2hunter2', client });
ok(restored.name === 'note.txt' && restored.mime === 'text/plain', 'restore keeps name and mime');
ok([...restored.bytes].every((b, i) => b === bytes[i]) && restored.bytes.length === bytes.length, 'restore returns the exact bytes');

let wrong = false;
try { await decryptFile({ manifest: reparsed.manifest, passphrase: 'not-the-passphrase', client }); }
catch (e) { wrong = e && e.code === 'INVALID_ARGUMENT'; }
ok(wrong, 'wrong passphrase fails to decrypt');

/* Manifest validation rejects malformed and unsafe records. */
ok(!parseManifest('{').ok, 'non-JSON manifest rejected');
ok(!parseManifest({ ...manifest, sha256: 'nope' }).ok, 'bad digest rejected');
ok(!parseManifest({ ...manifest, name: '../escape' }).ok, 'path traversal in name rejected');
ok(!parseManifest({ ...manifest, name: '..' }).ok, 'dot-dot name rejected');
ok(!parseManifest({ ...manifest, alg: 'A128GCM' }).ok, 'unknown cipher rejected');
ok(!parseManifest({ ...manifest, kdf: { salt: manifest.kdf.salt, iterations: 10 } }).ok, 'too-few PBKDF2 iterations rejected');

/* BUD-11 authorization token: signed kind 24242, x + server tags, verifiable. */
const seckey = generateSecretKey();
const token = await signAuthEvent({ seckey, verb: 'upload', sha256: manifest.sha256, servers: ['https://cdn.example.com'], now: 1700000000 });
ok(token.kind === 24242 && token.content, 'auth token kind and content');
ok(token.tags.some(t => t[0] === 't' && t[1] === 'upload'), 'auth token carries the verb');
ok(token.tags.some(t => t[0] === 'x' && t[1] === manifest.sha256), 'auth token scopes the blob hash');
ok(token.tags.some(t => t[0] === 'server' && t[1] === 'cdn.example.com'), 'auth token scopes the server host only');
ok(Number(token.tags.find(t => t[0] === 'expiration')[1]) === 1700000300, 'auth token has an expiry');
ok(await verifySchnorr(token.pubkey, hexToBytes(await eventId(token)), token.sig), 'auth token signature verifies');
ok(authorizationHeader(token).startsWith('Nostr ') && !/[+/=]/.test(authorizationHeader(token).slice(6)), 'auth header is base64url without padding');

/* The HTTP client signs requests and round-trips bytes through a fake server. */
const store = new Map();
const seen = [];
const fakeFetch = async (url, opts) => {
  seen.push({ url, headers: opts.headers });
  if (url.endsWith('/upload')) {
    const sha = opts.headers['X-SHA-256'];
    store.set(sha, opts.body);
    return { ok: true, status: 201, json: async () => ({ url: url.replace('/upload', '/' + sha), sha256: sha, size: opts.body.length, type: opts.headers['Content-Type'], uploaded: 7 }) };
  }
  const sha = url.split('/').pop();
  if (!store.has(sha)) return { ok: false, status: 404 };
  return { ok: true, status: 200, arrayBuffer: async () => store.get(sha).slice().buffer };
};
const http = createBlossomClient({ servers: ['cdn.example.com'], seckey, fetch: fakeFetch });
const desc = await http.upload(new Uint8Array([1, 2, 3, 4, 5]), 'application/octet-stream');
ok(desc.sha256 && desc.size === 5, 'http upload returns a descriptor');
ok(seen[0].headers.Authorization.startsWith('Nostr '), 'http upload sends an authorization header');
const got = await http.download(desc.sha256);
ok(got.length === 5 && got[0] === 1 && got[4] === 5, 'http download returns the bytes');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
