'use strict';
/* ============================================================================
   BITOS WEB / ENTRYPOINT
   Loads every built-in app module (each registers itself), then starts boot.
   This is the module referenced by index.html; nothing else starts the UI.
   ========================================================================== */
import { loadApps } from './apps.js';
import { runBoot, showRecovery } from './boot/boot.js';

loadApps()
  .then(() => runBoot())
  .catch(error => showRecovery('Could not start Bitos', error));
