'use strict';
/* ============================================================================
   BITOS WEB / CATALOG CACHE
   Persist the accepted catalog snapshot and its listings in the `catalog` and
   `listings` stores. The Store reads this first so it can render immediately
   (and offline) while the live snapshot is re-verified. Cache records are not
   trusted on their own: the signature status is stored alongside and re-derived
   on each load.
   ========================================================================== */
import { idbPutIn, idbAllIn, idbDelIn } from './idb.js';

const CATALOG_KEY = 'current';

export async function cacheCatalogSnapshot(entries, meta, verification) {
  const at = Date.now();
  const record = {
    meta: meta || null,
    verification: verification ? { status: verification.status, digest: verification.digest || '', reason: verification.reason || '' } : null,
    at, count: (entries || []).length,
  };
  await idbPutIn('catalog', CATALOG_KEY, record).catch(() => { });
  const snapshot = (meta && meta.snapshot) || 'unknown';
  await Promise.all((entries || []).map(e => idbPutIn('listings', snapshot + '/' + e.publisherKey + '/' + e.appId, {
    snapshot, publisherKey: e.publisherKey, appId: e.appId, version: e.version,
    digest: e.digest || '', status: (e.catalog && e.catalog.status) || 'approved',
  }).catch(() => { })));
  return record;
}

export async function readCatalogCache() {
  const all = await idbAllIn('catalog').catch(() => []);
  const hit = all.find(([k]) => k === CATALOG_KEY);
  return hit ? hit[1] : null;
}

export async function listCachedListings() {
  return (await idbAllIn('listings').catch(() => [])).map(([, v]) => v);
}

export async function clearCatalogCache() {
  await idbDelIn('catalog', CATALOG_KEY).catch(() => { });
  const all = await idbAllIn('listings').catch(() => []);
  await Promise.all(all.map(([k]) => idbDelIn('listings', k).catch(() => { })));
}
