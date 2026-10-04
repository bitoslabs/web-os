'use strict';
/* ============================================================================
   BITOS WEB / APP REGISTRY
   Built-in programs call registerApp(id, definition) once when their module is
   imported. A definition requires title, icon, dimensions, and mount(body, win).
   Optional: sub (status line), unified (toolbar header), multi (supports more
   than one window; the dock then offers "new window").
   ========================================================================== */

export const APPS = Object.create(null);
export function registerApp(id, definition) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`invalid app id: ${id}`);
  if (APPS[id]) throw new Error(`duplicate app id: ${id}`);
  if (!definition || typeof definition.mount !== 'function') throw new Error(`app ${id} needs mount()`);
  APPS[id] = Object.freeze({ ...definition, id });
}
