#!/usr/bin/env node
/* Open-with resolver fixtures: glob matching and file-type dispatch.
 * Usage: node scripts/test-registry.mjs */
import { registerApp, resolveOpener, matchGlob } from '../src/core/registry.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error('FAIL ' + name); } };

registerApp('viewer', { title: 'v', icon: 'pic', w: 1, h: 1, mount() { }, opens: ['image/*', '*.png', '*.svg'] });
registerApp('editor', { title: 'e', icon: 'doc', w: 1, h: 1, mount() { }, opens: ['text/*', '*.json'] });

ok(matchGlob('image/*', 'image/png'), 'mime glob matches');
ok(matchGlob('image/*', 'text/plain') === false, 'mime glob rejects other type');
ok(matchGlob('*.png', 'photo.png'), 'extension glob matches');
ok(matchGlob('*.png', 'photo.jpg') === false, 'extension glob rejects other extension');
ok(matchGlob('text/*', '') === false, 'empty value never matches');
ok(matchGlob('image/png', 'image/png'), 'literal pattern matches exactly');
ok(matchGlob('*.a+b', 'x.a+b'), 'glob regex-escapes special characters');

ok(resolveOpener('photo.png', 'image/png') === 'viewer', 'image resolves to viewer');
ok(resolveOpener('icon.svg', 'image/svg+xml') === 'viewer', 'svg resolves to viewer');
ok(resolveOpener('notes.txt', 'text/plain') === 'editor', 'text resolves to editor');
ok(resolveOpener('data.json', 'application/json') === 'editor', 'json resolves to editor');
ok(resolveOpener('photo.png', 'image/png', 'viewer') === null, 'excluded app is skipped');
ok(resolveOpener('archive.bin', 'application/octet-stream') === null, 'unknown type has no opener');

let threw = false;
try { registerApp('bad', { title: 'b', icon: 'doc', w: 1, h: 1, mount() { }, opens: 'image/*' }); }
catch (e) { threw = true; }
ok(threw, 'non-array opens is rejected');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
