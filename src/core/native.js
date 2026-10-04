'use strict';
/* ============================================================================
   BITOS WEB / NATIVE CHANNEL
   In the booted OS the launcher injects window.__bitosNative with
   postMessage(request) and calls _resolve(id, ok, value) from native code
   (docs/NATIVE_API.md). It is absent in the browser, so callers fall back to
   the localStorage mock. Remote web content must never receive this bridge.
   ========================================================================== */

export const native = (() => {
  const b = window.__bitosNative;
  if (!b || typeof b.postMessage !== 'function') return null;
  const pend = new Map(); let n = 0;
  b._resolve = (id, ok, val) => {
    const p = pend.get(id); if (!p) return; pend.delete(id); clearTimeout(p.t);
    (ok ? p.res : p.rej)(val);
  };
  const call = (method, params) => new Promise((res, rej) => {
    const id = ++n; const t = setTimeout(() => { pend.delete(id); rej({ code: 'TIMEOUT', message: method + ' timed out' }); }, 8000);
    pend.set(id, { res, rej, t });
    try { b.postMessage({ id, version: 1, method, params: params || {} }); }
    catch (e) { clearTimeout(t); pend.delete(id); rej({ code: 'UNAVAILABLE', message: 'system service is unavailable' }); }
  });
  return {
    call,
    getInfo: () => call('system.getInfo'),
    requestPowerAction: action => call('system.requestPowerAction', { action }),
    setupState: () => call('setup.getState'),
    setupComplete: p => call('setup.complete', p),
  };
})();
