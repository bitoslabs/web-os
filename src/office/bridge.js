'use strict';
/* ============================================================================
   BITOS OFFICE / HOST BRIDGE PROTOCOL
   The message contract a sandboxed (installable) office app uses to talk to the
   OS, and the reference host side that dispatches requests to built-in services.
   Built-in apps call the in-process host (src/office/host.js). The APP-05 frame
   runtime would post these envelopes over postMessage and call createBridgeHost
   with the granted permissions, so no app code changes when packaging lands.

   Envelopes:
     request : { v, id, kind:'req', method, params }
     response: { v, id, kind:'res', result }
     error   : { v, id, kind:'err', code, message }
   ========================================================================== */

export const PROTOCOL_VERSION = 1;

export const METHODS = Object.freeze([
  'storage.get', 'storage.set', 'storage.remove',
  'sync.push', 'sync.status',
  'ui.toast', 'ui.dialog',
  'file.open', 'file.save', 'print',
  'window.title', 'window.menu',
]);

/* Permission each method requires; null = always allowed to a running app. */
export const METHOD_PERMISSION = Object.freeze({
  'storage.get': 'app.storage', 'storage.set': 'app.storage', 'storage.remove': 'app.storage',
  'sync.push': 'app.storage', 'sync.status': 'app.storage',
  'ui.toast': null, 'ui.dialog': null,
  'file.open': 'fs.files', 'file.save': 'fs.files', 'print': 'app.print',
  'window.title': 'app.window', 'window.menu': 'app.menu',
});

export function request(id, method, params) {
  if (!METHODS.includes(method)) throw new Error('unknown bridge method: ' + method);
  return { v: PROTOCOL_VERSION, id, kind: 'req', method, params: params || {} };
}
export function response(id, result) { return { v: PROTOCOL_VERSION, id, kind: 'res', result }; }
export function error(id, code, message) { return { v: PROTOCOL_VERSION, id, kind: 'err', code, message }; }

export function allowed(method, granted) {
  const need = METHOD_PERMISSION[method];
  return !need || (granted || []).includes(need);
}

/* Reference host: validate → permission-check → dispatch to a handler map. */
export function createBridgeHost(opts) {
  const handlers = (opts && opts.handlers) || {};
  const granted = (opts && opts.permissions) || [];
  return async function handle(msg) {
    if (!msg || msg.v !== PROTOCOL_VERSION || msg.kind !== 'req') {
      return error(msg && msg.id, 'BAD_REQUEST', 'unsupported bridge message');
    }
    if (!allowed(msg.method, granted)) {
      return error(msg.id, 'DENIED', 'permission not granted: ' + METHOD_PERMISSION[msg.method]);
    }
    const fn = handlers[msg.method];
    if (typeof fn !== 'function') return error(msg.id, 'UNSUPPORTED', 'no host handler for ' + msg.method);
    try { return response(msg.id, await fn(msg.params || {})); }
    catch (e) { return error(msg.id, (e && e.code) || 'ERROR', (e && e.message) || 'bridge error'); }
  };
}
