/* Built-in app: App Store. Browse a curated catalog, install from a local
 * descriptor, and manage installed apps — permissions, updates, rollback,
 * uninstall, and the separate app-data choice. Package bytes and the isolated
 * app runtime are later ecosystem tasks; this screen makes the lifecycle and
 * records real in the preview. */
import {
  registerApp, el, esc, icon, toast, dialog, APPS,
  listInstalls, install, updateInstall, rollbackInstall, uninstall,
  grantsOf, setGrant, isGranted, dataUsage, clearAppData,
  isNewer, validateDescriptor, appKey, systemKey, isSystemKey,
  PERMISSION_LABELS, onEcosystemChange, hasPackage,
} from '../../src/core/index.js';
import { preview as previewSource, install as installSource } from '../../src/core/installer.js';
import { WM } from '../../src/shell/window-manager.js';
import { openInstalled } from '../../src/shell/installed-apps.js';
import { CATALOG } from '../../src/data/store-catalog.js';

const SYS_VERSION = 'built-in';

function systemInstall(appId) {
  const a = APPS[appId];
  return {
    key: systemKey(appId), system: true, appId,
    name: a.title, icon: a.icon, version: SYS_VERSION,
    source: 'built-in', permissions: [], summary: 'shipped with the system',
  };
}

function installFor(entry) { return listInstalls().find(r => r.key === appKey(entry.publisherKey, entry.appId)) || null; }

function pendingUpdate(rec) {
  if (!rec || rec.system || isSystemKey(rec.key)) return null;
  return CATALOG.find(e => appKey(e.publisherKey, e.appId) === rec.key && isNewer(e.version, rec.installedVersion)) || null;
}

function atLeast(entry) { return (entry.minBitosApi || 1) <= 1; }

function choose(title, body, options) {
  return new Promise(resolve => {
    const box = el('div', 'modal');
    box.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-t">${esc(title)}</div>
      ${body ? `<div class="modal-b">${esc(body)}</div>` : ''}
      <div class="modal-act">${options.map((o, i) => `<button class="btn sm ${o.cls || ''}" data-i="${i}">${esc(o.label)}</button>`).join('')}</div>
    </div>`;
    const key = e => { if (e.key === 'Escape') done(null); };
    const done = v => { box.remove(); document.removeEventListener('keydown', key); resolve(v); };
    box.addEventListener('pointerdown', e => { if (e.target === box) done(null); });
    box.querySelectorAll('[data-i]').forEach(b => b.onclick = () => done(options[+b.dataset.i].value));
    document.addEventListener('keydown', key);
    document.body.append(box);
    const first = box.querySelector('[data-i]'); first && first.focus();
  });
}

registerApp('store', {
  title: 'app store', icon: 'down', sub: 'apps & permissions', w: 920, h: 620,
  mount(body) {
    let view = 'browse';
    let sel = null;
    let q = '';
    let busy = false;

    const isRunnable = x => !!(x && (x.entryUrl || x.content || (x.packageDigest && hasPackage(x.packageDigest))));
    /* Run a one-at-a-time action with a disabled, relabelled button. */
    async function run(btn, label, fn) {
      if (busy) return;
      busy = true;
      const old = btn ? btn.textContent : null;
      if (btn) { btn.disabled = true; btn.textContent = label; }
      try { await fn(); }
      catch (e) { toast('action failed — ' + esc(e.message || e), 'err'); }
      finally { busy = false; if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = old; } }
    }

    body.innerHTML = `<div class="store-shell">
      <aside class="store-side">
        <div class="store-brand">${icon('down', 16)}<b>app store</b></div>
        <div class="store-tabs" role="tablist">
          <button data-view="browse" role="tab">browse</button>
          <button data-view="installed" role="tab">installed</button>
          <button data-view="updates" role="tab">updates<i data-count></i></button>
        </div>
        <button class="btn sm ghost store-updateall" data-updateall hidden>${icon('down', 13)} update all</button>
        <div class="store-search">${icon('mag', 14)}<input data-q placeholder="search apps" spellcheck="false" aria-label="search apps"></div>
        <div class="store-list" data-list role="listbox" aria-label="apps"></div>
        <button class="btn sm ghost store-import" data-import>${icon('doc', 13)} install from file…</button>
        <input type="file" accept=".json,.bitos-app,application/json" hidden data-file>
        <div class="store-foot">catalog snapshot · ${esc(CATALOG.length)} approved apps</div>
      </aside>
      <section class="store-detail" data-detail></section>
    </div>`;

    const listEl = body.querySelector('[data-list]');
    const detailEl = body.querySelector('[data-detail]');
    const qEl = body.querySelector('[data-q]');
    const fileEl = body.querySelector('[data-file]');
    const countEl = body.querySelector('[data-count]');
    const updateAllBtn = body.querySelector('[data-updateall]');

    /* Stop the app's running windows before update, rollback, or removal. */
    function closeWindowsFor(key) {
      let n = 0;
      for (const w of [...WM.wins.values()]) if (w.key === key || w.id === key) { WM.close(w); n++; }
      return n;
    }

    const sysList = () => Object.keys(APPS).map(systemInstall);
    const instList = () => listInstalls().filter(r => r.state === 'ready');
    const updateList = () => instList().map(r => ({ rec: r, entry: pendingUpdate(r) })).filter(x => x.entry);

    function items() {
      if (view === 'installed') return [...sysList(), ...instList()];
      if (view === 'updates') return updateList().map(x => x.entry);
      return CATALOG.slice();
    }

    function itemKey(it) { return it.system || isSystemKey(it.key) ? it.key : appKey(it.publisherKey, it.appId); }
    function itemName(it) { return it.name; }

    function matches(it) {
      if (!q) return true;
      const hay = (itemName(it) + ' ' + (it.summary || '') + ' ' + (it.appId || '')).toLowerCase();
      return hay.includes(q);
    }

    function filtered() { return items().filter(matches); }

    function renderTabs() {
      body.querySelectorAll('button[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === view));
      const n = updateList().length;
      countEl.textContent = n ? String(n) : '';
      countEl.classList.toggle('on', n > 0);
      updateAllBtn.hidden = !(view === 'updates' && n > 0);
    }

    function badgeFor(it) {
      if (it.system) return '<span class="st-badge sys">system</span>';
      if (view === 'browse') {
        const rec = installFor(it);
        if (rec) return pendingUpdate(rec) ? '<span class="st-badge upd">update</span>' : '<span class="st-badge ok">installed</span>';
        return '<span class="st-badge">' + esc(it.version) + '</span>';
      }
      if (view === 'updates') return '<span class="st-badge upd">' + esc(it.version) + '</span>';
      const up = pendingUpdate(it);
      return up ? '<span class="st-badge upd">update</span>' : '<span class="st-badge">' + esc(it.installedVersion) + '</span>';
    }

    function renderList() {
      const list = filtered();
      if (!list.length) {
        listEl.innerHTML = `<div class="store-empty">${q ? 'no apps match “' + esc(q) + '”' : view === 'updates' ? 'everything is up to date' : 'nothing installed yet'}</div>`;
        return;
      }
      if (!sel || !list.some(it => itemKey(it) === sel)) sel = itemKey(list[0]);
      listEl.innerHTML = list.map(it => {
        const key = itemKey(it);
        return `<button class="store-item${key === sel ? ' on' : ''}" data-key="${esc(key)}" role="option" aria-selected="${key === sel}" tabindex="0">
          <span class="st-itile">${icon(it.icon || 'grid', 18)}</span>
          <span class="st-imeta"><b>${esc(itemName(it))}</b><em>${esc(it.summary || it.appId || '')}</em></span>
          ${badgeFor(it)}
        </button>`;
      }).join('');
      listEl.querySelectorAll('.store-item').forEach(b => {
        b.onclick = () => { sel = b.dataset.key; renderList(); renderDetail(); };
        b.onfocus = () => {
          if (sel === b.dataset.key) return;
          sel = b.dataset.key;
          listEl.querySelectorAll('.store-item').forEach(x => {
            const on = x.dataset.key === sel;
            x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on));
          });
          renderDetail();
        };
      });
    }

    function permRows(permissions, key) {
      if (!permissions || !permissions.length) return '<div class="st-note">requested no permissions.</div>';
      const g = key ? grantsOf(key) : null;
      return permissions.map(p => {
        const granted = !!(g && g[p] && g[p].granted);
        const control = key
          ? `<button class="sw2${granted ? ' on' : ''}" data-perm="${esc(p)}" role="switch" aria-checked="${granted}" title="${granted ? 'revoke' : 'grant'} ${esc(p)}" aria-label="${granted ? 'revoke' : 'grant'} ${esc(p)}"><i></i></button>`
          : '<span class="st-grant">denied</span>';
        return `<div class="perm-row"><span>${icon('check', 13)}<b>${esc(p)}</b><em>${esc(PERMISSION_LABELS[p] || '')}</em></span>${control}</div>`;
      }).join('');
    }

    function hero(it, v) {
      return `<div class="st-hero"><span class="st-tile">${icon(it.icon || 'grid', 30)}</span>
        <div><h1>${esc(itemName(it))}</h1>
        <div class="st-sub">${esc(it.appId || it.key)} · v${esc(v)}${it.system ? '' : ' · ' + esc(it.source || 'catalog')}</div></div></div>`;
    }

    function badges(it, rec) {
      const out = [];
      if (it.system) out.push('<span class="st-chip">shipped with bitos</span>');
      else {
        out.push(`<span class="st-chip${it.catalog ? '' : ' dim'}">${it.catalog && it.catalog.status === 'approved' ? 'catalog approved' : 'unverified source'}</span>`);
        out.push(`<span class="st-chip${atLeast(it) ? '' : ' warn'}">api ${esc(it.minBitosApi || 1)}</span>`);
        out.push(`<span class="st-chip dim">${esc((it.permissions || []).length)} permission${(it.permissions || []).length === 1 ? '' : 's'}</span>`);
        const runnable = isRunnable(it) || isRunnable(rec);
        const hasBytes = !!((rec && rec.packageDigest && hasPackage(rec.packageDigest)) || (it.packageDigest && hasPackage(it.packageDigest)));
        out.push(`<span class="st-chip${runnable ? '' : ' dim'}">${runnable ? 'runs sandboxed' : 'metadata only'}</span>`);
        if (hasBytes) out.push('<span class="st-chip">package bytes verified</span>');
      }
      if (rec && rec.previousVersion) out.push('<span class="st-chip dim">rollback available</span>');
      return `<div class="st-chips">${out.join('')}</div>`;
    }

    function publisherBox(it, rec) {
      const row = (k, v) => `<div class="st-kv"><span>${esc(k)}</span><b class="mono-dim">${esc(v)}</b></div>`;
      if (it.system) return `<div class="grpbox"><span class="lbl">system</span>${row('identity', 'bitos built-in')}${row('version', it.version)}</div>`;
      const pk = (rec && rec.publisherKey) || it.publisherKey || 'local';
      let html = `<div class="grpbox"><span class="lbl">publisher</span>${row('identity', pk)}`;
      html += row('source', rec ? rec.source : 'catalog');
      html += row('entry', (rec && rec.entry) || it.entry || 'index.html');
      const pd = (rec && rec.packageDigest) || it.packageDigest;
      if (pd) html += row('package', pd.slice(0, 16) + '…');
      if (rec) html += row('installed data', dataUsage(rec.key) + ' / 65536 bytes');
      html += '</div>';
      return html;
    }

    /* Permission switches are shared by the Browse and Installed detail views. */
    function wirePerms(rec) {
      detailEl.querySelectorAll('[data-perm]').forEach(b => b.onclick = () => {
        const p = b.dataset.perm;
        const next = !isGranted(rec.key, p);
        try {
          setGrant(rec.key, p, next);
          toast(esc(p) + (next ? ' granted' : ' revoked') + (next ? '' : ' — running windows lose it now'), next ? 'ok' : 'info');
        } catch (e) { toast('could not change permission — ' + esc(e.message || e), 'err'); }
      });
    }

    function renderBrowseDetail(it) {
      const rec = installFor(it);
      const upd = rec ? pendingUpdate(rec) : null;
      const actions = [];
      if (rec) {
        if (upd) actions.push(`<button class="btn sm pri" data-update>update to ${esc(upd.version)}</button>`);
        actions.push(`<button class="btn sm${upd ? '' : ' pri'}" data-open>open</button>`);
        if (rec.previousVersion) actions.push(`<button class="btn sm ghost" data-rollback>roll back to ${esc(rec.previousVersion)}</button>`);
        actions.push('<button class="btn sm danger" data-uninstall>uninstall</button>');
      } else {
        actions.push(`<button class="btn sm pri" data-install${atLeast(it) ? '' : ' disabled'}>install</button>`);
        if (!isRunnable(it)) actions.push('<span class="st-note">no runnable package — installs as managed metadata.</span>');
      }
      detailEl.innerHTML = `${hero(it, it.version)}${badges(it, rec)}
        <p class="st-summary">${esc(it.summary || '')}</p>
        ${publisherBox(it, rec)}
        <div class="grpbox"><span class="lbl">permissions</span>${permRows(rec ? rec.permissions : it.permissions, rec ? rec.key : null)}</div>
        <div class="u-row u-gap-8 st-actions">${actions.join('')}</div>`;
      const root = detailEl;
      const ib = root.querySelector('[data-install]'); if (ib) ib.onclick = () => doInstall(it, ib);
      const ub = root.querySelector('[data-update]'); if (ub) ub.onclick = () => doUpdate(rec, upd, ub);
      const ob = root.querySelector('[data-open]'); if (ob) ob.onclick = () => openApp(rec);
      const rb = root.querySelector('[data-rollback]'); if (rb) rb.onclick = () => doRollback(rec, rb);
      const xb = root.querySelector('[data-uninstall]'); if (xb) xb.onclick = () => doUninstall(rec, xb);
      if (rec) wirePerms(rec);
    }

    function renderInstalledDetail(rec) {
      if (rec.system) {
        detailEl.innerHTML = `${hero(rec, rec.version)}${badges(rec, rec)}
          <p class="st-summary">built-in program · managed by the system and cannot be removed.</p>
          ${publisherBox(rec, rec)}
          <div class="u-row u-gap-8 st-actions"><button class="btn sm pri" data-open>open</button></div>`;
        detailEl.querySelector('[data-open]').onclick = () => openApp(rec);
        return;
      }
      const upd = pendingUpdate(rec);
      const newPerms = upd ? (upd.permissions || []).filter(p => !(rec.permissions || []).includes(p)) : [];
      const running = [...WM.wins.values()].filter(w => w.key === rec.key || w.id === rec.key).length;
      const banners = [];
      if (running) banners.push(`<div class="st-banner">${icon('win', 14)} ${running} window${running === 1 ? '' : 's'} running — updating, rolling back, or uninstalling closes ${running === 1 ? 'it' : 'them'}.</div>`);
      if (newPerms.length) banners.push(`<div class="st-banner">${icon('help', 14)} this update adds ${newPerms.map(p => esc(p)).join(', ')} — new permissions start denied.</div>`);
      const actions = [
        '<button class="btn sm pri" data-open>open</button>',
        upd ? `<button class="btn sm" data-update>update to ${esc(upd.version)}</button>` : '',
        rec.previousVersion ? `<button class="btn sm ghost" data-rollback>roll back to ${esc(rec.previousVersion)}</button>` : '',
        '<button class="btn sm danger" data-uninstall>uninstall</button>',
      ].join('');
      detailEl.innerHTML = `${hero(rec, rec.installedVersion)}${badges(rec, rec)}${banners.join('')}
        ${rec.summary ? `<p class="st-summary">${esc(rec.summary)}</p>` : ''}
        ${publisherBox(rec, rec)}
        <div class="grpbox"><span class="lbl">permissions</span>${permRows(rec.permissions, rec.key)}</div>
        <div class="grpbox"><span class="lbl">app data</span>
          <div class="st-kv"><span>private namespace</span><b class="mono-dim">${dataUsage(rec.key)} / 65536 bytes</b></div>
          <div class="u-row u-gap-8 st-actions"><button class="btn sm ghost" data-clear-data>clear app data</button></div>
        </div>
        <div class="u-row u-gap-8 st-actions">${actions}</div>`;
      wirePerms(rec);
      detailEl.querySelector('[data-open]').onclick = () => openApp(rec);
      const up = detailEl.querySelector('[data-update]'); if (up) up.onclick = () => doUpdate(rec, upd, up);
      const rb = detailEl.querySelector('[data-rollback]'); if (rb) rb.onclick = () => doRollback(rec, rb);
      const ub = detailEl.querySelector('[data-uninstall]'); if (ub) ub.onclick = () => doUninstall(rec, ub);
      const cb = detailEl.querySelector('[data-clear-data]'); if (cb) cb.onclick = () => doClearData(rec);
    }

    function renderDetail() {
      if (view === 'installed') {
        const rec = instList().find(r => r.key === sel) || sysList().find(r => r.key === sel);
        if (!rec) { detailEl.innerHTML = '<div class="store-blank">select an app</div>'; return; }
        renderInstalledDetail(rec);
        return;
      }
      const it = items().find(x => itemKey(x) === sel);
      if (!it) { detailEl.innerHTML = '<div class="store-blank">select an app</div>'; return; }
      renderBrowseDetail(it);
    }

    function refresh() { renderTabs(); renderList(); renderDetail(); }

    /* ---------- actions ---------- */
    function doInstall(entry, btn) {
      return run(btn, 'installing…', async () => {
        const perms = entry.permissions || [];
        const body = 'version ' + entry.version + ' from ' + (entry.publisherKey === 'local' ? 'a local file' : entry.publisherKey.slice(0, 12) + '…') +
          (perms.length ? '. Requests: ' + perms.join(', ') + '. New permissions start denied.' : '. No permissions requested.');
        const ok = await dialog({ title: 'install ' + entry.name + '?', body, ok: 'install' });
        if (!ok) return;
        let r;
        try { r = install(entry, { source: entry.publisherKey === 'local' ? 'local-file' : 'catalog' }); }
        catch (e) { toast('install failed — ' + esc(e.message || e), 'err'); return; }
        if (r) { sel = r.key; refresh(); }
        toast('<b>' + esc(entry.name) + '</b> installed', 'ok', { label: 'open', fn: () => r && openApp(r) });
      });
    }

    function doUpdate(rec, entry, btn) {
      if (!entry) return Promise.resolve();
      return run(btn, 'updating…', async () => {
        const newPerms = (entry.permissions || []).filter(p => !(rec.permissions || []).includes(p));
        const running = [...WM.wins.values()].filter(w => w.key === rec.key || w.id === rec.key).length;
        let body = 'update ' + rec.installedVersion + ' → ' + entry.version + '. the previous version is kept for rollback.';
        if (newPerms.length) body += ' adds ' + newPerms.join(', ') + ' — denied by default.';
        if (running) body += ' ' + running + ' open window' + (running === 1 ? '' : 's') + ' will close.';
        const ok = await dialog({ title: 'update ' + rec.name + '?', body, ok: 'update' });
        if (!ok) return;
        closeWindowsFor(rec.key);
        let r;
        try { r = updateInstall(rec.key, entry, { source: 'catalog' }); }
        catch (e) { toast('update failed — ' + esc(e.message || e), 'err'); return; }
        toast('<b>' + esc(rec.name) + '</b> updated to ' + esc(entry.version), 'ok', { label: 'open', fn: () => r && openApp(r) });
      });
    }

    async function doUpdateAll() {
      const list = updateList();
      if (!list.length || busy) return;
      const ok = await dialog({ title: 'update all?', body: 'update ' + list.length + ' app' + (list.length === 1 ? '' : 's') + '. running windows close and previous versions are kept for rollback.', ok: 'update all' });
      if (!ok) return;
      await run(null, 'updating…', async () => {
        let n = 0;
        for (const { rec, entry } of list) {
          closeWindowsFor(rec.key);
          try { updateInstall(rec.key, entry, { source: 'catalog' }); n++; } catch (e) { }
        }
        toast(n + ' app' + (n === 1 ? '' : 's') + ' updated', n ? 'ok' : 'info');
      });
    }

    function doRollback(rec, btn) {
      return run(btn, 'rolling back…', async () => {
        const ok = await dialog({ title: 'roll back ' + rec.name + '?', body: 'return to ' + rec.previousVersion + '. open windows will close.', ok: 'roll back' });
        if (!ok) return;
        closeWindowsFor(rec.key);
        let r;
        try { r = rollbackInstall(rec.key); }
        catch (e) { toast('rollback failed — ' + esc(e.message || e), 'err'); return; }
        toast('rolled back to ' + esc(rec.previousVersion), 'ok', { label: 'open', fn: () => r && openApp(r) });
      });
    }

    async function doUninstall(rec, btn) {
      if (busy) return;
      const running = [...WM.wins.values()].filter(w => w.key === rec.key || w.id === rec.key).length;
      const body = 'package code and permission grants are removed' + (running ? ', and ' + running + ' open window' + (running === 1 ? '' : 's') + ' will close' : '') +
        '. choose what happens to this app\u2019s private data.';
      const kind = await choose('uninstall ' + rec.name + '?', body, [
        { label: 'cancel', value: 'cancel', cls: 'ghost' },
        { label: 'keep data', value: 'keep' },
        { label: 'delete data', value: 'delete', cls: 'danger' },
      ]);
      if (!kind || kind === 'cancel') return;
      sel = null;
      await run(btn, 'removing…', async () => {
        closeWindowsFor(rec.key);
        try { uninstall(rec.key, { keepData: kind === 'keep' }); }
        catch (e) { toast('uninstall failed — ' + esc(e.message || e), 'err'); return; }
        toast('<b>' + esc(rec.name) + '</b> uninstalled' + (kind === 'keep' ? ' — data kept' : ' and data deleted'), 'ok');
      });
    }

    async function doClearData(rec) {
      const ok = await dialog({ title: 'clear app data?', body: 'this deletes ' + rec.name + '\u2019s private data but keeps the app installed.', ok: 'clear', danger: true });
      if (!ok) return;
      clearAppData(rec.key); toast('app data cleared', 'ok');
    }

    function openApp(rec) {
      if (rec.system) WM.open(rec.appId);
      else openInstalled(rec.key);
    }

    async function importContainer(pkg) {
      const p = await previewSource(pkg);
      if (!p.ok) { const e = p.errors[0]; toast('invalid package — ' + esc(e.code) + ' ' + esc(e.message), 'err'); return; }
      const perms = p.permissions;
      const body = 'package ' + p.digest.slice(0, 16) + '… · ' + (perms.length ? 'requests: ' + perms.join(', ') + '.' : 'requests no permissions.') + ' local packages are unverified.';
      const ok = await dialog({ title: 'install ' + p.name + ' v' + p.version + '?', body, ok: 'install' });
      if (!ok) return;
      let r;
      try { r = await installSource(pkg, { source: 'local-file' }); }
      catch (e) { toast('install failed — ' + esc(e.message || e), 'err'); return; }
      view = 'installed'; sel = r ? r.key : null; refresh();
      toast('<b>' + esc(p.name) + '</b> installed from package', 'ok', { label: 'open', fn: () => r && openApp(r) });
    }

    function importFile(file) {
      if (!file) return;
      const fr = new FileReader();
      fr.onerror = () => toast('could not read that file', 'err');
      fr.onload = async () => {
        let d;
        try { d = JSON.parse(fr.result); } catch (e) { toast('not a valid package or descriptor file', 'err'); return; }
        if (d && d.format === 'bitos-app') {
          try { await importContainer(d); }
          catch (e) { toast('install failed — ' + esc(e.message || e), 'err'); }
          return;
        }
        const v = validateDescriptor(d);
        if (!v.ok) { toast('invalid app descriptor — ' + esc(v.errors[0]), 'err'); return; }
        const body = 'local file · version ' + d.version + (d.permissions && d.permissions.length ? '. requests: ' + d.permissions.join(', ') : '. requests no permissions.') + ' local files are unverified.';
        const ok = await dialog({ title: 'install ' + d.name + '?', body, ok: 'install' });
        if (!ok) return;
        let r;
        try { r = install(d, { source: 'local-file' }); }
        catch (e) { toast('install failed — ' + esc(e.message || e), 'err'); return; }
        view = 'installed'; sel = r ? r.key : null; refresh();
        toast('<b>' + esc(d.name) + '</b> installed from file', 'ok', { label: 'open', fn: () => r && openApp(r) });
      };
      fr.readAsText(file);
    }

    function primaryAction() {
      return detailEl.querySelector('.st-actions .btn.pri:not(:disabled), .st-actions [data-install]:not(:disabled), .st-actions [data-update]:not(:disabled), .st-actions [data-open]:not(:disabled)');
    }

    /* ---------- wiring ---------- */
    body.querySelectorAll('button[data-view]').forEach(b => b.onclick = () => { view = b.dataset.view; sel = null; qEl.value = ''; q = ''; refresh(); });
    qEl.oninput = () => { q = qEl.value.trim().toLowerCase(); renderList(); };
    body.querySelector('[data-import]').onclick = () => fileEl.click();
    fileEl.onchange = () => { importFile(fileEl.files && fileEl.files[0]); fileEl.value = ''; };
    updateAllBtn.onclick = doUpdateAll;

    /* Keyboard operation for the list: arrows move, enter runs the primary action. */
    listEl.addEventListener('keydown', e => {
      const items = [...listEl.querySelectorAll('.store-item')];
      if (!items.length) return;
      const idx = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[idx < 0 ? 0 : Math.min(idx + 1, items.length - 1)].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[idx < 0 ? 0 : Math.max(idx - 1, 0)].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const b = primaryAction(); if (b) b.click();
      }
    });

    /* Re-render whenever records change, including changes made elsewhere. */
    const unsub = onEcosystemChange(() => { if (body.isConnected) refresh(); });

    refresh();
    return unsub;
  },
});
