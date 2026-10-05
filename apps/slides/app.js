/* Built-in app: Slides. Presentation editor for the Bitos office suite. Decks
 * persist through src/office/store.js (IndexedDB, localStorage fallback) and
 * read/write .pptx. The booted OS keeps decks on the user data partition. */
import { registerApp, esc, icon, toast, dialog, appStorage } from '../../src/office/host.js';
import { newDeck, deckToPptx, pptxToDeck, bindRibbon, setupOverflow } from '../../src/office/index.js';
import { MANIFESTS } from '../../src/office/manifests.js';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const KEY = 'bitos.ui.slides.v1';
const store = appStorage('slides');
const uid = () => 'slide-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function defaultDeck() {
  const deck = newDeck();
  deck.title = 'untitled deck';
  deck.slides = [
    { id: uid(), layout: 'title', title: 'a new deck', body: 'btios office · slides', notes: '' },
    { id: uid(), layout: 'title', title: 'first point', body: 'edit me, or add a slide', notes: '' },
  ];
  return deck;
}
function persist(data) { store.save(KEY, data); return true; }
const esc2 = s => esc(s);

registerApp(MANIFESTS.slides.id, {
  ...MANIFESTS.slides,
  mount(body, win) {
    const payload = (win && win.opts && win.opts.file) || null;
    const data = defaultDeck();
    let active = 0, present = -1, timer = null;

    body.innerHTML = `<div class="dp">
      <div class="dp-bar ribbon">
        <div class="ribbon-tabs">
          <button class="ribbon-tab on" data-tab="home">Home</button>
          <button class="ribbon-tab" data-tab="insert">Insert</button>
          <button class="ribbon-tab" data-tab="view">View</button>
          <span class="ribbon-flex"></span>
          <input class="dc-title" data-title placeholder="deck title" spellcheck="false" aria-label="deck title">
        </div>
        <div class="ribbon-body">
          <div class="ribbon-panel on" data-panel="home">
            <div class="rgroup"><div class="rgroup-items">
              <button class="rbtn" data-import title="open .pptx"><span class="ric">${icon('upload', 17)}</span>open</button>
              <button class="rbtn" data-save title="save .pptx"><span class="ric">${icon('down', 17)}</span>save</button>
            </div><div class="rgroup-label">file</div></div>
            <div class="rgroup"><div class="rgroup-items">
              <button class="rbtn" data-add title="new slide"><span class="ric">${icon('cols', 17)}</span>new slide</button>
              <button class="rbtn" data-present title="present (f5)"><span class="ric">${icon('max', 17)}</span>present</button>
            </div><div class="rgroup-label">slideshow</div></div>
            <div class="rgroup"><div class="rgroup-items">
              <div class="rcol">
                <button class="rbtn sq" data-up title="move up">${icon('arru', 14)}</button>
                <button class="rbtn sq" data-down title="move down">${icon('arrd', 14)}</button>
              </div>
              <button class="rbtn sq" data-del title="delete slide">${icon('trash', 14)}</button>
            </div><div class="rgroup-label">arrange</div></div>
          </div>
          <div class="ribbon-panel" data-panel="insert">
            <div class="rgroup"><div class="rgroup-items">
              <button class="rbtn" data-image title="insert a picture"><span class="ric">${icon('pic', 17)}</span>picture</button>
              <button class="rbtn" data-imgclear title="remove the picture"><span class="ric">${icon('trash', 17)}</span>remove</button>
            </div><div class="rgroup-label">media</div></div>
            <div class="rgroup"><div class="rgroup-items">
              <div class="rstack"><select class="rselect" data-shapekind aria-label="shape kind" title="shape kind"><option value="rect">rectangle</option><option value="ellipse">ellipse</option></select><span class="rmini">kind</span></div>
              <button class="rbtn" data-addshape title="add a shape"><span class="ric">${icon('grid', 17)}</span>shape</button>
              <button class="rbtn" data-delshape title="delete the selected shape"><span class="ric">${icon('trash', 17)}</span>delete</button>
            </div><div class="rgroup-label">shapes</div></div>
          </div>
          <div class="ribbon-panel" data-panel="view">
            <div class="rgroup"><div class="rgroup-items">
              <div class="rbtn" style="pointer-events:none"><span class="ric" data-slidenum>0</span>slides</div>
              <div class="rbtn" style="pointer-events:none"><span class="ric" data-slidepos>1</span>position</div>
            </div><div class="rgroup-label">deck</div></div>
          </div>
        </div>
      </div>
      <div class="dp-body">
        <ol class="dp-list" data-list></ol>
        <section class="dp-main">
          <div class="dp-stage"><div class="dp-slide" data-slide>
            <div class="dp-stitle" data-title2 contenteditable="true" spellcheck="true" role="textbox" aria-label="slide title"></div>
            <div class="dp-sbody" data-body2 contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="slide body"></div>
          </div></div>
          <label class="dp-notes"><span class="lbl">speaker notes</span>
            <textarea data-notes placeholder="notes for this slide…" spellcheck="false" aria-label="speaker notes"></textarea></label>
        </section>
      </div>
      <div class="statusbar"><span data-status></span><span class="sb-fx"></span><span class="mono-dim">slides · .pptx</span></div>
      <div class="dp-present" data-present-view hidden></div>
      <input type="file" data-file class="hide" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation">
      <input type="file" data-img class="hide" accept="image/*">
    </div>`;

    const listEl = body.querySelector('[data-list]');
    const titleEl = body.querySelector('[data-title]');
    const slideEl = body.querySelector('[data-slide]');
    const stEl = body.querySelector('[data-title2]');
    const sbEl = body.querySelector('[data-body2]');
    const notesEl = body.querySelector('[data-notes]');
    const statusEl = body.querySelector('[data-status]');
    const presentEl = body.querySelector('[data-present-view]');
    const fileEl = body.querySelector('[data-file]');
    const imgEl = body.querySelector('[data-img]');
    const shapeKindEl = body.querySelector('[data-shapekind]');
    let selectedShape = null;
    const cur = () => data.slides[active];
    const ribbonEl = body.querySelector('.ribbon');
    bindRibbon(ribbonEl);
    const ribbonOverflow = setupOverflow(ribbonEl);

    function mark(saving) {
      statusEl.textContent = saving ? 'saving…' : `${data.slides.length} slides · ${active + 1}/${data.slides.length}`;
      statusEl.classList.toggle('dirty', !!saving);
      const numEl = body.querySelector('[data-slidenum]');
      if (numEl) numEl.textContent = String(data.slides.length);
      const posEl = body.querySelector('[data-slidepos]');
      if (posEl) posEl.textContent = String(active + 1);
    }
    function flush() {
      clearTimeout(timer); timer = null;
      const s = cur(); if (!s) return;
      s.title = stEl.textContent; s.body = sbEl.textContent; s.notes = notesEl.value;
      persist(data); mark(false);
    }
    function queue() { mark(true); clearTimeout(timer); timer = setTimeout(() => { flush(); renderList(); }, 400); }
    function renderList() {
      listEl.innerHTML = data.slides.map((s, i) =>
        `<li><button class="dp-thumb${i === active ? ' on' : ''}" data-slide="${i}">
          <span class="dp-num">${i + 1}</span>
          <span class="dp-t"><b>${esc2(s.title || 'untitled')}</b><i>${esc2((s.body || '').slice(0, 60))}</i></span>
        </button></li>`).join('');
    }
    function applyImage(el, s) {
      const url = s && s.image && s.image.dataUrl;
      el.classList.toggle('has-img', !!url);
      el.style.backgroundImage = url ? `url("${url}")` : '';
      el.style.backgroundSize = url ? 'cover' : '';
      el.style.backgroundPosition = url ? 'center' : '';
    }
    function renderEditor() {
      const s = cur();
      stEl.textContent = s ? s.title : '';
      sbEl.textContent = s ? s.body : '';
      notesEl.value = s ? s.notes || '' : '';
      slideEl.classList.toggle('title-layout', s && s.layout === 'title');
      applyImage(slideEl, s);
      renderShapes(s);
      titleEl.value = data.title || '';
      mark(false);
    }
    function fillHex(sh) { return '#' + String(sh.fill || '4472C4').replace('#', ''); }
    function renderShapes(s) {
      let layer = slideEl.querySelector('.dp-shapes');
      if (!layer) { layer = document.createElement('div'); layer.className = 'dp-shapes'; slideEl.append(layer); }
      const shapes = (s && s.shapes) || [];
      if (!shapes.some(sh => sh.id === selectedShape)) selectedShape = null;
      layer.innerHTML = shapes.map(sh =>
        `<div class="dp-shape${sh.kind === 'ellipse' ? ' round' : ''}${sh.id === selectedShape ? ' on' : ''}" data-shape="${esc(sh.id)}" ` +
        `style="left:${(sh.x * 100).toFixed(2)}%;top:${(sh.y * 100).toFixed(2)}%;width:${(sh.w * 100).toFixed(2)}%;height:${(sh.h * 100).toFixed(2)}%;background:${fillHex(sh)}">` +
        `<span class="dp-shape-t" contenteditable="false">${esc(sh.text || '')}</span>` +
        (sh.id === selectedShape ? '<i class="dp-shape-h" data-handle></i>' : '') + '</div>'
      ).join('');
    }
    function addShape() {
      const s = cur(); if (!s) return;
      const kind = shapeKindEl.value;
      (s.shapes || (s.shapes = [])).push({
        id: 'shape-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        kind, x: 0.12, y: 0.62, w: 0.32, h: 0.18, text: kind === 'ellipse' ? 'ellipse' : 'shape', fill: '4472C4',
      });
      selectedShape = s.shapes[s.shapes.length - 1].id;
      queue(); renderShapes(s);
    }
    function delShape() {
      const s = cur(); if (!s || !selectedShape) return;
      s.shapes = (s.shapes || []).filter(x => x.id !== selectedShape);
      selectedShape = null; queue(); renderShapes(s);
    }
    slideEl.addEventListener('pointerdown', e => {
      const shapeEl = e.target.closest('.dp-shape'); if (!shapeEl) return;
      const s = cur(); const sh = (s.shapes || []).find(x => x.id === shapeEl.dataset.shape); if (!sh) return;
      const textEl = e.target.closest('.dp-shape-t');
      const editing = textEl && textEl.isContentEditable;
      const handle = e.target.closest('.dp-shape-h');
      selectedShape = sh.id; renderShapes(s);
      if (editing) return;
      const box = slideEl.getBoundingClientRect();
      const start = { px: e.clientX, py: e.clientY, x: sh.x, y: sh.y, w: sh.w, h: sh.h };
      const mode = handle ? 'resize' : 'move';
      const onMove = ev => {
        const dx = (ev.clientX - start.px) / box.width, dy = (ev.clientY - start.py) / box.height;
        if (mode === 'move') {
          sh.x = Math.max(0, Math.min(1 - sh.w, start.x + dx));
          sh.y = Math.max(0, Math.min(1 - sh.h, start.y + dy));
        } else {
          sh.w = Math.max(0.06, Math.min(1 - sh.x, start.w + dx));
          sh.h = Math.max(0.06, Math.min(1 - sh.y, start.h + dy));
        }
        const live = layer().querySelector(`[data-shape="${sh.id}"]`);
        if (live) Object.assign(live.style, { left: (sh.x * 100) + '%', top: (sh.y * 100) + '%', width: (sh.w * 100) + '%', height: (sh.h * 100) + '%' });
      };
      const onUp = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); queue(); };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
    function layer() { return slideEl.querySelector('.dp-shapes') || slideEl; }
    slideEl.addEventListener('dblclick', e => {
      const t = e.target.closest('.dp-shape-t'); if (!t) return;
      t.contentEditable = 'true'; t.focus();
      const range = document.createRange(); range.selectNodeContents(t);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    });
    slideEl.addEventListener('input', e => {
      const t = e.target.closest && e.target.closest('.dp-shape-t'); if (!t) return;
      const el = t.closest('.dp-shape'); const s = cur();
      const sh = (s.shapes || []).find(x => x.id === el.dataset.shape);
      if (sh) { sh.text = t.textContent; queue(); }
    });
    slideEl.addEventListener('blur', e => {
      const t = e.target && e.target.closest ? e.target.closest('.dp-shape-t') : null;
      if (t) { t.contentEditable = 'false'; queue(); }
    }, true);
    function setImage(file) {
      if (!file) return;
      const r = new FileReader();
      r.onload = () => { const s = cur(); if (!s) return; s.image = { dataUrl: String(r.result), mime: file.type || 'image/png', name: file.name }; queue(); renderEditor(); };
      r.onerror = () => toast('could not read that image', 'err');
      r.readAsDataURL(file);
    }
    function clearImage() {
      const s = cur(); if (!s || !s.image) return;
      delete s.image; queue(); renderEditor();
    }
    imgEl.onchange = () => { const f = imgEl.files && imgEl.files[0]; if (f) setImage(f); imgEl.value = ''; };
    function select(i) { flush(); active = Math.max(0, Math.min(i, data.slides.length - 1)); renderList(); renderEditor(); }
    function add() {
      flush();
      data.slides.splice(active + 1, 0, { id: uid(), layout: 'title', title: 'new slide', body: '', notes: '' });
      active++; persist(data); renderList(); renderEditor(); stEl.focus();
    }
    async function del() {
      if (data.slides.length < 2) { toast('a deck needs at least one slide', 'info'); return; }
      if (!await dialog({ title: 'delete this slide?', ok: 'delete', danger: true })) return;
      data.slides.splice(active, 1); active = Math.max(0, active - 1); persist(data); renderList(); renderEditor();
    }
    function move(dir) {
      const to = active + dir; if (to < 0 || to >= data.slides.length) return;
      flush();
      const [s] = data.slides.splice(active, 1); data.slides.splice(to, 0, s); active = to;
      persist(data); renderList(); renderEditor();
    }
    function showPresent(i) {
      present = Math.max(0, Math.min(i, data.slides.length - 1));
      const s = data.slides[present];
      presentEl.hidden = false;
      const bg = s.image && s.image.dataUrl ? ` style="background-image:url('${s.image.dataUrl}');background-size:cover;background-position:center"` : '';
      const shapes = (s.shapes || []).map(sh =>
        `<div class="dp-p-shape${sh.kind === 'ellipse' ? ' round' : ''}" style="left:${(sh.x * 100).toFixed(2)}%;top:${(sh.y * 100).toFixed(2)}%;width:${(sh.w * 100).toFixed(2)}%;height:${(sh.h * 100).toFixed(2)}%;background:${fillHex(sh)}">${esc2(sh.text || '')}</div>`).join('');
      presentEl.innerHTML = `<div class="dp-pslide${s.layout === 'title' ? ' title' : ''}${s.image ? ' has-img' : ''}"${bg}>
        <h1>${esc2(s.title || '')}</h1><p>${esc2(s.body || '').replace(/\n/g, '<br>')}</p>${shapes}</div>
        <div class="dp-phint">${present + 1} / ${data.slides.length} · ← → navigate · esc exit</div>`;
    }
    function exitPresent() { present = -1; presentEl.hidden = true; presentEl.innerHTML = ''; }

    async function savePptx() {
      flush();
      try {
        const bytes = await deckToPptx(data);
        if (payload && typeof payload.save === 'function') await payload.save(bytes);
        else {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([bytes], { type: PPTX_MIME }));
          a.download = (data.title || 'deck') + '.pptx';
          document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        }
        toast('saved', 'ok');
      } catch (e) { toast(`save: ${esc(e.message || 'error')}`, 'err'); }
    }
    function adopt(deck) {
      data.title = deck.title || data.title;
      data.slides = deck.slides && deck.slides.length ? deck.slides : data.slides;
      active = 0; persist(data); renderList(); renderEditor();
    }
    async function loadPayload() {
      if (!payload || !payload.bytes) return;
      try { adopt(await pptxToDeck(payload.bytes)); toast(`opened <b>${esc(payload.name || 'deck')}</b>`, 'ok'); }
      catch (e) { toast(`open: ${esc(e.message || 'error')}`, 'err'); }
    }
    fileEl.onchange = async () => {
      const f = fileEl.files && fileEl.files[0]; if (!f) return;
      try { adopt(await pptxToDeck(await f.arrayBuffer())); toast(`opened <b>${esc(f.name)}</b>`, 'ok'); }
      catch (e) { toast(`open: ${esc(e.message || 'error')}`, 'err'); }
      fileEl.value = '';
    };

    body.querySelector('.dp-bar').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.import != null) fileEl.click();
      else if (b.dataset.save != null) savePptx();
      else if (b.dataset.add != null) add();
      else if (b.dataset.image != null) imgEl.click();
      else if (b.dataset.imgclear != null) clearImage();
      else if (b.dataset.addshape != null) addShape();
      else if (b.dataset.delshape != null) delShape();
      else if (b.dataset.present != null) showPresent(active);
      else if (b.dataset.up != null) move(-1);
      else if (b.dataset.down != null) move(1);
      else if (b.dataset.del != null) del();
    };
    listEl.onclick = e => { const b = e.target.closest('.dp-thumb'); if (b) select(+b.dataset.slide); };
    listEl.oncontextmenu = e => {
      const b = e.target.closest('.dp-thumb'); if (!b) return;
      e.preventDefault(); select(+b.dataset.slide); del();
    };
    titleEl.oninput = () => { data.title = titleEl.value; persist(data); };
    stEl.addEventListener('input', queue);
    sbEl.addEventListener('input', queue);
    notesEl.addEventListener('input', queue);
    presentEl.onclick = exitPresent;
    body.addEventListener('keydown', e => {
      const k = e.key;
      if (present >= 0) {
        if (k === 'Escape') { e.preventDefault(); exitPresent(); }
        else if (k === 'ArrowRight' || k === ' ') { e.preventDefault(); showPresent(present + 1); }
        else if (k === 'ArrowLeft') { e.preventDefault(); showPresent(present - 1); }
        return;
      }
      if (k === 'F5') { e.preventDefault(); showPresent(active); }
      else if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 's') { e.preventDefault(); flush(); toast('deck saved', 'ok'); }
      else if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'n') { e.preventDefault(); add(); }
      else if (k === 'Delete' && selectedShape && !(document.activeElement && document.activeElement.isContentEditable)) { e.preventDefault(); delShape(); }
    });

    renderList(); renderEditor();
    loadPayload();
    store.load(KEY, null).then(saved => {
      if (payload || !saved || !Array.isArray(saved.slides) || !saved.slides.length) return;
      data.title = saved.title || data.title;
      data.slides = saved.slides;
      active = 0;
      renderList(); renderEditor();
    });
    return () => { if (ribbonOverflow) ribbonOverflow(); flush(); };
  }
});
