/* Built-in app: Docs. Rich-text word processing for the Bitos office suite.
 * Edits contenteditable HTML in the preview and reads/writes real .docx through
 * src/office. The booted OS saves bytes back through the fs.* broker. */
import { registerApp, esc, icon, toast, dialog, appStorage, syncConfig, configureSync } from '../../src/office/host.js';
import { blocksToDocx, docxToDocument, htmlToBlocks, blocksToHtml, blocksToPlain, plainToBlocks, diffBlocks, bindRibbon, setupOverflow, DOCX_MIME } from '../../src/office/index.js';
import { MANIFESTS } from '../../src/office/manifests.js';

const KEY = 'bitos.ui.docs.v1';
const baseName = n => String(n || 'untitled').replace(/\.[^.]+$/, '') || 'untitled';

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

registerApp(MANIFESTS.docs.id, {
  ...MANIFESTS.docs,
  mount(body, win) {
    let name = 'untitled.docx', saved = true, timer = null;
    const payload = (win && win.opts && win.opts.file) || null;
    const store = appStorage('docs');

    /* The document bar lives in the OS window header (win.tools, unified). */
    const tools = document.createElement('div');
    tools.className = 'dc-tools';
    tools.innerHTML = `
      <span class="dc-autosave" data-no-drag><i></i>autosave</span>
      <button class="dc-ib" data-cmd="undo" title="undo">${icon('undo', 15)}</button>
      <button class="dc-ib" data-cmd="redo" title="redo">${icon('redo', 15)}</button>
      <span class="dc-fname" data-title role="textbox" tabindex="0" spellcheck="false" title="double-click to rename" aria-label="document name">untitled</span>
      <div class="dc-docbar-r" data-no-drag>
        <select class="rselect" data-fmt aria-label="save format" title="save format"><option value="docx">.docx</option><option value="html">.html</option><option value="txt">.txt</option></select>
        <button class="dc-sync" data-sync title="cloud sync"><span class="dc-sync-dot"></span><span data-sync-label>local</span></button>
        <label class="dc-search">${icon('mag', 14)}<input data-find-input placeholder="search (ctrl f)" spellcheck="false" aria-label="search document"></label>
      </div>`;
    if (win && win.tools) win.tools.append(tools);

    /* File/Edit/View commands surface in the global OS menu bar for this window.
       Built lazily so it reads current state (ruler/grid/zoom) when opened. */
    if (win) win.menu = () => ({
      file: [
        { t: 'new document', ic: 'doc', k: '<kbd>ctrl n</kbd>', fn: () => newDoc() },
        { t: 'open…', ic: 'fold', k: '<kbd>ctrl o</kbd>', fn: () => file.click() }, '-',
        { t: 'save', ic: 'down', k: '<kbd>ctrl s</kbd>', fn: () => saveFile() },
        { t: 'save as…', ic: 'fold', fn: () => saveAs() }, '-',
        { t: 'print / pdf', ic: 'win', k: '<kbd>ctrl p</kbd>', fn: () => printDoc() },
      ],
      edit: [
        { t: 'undo', ic: 'undo', fn: () => exec('undo') },
        { t: 'redo', ic: 'redo', fn: () => exec('redo') }, '-',
        { t: 'find…', ic: 'mag', k: '<kbd>ctrl f</kbd>', fn: () => findText() },
        { t: 'replace…', fn: () => replaceText() },
      ],
      view: [
        { t: 'ruler', check: showRuler, fn: toggleRuler },
        { t: 'gridlines', check: showGrid, fn: toggleGrid }, '-',
        { t: 'zoom in', fn: () => setZoom(zoom + 0.1) },
        { t: 'zoom out', fn: () => setZoom(zoom - 0.1) },
        { t: 'reset zoom', k: '100%', fn: () => setZoom(1) },
      ],
    });

    body.innerHTML = `<div class="dc">
      <div class="dc-bar ribbon">
        <div class="ribbon-tabs">
          <button class="ribbon-tab on" data-tab="home">Home</button>
          <button class="ribbon-tab" data-tab="insert">Insert</button>
          <button class="ribbon-tab" data-tab="view">View</button>
          <button class="ribbon-tab" data-tab="review">Review</button>
        </div>
        <div class="ribbon-body">
          <div class="ribbon-panel on" data-panel="home">
            <div class="rgroup rows"><div class="rgroup-items">
              <div class="rcol">
                <div class="rrow">
                  <select class="rselect" data-font title="font family" aria-label="font family">
                    <option value="Calibri">Calibri</option><option value="Georgia">Georgia</option>
                    <option value="Times New Roman">Times New Roman</option><option value="Arial">Arial</option>
                    <option value="Courier New">Courier New</option><option value="Verdana">Verdana</option>
                  </select>
                  <select class="rselect" data-size title="font size" aria-label="font size">
                    <option value="1">8</option><option value="2">10</option><option value="3" selected>12</option>
                    <option value="4">14</option><option value="5">18</option><option value="6">24</option><option value="7">36</option>
                  </select>
                </div>
                <div class="rrow">
                  <button class="rbtn sq" data-cmd="bold" title="bold"><b>B</b></button>
                  <button class="rbtn sq" data-cmd="italic" title="italic"><i>I</i></button>
                  <button class="rbtn sq" data-cmd="underline" title="underline"><u>U</u></button>
                  <button class="rbtn sq" data-cmd="strikeThrough" title="strikethrough"><span style="text-decoration:line-through">S</span></button>
                  <button class="rbtn sq" data-cmd="subscript" title="subscript">x&#8322;</button>
                  <button class="rbtn sq" data-cmd="superscript" title="superscript">x&#178;</button>
                  <input type="color" class="rcolor" data-color value="#e5484d" title="font colour" aria-label="font colour">
                  <input type="color" class="rcolor" data-hilite value="#ffe08a" title="highlight colour" aria-label="highlight colour">
                  <button class="rbtn sq" data-cmd="removeFormat" title="clear formatting">${icon('close', 13)}</button>
                </div>
              </div>
            </div><div class="rgroup-label">font</div></div>
            <div class="rgroup rows"><div class="rgroup-items"><div class="rcol">
              <div class="rrow">
                <button class="rbtn sq" data-cmd="insertUnorderedList" title="bullet list">${icon('list', 16)}</button>
                <button class="rbtn sq" data-cmd="insertOrderedList" title="numbered list">1.</button>
                <button class="rbtn sq" data-cmd="outdent" title="decrease indent">${icon('chevl', 15)}</button>
                <button class="rbtn sq" data-cmd="indent" title="increase indent">${icon('chevr', 15)}</button>
              </div>
              <div class="rrow">
                <button class="rbtn sq" data-cmd="justifyLeft" title="align left">${icon('alignl', 16)}</button>
                <button class="rbtn sq" data-cmd="justifyCenter" title="align center">${icon('alignc', 16)}</button>
                <button class="rbtn sq" data-cmd="justifyRight" title="align right">${icon('alignr', 16)}</button>
                <button class="rbtn sq" data-cmd="justifyFull" title="justify">${icon('just', 16)}</button>
              </div>
            </div></div><div class="rgroup-label">paragraph</div></div>
            <div class="rgroup"><div class="rgroup-items">
              <button class="rstyle" data-style="p" title="normal">Normal</button>
              <button class="rstyle h1" data-style="h1" title="heading 1">Heading 1</button>
              <button class="rstyle h2" data-style="h2" title="heading 2">Heading 2</button>
              <button class="rstyle h3" data-style="h3" title="heading 3">Heading 3</button>
              <button class="rstyle quote" data-style="blockquote" title="quote">Quote</button>
            </div><div class="rgroup-label">styles</div></div>
            <div class="rgroup"><div class="rgroup-items">
              <button class="rbtn" data-find title="find (ctrl f)"><span class="ric">${icon('mag', 17)}</span>find</button>
              <button class="rbtn" data-replace title="replace"><span class="ric">ab</span>replace</button>
            </div><div class="rgroup-label">editing</div></div>
          </div>
          <div class="ribbon-panel" data-panel="insert">
            <div class="rgroup"><div class="rgroup-items">
              <button class="rbtn" data-image title="insert a picture"><span class="ric">${icon('pic', 17)}</span>picture</button>
              <button class="rbtn" data-table title="insert a table"><span class="ric">${icon('grid', 17)}</span>table</button>
            </div><div class="rgroup-label">media</div></div>
            <div class="rgroup"><div class="rgroup-items">
              <button class="rbtn" data-link title="insert link"><span class="ric">${icon('ext', 17)}</span>link</button>
            </div><div class="rgroup-label">links</div></div>
            <div class="rgroup"><div class="rgroup-items">
              <button class="rbtn" data-print title="print / pdf (ctrl p)"><span class="ric">${icon('win', 17)}</span>print / pdf</button>
            </div><div class="rgroup-label">output</div></div>
          </div>
          <div class="ribbon-panel" data-panel="view">
            <div class="rgroup"><div class="rgroup-items">
              <button class="rbtn sq" data-ruler title="toggle ruler">${icon('ruler', 16)}</button>
              <button class="rbtn sq" data-grid title="toggle gridlines">${icon('grid', 16)}</button>
              <div class="rstack"><select class="rselect" data-pagesize aria-label="page size" title="page size">
                <option value="letter">letter</option><option value="a4">a4</option><option value="legal">legal</option>
              </select><span class="rmini">page</span></div>
            </div><div class="rgroup-label">page</div></div>
            <div class="rgroup"><div class="rgroup-items">
              <button class="rbtn sq" data-orient="portrait" title="portrait orientation">&#9633;</button>
              <button class="rbtn sq" data-orient="landscape" title="landscape orientation">&#9647;</button>
            </div><div class="rgroup-label">orientation</div></div>
            <div class="rgroup"><div class="rgroup-items">
              <button class="rbtn sq" data-zoomout title="zoom out">&minus;</button>
              <button class="rbtn sq" data-zoomreset title="reset zoom"><span data-zoomlabel>100%</span></button>
              <button class="rbtn sq" data-zoomin title="zoom in">+</button>
            </div><div class="rgroup-label">zoom</div></div>
            <div class="rgroup"><div class="rgroup-items">
              <div class="rbtn" style="pointer-events:none"><span class="ric" data-statnum>0</span>words</div>
              <div class="rbtn" style="pointer-events:none"><span class="ric" data-statnum2>0</span>characters</div>
            </div><div class="rgroup-label">document</div></div>
          </div>
          <div class="ribbon-panel" data-panel="review">
            <div class="rgroup"><div class="rgroup-items">
              <button class="rbtn" data-comment-new title="add a comment"><span class="ric">${icon('note', 17)}</span>new comment</button>
              <button class="rbtn" data-comment-toggle title="show or hide comments"><span class="ric">${icon('list', 17)}</span>comments</button>
            </div><div class="rgroup-label">comments</div></div>
            <div class="rgroup"><div class="rgroup-items">
              <button class="rbtn" data-track title="track changes"><span class="ric">${icon('pen', 17)}</span>track</button>
              <button class="rbtn" data-accept title="accept all changes"><span class="ric">${icon('check', 17)}</span>accept</button>
              <button class="rbtn" data-reject title="reject all changes"><span class="ric">${icon('undo', 17)}</span>reject</button>
              <div class="rbtn" style="pointer-events:none"><span class="ric" data-revnum>0</span>changes</div>
            </div><div class="rgroup-label">tracking</div></div>
          </div>
        </div>
      </div>
      <div class="dc-body">
        <div class="dc-scroll"><div class="dc-wrap">
          <div class="dc-ruler" data-ruler hidden aria-hidden="true"></div>
          <div class="dc-sheet size-letter" data-sheet>
            <div class="dc-hf" data-header contenteditable="true" data-ph="header" spellcheck="false" aria-label="header"></div>
            <div class="dc-page" data-page contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="document body"></div>
            <div class="dc-hf" data-footer contenteditable="true" data-ph="footer" spellcheck="false" aria-label="footer"></div>
          </div>
        </div></div>
        <aside class="dc-comments" data-comments hidden aria-label="comments"></aside>
      </div>
      <div class="statusbar"><span class="sb-name" data-filename></span><span data-status></span><span class="sb-fx"></span><span class="mono-dim">docs · .docx</span></div>
      <input type="file" data-file class="hide" accept=".docx,.html,.htm,.md,.markdown,.txt,text/plain,text/html,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
      <input type="file" data-img class="hide" accept="image/*">
    </div>`;

    const page = body.querySelector('[data-page]');
    const sheetEl = body.querySelector('[data-sheet]');
    const rulerEl = body.querySelector('[data-ruler]');
    const headerEl = body.querySelector('[data-header]');
    const footerEl = body.querySelector('[data-footer]');
    let pageSize = 'letter', showGrid = false, showRuler = false, zoom = 1, orientation = 'portrait', comments = [];
    let trackChanges = false, baselineHtml = '';
    const PAGE_PX = { letter: { w: 816, h: 1056 }, a4: { w: 794, h: 1123 }, legal: { w: 816, h: 1344 } };
    const file = body.querySelector('[data-file]');
    const imgFile = body.querySelector('[data-img]');
    const titleEl = tools.querySelector('[data-title]');
    const statusEl = body.querySelector('[data-status]');
    const statNumEl = body.querySelector('[data-statnum]');
    const statNum2El = body.querySelector('[data-statnum2]');
    const fmtEl = tools.querySelector('[data-fmt]');
    const fontEl = body.querySelector('[data-font]');
    const sizeEl = body.querySelector('[data-size]');
    const colorEl = body.querySelector('[data-color]');
    const hiliteEl = body.querySelector('[data-hilite]');
    const ribbonEl = body.querySelector('.ribbon');
    bindRibbon(ribbonEl);
    const ribbonOverflow = setupOverflow(ribbonEl);
    try { document.execCommand('styleWithCSS', false, true); } catch (e) {}

    /* Keep the last editor selection so toolbar controls (selects, colour
       inputs) can apply formatting without losing it. */
    let savedRange = null;
    const saveSel = () => {
      const s = window.getSelection();
      if (s && s.rangeCount && page.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange();
    };
    const restoreSel = () => {
      if (!savedRange) return;
      const s = window.getSelection();
      s.removeAllRanges(); s.addRange(savedRange);
    };
    fontEl.addEventListener('change', () => { if (fontEl.value) exec('fontName', fontEl.value); });
    sizeEl.addEventListener('change', () => exec('fontSize', sizeEl.value));
    colorEl.addEventListener('change', () => exec('foreColor', colorEl.value));
    hiliteEl.addEventListener('change', () => exec('hiliteColor', hiliteEl.value));
    body.querySelector('[data-pagesize]').addEventListener('change', e => { pageSize = e.target.value; applyView(); markDirty(); });

    function stat() {
      const text = page.innerText || '';
      const words = (text.trim().match(/\S+/g) || []).length;
      statusEl.textContent = `${words} words · ${text.length} chars`;
      statusEl.classList.toggle('dirty', !saved);
      if (statNumEl) statNumEl.textContent = String(words);
      if (statNum2El) statNum2El.textContent = String(text.length);
      const nameView = body.querySelector('[data-filename]');
      if (nameView) { nameView.textContent = name; nameView.classList.toggle('dirty', !saved); }
    }
    const snapshot = () => ({ name, html: page.innerHTML, header: headerEl.textContent, footer: footerEl.textContent, pageSize, showGrid, showRuler, zoom, orientation, comments, trackChanges, baselineHtml });
    function applyView() {
      const p = PAGE_PX[pageSize] || PAGE_PX.letter;
      const W = orientation === 'landscape' ? p.h : p.w;
      const H = orientation === 'landscape' ? p.w : p.h;
      sheetEl.style.width = W + 'px';
      page.style.minHeight = H + 'px';
      sheetEl.style.zoom = String(zoom);
      page.classList.toggle('show-grid', showGrid);
      rulerEl.hidden = !showRuler;
      const rb = body.querySelector('[data-ruler]'); if (rb) rb.classList.toggle('on', showRuler);
      const gb = body.querySelector('[data-grid]'); if (gb) gb.classList.toggle('on', showGrid);
      const ps = body.querySelector('[data-pagesize]'); if (ps) ps.value = pageSize;
      const zl = body.querySelector('[data-zoomlabel]'); if (zl) zl.textContent = Math.round(zoom * 100) + '%';
      for (const ob of body.querySelectorAll('[data-orient]')) ob.classList.toggle('on', ob.dataset.orient === orientation);
    }
    function toggleRuler() { showRuler = !showRuler; applyView(); markDirty(); }
    function toggleGrid() { showGrid = !showGrid; applyView(); markDirty(); }
    function setZoom(z) { zoom = Math.max(0.5, Math.min(2, Math.round(z * 10) / 10)); applyView(); markDirty(); }
    function setOrient(o) { orientation = o === 'landscape' ? 'landscape' : 'portrait'; applyView(); markDirty(); }

    const commentsEl = body.querySelector('[data-comments]');
    function renderComments() {
      commentsEl.innerHTML = `<div class="dc-chead">comments · ${comments.length}</div>` +
        (comments.length
          ? comments.map(c => `<div class="dc-comment"><p>${esc(c.text)}</p><div class="dc-cmeta"><span>${esc(c.author || 'you')}</span><button class="dc-cx" data-delcomment="${esc(c.id)}" title="delete comment">${icon('trash', 11)}</button></div></div>`).join('')
          : '<p class="dc-cempty">no comments yet</p>');
    }
    function showComments(on) { commentsEl.hidden = !on; const b = body.querySelector('[data-comment-toggle]'); if (b) b.classList.toggle('on', !!on); }
    async function newComment() {
      const text = await dialog({ title: 'new comment', input: true, placeholder: 'comment', ok: 'add' });
      if (!text) return;
      comments.push({ id: 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), author: 'you', text, created: Date.now() });
      showComments(true); renderComments(); markDirty();
    }
    commentsEl.addEventListener('click', e => {
      const b = e.target.closest('[data-delcomment]'); if (!b) return;
      comments = comments.filter(c => c.id !== b.dataset.delcomment); renderComments(); markDirty();
    });

    /* Tracked changes: diff the current document against a baseline. */
    function revisions() {
      if (!trackChanges || !baselineHtml) return [];
      try { return diffBlocks(htmlToBlocks(baselineHtml), htmlToBlocks(page.innerHTML)); } catch (e) { return []; }
    }
    function renderTrack() {
      const tb = body.querySelector('[data-track]'); if (tb) tb.classList.toggle('on', trackChanges);
      const n = body.querySelector('[data-revnum]'); if (n) n.textContent = String(revisions().filter(o => o.op !== 'same').length);
    }
    function toggleTrack() {
      if (!trackChanges && !baselineHtml) baselineHtml = page.innerHTML;
      trackChanges = !trackChanges;
      renderTrack(); markDirty();
      toast(trackChanges ? 'tracking changes' : 'tracking off', 'info');
    }
    function acceptAll() { baselineHtml = page.innerHTML; renderTrack(); markDirty(); toast('all changes accepted', 'ok'); }
    function rejectAll() {
      if (!baselineHtml) { toast('no tracked changes', 'info'); return; }
      setHtml(baselineHtml, name, false); renderTrack(); markDirty(); toast('all changes rejected', 'ok');
    }
    function stash() {
      clearTimeout(timer);
      timer = setTimeout(() => store.save(KEY, snapshot()), 400);
    }
    const markDirty = () => { saved = false; stat(); stash(); if (trackChanges) renderTrack(); };
    function setHtml(html, fname, isSaved) {
      page.innerHTML = html || '<p><br></p>';
      if (fname) { name = fname; titleEl.textContent = baseName(fname); }
      saved = isSaved !== false; stat(); stash();
    }
    function exec(cmd, value) {
      page.focus(); restoreSel();
      try { document.execCommand(cmd, false, value); } catch (e) {}
      saveSel(); markDirty(); sync();
    }
    function sync() {
      const on = (cmd, el) => { try { el.classList.toggle('on', document.queryCommandState(cmd)); } catch (e) {} };
      for (const b of body.querySelectorAll('[data-cmd]')) {
        const cmd = b.dataset.cmd;
        if (cmd === 'bold' || cmd === 'italic' || cmd === 'underline' || cmd === 'strikeThrough' || cmd === 'subscript' || cmd === 'superscript' || cmd === 'insertUnorderedList' || cmd === 'insertOrderedList') on(cmd, b);
      }
      let block = '';
      try { block = (document.queryCommandValue('formatBlock') || '').toLowerCase(); } catch (e) {}
      for (const b of body.querySelectorAll('[data-block]')) b.classList.toggle('on', b.dataset.block === block);
    }

    setHtml('<p><br></p>', name, true);
    applyView(); renderComments(); renderTrack();
    store.load(KEY, null).then(draft => {
      if (payload) return;
      if (draft && typeof draft.html === 'string') {
        setHtml(draft.html, draft.name || name, false);
        if (draft.header) headerEl.textContent = draft.header;
        if (draft.footer) footerEl.textContent = draft.footer;
        pageSize = draft.pageSize || 'letter'; showGrid = !!draft.showGrid; showRuler = !!draft.showRuler;
        zoom = draft.zoom || 1; orientation = draft.orientation || 'portrait';
        comments = Array.isArray(draft.comments) ? draft.comments : [];
        trackChanges = !!draft.trackChanges; baselineHtml = typeof draft.baselineHtml === 'string' ? draft.baselineHtml : '';
        applyView(); renderComments(); showComments(comments.length > 0); renderTrack();
      }
    });

    async function loadPayload() {
      if (!payload) return;
      try {
        if (payload.bytes) {
          const doc = await docxToDocument(payload.bytes);
          setHtml(blocksToHtml(doc.blocks), payload.name || name, true);
          if (doc.header) headerEl.textContent = doc.header;
          if (doc.footer) footerEl.textContent = doc.footer;
          if (doc.pageSize) { pageSize = doc.pageSize; applyView(); }
          if (doc.orientation) { orientation = doc.orientation; applyView(); }
          if (Array.isArray(doc.comments)) { comments = doc.comments; renderComments(); showComments(comments.length > 0); }
        } else if (typeof payload.text === 'string') {
          const html = /html|markdown/.test(payload.mime || '') ? payload.text : blocksToHtml(plainToBlocks(payload.text));
          setHtml(html, payload.name || name, true);
        }
      } catch (e) { toast(`open: ${esc(e.message || 'could not read document')}`, 'err'); }
    }
    loadPayload();

    imgFile.onchange = () => {
      const f = imgFile.files && imgFile.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => insertImage(String(r.result));
      r.onerror = () => toast('could not read that image', 'err');
      r.readAsDataURL(f);
      imgFile.value = '';
    };
    function insertImage(dataUrl) {
      const probe = new Image();
      probe.onload = () => {
        const max = 520;
        let w = probe.naturalWidth || 320, h = probe.naturalHeight || 200;
        if (w > max) { h = Math.round(h * max / w); w = max; }
        page.focus(); restoreSel();
        const node = document.createElement('img');
        node.src = dataUrl; node.width = w; node.height = h; node.alt = 'image';
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0); range.deleteContents(); range.insertNode(node);
          range.setStartAfter(node); range.collapse(true); sel.removeAllRanges(); sel.addRange(range);
        } else page.append(node);
        saveSel(); markDirty();
      };
      probe.onerror = () => toast('could not load that image', 'err');
      probe.src = dataUrl;
    }

    async function insertTable() {
      const spec = await dialog({ title: 'insert table', input: true, value: '3x2', placeholder: 'rows x columns', ok: 'insert' });
      if (!spec) return;
      const m = /^(\d+)\s*[x×,]\s*(\d+)$/i.exec(spec.trim());
      if (!m) { toast('use <b>rows x columns</b>, e.g. 3x2', 'err'); return; }
      const rows = Math.min(20, Math.max(1, +m[1])), cols = Math.min(12, Math.max(1, +m[2]));
      let html = '<table class="dc-table">';
      for (let r = 0; r < rows; r++) { html += '<tr>'; for (let c = 0; c < cols; c++) html += '<td><br></td>'; html += '</tr>'; }
      html += '</table><p><br></p>';
      page.focus(); restoreSel();
      try { document.execCommand('insertHTML', false, html); } catch (e) { page.insertAdjacentHTML('beforeend', html); }
      saveSel(); markDirty();
    }

    /* Toolbar: keep the contenteditable selection by not focusing on mousedown
       (mousedown, not pointerdown, so the click event is not suppressed). */
    async function handleAction(btn) {
      if (btn.dataset.cmd) exec(btn.dataset.cmd);
      else if (btn.dataset.block) exec('formatBlock', `<${btn.dataset.block}>`);
      else if (btn.hasAttribute('data-link')) {
        const url = await dialog({ title: 'link url', input: true, placeholder: 'https://', ok: 'insert' });
        if (url) exec('createLink', url);
      }
      else if (btn.dataset.image != null) imgFile.click();
      else if (btn.dataset.table != null) insertTable();
      else if (btn.dataset.style) exec('formatBlock', `<${btn.dataset.style}>`);
      else if (btn.hasAttribute('data-ruler')) toggleRuler();
      else if (btn.hasAttribute('data-grid')) toggleGrid();
      else if (btn.hasAttribute('data-zoomin')) setZoom(zoom + 0.1);
      else if (btn.hasAttribute('data-zoomout')) setZoom(zoom - 0.1);
      else if (btn.hasAttribute('data-zoomreset')) setZoom(1);
      else if (btn.dataset.orient) setOrient(btn.dataset.orient);
      else if (btn.hasAttribute('data-saveas')) saveAs();
      else if (btn.hasAttribute('data-comment-new')) newComment();
      else if (btn.hasAttribute('data-comment-toggle')) showComments(commentsEl.hidden);
      else if (btn.hasAttribute('data-track')) toggleTrack();
      else if (btn.hasAttribute('data-accept')) acceptAll();
      else if (btn.hasAttribute('data-reject')) rejectAll();
      else if (btn.hasAttribute('data-sync')) configureSyncUI();
      else if (btn.hasAttribute('data-find')) findText();
      else if (btn.hasAttribute('data-replace')) replaceText();
      else if (btn.dataset.open != null) file.click();
      else if (btn.dataset.new != null) newDoc();
      else if (btn.dataset.save != null) saveFile();
      else if (btn.dataset.print != null) printDoc();
    }
    body.querySelector('.dc-bar').addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
    body.querySelector('.dc-bar').addEventListener('click', e => { const b = e.target.closest('button'); if (b) handleAction(b); });
    tools.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
    tools.addEventListener('click', e => { const b = e.target.closest('button'); if (b) handleAction(b); });
    const findInput = tools.querySelector('[data-find-input]');
    findInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); const q = findInput.value.trim(); if (q) findText(q); }
    });

    /* Cloud sync: local IndexedDB saves always happen; this uploads to the
       configured server (or a local simulated remote) in the background. */
    const syncBtn = tools.querySelector('[data-sync]');
    const syncLabel = tools.querySelector('[data-sync-label]');
    function renderSync(state) {
      const st = state || store.status(KEY);
      const text = st.state === 'off' ? 'local only'
        : st.state === 'syncing' ? 'syncing…'
          : st.state === 'error' ? 'sync error'
            : st.simulated ? 'synced (local)' : 'synced';
      if (syncLabel) syncLabel.textContent = text;
      if (syncBtn) { syncBtn.classList.toggle('on', st.state === 'synced'); syncBtn.classList.toggle('err', st.state === 'error'); }
    }
    async function configureSyncUI() {
      const cur = syncConfig();
      const url = await dialog({
        title: 'cloud sync server', input: true, value: cur.url, placeholder: 'https://server (blank = local only)', ok: 'save',
        body: cur.enabled ? `syncing to <b>${esc(cur.url)}</b>` : 'documents save locally; add a server URL to sync them',
      });
      if (url == null) return;
      const next = configureSync({ url, enabled: !!String(url).trim() });
      if (next.enabled) store.pushNow(KEY, snapshot());
      renderSync();
      toast(next.enabled ? `syncing to <b>${esc(next.url)}</b>` : 'cloud sync off — saving locally only', next.enabled ? 'ok' : 'info');
    }
    const unsubSync = store.onSync((k, st) => renderSync(st));
    renderSync();

    async function findText(initial) {
      const q = initial || await dialog({ title: 'find', input: true, placeholder: 'text to find', ok: 'find' });
      if (!q) return;
      page.focus();
      if (typeof window.find === 'function' && window.find(q, false, false, true)) { saveSel(); return; }
      toast(`no match for <b>${esc(q)}</b>`, 'info');
    }
    async function replaceText() {
      const q = await dialog({ title: 'replace', input: true, placeholder: 'find text', ok: 'next' });
      if (!q) return;
      const r = await dialog({ title: `replace “${q}” with`, input: true, placeholder: 'replacement', ok: 'replace all' });
      if (r == null) return;
      let n = 0;
      const walk = node => {
        if (node.nodeType === 3) { if (node.nodeValue.includes(q)) { n += node.nodeValue.split(q).length - 1; node.nodeValue = node.nodeValue.split(q).join(r); } return; }
        if (node.nodeType === 1) for (const child of [...node.childNodes]) walk(child);
      };
      walk(page);
      if (n) { markDirty(); toast(`replaced ${n} occurrence${n > 1 ? 's' : ''}`, 'ok'); }
      else toast('no matches', 'info');
    }

    /* Print the document by rendering it into a hidden same-origin iframe and
       invoking the browser print dialog (printers and "Save as PDF"). */
    let printing = false;
    function printDoc() {
      if (printing) return;
      printing = true;
      const frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
      let printed = false;
      const cleanup = () => setTimeout(() => { frame.remove(); printing = false; }, 500);
      frame.onload = () => {
        if (printed) return; // about:blank load followed by srcdoc load
        printed = true;
        const win = frame.contentWindow;
        if (!win) return cleanup();
        win.addEventListener('afterprint', cleanup, { once: true });
        win.focus();
        win.print();
      };
      /* Set the content before appending, and print only on the first load. */
      frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(baseName(name))}</title>
        <style>
          @page{size:letter;margin:20mm}
          html,body{margin:0;padding:0}
          body{font:12pt/1.55 "Helvetica Neue",Arial,sans-serif;color:#111}
          h1{font-size:20pt;margin:.5em 0 .3em}h2{font-size:16pt;margin:.5em 0 .3em}h3{font-size:13pt;margin:.5em 0 .3em}
          p{margin:.6em 0}ul,ol{margin:.6em 0 .6em 1.5em}
          img{max-width:100%}a{color:#0645ad;text-decoration:none}
          blockquote{margin:.6em 0;padding-left:1em;border-left:3px solid #ccc;color:#444}
          .hf{color:#666;font-size:10pt;text-align:center;margin:6mm 0}
        </style></head><body>${headerEl.textContent ? `<div class="hf">${esc(headerEl.textContent)}</div>` : ''}${page.innerHTML}${footerEl.textContent ? `<div class="hf">${esc(footerEl.textContent)}</div>` : ''}</body></html>`;
      document.body.append(frame);
    }

    async function newDoc() {
      if (!saved && (page.innerText || '').trim()) {
        const ok = await dialog({ title: 'discard unsaved changes?', body: titleEl.textContent.trim() || 'untitled', ok: 'discard', danger: true });
        if (!ok) return;
      }
      setHtml('<p><br></p>', 'untitled.docx', false);
      headerEl.textContent = ''; footerEl.textContent = '';
      page.focus();
    }
    async function saveFile() {
      const fmt = fmtEl.value;
      const base = (titleEl.textContent || '').trim() || baseName(name);
      name = base + '.' + fmt;
      try {
        if (fmt === 'docx') {
          const bytes = await blocksToDocx(htmlToBlocks(page.innerHTML), { header: headerEl.textContent, footer: footerEl.textContent, pageSize, orientation, comments, track: (trackChanges && baselineHtml) ? { baseline: htmlToBlocks(baselineHtml), author: 'you', date: new Date().toISOString() } : undefined });
          if (payload && typeof payload.save === 'function') await payload.save(bytes);
          else download(new Blob([bytes], { type: DOCX_MIME }), name);
        } else if (fmt === 'html') {
          const html = `<!doctype html>\n<meta charset="utf-8">\n<title>${esc(base)}</title>\n` + page.innerHTML;
          if (payload && typeof payload.save === 'function') await payload.save(html);
          else download(new Blob([html], { type: 'text/html;charset=utf-8' }), name);
        } else {
          const text = blocksToPlain(htmlToBlocks(page.innerHTML));
          if (payload && typeof payload.save === 'function') await payload.save(text);
          else download(new Blob([text], { type: 'text/plain;charset=utf-8' }), name);
        }
        saved = true; stat(); toast(`saved <b>${esc(name)}</b>`, 'ok');
      } catch (e) { toast(`save: ${esc(e.message || 'error')}`, 'err'); }
    }

    /* Save As: pick a folder with the File System Access API when available,
       otherwise fall back to the normal save/download path. */
    async function saveAs() {
      const base = (titleEl.textContent || '').trim() || baseName(name);
      if (fmtEl.value === 'docx' && window.showSaveFilePicker) {
        try {
          const bytes = await blocksToDocx(htmlToBlocks(page.innerHTML), { header: headerEl.textContent, footer: footerEl.textContent, pageSize, orientation, comments, track: (trackChanges && baselineHtml) ? { baseline: htmlToBlocks(baselineHtml), author: 'you', date: new Date().toISOString() } : undefined });
          const handle = await window.showSaveFilePicker({
            suggestedName: base + '.docx',
            types: [{ description: 'Word document', accept: { [DOCX_MIME]: ['.docx'] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(bytes); await writable.close();
          name = base + '.docx'; saved = true; stat();
          toast(`saved <b>${esc(name)}</b>`, 'ok');
          return;
        } catch (e) { if (e && e.name === 'AbortError') return; }
      }
      await saveFile();
    }

    file.onchange = async () => {
      const f = file.files && file.files[0]; if (!f) return;
      try {
        if (/\.docx$/i.test(f.name)) {
          const doc = await docxToDocument(await f.arrayBuffer());
          setHtml(blocksToHtml(doc.blocks), f.name, true);
          if (doc.header) headerEl.textContent = doc.header;
          if (doc.footer) footerEl.textContent = doc.footer;
          if (doc.pageSize) { pageSize = doc.pageSize; applyView(); }
          if (doc.orientation) { orientation = doc.orientation; applyView(); }
          if (Array.isArray(doc.comments)) { comments = doc.comments; renderComments(); showComments(comments.length > 0); }
        }
        else {
          const text = await f.text();
          const isMarkup = /\.(html|htm)$/i.test(f.name);
          setHtml(isMarkup ? text : blocksToHtml(plainToBlocks(text)), isMarkup ? f.name : f.name.replace(/\.[^.]+$/, '.txt'), true);
        }
        toast(`opened <b>${esc(f.name)}</b>`, 'ok');
      } catch (e) { toast(`open: ${esc(e.message || 'error')}`, 'err'); }
      file.value = '';
    };

    headerEl.addEventListener('input', markDirty);
    footerEl.addEventListener('input', markDirty);
    page.addEventListener('input', () => { markDirty(); saveSel(); });
    page.addEventListener('keyup', () => { sync(); saveSel(); });
    page.addEventListener('mouseup', () => { sync(); saveSel(); });
    /* Filename is a plain (draggable) title; double-click or F2/Enter edits it. */
    function startRename() {
      if (titleEl.isContentEditable) return;
      titleEl.contentEditable = 'true'; titleEl.focus();
      const range = document.createRange(); range.selectNodeContents(titleEl);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    }
    titleEl.addEventListener('dblclick', e => { e.stopPropagation(); startRename(); });
    titleEl.addEventListener('keydown', e => {
      if (!titleEl.isContentEditable) {
        if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startRename(); }
        return;
      }
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); titleEl.blur(); }
    });
    titleEl.addEventListener('blur', () => {
      titleEl.contentEditable = 'false';
      if (!titleEl.textContent.trim()) titleEl.textContent = baseName(name);
      markDirty();
    });
    body.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === 's') { e.preventDefault(); saveFile(); }
      else if ((e.metaKey || e.ctrlKey) && k === 'o') { e.preventDefault(); file.click(); }
      else if ((e.metaKey || e.ctrlKey) && k === 'n') { e.preventDefault(); newDoc(); }
      else if ((e.metaKey || e.ctrlKey) && k === 'p') { e.preventDefault(); printDoc(); }
      else if ((e.metaKey || e.ctrlKey) && k === 'f') { e.preventDefault(); findText(); }
      else if ((e.metaKey || e.ctrlKey) && k === 'h') { e.preventDefault(); replaceText(); }
    });
    setTimeout(() => page.focus(), 0);
    return () => {
      clearTimeout(timer);
      if (ribbonOverflow) ribbonOverflow();
      if (unsubSync) unsubSync();
      if (win) win.menu = null;
      if (tools.parentNode) tools.remove();
      store.save(KEY, snapshot());
    };
  }
});
