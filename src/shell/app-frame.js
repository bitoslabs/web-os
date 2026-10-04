'use strict';
/* OS shell module: isolated runtime for installed apps (APP-05). Each app runs
 * in a sandboxed iframe with an opaque origin and a restrictive CSP. The only
 * channel back to the shell is a versioned postMessage host API; every call is
 * checked for source identity, size, method, and a live permission grant. Raw
 * native access is never forwarded. */
import { el, esc, icon, clamp, isGranted, readAppData, writeAppData, removeAppData,
  listAppDataKeys, clearAppData, dataUsage, DATA_QUOTA, CONTENT_MAX, onEcosystemChange,
  getPackage, hasPackage, inlineDocument } from '../core/index.js';
import { WM } from './window-manager.js';

export const API_VERSION = 1;
const MAX_MSG = 32 * 1024;
const MAX_VALUE = 32 * 1024;

const METHODS = {
  'app.ready': { permission: null },
  'app.storage.get': { permission: 'app.storage' },
  'app.storage.set': { permission: 'app.storage' },
  'app.storage.remove': { permission: 'app.storage' },
  'app.storage.keys': { permission: 'app.storage' },
  'app.storage.usage': { permission: 'app.storage' },
  'app.storage.clear': { permission: 'app.storage' },
  'app.window.setTitle': { permission: 'app.window' },
  'app.window.resize': { permission: 'app.window' },
  'app.window.close': { permission: 'app.window' },
};

const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; font-src data:; connect-src 'none'; media-src 'none'; " +
  "object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'";

/* Injected into every framed document. It defines the only door the app has. */
const BRIDGE = `<script>(function(){
  var seq=0,pending={};
  function call(method,params){return new Promise(function(res,rej){
    var id='r'+(++seq);pending[id]={res:res,rej:rej};
    parent.postMessage({__bitos:1,v:${API_VERSION},kind:'req',id:id,method:method,params:params||{}},'*');
  });}
  window.addEventListener('message',function(e){
    var d=e.data;if(!d||d.__bitos!==1)return;
    if(d.kind==='signal'){
      if(d.event==='permissions'){window.bitos.permissions=d.permissions||{};
        if(typeof window.bitos.onPermissions==='function'){try{window.bitos.onPermissions(window.bitos.permissions);}catch(err){}}}
      return;
    }
    if(d.kind!=='res')return;
    var p=pending[d.id];if(!p)return;delete pending[d.id];
    if(d.error)p.rej(new Error(d.error));else p.res(d.result);
  });
  window.bitos={api:${API_VERSION},permissions:{},onPermissions:null,
    ready:function(){return call('app.ready');},
    storage:{
      get:function(k){return call('app.storage.get',{key:k});},
      set:function(k,v){return call('app.storage.set',{key:k,value:v});},
      remove:function(k){return call('app.storage.remove',{key:k});},
      keys:function(){return call('app.storage.keys');},
      usage:function(){return call('app.storage.usage');},
      clear:function(){return call('app.storage.clear');}
    },
    window:{
      setTitle:function(t){return call('app.window.setTitle',{title:t});},
      resize:function(w,h){return call('app.window.resize',{width:w,height:h});},
      close:function(){return call('app.window.close');}
    }
  };
  parent.postMessage({__bitos:1,v:${API_VERSION},kind:'signal',event:'frameready'},'*');
})();</script>`;

export function canRun(rec) {
  return !!(rec && (rec.entryUrl || rec.content || (rec.packageDigest && hasPackage(rec.packageDigest))));
}

function packageDoc(rec) {
  const pkg = rec.packageDigest ? getPackage(rec.packageDigest) : null;
  if (!pkg) return null;
  const entry = rec.entry || (pkg.manifest && pkg.manifest.entry) || 'index.html';
  const src = pkg.files && pkg.files[entry];
  if (!src || src.encoding !== 'utf8') return null;
  return inlineDocument(src.data, pkg.files, entry);
}

function recPermissions(rec) {
  const out = {};
  (rec.permissions || []).forEach(p => { out[p] = isGranted(rec.key, p); });
  return out;
}

/* Pure host API. Exported so it can be exercised without a browser. `ctl`
 * supplies the window operations the frame is not allowed to perform itself. */
export function hostResult(rec, method, params, ctl) {
  const spec = METHODS[method];
  if (!spec) throw new Error('unknown method: ' + String(method));
  if (spec.permission && !isGranted(rec.key, spec.permission)) throw new Error('permission denied: ' + spec.permission);
  const p = (params && typeof params === 'object') ? params : {};
  switch (method) {
    case 'app.ready':
      return { app: { appId: rec.appId, name: rec.name, version: rec.installedVersion }, api: API_VERSION, permissions: recPermissions(rec) };
    case 'app.storage.get':
      return readAppData(rec.key, dataKey(p.key)) ?? null;
    case 'app.storage.set': {
      const j = JSON.stringify(p.value);
      if (j === undefined) throw new Error('value is required');
      if (j.length > MAX_VALUE) throw new Error('value too large');
      writeAppData(rec.key, dataKey(p.key), p.value);
      return true;
    }
    case 'app.storage.remove': removeAppData(rec.key, dataKey(p.key)); return true;
    case 'app.storage.keys': return listAppDataKeys(rec.key);
    case 'app.storage.usage': return { bytes: dataUsage(rec.key), quota: DATA_QUOTA };
    case 'app.storage.clear': clearAppData(rec.key); return true;
    case 'app.window.setTitle': ctl.setTitle(title(p.title)); return true;
    case 'app.window.resize': ctl.resize(clampInt(p.width, 320, 1600), clampInt(p.height, 240, 1200)); return true;
    case 'app.window.close': ctl.close(); return true;
  }
  throw new Error('unhandled method');
}

function dataKey(v) {
  if (typeof v !== 'string' || !v.length || v.length > 128) throw new Error('invalid key');
  return v;
}
function title(v) {
  if (typeof v !== 'string' || !v.length) throw new Error('invalid title');
  return v.slice(0, 80);
}
function clampInt(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error('invalid size');
  return Math.round(clamp(n, lo, hi));
}

function inject(html) {
  const head = `<meta http-equiv="Content-Security-Policy" content="${CSP}">${BRIDGE}`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + head) : head + html;
}

async function loadDoc(rec) {
  if (rec.content) return rec.content;
  const packed = packageDoc(rec);
  if (packed != null) return packed;
  if (!rec.entryUrl) return null;
  const res = await fetch(rec.entryUrl, { credentials: 'omit', cache: 'no-store' });
  if (!res.ok) throw new Error('entry returned ' + res.status);
  const text = await res.text();
  if (text.length > CONTENT_MAX) throw new Error('entry document too large');
  return text;
}

const active = new Set();

export function runtimeDef(rec) {
  return {
    title: rec.name, icon: rec.icon || 'grid',
    sub: rec.appId + ' · v' + rec.installedVersion + ' · sandboxed',
    w: 640, h: 480,
    mount(body, win) {
      body.classList.add('af-host');
      const wrap = el('div', 'app-frame');
      const state = el('div', 'af-state');
      const ifr = document.createElement('iframe');
      ifr.className = 'af-frame';
      /* allow-scripts only: opaque origin, no shell DOM or storage access. */
      ifr.setAttribute('sandbox', 'allow-scripts');
      ifr.setAttribute('referrerpolicy', 'no-referrer');
      ifr.setAttribute('title', rec.name);
      wrap.append(ifr, state);
      body.append(wrap);
      state.innerHTML = icon('act', 15) + ' starting ' + esc(rec.name) + '…';

      let iframeReady = false;
      const ctl = {
        setTitle(t) {
          const tEl = win.el.querySelector('.win-title'); if (tEl) tEl.textContent = t;
        },
        resize(w, h) { win.el.style.width = w + 'px'; win.el.style.height = h + 'px'; },
        close() { WM.close(win); },
      };
      const reply = (id, result, error) => {
        try { ifr.contentWindow.postMessage({ __bitos: 1, v: API_VERSION, kind: 'res', id, result, error: error || null }, '*'); } catch (e) { }
      };
      const onMessage = e => {
        if (e.source !== ifr.contentWindow) return;
        const d = e.data;
        if (!d || d.__bitos !== 1) return;
        if (d.kind === 'signal') { if (d.event === 'frameready') iframeReady = true; return; }
        if (d.kind !== 'req' || typeof d.id !== 'string' || d.id.length > 64) return;
        let size = 0;
        try { size = JSON.stringify(d).length; } catch (err) { return; }
        if (size > MAX_MSG) { reply(d.id, null, 'request too large'); return; }
        let result = null, error = null;
        try { result = hostResult(rec, String(d.method), d.params, ctl); }
        catch (err) { error = String((err && err.message) || err); }
        reply(d.id, result, error);
      };
      window.addEventListener('message', onMessage);
      const frame = { rec, ifr };
      active.add(frame);

      loadDoc(rec).then(html => {
        if (html == null) { state.classList.add('af-blocked'); state.innerHTML = blockedHtml(rec); return; }
        ifr.addEventListener('load', () => { setTimeout(() => { if (!iframeReady) { state.classList.add('af-blocked'); state.innerHTML = blockedHtml(rec); } }, 1200); }, { once: true });
        ifr.srcdoc = inject(html);
      }).catch(err => {
        state.classList.add('af-blocked');
        state.innerHTML = icon('help', 15) + ' could not load ' + esc(rec.name) + ' — ' + esc(String(err.message || err));
      });

      return () => { window.removeEventListener('message', onMessage); active.delete(frame); };
    },
  };
}

function blockedHtml(rec) {
  return icon('help', 15) + ' ' + esc(rec.name) + ' has no runnable package bytes in this build. ' +
    'install, permissions, and removal still apply.';
}

/* Push live grant changes to every running frame so revocation is immediate. */
onEcosystemChange(change => {
  if (!change || change.type !== 'grant') return;
  active.forEach(f => {
    try { f.ifr.contentWindow.postMessage({ __bitos: 1, v: API_VERSION, kind: 'signal', event: 'permissions', permissions: recPermissions(f.rec) }, '*'); } catch (e) { }
  });
});
