'use strict';
/* ============================================================================
   BITOS WEB / STATIC STORE CATALOG
   A curated snapshot for the Store preview. Entries use the descriptor shape
   the installer consumes; they are approved tuples, not downloads. Package
   bytes, digests, and Nostr verification arrive with later ecosystem tasks.
   ========================================================================== */
import { appKey } from '../core/ecosystem.js';

export const CATALOG_SNAPSHOT = 'bitos-catalog-2026-10-04';
export const REVIEWED_AT = '2026-10-04T00:00:00Z';
export const CATALOG_META = Object.freeze({ snapshot: CATALOG_SNAPSHOT, publishedAt: REVIEWED_AT });

const P1 = 'f2e240b54df3d0fe3ff9e6c520a54b2d260a63b5eb94e227217276ab1a6c67e6';
const P2 = '6ab7e699a3d2f301334ae60bb4c7355ae5a77d5addc7aa92fec7c3755a896fb6';
const P3 = 'b3a5a091cca3b663f1412b2548cdb306c1bb52997bdb4b944c11361605205c1b';
const P4 = '3b3bc8c2d26b51b5212daeccf5117ef3626d926b2e18f72e1c7d177ef78039e7';

function entry(e) {
  return Object.freeze({
    schema: 1, minBitosApi: 1, permissions: [], entry: 'index.html',
    catalog: Object.freeze({ status: 'approved', reviewedAt: REVIEWED_AT, snapshot: CATALOG_SNAPSHOT }),
    ...e,
  });
}

export const CATALOG = Object.freeze([
  entry({
    publisherKey: P2, appId: 'example-counter', name: 'Example Counter', version: '1.0.0', icon: 'act',
    summary: 'Bundled single-file sample that runs in the sandbox and keeps its count in app.storage.',
    permissions: ['app.storage', 'app.window'],
    entryUrl: 'templates/installable-app/counter-sample.html',
    sample: true,
  }),
  entry({
    publisherKey: P1, appId: 'counter', name: 'Counter', version: '1.1.0', icon: 'act',
    summary: 'A tiny offline counter. No network, no storage, no surprises.',
    digest: '2528acccf27e0905ea974a737646df35ffd4683f07d7d3894aaba41391e4a1ff',
    packageUrl: 'https://apps.bitos.dev/releases/counter-1.1.0.bitos-app',
  }),
  entry({
    publisherKey: P2, appId: 'notes', name: 'Notes', version: '2.3.0', icon: 'doc',
    summary: 'Quick notes with autosave. Stores everything in private app storage.',
    permissions: ['app.storage'],
    digest: 'a8cab18ede0b97f970c27c6be3aee6a89adca95564fdda125091fb9b1cf60f42',
    packageUrl: 'https://apps.bitos.dev/releases/notes-2.3.0.bitos-app',
  }),
  entry({
    publisherKey: P3, appId: 'focus-timer', name: 'Focus Timer', version: '1.4.2', icon: 'act',
    summary: 'A pomodoro timer that can set its own window title and size.',
    permissions: ['app.window'],
    digest: '523f1ff42e2f304f4d6422b07ddb59a40e97af12b6e6a470e880014f53278c0e',
    packageUrl: 'https://apps.bitos.dev/releases/focus-timer-1.4.2.bitos-app',
    catalog: { status: 'withdrawn', reviewedAt: REVIEWED_AT, snapshot: CATALOG_SNAPSHOT, reason: 'author withdrew this build' },
  }),
  entry({
    publisherKey: P4, appId: 'weather', name: 'Weather', version: '3.0.1', icon: 'pic',
    summary: 'Local forecast with a place you save. Window controls and private storage.',
    permissions: ['app.window', 'app.storage'],
    digest: '0f84eedb0ae7436860d81d41453cd09edf04cf2c1cda51bd0ab7573b3185ee3f',
    packageUrl: 'https://apps.bitos.dev/releases/weather-3.0.1.bitos-app',
    catalog: { status: 'revoked', reviewedAt: REVIEWED_AT, snapshot: CATALOG_SNAPSHOT, reason: 'revoked after a bad build' },
  }),
  entry({
    publisherKey: P1, appId: 'vault', name: 'Vault', version: '0.9.0', icon: 'fold',
    summary: 'Encrypted scratchpad. Early preview release.',
    permissions: ['app.storage'],
    digest: '0c35b0e44ecee40164357bd90c36fd0ca95712184092a72c88f8a7663a0fc404',
    packageUrl: 'https://apps.bitos.dev/releases/vault-0.9.0.bitos-app',
  }),
]);

export function catalogEntry(publisherKey, appId) {
  const key = appKey(publisherKey, appId);
  return CATALOG.find(e => appKey(e.publisherKey, e.appId) === key) || null;
}

export function latestCatalogFor(publisherKey, appId) {
  const key = appKey(publisherKey, appId);
  return CATALOG
    .filter(e => appKey(e.publisherKey, e.appId) === key)
    .sort((a, b) => (a.version < b.version ? 1 : -1))[0] || null;
}
