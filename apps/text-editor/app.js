/* Built-in app: Text Editor. Plain-text editing of local files in the browser;
 * the booted OS reads and writes scoped files through the fs.* broker. */
import { registerApp, esc, icon, toast, dialog } from '../../src/core/index.js';

const KEY = 'bitos.ui.editor.v1';

registerApp('text-editor', {
  title: 'editor', icon: 'doc', sub: 'plain text · local', w: 720, h: 500,
  opens: ['text/*', 'application/json', '*.txt', '*.md', '*.markdown', '*.json', '*.js', '*.mjs', '*.cjs', '*.css', '*.html', '*.xml', '*.csv', '*.tsv', '*.log', '*.yml', '*.yaml', '*.ini', '*.conf'],
  mount(body, win) {
    let name = 'untitled.txt', saved = true, wrap = true, timer = null;
    const payload = (win && win.opts && win.opts.file) || null;

    body.innerHTML = `<div class="te">
      <div class="te-tools">
        <button class="btn sm ghost" data-open title="open a text file (ctrl o)">${icon('fold', 14)} open</button>
        <button class="btn sm ghost" data-new title="new file">${icon('doc', 14)} new</button>
        <button class="btn sm pri" data-save title="download this file (ctrl s)">${icon('down', 14)} save</button>
        <span class="te-sep"></span>
        <button class="btn sm ghost on" data-wrap title="toggle word wrap" aria-pressed="true">wrap</button>
        <span class="te-flex"></span>
        <span class="te-name" data-name></span>
        <span class="mono-dim" data-stat></span>
      </div>
      <textarea class="te-area" data-area spellcheck="false" aria-label="text content"></textarea>
      <input type="file" data-file class="hide" accept=".txt,.md,.markdown,.json,.js,.mjs,.cjs,.css,.html,.xml,.csv,.tsv,.log,.yml,.yaml,.ini,.conf,text/*">
    </div>`;

    const area = body.querySelector('[data-area]');
    const file = body.querySelector('[data-file]');
    const nameEl = body.querySelector('[data-name]');
    const statEl = body.querySelector('[data-stat]');
    const wrapBtn = body.querySelector('[data-wrap]');

    function stat() {
      const lines = area.value ? area.value.split('\n').length : 0;
      statEl.textContent = `${area.value.length} chars · ${lines} lines${saved ? '' : ' · edited'}`;
      nameEl.textContent = name;
      nameEl.classList.toggle('dirty', !saved);
    }
    function stash() {
      clearTimeout(timer);
      timer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify({ name, text: area.value })); } catch (e) { } }, 400);
    }
    function setText(text, fname, isSaved) { area.value = text; if (fname) name = fname; saved = isSaved !== false; stat(); stash(); }

    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(KEY)); } catch (e) { }
    if (draft && typeof draft.text === 'string') { area.value = draft.text; name = draft.name || name; saved = false; }
    if (payload && typeof payload.text === 'string') { area.value = payload.text; name = payload.name || name; saved = true; }
    stat();

    body.querySelector('[data-open]').onclick = () => file.click();
    file.onchange = () => {
      const f = file.files && file.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { setText(String(r.result), f.name, true); toast(`opened <b>${esc(f.name)}</b>`, 'ok'); };
      r.onerror = () => toast('could not read that file', 'err');
      r.readAsText(f);
      file.value = '';
    };
    body.querySelector('[data-new]').onclick = async () => {
      if (!saved && area.value) {
        const ok = await dialog({ title: 'discard unsaved changes?', body: name, ok: 'discard', danger: true });
        if (!ok) return;
      }
      setText('', 'untitled.txt', false); area.focus();
    };
    body.querySelector('[data-save]').onclick = async () => {
      try {
        if (payload && typeof payload.save === 'function') {
          await payload.save(area.value);
          saved = true; stat(); stash(); toast('saved', 'ok'); return;
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([area.value], { type: 'text/plain;charset=utf-8' }));
        a.download = name || 'untitled.txt';
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        saved = true; stat(); stash(); toast('saved', 'ok');
      } catch (e) { toast(`could not save — ${esc(e.message || 'error')}`, 'err'); }
    };
    wrapBtn.onclick = () => {
      wrap = !wrap;
      area.classList.toggle('nowrap', !wrap);
      wrapBtn.classList.toggle('on', wrap);
      wrapBtn.setAttribute('aria-pressed', String(wrap));
    };
    area.addEventListener('input', () => { saved = false; stat(); stash(); });
    area.addEventListener('keydown', e => {
      if (e.key === 'Tab') { e.preventDefault(); area.setRangeText('  ', area.selectionStart, area.selectionEnd, 'end'); saved = false; stat(); stash(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); body.querySelector('[data-save]').click(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); file.click(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); body.querySelector('[data-new]').click(); }
    });
    area.focus();
    return () => { clearTimeout(timer); try { localStorage.setItem(KEY, JSON.stringify({ name, text: area.value })); } catch (e) { } };
  }
});
