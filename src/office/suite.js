'use strict';
/* ============================================================================
   BITOS OFFICE / SUITE
   The single entry point for the office suite. Built-in loading imports the
   three apps through loadOfficeApps(); a future package build points its
   ecosystem `entry` here and derives its install record from packageManifest().
   Only manifests are imported statically (pure); app modules load dynamically
   so this module stays importable without a DOM (tests, tooling).
   ========================================================================== */

import { MANIFESTS, OFFICE_VERSION } from './manifests.js';
import { PUBLISHER, capsFor } from './publisher.js';
import { latestRelease } from './releases.js';

export const SUITE_ID = 'bitos-office';
export const SUITE_APPS = Object.freeze(['docs', 'sheets', 'slides']);

/* Import the apps so they register themselves via registerApp(). */
export async function loadOfficeApps() {
  await Promise.all(SUITE_APPS.map(id => import(`../../apps/${id}/app.js`)));
}

/* Ecosystem-facing descriptor: an installer/Store listing can be built from it. */
export function packageManifest() {
  const apps = SUITE_APPS.map(id => MANIFESTS[id]);
  return Object.freeze({
    appId: SUITE_ID,
    name: 'Bitos Office',
    icon: 'doc',
    version: OFFICE_VERSION,
    entry: 'office/suite.js',
    publisher: PUBLISHER.key,
    publisherName: PUBLISHER.name,
    trusted: PUBLISHER.trusted,
    caps: capsFor(PUBLISHER.key),
    releases: Object.fromEntries(SUITE_APPS.map(id => [id, latestRelease(id)])),
    permissions: [...new Set(apps.flatMap(a => a.permissions || []))],
    opens: [...new Set(apps.flatMap(a => a.opens || []))],
    apps: apps.map(a => ({ id: a.id, title: a.title, icon: a.icon, opens: a.opens })),
  });
}
