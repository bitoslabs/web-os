'use strict';
/* OS shell module: exposes ready installed apps to the launch surfaces. Built-in
 * programs stay in the registry; installable apps are trusted wrappers that show
 * app identity and permissions. Running third-party code needs the isolated
 * frame runtime (APP-05), which is not part of this build, so opening an
 * installed app presents its verified metadata instead of executing package
 * code in the shell. */
import { esc, icon, toast, listInstalls, getInstall, isSystemKey, grantsOf, dataUsage, PERMISSION_LABELS } from '../core/index.js';
import { WM } from './window-manager.js';
import { canRun, runtimeDef } from './app-frame.js';

export function installedLaunchEntries() {
  return listInstalls()
    .filter(r => r.state === 'ready' && !isSystemKey(r.key))
    .map(r => ({ key: r.key, install: r, def: defFor(r) }));
}

/* Run in the sandbox when the record has an entry source, else show identity. */
export function defFor(r) { return canRun(r) ? runtimeDef(r) : appInfoDef(r); }

export function openInstalled(key) {
  const r = getInstall(key);
  if (!r) { toast('that app is no longer installed', 'err'); return null; }
  if (r.state !== 'ready') { toast(r.name + ' is ' + r.state + ' — not launchable yet', 'info'); return null; }
  return WM.open(key, { def: defFor(r), title: r.name });
}

function grantsHtml(key, permissions) {
  if (!permissions || !permissions.length) return '<div class="st-note">this app requested no permissions.</div>';
  const g = grantsOf(key);
  return permissions.map(p => {
    const granted = !!(g[p] && g[p].granted);
    return `<div class="perm-row"><span>${icon('check', 13)}<b>${esc(p)}</b><em>${esc(PERMISSION_LABELS[p] || '')}</em></span>
      <span class="st-grant ${granted ? 'on' : ''}">${granted ? 'granted' : 'denied'}</span></div>`;
  }).join('');
}

export function appInfoDef(r) {
  const bytes = dataUsage(r.key);
  return {
    title: r.name, icon: r.icon || 'grid',
    sub: (r.publisherKey === 'local' ? 'local app' : r.appId) + ' · ' + r.installedVersion,
    w: 560, h: 460,
    mount(body) {
      body.innerHTML = `<div class="scrolly st-info">
        <div class="st-hero">
          <span class="st-tile">${icon(r.icon || 'grid', 30)}</span>
          <div><h1>${esc(r.name)}</h1><div class="st-sub">${esc(r.appId)} · v${esc(r.installedVersion)} · ${esc(r.source)}</div></div>
        </div>
        <div class="st-banner">${icon('help', 14)} the isolated app runtime is not available in this build, so package code is not run. install, permissions, updates, and removal are managed now.</div>
        <div class="grpbox"><span class="lbl">publisher</span>
          <div class="st-kv"><span>identity</span><b class="mono-dim">${esc(r.publisherKey)}</b></div>
          <div class="st-kv"><span>entry</span><b class="mono-dim">${esc(r.entry)}</b></div>
          <div class="st-kv"><span>installed data</span><b class="mono-dim">${bytes} / 65536 bytes</b></div>
        </div>
        <div class="grpbox"><span class="lbl">permissions</span>${grantsHtml(r.key, r.permissions)}</div>
        <div class="u-row u-gap-8"><button class="btn sm pri" data-open-store>manage in store</button></div>
      </div>`;
      body.querySelector('[data-open-store]').onclick = () => WM.open('store');
    },
  };
}
