'use strict';
/* ============================================================================
   BITOS WEB / SYSTEM STATE
   Live device info comes from system.getInfo when the native bridge exists.
   Everything here degrades to simulated preview data in the browser.
   ========================================================================== */
import { native } from './native.js';
import { store } from './store.js';
import { petname } from './identity.js';

/* Live device info from system.getInfo; null in the browser preview. */
export let SYSINFO = null;
export function primeSysInfo() { if (!native) return; native.getInfo().then(i => { SYSINFO = i; }).catch(() => { }); }

/* Boot decision: native setup state when the bridge exists, else the mock. */
export function bootState() {
  if (!native) return Promise.resolve(store.load());
  return native.setupState().then(s => {
    if (!s || !s.completed) return null;
    if (!store.d) store.d = {
      v: 1, host: s.hostname || s.displayName || 'bitos', keymap: s.language || 'us',
      npub: s.npub || '', nsec: s.nsec || '', pet: s.npub ? petname(s.npub) : (s.displayName || 'bitos'),
      accent: 'zap', wall: true, icons: true, big: false, resize: true, toasts: true,
      satsIn: 0, satsOut: 0, seen: 0, born: Date.now(),
    };
    return store.d;
  });
}
