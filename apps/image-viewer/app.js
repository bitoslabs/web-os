/* Built-in app: Image Viewer. Opens local images with zoom, rotate, pan, and a
 * filmstrip. Files never leave the browser; the OS reads scoped files only. */
import { registerApp, esc, icon, toast } from '../../src/core/index.js';

const fmtSize = n => n < 1024 ? n + ' B' : n < 1024 * 1024 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

registerApp('image-viewer', {
  title: 'images', icon: 'pic', sub: 'local · zoom', w: 700, h: 520,
  opens: ['image/*', '*.png', '*.jpg', '*.jpeg', '*.gif', '*.webp', '*.bmp', '*.svg', '*.avif', '*.ico'],
  mount(body, win) {
    const items = [];
    let sel = -1, zoom = 1, rot = 0, fit = true, tx = 0, ty = 0;

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
        <button class="btn sm ghost" data-rot title="rotate (r)">${icon('refresh', 14)}</button>
        <span class="iv-flex"></span>
        <button class="btn sm ghost danger" data-del title="remove from list" aria-label="remove">${icon('trash', 14)}</button>
        <span class="mono-dim" data-info></span>
      </div>
      <div class="iv-stage" data-stage>
        <img data-img alt="" draggable="false">
        <div class="iv-empty" data-empty>drop images here<br><span class="mono-dim">or use open — nothing is uploaded</span></div>
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
    const cur = () => items[sel] || null;

    function fitScale() {
      const it = cur(); if (!it || !it.w || !it.h) return 1;
      const r = stage.getBoundingClientRect();
      if (r.width < 16 || r.height < 16) return 1;
      return Math.min((r.width - 24) / it.w, (r.height - 24) / it.h);
    }
    function scale() { return fit ? fitScale() : zoom; }
    function apply() {
      const it = cur();
      if (!it) { img.removeAttribute('src'); emptyEl.classList.remove('hide'); infoEl.textContent = ''; zEl.textContent = '100%'; return; }
      emptyEl.classList.add('hide');
      img.style.transform = `translate(${tx}px,${ty}px) rotate(${rot}deg) scale(${scale()})`;
      const pct = Math.round(scale() * 100);
      zEl.textContent = pct + '%';
      infoEl.textContent = `${it.name} · ${it.w || '?'}×${it.h || '?'} · ${fmtSize(it.size)}${rot ? ' · ' + ((rot % 360 + 360) % 360) + '°' : ''}`;
      body.querySelector('[data-fit]').classList.toggle('on', fit);
    }
    function reset() { fit = true; rot = 0; tx = 0; ty = 0; }
    function renderStrip() {
      stripEl.innerHTML = items.map((it, i) => `<button class="iv-th${i === sel ? ' on' : ''}" data-i="${i}" title="${esc(it.name)}" aria-label="${esc(it.name)}">
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
      imgs.forEach(f => items.push({ name: f.name, url: URL.createObjectURL(f), size: f.size, w: 0, h: 0 }));
      show(start);
      toast(`added ${imgs.length} image${imgs.length === 1 ? '' : 's'}`, 'ok');
    }
    function step(d) { if (items.length < 2) return; show((sel + d + items.length) % items.length); }
    function zoomBy(f) { fit = false; zoom = Math.min(8, Math.max(0.05, scale() * f)); apply(); }
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
    stripEl.onclick = e => { const b = e.target.closest('.iv-th'); if (b) show(+b.dataset.i); };

    let drag = null;
    stage.addEventListener('pointerdown', e => {
      if (!cur()) return;
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
      else if (e.key === 'r') { rot = (rot + 90) % 360; apply(); }
    });
    const seed = win && win.opts && win.opts.file;
    if (seed && seed.url) {
      items.push({ name: seed.name || 'image', url: seed.url, size: seed.size || 0, w: 0, h: 0 });
      show(0);
    }
    apply();
    setTimeout(() => body.focus(), 0);
    return () => items.forEach(it => URL.revokeObjectURL(it.url));
  }
});
