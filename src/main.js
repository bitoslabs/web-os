'use strict';
/* ============================================================================
   BITOS WEB / ENTRYPOINT
   Loads every built-in app module (each registers itself), then starts boot.
   This is the module referenced by index.html; nothing else starts the UI.
   ========================================================================== */
import { loadApps } from './apps.js';
import { hydratePackages, hydrateEcosystem } from './core/ecosystem.js';
import { runBoot, showRecovery } from './boot/boot.js';

/* Register built-ins, then load persisted package bytes and metadata before the
 * desktop renders, so installed apps are launchable on first paint. */
Promise.all([loadApps(), hydratePackages()])
  .then(() => hydrateEcosystem())
  .then(() => runBoot())
  .catch(error => showRecovery('Could not start Bitos', error));
