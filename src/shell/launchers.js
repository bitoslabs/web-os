'use strict';
/* ============================================================================
   BITOS WEB / LAUNCHER CATALOG
   Single source of truth for dock and desktop-icon entries.
   IDs must match apps/<app-id> and registerApp(). Search indexes every app;
   this list contains pinned shell entries only.
   Each entry is [app id, display label, icon name].
   ========================================================================== */

export const SHELL_APPS = [
  ['get-started', 'get started', 'check'],
  ['files', 'files', 'fold'],
  ['terminal', 'terminal', 'term'],
  ['nostr', 'nostr', 'bolt'],
  ['handbook', 'handbook', 'book'],
  ['store', 'app store', 'down'],
  ['system-monitor', 'sysmon', 'act'],
  ['settings', 'settings', 'sl'],
  ['vanjs', 'vanjs', 'van'],
];
