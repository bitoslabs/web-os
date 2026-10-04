#!/usr/bin/env node
/* Catalog trust fixtures (APP-12): approval is one exact tuple. A changed
 * version or digest, or a withdrawn/revoked/unknown listing, must not install.
 * Usage: node scripts/test-catalog.mjs */
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};

const { curatedDecision, installCurated, getInstall, remove } = await import('../src/core/installer.js');
const { CATALOG, CATALOG_META } = await import('../src/data/store-catalog.js');
const { CATALOG_SIGNER } = await import('../src/data/catalog-signature.js');
const { verifyCatalog, catalogDigest } = await import('../src/core/catalog-sign.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : (fail++, console.error('FAIL ' + name + (extra ? ' — ' + extra : ''))); };

const approved = CATALOG.find(e => e.appId === 'counter');
ok('approved tuple installs', curatedDecision(approved, CATALOG).approved === true);
ok('tampered digest blocked', curatedDecision({ ...approved, digest: '00'.repeat(32) }, CATALOG).status === 'unapproved');
ok('bumped version blocked', curatedDecision({ ...approved, version: '9.9.9' }, CATALOG).status === 'unapproved');

const withdrawn = CATALOG.find(e => e.appId === 'focus-timer');
ok('withdrawn blocked', curatedDecision(withdrawn, CATALOG).status === 'withdrawn' && !curatedDecision(withdrawn, CATALOG).approved);
const revoked = CATALOG.find(e => e.appId === 'weather');
ok('revoked blocked', curatedDecision(revoked, CATALOG).status === 'revoked' && !curatedDecision(revoked, CATALOG).approved);
ok('unknown publisher blocked', curatedDecision({ publisherKey: 'f'.repeat(64), appId: 'ghost', version: '1.0.0', digest: '' }, CATALOG).status === 'unknown');

let refused = false;
try { installCurated({ ...approved, digest: '00'.repeat(32) }, CATALOG); } catch (e) { refused = true; }
ok('installCurated refuses a changed digest', refused);
let refusedVersion = false;
try { installCurated(withdrawn, CATALOG); } catch (e) { refusedVersion = true; }
ok('installCurated refuses a withdrawn listing', refusedVersion);

const rec = installCurated(approved, CATALOG, { source: 'catalog' });
ok('installCurated installs the approved tuple', !!(rec && rec.key && getInstall(rec.key)));
ok('installed digest is the approved tuple', rec.installedDigest === approved.digest);
remove(rec.key, { keepData: false });

/* Snapshot signature (APP-12). */
const verified = await verifyCatalog(CATALOG, CATALOG_META, CATALOG_SIGNER);
ok('snapshot signature verifies', verified.ok && verified.status === 'verified', JSON.stringify(verified));
ok('signed digest matches the snapshot', (await catalogDigest(CATALOG, CATALOG_META)) === CATALOG_SIGNER.digest);
const tampered = CATALOG.map(e => (e.appId === 'counter' ? { ...e, version: '0.0.1' } : e));
const bad = await verifyCatalog(tampered, CATALOG_META, CATALOG_SIGNER);
ok('tampered snapshot is invalid', !bad.ok && bad.status === 'invalid');
ok('missing signature is reported', (await verifyCatalog(CATALOG, CATALOG_META, {})).status === 'missing');

/* Catalog cache (APP-03). */
const cache = await import('../src/core/catalog-store.js');
await cache.cacheCatalogSnapshot(CATALOG, CATALOG_META, verified);
const cached = await cache.readCatalogCache();
ok('catalog snapshot cached', !!(cached && cached.count === CATALOG.length && cached.verification.status === 'verified'));
ok('listings cached', (await cache.listCachedListings()).length >= CATALOG.length);
await cache.clearCatalogCache();
ok('catalog cache clears', (await cache.listCachedListings()).length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
