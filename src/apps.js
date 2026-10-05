'use strict';
/* ============================================================================
   BITOS WEB / BUILT-IN APP MANIFEST
   One entry per apps/<app-id>/ folder. Each module is imported dynamically so
   it registers itself via registerApp() before the session starts. Paths are
   relative to this file, so they resolve under /apps regardless of host.
   ========================================================================== */

export const BUILT_IN_APPS = [
  'files',
  'terminal',
  'notes',
  'calculator',
  'text-editor',
  'image-viewer',
  'screenshots',
  'browser',
  'handbook',
  'nostr',
  'settings',
  'store',
  'system-monitor',
  'about',
  'get-started',
  'shortcuts',
  'vanjs',
];

export async function loadApps() {
  await Promise.all(BUILT_IN_APPS.map(id => import(`../apps/${id}/app.js`)));
}
