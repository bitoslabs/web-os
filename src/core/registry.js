'use strict';
/* ============================================================================
   BITOS WEB / APP REGISTRY
   Built-in programs call registerApp(id, definition) once when their module is
   imported. A definition requires title, icon, dimensions, and mount(body, win).
   Optional: sub (status line), unified (toolbar header), multi (supports more
   than one window; the dock then offers "new window"), and opens (glob patterns
   for the file types the app can display, so Files can dispatch by type).
   ========================================================================== */

export const APPS = Object.create(null);
export function registerApp(id, definition) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`invalid app id: ${id}`);
  if (APPS[id]) throw new Error(`duplicate app id: ${id}`);
  if (!definition || typeof definition.mount !== 'function') throw new Error(`app ${id} needs mount()`);
  if (definition.opens != null && (!Array.isArray(definition.opens) || definition.opens.some(p => typeof p !== 'string'))) {
    throw new Error(`app ${id} opens must be an array of glob strings`);
  }
  APPS[id] = Object.freeze({ ...definition, id });
}

/* Glob match for `opens` patterns: `image/*`, `text/*`, `*.png`. */
export function matchGlob(pattern, value) {
  const p = String(pattern == null ? '' : pattern).toLowerCase();
  const v = String(value == null ? '' : value).toLowerCase();
  if (!p || !v) return false;
  if (!p.includes('*')) return p === v;
  const re = new RegExp('^' + p.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return re.test(v);
}

/* First registered app that declares it handles this file, ignoring `exclude`
 * (usually the asking app). mime may be empty; the extension always helps. */
export function resolveOpener(name, mime, exclude) {
  const ext = '.' + String(name || '').split('.').pop().toLowerCase();
  for (const id of Object.keys(APPS)) {
    if (id === exclude) continue;
    const opens = APPS[id].opens;
    if (!opens || !opens.length) continue;
    if (opens.some(p => matchGlob(p, mime) || matchGlob(p, ext))) return id;
  }
  return null;
}
