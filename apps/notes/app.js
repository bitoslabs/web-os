/* Built-in app: Notes. Quick notes with autosave. The preview stores notes in
 * localStorage; the booted OS keeps them on the user data partition. */
import { registerApp, esc, icon, toast, dialog } from '../../src/core/index.js';

const KEY = 'bitos.ui.notes.v1';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const label = n => (n.title && n.title.trim()) || (n.body.split('\n').find(l => l.trim()) || 'untitled note').trim().slice(0, 48);

function load() {
  try { const raw = JSON.parse(localStorage.getItem(KEY)); if (raw && Array.isArray(raw.notes)) return raw; } catch (e) { }
  return { notes: [] };
}
function persist(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
  catch (e) { toast('notes could not be saved — storage is full', 'err'); return false; }
}

registerApp('notes', {
  title: 'notes', icon: 'note', sub: 'quick notes · autosave', w: 640, h: 440,
  mount(body) {
    const data = load();
    if (!data.notes.length) data.notes.push({
      id: uid(), title: 'welcome to notes',
      body: 'notes autosave as you type.\n\n· ctrl/⌘ + n — new note\n· ctrl/⌘ + s — save now\n· right-click a note — delete',
      updated: Date.now(),
    });
    let sel = data.notes.slice().sort((a, b) => b.updated - a.updated)[0].id;
    let q = '', timer = null;

    body.innerHTML = `<div class="nt">
      <aside class="nt-side">
        <div class="nt-head"><span class="lbl">notes</span>
          <button class="btn sm ghost" data-new title="new note (ctrl n)" aria-label="new note">${icon('pen', 14)}</button></div>
        <label class="nt-search"><span>${icon('mag', 13)}</span>
          <input data-q placeholder="search notes" spellcheck="false" aria-label="search notes"></label>
        <div class="nt-list" role="listbox" aria-label="notes"></div>
      </aside>
      <section class="nt-main">
        <div class="nt-bar">
          <input class="nt-title" data-title placeholder="untitled" spellcheck="false" aria-label="note title">
          <span class="nt-meta" data-meta></span>
          <button class="btn sm ghost danger" data-del title="delete note" aria-label="delete note">${icon('trash', 14)}</button>
        </div>
        <textarea class="nt-body" data-body placeholder="start typing…" spellcheck="false" aria-label="note body"></textarea>
        <div class="nt-foot"><span class="lbl c-dim" data-status>saved</span><span class="mono-dim" data-count></span></div>
      </section></div>`;

    const listEl = body.querySelector('.nt-list');
    const qEl = body.querySelector('[data-q]');
    const titleEl = body.querySelector('[data-title]');
    const bodyEl = body.querySelector('[data-body]');
    const metaEl = body.querySelector('[data-meta]');
    const statusEl = body.querySelector('[data-status]');
    const countEl = body.querySelector('[data-count]');
    const cur = () => data.notes.find(n => n.id === sel) || null;

    const count = () => `${bodyEl.value.length} chars · ${bodyEl.value ? bodyEl.value.split('\n').length : 0} lines`;
    function mark(saving) {
      statusEl.textContent = saving ? 'saving…' : 'saved';
      statusEl.classList.toggle('c-warn', !!saving);
      statusEl.classList.toggle('c-dim', !saving);
    }
    function flush() {
      clearTimeout(timer); timer = null;
      const n = cur(); if (!n) return;
      n.title = titleEl.value; n.body = bodyEl.value; n.updated = Date.now();
      if (persist(data)) mark(false);
    }
    function queue() { mark(true); clearTimeout(timer); timer = setTimeout(() => { flush(); renderList(); }, 350); }
    function when(ts) {
      const s = Math.round((Date.now() - ts) / 1000);
      if (s < 60) return 'just now';
      if (s < 3600) return Math.floor(s / 60) + 'm ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      return new Date(ts).toLocaleDateString();
    }
    function renderList() {
      const rows = data.notes.slice().sort((a, b) => b.updated - a.updated)
        .filter(n => !q || (n.title + ' ' + n.body).toLowerCase().includes(q));
      if (!rows.length) { listEl.innerHTML = `<div class="nt-empty">${q ? 'no notes match' : 'no notes yet'}</div>`; return; }
      listEl.innerHTML = rows.map(n => `<button class="nt-item${n.id === sel ? ' on' : ''}" data-id="${n.id}" role="option" aria-selected="${n.id === sel}">
        <span class="nt-iname">${esc(label(n))}</span>
        <span class="nt-iprev">${esc((n.body.split('\n').find(l => l.trim()) || 'empty').slice(0, 90))}</span>
        <span class="nt-itime">${when(n.updated)}</span></button>`).join('');
    }
    function renderEditor() {
      const n = cur();
      if (!n) { titleEl.value = ''; bodyEl.value = ''; metaEl.textContent = ''; countEl.textContent = ''; return; }
      titleEl.value = n.title || ''; bodyEl.value = n.body || '';
      metaEl.textContent = new Date(n.updated).toLocaleString();
      countEl.textContent = count();
      mark(false);
    }
    function select(id) { sel = id; renderList(); renderEditor(); }
    function create() {
      flush();
      const n = { id: uid(), title: '', body: '', updated: Date.now() };
      data.notes.push(n); persist(data); select(n.id); titleEl.focus();
    }
    async function del() {
      const n = cur(); if (!n) return;
      const ok = await dialog({ title: 'delete this note?', body: label(n), ok: 'delete', danger: true });
      if (!ok) return;
      data.notes = data.notes.filter(x => x.id !== n.id);
      persist(data);
      sel = data.notes.slice().sort((a, b) => b.updated - a.updated)[0]?.id ?? null;
      renderList(); renderEditor();
    }

    body.querySelector('[data-new]').onclick = create;
    body.querySelector('[data-del]').onclick = del;
    qEl.oninput = () => { q = qEl.value.trim().toLowerCase(); renderList(); };
    titleEl.oninput = queue;
    bodyEl.oninput = () => { queue(); countEl.textContent = count(); };
    listEl.onclick = e => { const b = e.target.closest('.nt-item'); if (b) { flush(); select(b.dataset.id); } };
    listEl.oncontextmenu = e => { const b = e.target.closest('.nt-item'); if (!b) return; e.preventDefault(); flush(); select(b.dataset.id); del(); };
    body.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); create(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flush(); toast('notes saved', 'ok'); }
    });
    body.tabIndex = -1;
    renderList(); renderEditor();
    setTimeout(() => titleEl.focus(), 0);
    return () => flush();
  }
});
