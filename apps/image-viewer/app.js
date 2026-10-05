/* Built-in app: Image Viewer. Opens local images with fit, 1:1, stepped zoom,
 * rotation, pan, a filmstrip, and an inspect panel for file metadata. Files
 * never leave the browser; the OS reads scoped files only. */
import { registerApp, esc, icon, toast } from '../../src/core/index.js';

const fmtSize = n => n < 1024 ? n + ' B' : n < 1024 * 1024 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const fmtDate = t => t ? new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
const gcd = (a, b) => b ? gcd(b, a % b) : a;
const fmtAspect = (w, h) => {
  if (!w || !h) return '';
  const g = gcd(w, h), rw = w / g, rh = h / g;
  return (rw <= 40 && rh <= 40) ? rw + ':' + rh : (w / h).toFixed(2) + ':1';
};
const TYPES = {
  'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/gif': 'GIF', 'image/webp': 'WebP',
  'image/bmp': 'BMP', 'image/svg+xml': 'SVG', 'image/avif': 'AVIF',
  'image/x-icon': 'ICO', 'image/vnd.microsoft.icon': 'ICO',
};
const typeLabel = it => TYPES[it.mime] || (it.name.split('.').pop() || '').toUpperCase() || 'image';

registerApp('image-viewer', {
  title: 'images', icon: 'pic', sub: 'local · zoom', w: 760, h: 540,
  opens: ['image/*', '*.png', '*.jpg', '*.jpeg', '*.gif', '*.webp', '*.bmp', '*.svg', '*.avif', '*.ico'],
  mount(body, win) {
    const items = [];
    let sel = -1, zoom = 1, rot = 0, fit = true, tx = 0, ty = 0, infoOpen = false;

    body.innerHTML = `<div class="iv">
      <div class="iv-tools">
        <button class="btn sm ghost" data-open title="open images">${icon('pic', 14)} open</button>
        <button class="btn sm ghost" data-prev title="previous (←)" aria-label="previous">${icon('chevl', 14)}</button>
        <button class="btn sm ghost" data-next title="next (→)" aria-label="next">${icon('chevr', 14)}</button>
        <span class="iv-sep"></span>
        <button class="btn sm ghost on" data-fit title="fit to window (0)">fit</button>
        <button class="btn sm ghost" data-actual title="actual size (1)">1:1</button>
        <button class="btn sm ghost" data-out title="zoom out (−)" aria-label="zoom out">−</button>
        <span class="iv-zoom" data-z>100%</span>
        <button class="btn sm ghost" data-in title="zoom in (+)" aria-label="zoom in">+</button>
        <button class="btn sm ghost" data-rot title="rotate (r)" aria-label="rotate">${icon('refresh', 14)}</button>
        <span class="iv-flex"></span>
        <span class="iv-sum mono-dim" data-info></span>
        <button class="btn sm ghost" data-info-toggle title="file info (i)" aria-label="file info" aria-pressed="false">${icon('info', 14)}</button>
        <button class="btn sm ghost danger" data-del title="remove from list" aria-label="remove">${icon('trash', 14)}</button>
      </div>
      <div class="iv-body">
        <div class="iv-stage" data-stage>
          <img data-img alt="" draggable="false">
          <div class="iv-empty" data-empty>drop images here<br><span class="mono-dim">or use open — nothing is uploaded</span></div>
        </div>
        <aside class="iv-info hide" data-panel aria-label="file info">
          <div class="iv-info-head">
            <div class="iv-info-thumb"><img data-thumb alt="" draggable="false"></div>
            <div class="iv-info-name" data-iname>—</div>
          </div>
          <div class="iv-info-rows" data-rows></div>
        </aside>
      </div>
      <div class="iv-strip" data-strip></div>
      <input type="file" data-file accept="image/*" multiple class="hide">
    </div>`;

    const img = body.querySelector('[data-img]');
    const stage = body.querySelector('[data-stage]');
    const stripEl = body.querySelector('[data-strip]');
    const infoEl = body.querySelector('[data-info]');
    const zEl = body.querySelector('[data-z]');
    const emptyEl = body.querySelector('[data-empty]');
    const file = body.querySelector('[data-file]');
    const panel = body.querySelector('[data-panel]');
    const infoBtn = body.querySelector('[data-info-toggle]');
    const thumbEl = body.querySelector('[data-thumb]');
    const inameEl = body.querySelector('[data-iname]');
    const rowsEl = body.querySelector('[data-rows]');
    const cur = () => items[sel] || null;

    function fitScale() {
      const it = cur(); if (!it || !it.w || !it.h) return 1;
      /* clientWidth/Height are layout size and ignore the window's open/zoom
       * transforms, unlike getBoundingClientRect, so the fit is stable while
       * the window animates in. */
      const w = stage.clientWidth, h = stage.clientHeight;
      if (w < 16 || h < 16) return 1;
      return Math.min((w - 24) / it.w, (h - 24) / it.h);
    }
    function scale() { return fit ? fitScale() : zoom; }
    function renderInfo() {
      const it = cur();
      if (!it) {
        infoEl.textContent = ''; infoEl.removeAttribute('title');
        inameEl.textContent = '—'; inameEl.removeAttribute('title');
        thumbEl.removeAttribute('src');
        rowsEl.innerHTML = `<div class="iv-hint">open an image to inspect its file details.</div>`;
        return;
      }
      const dims = it.w && it.h ? it.w + '×' + it.h : '';
      infoEl.textContent = [dims, fmtSize(it.size)].filter(Boolean).join(' · ');
      infoEl.title = it.name;
      inameEl.textContent = it.name; inameEl.title = it.name;
      if (it.url) thumbEl.src = it.url; else thumbEl.removeAttribute('src');
      const rows = [
        ['dimensions', it.w && it.h ? it.w + ' × ' + it.h : '—'],
        ['aspect', fmtAspect(it.w, it.h) || '—'],
        ['megapixels', it.w && it.h ? (it.w * it.h / 1e6).toFixed(1) + ' MP' : '—'],
        ['size', fmtSize(it.size)],
        ['type', typeLabel(it)],
        ['zoom', Math.round(scale() * 100) + '%' + (fit ? ' · fit' : '')],
        ['rotation', ((rot % 360 + 360) % 360) + '°'],
      ];
      if (it.modified) rows.push(['modified', fmtDate(it.modified)]);
      rowsEl.innerHTML = rows.map(([k, v]) =>
        `<div class="iv-row"><span class="iv-k">${k}</span><span class="iv-v mono">${esc(String(v))}</span></div>`).join('');
    }
    function apply() {
      const it = cur();
      if (!it) {
        img.removeAttribute('src'); emptyEl.classList.remove('hide');
        zEl.textContent = '100%'; stage.classList.remove('zoomed');
        body.querySelector('[data-fit]').classList.toggle('on', fit);
        renderInfo(); return;
      }
      emptyEl.classList.add('hide');
      if (fit) { tx = 0; ty = 0; }
      const s = scale();
      img.style.transform = `translate(${tx}px,${ty}px) rotate(${rot}deg) scale(${s})`;
      zEl.textContent = Math.round(s * 100) + '%';
      body.querySelector('[data-fit]').classList.toggle('on', fit);
      stage.classList.toggle('zoomed', !fit);
      renderInfo();
    }
    function reset() { fit = true; rot = 0; tx = 0; ty = 0; }
    function setInfo(open) {
      infoOpen = open;
      panel.classList.toggle('hide', !open);
      infoBtn.classList.toggle('on', open);
      infoBtn.setAttribute('aria-pressed', String(open));
      if (cur()) apply();
    }
    function renderStrip() {
      stripEl.innerHTML = items.map((it, i) => `<button class="iv-th${i === sel ? ' on' : ''}" data-i="${i}" title="${esc(it.name)}" aria-label="${esc(it.name)}" aria-current="${i === sel ? 'true' : 'false'}">
        <img src="${it.url}" alt="" draggable="false"></button>`).join('');
    }
    function show(i, resetView) {
      if (i < 0 || i >= items.length) return;
      sel = i;
      if (resetView !== false) reset();
      const it = cur();
      img.onload = () => { it.w = img.naturalWidth; it.h = img.naturalHeight; apply(); };
      img.src = it.url;
      if (img.complete) { it.w = img.naturalWidth; it.h = img.naturalHeight; }
      renderStrip(); apply();
    }
    function add(files) {
      const imgs = [...files].filter(f => /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i.test(f.name));
      if (!imgs.length) { toast('no images in that selection', 'err'); return; }
      const start = items.length;
      imgs.forEach(f => items.push({ name: f.name, url: URL.createObjectURL(f), size: f.size, mime: f.type || '', modified: f.lastModified || 0, w: 0, h: 0 }));
      show(start);
      toast(`added ${imgs.length} image${imgs.length === 1 ? '' : 's'}`, 'ok');
    }
    function step(d) { if (items.length < 2) return; show((sel + d + items.length) % items.length); }
    function zoomBy(f) { if (!cur()) return; fit = false; zoom = Math.min(8, Math.max(0.05, scale() * f)); apply(); }
    function remove() {
      const it = cur(); if (!it) return;
      URL.revokeObjectURL(it.url); items.splice(sel, 1);
      if (!items.length) { sel = -1; img.removeAttribute('src'); emptyEl.classList.remove('hide'); renderStrip(); apply(); return; }
      show(Math.min(sel, items.length - 1));
    }

    body.querySelector('[data-open]').onclick = () => file.click();
    file.onchange = () => { add(file.files); file.value = ''; };
    body.querySelector('[data-prev]').onclick = () => step(-1);
    body.querySelector('[data-next]').onclick = () => step(1);
    body.querySelector('[data-fit]').onclick = () => { fit = true; tx = ty = 0; apply(); };
    body.querySelector('[data-actual]').onclick = () => { fit = false; zoom = 1; apply(); };
    body.querySelector('[data-in]').onclick = () => zoomBy(1.25);
    body.querySelector('[data-out]').onclick = () => zoomBy(1 / 1.25);
    body.querySelector('[data-rot]').onclick = () => { rot = (rot + 90) % 360; apply(); };
    body.querySelector('[data-del]').onclick = remove;
    infoBtn.onclick = () => setInfo(!infoOpen);
    stripEl.onclick = e => { const b = e.target.closest('.iv-th'); if (b) show(+b.dataset.i); };

    let drag = null;
    stage.addEventListener('pointerdown', e => {
      if (!cur() || fit) return;
      drag = { x: e.clientX, y: e.clientY, tx, ty };
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('grabbing');
    });
    stage.addEventListener('pointermove', e => {
      if (!drag) return;
      tx = drag.tx + (e.clientX - drag.x); ty = drag.ty + (e.clientY - drag.y); apply();
    });
    const endDrag = () => { drag = null; stage.classList.remove('grabbing'); };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('dblclick', () => {
      if (!cur()) return;
      if (fit) { fit = false; zoom = 1; } else { fit = true; tx = ty = 0; }
      apply();
    });
    stage.addEventListener('wheel', e => { if (!cur()) return; e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
    ['dragenter', 'dragover'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); stage.classList.add('drop'); }));
    ['dragleave', 'drop'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); if (t === 'drop') add(e.dataTransfer.files); stage.classList.remove('drop'); }));

    body.tabIndex = -1;
    body.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
      else if (e.key === '+' || e.key === '=') { zoomBy(1.25); e.preventDefault(); }
      else if (e.key === '-') { zoomBy(1 / 1.25); e.preventDefault(); }
      else if (e.key === '0') { fit = true; tx = ty = 0; apply(); }
      else if (e.key === '1') { fit = false; zoom = 1; apply(); }
      else if (e.key === 'r' || e.key === 'R') { rot = (rot + 90) % 360; apply(); }
      else if (e.key === 'i' || e.key === 'I') { setInfo(!infoOpen); e.preventDefault(); }
      else if (e.key === 'Escape' && infoOpen) { setInfo(false); e.preventDefault(); }
    });

    /* Re-fit on any layout change: window resize, maximize, fullscreen, or the
     * inspect panel opening. Keeps a fitted image always filling the stage. */
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => { if (fit && cur()) apply(); });
      ro.observe(stage);
    }

    const seed = win && win.opts && win.opts.file;
    if (seed && seed.url) {
      items.push({ name: seed.name || 'image', url: seed.url, size: seed.size || 0, mime: seed.mime || '', modified: seed.modified || 0, w: 0, h: 0 });
      show(0);
    }
    setInfo(infoOpen);
    apply();
    requestAnimationFrame(() => { if (fit && cur()) apply(); });
    setTimeout(() => body.focus(), 0);
    return () => { if (ro) ro.disconnect(); items.forEach(it => URL.revokeObjectURL(it.url)); };
  }
});
