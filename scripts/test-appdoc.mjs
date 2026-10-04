#!/usr/bin/env node
/* Package-to-document inlining and the preview package cache. Builds the
 * template package with the real pack tool, then asserts the runtime document
 * is self-contained and that cached bytes are dropped when unreferenced.
 * Usage: node scripts/test-appdoc.mjs */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inlineDocument, normalizePath } from '../src/core/appdoc.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : (fail++, console.error('FAIL ' + name + (extra ? ' — ' + extra : ''))); };

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'bitos-appdoc-'));
const out = join(tmp, 'example.bitos-app');
execFileSync(process.execPath, [join(root, 'scripts', 'pack.mjs'), join(root, 'templates', 'installable-app'), '-o', out], { stdio: 'pipe' });
const pkg = JSON.parse(readFileSync(out, 'utf8'));

const entry = pkg.manifest.entry;
const html = inlineDocument(pkg.files[entry].data, pkg.files, entry);
ok('no stylesheet link remains', !/<link\b[^>]*stylesheet/i.test(html));
ok('no external script src remains', !/<script\b[^>]*\bsrc\s*=/i.test(html));
ok('entry script inlined', html.includes('function change'));
ok('svg asset inlined', html.includes('data:image/svg+xml'));
ok('entry markup preserved', html.includes('id="count"'));
ok('no package-relative asset refs', !/(src|href)\s*=\s*["']\.?\//i.test(html.replace(/data:[^"']+/g, '')));

ok('normalizePath resolves parent', normalizePath('../x.js', 'a/b.html') === 'x.js');
ok('normalizePath keeps sibling', normalizePath('./s.css', 'index.html') === 's.css');
ok('normalizePath rejects remote', normalizePath('https://x/y.js', 'index.html') === null);
ok('normalizePath rejects absolute', normalizePath('/etc/passwd', 'index.html') === null);

/* Preview package cache round trip, including legacy localStorage migration. */
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const legacyDigest = 'cd'.repeat(32);
mem.set('bitos.apps.v1', JSON.stringify({
  schema: 1, installs: {}, grants: {}, data: {},
  packages: { [legacyDigest]: { files: { 'a.txt': { encoding: 'utf8', data: 'x' } }, manifest: null, at: 1 } },
}));
const eco = await import('../src/core/ecosystem.js');
await eco.hydratePackages();
ok('legacy package migrated', eco.hasPackage(legacyDigest) === true);
ok('legacy packages cleared from metadata', JSON.parse(mem.get('bitos.apps.v1')).packages === undefined);
const digest = 'ab'.repeat(32);
eco.putPackage(digest, pkg.files, pkg.manifest);
ok('package cached', eco.hasPackage(digest) === true);
ok('package readable', eco.getPackage(digest).manifest.id === 'example-counter');
const desc = { schema: 1, publisherKey: 'local', appId: pkg.manifest.id, version: pkg.manifest.version, name: pkg.manifest.name, entry: entry, permissions: pkg.manifest.permissions, packageDigest: digest };
const rec = eco.install(desc, { source: 'local-file' });
ok('install references package', rec && rec.packageDigest === digest);
await eco.hydrateEcosystem();
const idbState = await (await import('../src/core/idb.js')).idbReadState();
ok('metadata migrates into the database', !!(idbState && idbState.installs[rec.key]));
eco.uninstall(rec.key, { keepData: false });
ok('unreferenced package dropped', eco.hasPackage(digest) === false);

/* Install service (APP-06, preview). */
const installer = await import('../src/core/installer.js');
const pv = await installer.preview(pkg);
ok('service previews package', pv.ok && pv.kind === 'package' && /^[0-9a-f]{64}$/.test(pv.digest));
const badPkg = structuredClone(pkg);
badPkg.manifest.files['ghost.js'] = 'sha256-' + '0'.repeat(64);
const bp = await installer.preview(badPkg);
ok('service rejects malformed package', !bp.ok && bp.errors.length > 0);
const rec2 = await installer.install(pkg, { source: 'local-file' });
ok('service installs and caches', rec2 && rec2.packageDigest === pv.digest && installer.hasPackage(pv.digest));
ok('service list/get', installer.listInstalls().some(r => r.key === rec2.key) && !!installer.getInstall(rec2.key));
installer.remove(rec2.key, { keepData: false });
ok('service remove drops bytes', installer.hasPackage(pv.digest) === false);

/* Update keeps rollback bytes; uninstall drops both digests. */
const d1 = '11'.repeat(32), d2 = '22'.repeat(32);
eco.putPackage(d1, pkg.files, pkg.manifest);
const b1 = eco.install({ schema: 1, publisherKey: 'local', appId: 'notes', version: '1.0.0', name: 'Notes', permissions: [], packageDigest: d1 }, { source: 'local-file' });
eco.putPackage(d2, pkg.files, pkg.manifest);
eco.updateInstall(b1.key, { schema: 1, publisherKey: 'local', appId: 'notes', version: '2.0.0', name: 'Notes', permissions: [], packageDigest: d2 }, { source: 'local-file' });
ok('update keeps both package versions', eco.hasPackage(d1) && eco.hasPackage(d2));
eco.rollbackInstall(b1.key);
ok('rollback restores the previous digest', eco.getInstall(b1.key).installedDigest === d1);
const rels = eco.listReleases(b1.key);
ok('release history records both versions', rels.length >= 2 && rels.some(r => r.version === '1.0.0') && rels.some(r => r.version === '2.0.0'));
eco.uninstall(b1.key, { keepData: false });
ok('uninstall drops current and rollback bytes', !eco.hasPackage(d1) && !eco.hasPackage(d2));
ok('uninstall clears release history', eco.listReleases(b1.key).length === 0);

/* Dock pins (APP-10). */
const p1 = eco.install({ schema: 1, publisherKey: 'local', appId: 'pinme', version: '1.0.0', name: 'Pin Me', permissions: [] }, { source: 'local-file' });
eco.setPinned(p1.key, true);
ok('pin appears in listPinned', eco.listPinned().some(r => r.key === p1.key));
eco.setPinned(p1.key, false);
ok('unpin removes from listPinned', !eco.listPinned().some(r => r.key === p1.key));
eco.uninstall(p1.key, { keepData: false });

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
