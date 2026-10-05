'use strict';
/* ============================================================================
   BITOS OFFICE / HOST
   The single boundary between the office apps and the OS. Built-in apps import
   their runtime services from here instead of reaching into src/core or the
   window payload directly, so a future sandboxed (installable) build can swap
   this module for one that speaks the APP-05 postMessage bridge without
   touching the apps.

   Built-in host = direct in-process services:
     - UI: registerApp, toast, dialog, icon, esc (from src/core)
     - storage/sync: loadDoc/saveDoc + the sync API (src/office/store.js, sync.js)
   A packaged host would reimplement the same names over host messages.
   ========================================================================== */

export { registerApp, esc, icon, toast, dialog } from '../core/index.js';
export { loadDoc, saveDoc, deleteDoc, createStore, createStore as appStorage } from './store.js';
export { syncConfig, configureSync, push, pull, syncStatus, onSyncChange } from './sync.js';
