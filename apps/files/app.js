/* Built-in app: Files. Browser preview uses scoped localStorage data; the OS
 * uses permission-checked fs.* broker methods scoped to the Bitos home. */
import { registerApp, native, esc, icon, toast, dialog } from '../../src/core/index.js';
import { openContextMenu, togglePopup } from '../../src/shell/menus.js';
import { WM } from '../../src/shell/window-manager.js';
import { SAMPLE_FILES } from '../../src/data/sample-files.js';

/* ================= files service (GUI-02) =================
   Native: broker fs.* methods over the bridge, scoped to the session home.
   Browser: simulated home filesystem in localStorage, same shapes. */
const fsapi = (() => {
  if (native) return {
    list: p => native.call('fs.list', { path: p || '.' }),
    mkdir: p => native.call('fs.mkdir', { path: p }),
    rename: (from, to) => native.call('fs.rename', { from, to }),
    remove: p => native.call('fs.delete', { path: p }),
    readText: p => native.call('fs.readText', { path: p }),
    writeText: (p, content) => native.call('fs.writeText', { path: p, content })
  };

  const KEY = 'bitos.ui.fs.v1';
  let tree = null;
  const load = () => {
    try { tree = JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { tree = null; }
    if (!tree) {
      tree = { f: {}, d: ['Documents', 'Downloads', 'Pictures'] };
      tree.f['README'] = SAMPLE_FILES['README']; tree.f['notes.txt'] = SAMPLE_FILES['notes.txt'];
      tree.f['bitos.conf'] = SAMPLE_FILES['bitos.conf']; tree.f['.profile'] = SAMPLE_FILES['.profile'];
      tree.f['Documents/notes.txt'] = SAMPLE_FILES['notes.txt']; save();
    }
  };
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(tree)); }
    catch (e) { tree = null; throw { code: 'UNAVAILABLE', message: 'file changes could not be saved; check available storage' }; }
  };
  const norm = p => {
    const out = []; String(p || '').split('/').forEach(s => {
      if (!s || s === '.') return;
      if (s === '..') out.pop(); else out.push(s);
    }); return out.join('/');
  };
  const err = (code, message) => { throw { code, message }; };
  const tick = () => new Promise(r => setTimeout(r, 50));
  const kids = (p, src) => {
    const pre = p ? p + '/' : '';
    return [...new Set(Object.keys(src).filter(k => k !== p && k.startsWith(pre) && k.slice(pre.length) && !k.slice(pre.length).includes('/')).map(k => k.slice(pre.length)))];
  };
  return {
    async list(p) {
      await tick(); load(); p = norm(p);
      const dmap = tree.d.reduce((a, d) => (a[d] = 1, a), {});
      const dirs = kids(p, dmap).map(n => ({ name: n, dir: true, size: 0, mtime: Date.now() / 1000 | 0 }));
      const files = kids(p, tree.f).map(n => ({ name: n, dir: false, size: (tree.f[(p ? p + '/' : '') + n] || '').length, mtime: Date.now() / 1000 | 0 }));
      return { path: p || '.', entries: [...dirs, ...files].sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name)) };
    },
    async mkdir(p) {
      await tick(); load(); p = norm(p); if (!p) err('INVALID_ARGUMENT', 'name required');
      if (tree.d.includes(p) || tree.f[p] !== undefined) err('CONFLICT', 'already exists');
      tree.d.push(p); save(); return { created: true };
    },
    async writeText(p, c) {
      await tick(); load(); p = norm(p); if (!p) err('INVALID_ARGUMENT', 'name required');
      if (tree.d.includes(p)) err('INVALID_ARGUMENT', 'is a directory');
      tree.f[p] = String(c); save(); return { written: true, bytes: tree.f[p].length };
    },
    async readText(p) {
      await tick(); load(); p = norm(p);
      const c = tree.f[p]; if (c === undefined) err('INVALID_ARGUMENT', 'no such file');
      return { content: c, length: c.length };
    },
    async rename(from, to) {
      await tick(); load(); from = norm(from); to = norm(to);
      if (tree.f[from] !== undefined) {
        if (tree.f[to] !== undefined || tree.d.includes(to)) err('CONFLICT', 'destination exists');
        tree.f[to] = tree.f[from]; delete tree.f[from];
      } else if (tree.d.includes(from)) {
        if (tree.d.includes(to) || tree.f[to] !== undefined) err('CONFLICT', 'destination exists');
        tree.d = tree.d.map(d => d === from ? to : d);
        Object.keys(tree.f).forEach(k => { if (k.startsWith(from + '/')) { tree.f[to + k.slice(from.length)] = tree.f[k]; delete tree.f[k]; } });
      } else err('INVALID_ARGUMENT', 'no such path');
      save(); return { renamed: true };
    },
    async remove(p) {
      await tick(); load(); p = norm(p);
      if (tree.f[p] !== undefined) { delete tree.f[p]; }
      else if (tree.d.includes(p)) {
        if (Object.keys(tree.f).some(k => k.startsWith(p + '/')) || tree.d.some(d => d.startsWith(p + '/')))
          err('CONFLICT', 'folder not empty');
        tree.d = tree.d.filter(d => d !== p);
      } else err('INVALID_ARGUMENT', 'no such path');
      save(); return { deleted: true };
    }
  };
})();

registerApp('files', {
  title: 'files', icon: 'fold', sub: 'home — /home/bitos', w: 720, h: 480, unified: true, multi: true,
  mount(body, win) {
    /* Render + state are VanJS (van.state / van.tags / van.add); the fs.* adapter
       and the shared dialog()/openContextMenu()/toast() helpers stay imperative. */
    const { div, span, button, input, textarea, aside, b } = van.tags;
    const PREF = 'bitos.ui.files.prefs';
    const join = (p, n) => p ? p + '/' + n : n;
    const base = p => p ? p.split('/').pop() : 'home';
    const ext = n => { const i = n.lastIndexOf('.'); return i > 0 ? n.slice(i + 1).toLowerCase() : ''; };
    const fmtSize = n => n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB';
    const fmtAge = t => { const d = (Date.now() / 1000 - t) / 86400 | 0; return d < 1 ? 'today' : d < 30 ? d + 'd ago' : 'old'; };
    const newTab = cwd => ({ cwd: cwd || '', sel: null, hist: [cwd || ''], hi: 0, query: '', cache: [] });
    let pref = {}; try { pref = JSON.parse(localStorage.getItem(PREF)) || {}; } catch (e) { }

    /* ---- state ---- */
    const view = van.state(['list', 'grid', 'large', 'cols'].includes(pref.view) ? pref.view : 'list');
    const sort = van.state(['name', 'size', 'mtime', 'type'].includes(pref.sort) ? pref.sort : 'name');
    const sortDir = van.state(pref.sortDir === -1 ? -1 : 1);
    const tabs = van.state([newTab('')]);
    const ti = van.state(0);
    const renaming = van.state(null);
    const editor = van.state(null);       // path of the file open in the editor
    const editorName = van.state('');
    const editorText = van.state('');
    const errState = van.state(null);
    let searchEl = null, bodyEl = null;

    const tab = () => tabs.val[ti.val];
    const updateTab = patch => { const a = tabs.val.slice(); a[ti.val] = { ...a[ti.val], ...patch }; tabs.val = a; };
    const persist = () => { try { localStorage.setItem(PREF, JSON.stringify({ view: view.val, sort: sort.val, sortDir: sortDir.val })); } catch (e) { } };

    function arrange(t) {
      const q = t.query.trim().toLowerCase();
      const rows = t.cache.filter(e => !q || e.name.toLowerCase().includes(q));
      rows.sort((x, y) => {
        if (x.dir !== y.dir) return x.dir ? -1 : 1;
        let r;
        if (sort.val === 'size') r = x.size - y.size;
        else if (sort.val === 'mtime') r = x.mtime - y.mtime;
        else if (sort.val === 'type') r = ext(x.name).localeCompare(ext(y.name)) || x.name.localeCompare(y.name);
        else r = x.name.localeCompare(y.name, undefined, { sensitivity: 'base' });
        return r * sortDir.val;
      });
      return rows;
    }
    const iconEl = (name, size, cls) => { const s = span({ class: cls || '' }); s.innerHTML = icon(name, size); return s; };

    /* ---- async data ---- */
    async function refresh() {
      const t = tab();
      try { const r = await fsapi.list(t.cwd || '.'); errState.val = null; updateTab({ cache: r.entries }); }
      catch (e) { updateTab({ cache: [] }); errState.val = e; }
    }
    async function nav(p, opts) {
      const t = tab(), push = !(opts && opts.push === false);
      if (push && t.hist[t.hi] !== p) {
        const hist = t.hist.slice(0, t.hi + 1); hist.push(p);
        updateTab({ cwd: p, sel: null, query: '', hist, hi: hist.length - 1 });
      } else updateTab({ cwd: p, sel: null, query: '' });
      editor.val = null; renaming.val = null; if (searchEl) searchEl.value = ''; await refresh();
    }
    function go(d) {
      const t = tab(), n = t.hi + d; if (n < 0 || n >= t.hist.length) return;
      updateTab({ cwd: t.hist[n], hi: n, sel: null, query: '' });
      editor.val = null; renaming.val = null; if (searchEl) searchEl.value = ''; refresh();
    }

    /* ---- item actions ---- */
    const toggleSel = name => { const t = tab(); updateTab({ sel: t.sel === name ? null : name }); };
    const openItem = e => e.dir ? nav(join(tab().cwd, e.name)) : openText(e.name);
    async function openText(n) {
      const p = join(tab().cwd, n);
      try { const r = await fsapi.readText(p); editorName.val = n; editorText.val = r.content; editor.val = p; }
      catch (e) { toast(`open: <b>${esc(e.code || 'INTERNAL')}</b> — ${esc(e.message || '')}`, 'err'); }
    }
    function focusRename() {
      const i = body.querySelector('.fm-rin'); if (!i) return;
      i.focus(); const d = i.value.lastIndexOf('.'); i.setSelectionRange(0, d > 0 ? d : i.value.length);
    }
    function startRename(name) { const n = name || tab().sel; if (!n) return; renaming.val = n; setTimeout(focusRename, 0); }
    async function createItem(kind) {
      const name = await dialog({
        title: kind === 'nf' ? 'new folder' : 'new file',
        body: kind === 'nt' ? 'creates an empty utf-8 text file' : null, input: true,
        placeholder: kind === 'nf' ? 'folder name' : 'file name', ok: 'create'
      });
      if (name == null) return; const t = tab();
      try {
        if (kind === 'nf') await fsapi.mkdir(join(t.cwd, name));
        else await fsapi.writeText(join(t.cwd, name), '');
        updateTab({ sel: name }); await refresh();
      } catch (e) { toast(`files: <b>${esc(e.code || 'INTERNAL')}</b> — ${esc(e.message || '')}`, 'err'); }
    }
    async function deleteSel() {
      const t = tab(); if (!t.sel) return;
      const ok = await dialog({
        title: `delete ${t.sel}?`, ok: 'delete', danger: true,
        body: 'this removes it from home. trash lands with the data partition.'
      });
      if (!ok) return;
      try {
        await fsapi.remove(join(t.cwd, t.sel));
        toast(`deleted <b>${esc(t.sel)}</b>`, 'ok'); updateTab({ sel: null }); await refresh();
      } catch (e) { toast(`delete: <b>${esc(e.code || 'INTERNAL')}</b> — ${esc(e.message || '')}`, 'err'); refresh(); }
    }

    /* ---- tabs / windows ---- */
    function addTab() { tabs.val = [...tabs.val, newTab('')]; ti.val = tabs.val.length - 1; editor.val = null; renaming.val = null; if (searchEl) searchEl.value = ''; refresh(); }
    function switchTab(i) {
      if (i === ti.val) return; ti.val = i; editor.val = null; renaming.val = null;
      if (searchEl) searchEl.value = tab().query; refresh();
    }
    function closeTab(i) {
      if (tabs.val.length < 2) return; const a = tabs.val.slice(); a.splice(i, 1); tabs.val = a;
      if (ti.val >= a.length) ti.val = a.length - 1; else if (i < ti.val) ti.val--;
      editor.val = null; renaming.val = null; if (searchEl) searchEl.value = tab().query; refresh();
    }
    const newWindow = () => WM.open('files',
      { key: 'files#' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: 'files' });

    /* ---- views ---- */
    function renameInput(e) {
      const inp = input({ class: 'fm-rin', value: e.name });
      let closed = false;
      const finish = async ok => {
        if (closed) return; closed = true;
        const v = inp.value.trim(), old = e.name; renaming.val = null;
        if (!ok || !v || v === old) return;
        try { await fsapi.rename(join(tab().cwd, old), join(tab().cwd, v)); updateTab({ sel: v }); }
        catch (err) { toast(`rename: <b>${esc(err.code || 'INTERNAL')}</b> — ${esc(err.message || '')}`, 'err'); }
        await refresh();
      };
      inp.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
        else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
      });
      inp.addEventListener('blur', () => finish(true));
      inp.addEventListener('click', ev => ev.stopPropagation());
      inp.addEventListener('dblclick', ev => ev.stopPropagation());
      return inp;
    }
    function row(e) {
      const t = tab();
      return div({
        class: 'fm-row' + (t.sel === e.name ? ' sel' : ''), 'data-n': e.name, 'data-dir': e.dir ? 1 : 0,
        onclick: () => toggleSel(e.name), ondblclick: () => openItem(e)
      },
        (() => { const s = span({ class: 'fm-ic' }); s.innerHTML = icon(e.dir ? 'fold' : 'doc', 15); return s; })(),
        span({ class: 'fm-nm', title: e.name }, renaming.val === e.name ? renameInput(e) : e.name),
        span({ class: 'fm-mt' }, e.dir ? 'folder' : fmtSize(e.size) + ' · ' + fmtAge(e.mtime)));
    }
    function colRow(e) {
      const t = tab();
      return div({
        class: 'fm-crow' + (t.sel === e.name ? ' sel' : ''), 'data-n': e.name, 'data-dir': e.dir ? 1 : 0,
        onclick: () => toggleSel(e.name), ondblclick: () => openItem(e)
      },
        (() => { const s = span({ class: 'fm-cic' }); s.innerHTML = icon(e.dir ? 'fold' : 'doc', 14); return s; })(),
        span({ class: 'fm-cnm', title: e.name }, renaming.val === e.name ? renameInput(e) : e.name),
        span({ class: 'fm-cmt' }, e.dir ? '' : fmtSize(e.size)));
    }
    function tile(e, size) {
      const t = tab();
      return div({
        class: 'fm-tile' + (t.sel === e.name ? ' sel' : ''), 'data-n': e.name, 'data-dir': e.dir ? 1 : 0,
        onclick: () => toggleSel(e.name), ondblclick: () => openItem(e)
      },
        (() => { const s = span({ class: 'fm-tic' }); s.innerHTML = icon(e.dir ? 'fold' : 'doc', size); return s; })(),
        span({ class: 'fm-tnm', title: e.name }, renaming.val === e.name ? renameInput(e) : e.name),
        span({ class: 'fm-tmt' }, e.dir ? 'folder' : fmtSize(e.size)));
    }
    function editorNode() {
      const ta = textarea({ spellcheck: 'false' }); ta.value = editorText.val; queueMicrotask(() => ta.focus());
      const save = button({
        class: 'btn pri sm', onclick: async () => {
          try { await fsapi.writeText(editor.val, ta.value); toast(`saved <b>${esc(editorName.val)}</b>`, 'ok'); }
          catch (e) { toast(`save: <b>${esc(e.code || 'INTERNAL')}</b> — ${esc(e.message || '')}`, 'err'); }
        }
      }, 'save');
      const close = button({ class: 'btn ghost sm', onclick: () => { editor.val = null; refresh(); } }, 'close');
      return div({ class: 'fm-ed' }, ta,
        div({ class: 'fm-edbar' }, save, close,
          span({ class: 'mono-dim' }, () => `${editorName.val} · ${fmtSize(editorText.val.length)}`)));
    }
    function contentNode() {
      if (editor.val) return editorNode();
      const t = tab(), rows = arrange(t);
      if (!rows.length) return div({ class: 'fm-empty' },
        t.query ? ['no matches for ', b(t.query)] : 'empty folder — right-click to create a folder or file');
      if (view.val === 'grid') return div({ class: 'fm-grid' }, ...rows.map(e => tile(e, 26)));
      if (view.val === 'large') return div({ class: 'fm-grid fm-grid-lg' }, ...rows.map(e => tile(e, 42)));
      if (view.val === 'cols') return div({ class: 'fm-cols' }, ...rows.map(colRow));
      return div({ class: 'fm-rows' }, ...rows.map(row));
    }
    function statusNode() {
      const e = errState.val;
      if (e) return span(span({ class: 'c-err' }, e.code || 'INTERNAL'), ` — ${esc(e.message || '')}`);
      const t = tab(), total = t.cache.length, shown = arrange(t).length;
      return span(`${t.query ? shown + ' of ' + total : total} item${total === 1 ? '' : 's'} · /home/bitos/${t.cwd}${native ? '' : ' · simulated'}`);
    }
    function crumbNode() {
      const cwd = tab().cwd, parts = [['home', '']];
      cwd.split('/').filter(Boolean).forEach((p, i) => parts.push([p, cwd.split('/').slice(0, i + 1).join('/')]));
      const kids = []; parts.forEach(([n, p], i) => {
        if (i) kids.push(span({ class: 'fm-sep' }, '›'));
        kids.push(button({ class: 'fm-cr', onclick: () => nav(p) }, n));
      });
      return span({ class: 'fm-crumb' }, ...kids);
    }
    function tabButton(t, i) {
      const kids = [span({ class: 'fm-tab-n' }, base(t.cwd))];
      if (tabs.val.length > 1) kids.push(span({
        class: 'fm-tab-x', title: 'close tab',
        onclick: e => { e.stopPropagation(); closeTab(i); }
      }, '×'));
      return button({
        class: 'fm-tab' + (i === ti.val ? ' on' : ''), title: t.cwd || 'home',
        onclick: e => { if (e.target.closest('[data-tabclose]')) return; switchTab(i); }
      }, ...kids);
    }
    const placeBtn = (ic, label, go) => button({ class: 'fm-pl', onclick: () => nav(go) }, iconEl(ic, 14, 'fm-pl-ic'), label);
    const setView = v => { view.val = v; persist(); };
    const viewSeg = v => button({
      class: () => view.val === v ? 'on' : '',
      title: v === 'large' ? 'large icons' : v === 'cols' ? 'column view' : v + ' view',
      onclick: () => setView(v)
    }, iconEl(v === 'large' ? 'max' : v, 14, 'fm-vic'));
    const SORTS = [['name', 'name'], ['size', 'size'], ['mtime', 'date'], ['type', 'type']];
    function sortButton() {
      const el = button({
        class: 'btn sm ghost', 'data-pop': '', title: 'sort by',
        onclick: () => togglePopup(el, [
          ...SORTS.map(([v, l]) => ({ t: l, check: sort.val === v, fn: () => { sort.val = v; persist(); } })),
          '-',
          { t: 'descending', check: sortDir.val < 0, fn: () => { sortDir.val = -sortDir.val; persist(); } }])
      },
        iconEl('sort', 15, 'fm-vic'),
        () => { const s = span({ class: 'fm-vic' }); s.innerHTML = icon(sortDir.val < 0 ? 'arrd' : 'arru', 12); return s; });
      return el;
    }
    function searchInput() {
      const clear = button({
        class: 'fm-search-x', type: 'button', title: 'clear search', 'aria-label': 'clear search',
        onmousedown: e => e.preventDefault(),
        onclick: () => { searchEl.value = ''; updateTab({ query: '' }); searchEl.focus(); }
      }, '×');
      searchEl = input({
        spellcheck: 'false', placeholder: 'search', 'aria-label': 'search files',
        oninput: () => updateTab({ query: searchEl.value }),
        onkeydown: e => {
          if (e.key === 'Escape' && searchEl.value) {
            e.stopPropagation(); searchEl.value = ''; updateTab({ query: '' });
          }
        }
      });
      return div({ class: 'fm-search' }, iconEl('mag', 14, 'fm-sic'), searchEl, clear);
    }
    function refreshBtn() {
      return button({ class: 'btn sm ghost', title: 'refresh', 'aria-label': 'refresh', onclick: refresh },
        iconEl('refresh', 15, 'fm-vic'));
    }
    const toolbar = () => div({ class: 'fm-tools' },
      button({ class: 'btn sm ghost', title: 'back', disabled: () => tab().hi <= 0, onclick: () => go(-1) }, iconEl('chevl', 15, 'fm-vic')),
      button({ class: 'btn sm ghost', title: 'forward', disabled: () => tab().hi >= tab().hist.length - 1, onclick: () => go(1) }, iconEl('chevr', 15, 'fm-vic')),
      button({ class: 'btn sm ghost', title: 'up one folder', onclick: () => nav(tab().cwd.split('/').slice(0, -1).join('/')) }, iconEl('chevu', 15, 'fm-vic')),
      () => crumbNode(),
      span({ class: 'fm-flex' }),
      div({ class: 'seg fm-view' }, ...['grid', 'list', 'cols', 'large'].map(viewSeg)),
      span({ class: 'fm-flex' }),
      sortButton(),
      button({ class: 'btn sm ghost', title: 'open in new window', onclick: newWindow }, iconEl('win', 15, 'fm-vic')),
      refreshBtn(),
      searchInput());

    const App = () => div({ class: 'fm' },
      aside({ class: 'fm-side' },
        div({ class: 'lbl' }, 'places'),
        placeBtn('home', 'home', ''), placeBtn('fold', 'documents', 'Documents'),
        placeBtn('down', 'downloads', 'Downloads'), placeBtn('pic', 'pictures', 'Pictures'),
        button({ class: 'fm-pl', disabled: true }, iconEl('trash', 14, 'fm-pl-ic'), 'trash ', span({ class: 'mono-dim' }, '— later')),
        div({ class: 'lbl u-mt-14' }, 'scope'),
        div({ class: 'mono-dim u-small' }, native ? 'broker fs.* — /home/bitos' : 'simulated home · localStorage')),
      div({ class: 'fm-main' },
        div({ class: 'fm-tabs' },
          () => div({ class: 'fm-tablist' }, ...tabs.val.map(tabButton)),
          button({ class: 'fm-tab-add', title: 'new tab', onclick: addTab }, '+')),
        div({ class: 'fm-body' }, () => contentNode()),
        div({ class: 'fm-status' }, () => statusNode())));

    van.add(body, App());
    if (win && win.tools) win.tools.append(toolbar());
    else body.querySelector('.fm-main').prepend(toolbar());
    bodyEl = body.querySelector('.fm-body');
    bodyEl.addEventListener('contextmenu', e => {
      if (editor.val) return; e.preventDefault();
      const item = e.target.closest('.fm-row,.fm-tile,.fm-crow');
      if (item) {
        const name = item.getAttribute('data-n'), isDir = item.getAttribute('data-dir') === '1';
        updateTab({ sel: name });
        openContextMenu(e.clientX, e.clientY, [
          { t: 'open', ic: 'ext', fn: () => isDir ? nav(join(tab().cwd, name)) : openText(name) },
          '-',
          { t: 'rename', ic: 'pen', fn: () => startRename(name) },
          { t: 'delete', ic: 'trash', fn: deleteSel }]);
      }
      else openContextMenu(e.clientX, e.clientY, [
        { t: 'new folder', ic: 'fold', fn: () => createItem('nf') },
        { t: 'new file', ic: 'doc', fn: () => createItem('nt') },
        '-',
        { t: 'refresh', ic: 'refresh', fn: refresh },
        { t: 'open in new window', ic: 'win', fn: newWindow }]);
    });
    nav('');
  }
});
