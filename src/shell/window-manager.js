'use strict';
/* OS shell module: owns DOM app-window lifecycle. These are composited windows
 * inside one web view, not separate native windows or process boundaries. */
import { $, el, esc, clamp, toast, TSVG, APPS, store, uiZoom } from '../core/index.js';
import { deskEl, mbAppEl } from './state.js';
import { mark } from './tour.js';

let zTop = 20;
/* Windows stack from Z_BASE and never reach the chrome layer (dock/menu bar at
 * 600), so a focused or full-screen window can never cover the dock. When the
 * counter nears the cap, renormalize all windows to keep relative order. */
const Z_BASE = 20, Z_MAX = 590;

/* ================= window manager (aqua) ================= */
export const WM = {
  wins: new Map(), seq: 0, cur: null,
  open(id, opts) {
    const fresh = !!(opts && opts.fresh);
    const key = (opts && opts.key) || (fresh ? id + '#' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) : id);
    if (!fresh && this.wins.has(key)) { const w = this.wins.get(key); if (w.min) this.restore(w); else this.focus(w); return w; }
    const a = (opts && opts.def) || APPS[id];
    if (!a) { toast('program is unavailable: ' + esc(id), 'err'); return null; }
    const z = uiZoom();
    const d = deskEl.getBoundingClientRect();
    const W = Math.min(a.w, d.width / z - 16), H = Math.min(a.h, d.height / z - 16);
    const x = Math.round(64 + (this.seq % 6) * 38), y = Math.round(30 + (this.seq % 6) * 30); this.seq++;
    const w = { id, key, app: a, min: false, max: false, snapped: false, prev: null, cleanup: null, run: null, render: null, tools: null };
    const e = el('section', 'win focused');
    e.style.cssText = `left:${x}px;top:${y}px;width:${W}px;height:${H}px;z-index:${raiseZ()}`;
    const unified = !!a.unified;
    e.innerHTML = `<header class="win-head${unified ? ' unified' : ''}">
      <span class="wtl">
        <button class="c" data-a="close" title="close">${TSVG.c}</button>
        <button class="m" data-a="min" title="minimize">${TSVG.m}</button>
        <button class="z" data-a="zoom" title="zoom">${TSVG.z}</button></span>
      ${unified ? '<div class="win-tools"></div>' : `<span class="win-title">${esc((opts && opts.title) || a.title)}</span>`}</header>
      <div class="win-body"></div>
      <i class="w-rz w-rz-n" data-dir="n"></i><i class="w-rz w-rz-s" data-dir="s"></i>
      <i class="w-rz w-rz-e" data-dir="e"></i><i class="w-rz w-rz-w" data-dir="w"></i>
      <i class="w-rz w-rz-ne" data-dir="ne"></i><i class="w-rz w-rz-nw" data-dir="nw"></i>
      <i class="w-rz w-rz-sw" data-dir="sw"></i>
      <i class="w-rz w-rz-se w-grip" data-dir="se" title="drag to resize"></i>`;
    deskEl.append(e); w.el = e; w.tools = e.querySelector('.win-tools'); this.wins.set(key, w);
    e.setAttribute('role', 'region'); e.setAttribute('aria-label', a.title);
    e.querySelectorAll('.wtl button').forEach(b => b.setAttribute('aria-label', b.title + ' ' + a.title));
    try { w.cleanup = a.mount(e.querySelector('.win-body'), w) || null; }
    catch (error) {
      console.error('app launch failed', id, error);
      const content = e.querySelector('.win-body');
      content.innerHTML = '<div class="scrolly"><p>This program could not start.</p><button class="btn">retry</button></div>';
      content.querySelector('button').onclick = () => { this.close(w); this.open(id, opts); };
    }
    e.querySelector('.wtl').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      const act = b.dataset.a;
      if (act === 'close') this.close(w); else if (act === 'min') this.minimize(w); else this.toggleMax(w);
    });
    const snapEl = $('#snap');
    const head = e.querySelector('.win-head');
    head.addEventListener('pointerdown', ev => {
      if (ev.target.closest('button,input,select,textarea,a,[data-no-drag]')) return;
      this.focus(w);
      const z = uiZoom();
      const dR = deskEl.getBoundingClientRect();
      const dW = dR.width / z, dH = dR.height / z;
      const local = r => ({ left: (r.left - dR.left) / z, top: (r.top - dR.top) / z, width: r.width / z, height: r.height / z });
      let r = local(w.el.getBoundingClientRect());
      if (w.max || w.snapped) {
        Object.assign(w.el.style, w.prev); w.max = false; w.snapped = false;
        r = local(w.el.getBoundingClientRect());
        const px = clamp(((ev.clientX - dR.left) / z - r.left) / r.width, .12, .88);
        w.el.style.left = clamp((ev.clientX - dR.left) / z - px * r.width, 0, dW - r.width) + 'px';
        w.el.style.top = clamp((ev.clientY - dR.top) / z - 17, 0, dH - 40) + 'px';
        r = local(w.el.getBoundingClientRect());
      }
      const canResize = !(store.d && store.d.resize === false);
      const sx = (ev.clientX - dR.left) / z - r.left, sy = (ev.clientY - dR.top) / z - r.top; let zone = null;
      const mv = m => {
        const mx = (m.clientX - dR.left) / z, my = (m.clientY - dR.top) / z;
        w.el.style.left = clamp(mx - sx, -r.width + 120, dW - 80) + 'px';
        w.el.style.top = clamp(my - sy, 0, dH - 36) + 'px';
        zone = null;
        if (canResize && mx < 26) zone = 'left'; else if (canResize && dW - mx < 26) zone = 'right';
        else if (canResize && my < 26) zone = 'top';
        if (zone) {
          snapEl.style.display = 'block';
          const hw = Math.round(dW / 2);
          if (zone === 'left') Object.assign(snapEl.style, { left: '0px', top: '0px', width: hw + 'px', height: dH + 'px' });
          if (zone === 'right') Object.assign(snapEl.style, { left: hw + 'px', top: '0px', width: hw + 'px', height: dH + 'px' });
          if (zone === 'top') Object.assign(snapEl.style, { left: '0px', top: '0px', width: dW + 'px', height: dH + 'px' });
        }
        else snapEl.style.display = 'none';
      };
      const up = () => {
        snapEl.style.display = 'none';
        if (zone && !w.max && !w.snapped) {
          w.prev = { left: w.el.style.left, top: w.el.style.top, width: w.el.style.width, height: w.el.style.height };
          const hw = Math.round(dW / 2);
          if (zone === 'top') {
            w.max = true;
            Object.assign(w.el.style, { left: '10px', top: '10px', width: dW - 20 + 'px', height: dH - 20 + 'px' });
          } else {
            w.snapped = true;
            Object.assign(w.el.style, zone === 'left'
              ? { left: '0px', top: '0px', width: hw + 'px', height: dH + 'px' }
              : { left: hw + 'px', top: '0px', width: hw + 'px', height: dH + 'px' });
          }
        }
        document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
      };
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); ev.preventDefault();
    });
    head.addEventListener('dblclick', ev => { if (!ev.target.closest('button,input,select,textarea,a,[data-no-drag]')) this.toggleMax(w); });
    e.querySelectorAll('.w-rz').forEach(g => g.addEventListener('pointerdown', ev => {
      if (store.d && store.d.resize === false) return;
      ev.preventDefault(); ev.stopPropagation(); this.focus(w); w.max = false; w.snapped = false;
      const dir = g.dataset.dir, z = uiZoom();
      const dR = deskEl.getBoundingClientRect(), r = e.getBoundingClientRect();
      const dW = dR.width / z, dH = dR.height / z;
      const L0 = (r.left - dR.left) / z, T0 = (r.top - dR.top) / z, W0 = r.width / z, H0 = r.height / z;
      const right = L0 + W0, bottom = T0 + H0, x0 = ev.clientX, y0 = ev.clientY;
      const mv = m => {
        const dx = (m.clientX - x0) / z, dy = (m.clientY - y0) / z;
        let L = L0, T = T0, W = W0, H = H0;
        if (dir.includes('e')) W = clamp(W0 + dx, 340, dW - L0);
        else if (dir.includes('w')) { W = clamp(W0 - dx, 340, right); L = right - W; }
        if (dir.includes('s')) H = clamp(H0 + dy, 220, dH - T0);
        else if (dir.includes('n')) { H = clamp(H0 - dy, 220, bottom); T = bottom - H; }
        e.style.left = L + 'px'; e.style.top = T + 'px'; e.style.width = W + 'px'; e.style.height = H + 'px';
      };
      const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); };
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
    }));
    e.addEventListener('pointerdown', () => this.focus(w), true);
    this.focus(w); dockSync();
    if (!store.d.hinted) { store.d.hinted = true; store.save(); const h = $('#hint'); h && h.remove(); }
    if (id === 'terminal') mark('term');
    if (id === 'handbook') mark('book');
    return w;
  },
  focus(w) {
    document.querySelectorAll('.win.focused').forEach(x => x.classList.remove('focused'));
    w.el.classList.add('focused'); w.el.style.zIndex = raiseZ(); this.cur = w; dockSync();
    if (mbAppEl) mbAppEl.textContent = w.app.title;
    if (typeof w.focusInput === 'function') { try { w.focusInput(); } catch (e) { } }
    else if (w.id === 'terminal') { const i = w.el.querySelector('.t-in'); i && i.focus(); }
  },
  close(w) {
    try { w.cleanup && w.cleanup(); } catch (e) { }
    if (this.cur === w) this.cur = null; w.el.remove(); this.wins.delete(w.key);
    this.focusNext(); dockSync();
  },
  minimize(w) {
    if (w.min) return; w.min = true;
    const e = w.el, r = e.getBoundingClientRect();
    const dk = document.querySelector(`.dk[data-app="${w.id}"]`) || $('#dock');
    const dr = dk.getBoundingClientRect();
    const z = uiZoom();
    const dx = (dr.left + dr.width / 2 - (r.left + r.width / 2)) / z, dy = (dr.top + dr.height / 2 - (r.top + r.height / 2)) / z;
    e.style.transition = 'transform .3s cubic-bezier(.4,0,.9,.4), opacity .3s';
    e.style.transform = `translate(${dx}px,${dy}px) scale(.06)`; e.style.opacity = '0';
    dockFeedback(w.id, 'recv');
    setTimeout(() => {
      e.style.display = 'none'; e.style.transition = ''; e.style.transform = ''; e.style.opacity = '';
      if (this.cur === w) { this.cur = null; this.focusNext(); }
    }, 300);
    dockSync();
  },
  restore(w) {
    w.min = false; const e = w.el;
    const dk = document.querySelector(`.dk[data-app="${w.id}"]`);
    e.style.display = '';
    if (dk) {
      const r = e.getBoundingClientRect(), dr = dk.getBoundingClientRect();
      const z = uiZoom();
      const dx = (dr.left + dr.width / 2 - (r.left + r.width / 2)) / z, dy = (dr.top + dr.height / 2 - (r.top + r.height / 2)) / z;
      e.style.transition = 'none';
      e.style.transform = `translate(${dx}px,${dy}px) scale(.06)`; e.style.opacity = '0';
      void e.offsetWidth;
      e.style.transition = 'transform .32s var(--ease), opacity .26s';
      e.style.transform = ''; e.style.opacity = '';
      setTimeout(() => { e.style.transition = ''; }, 340);
    }
    dockFeedback(w.id, 'launch');
    this.focus(w); dockSync();
  },
  toggleMin(w) { w.min ? this.restore(w) : this.minimize(w); },
  toggleMax(w) {
    const z = uiZoom();
    const d = deskEl.getBoundingClientRect();
    if (w.max) { Object.assign(w.el.style, w.prev); w.max = false; }
    else {
      if (!w.snapped) w.prev = { left: w.el.style.left, top: w.el.style.top, width: w.el.style.width, height: w.el.style.height };
      Object.assign(w.el.style, { left: '10px', top: '10px', width: d.width / z - 20 + 'px', height: d.height / z - 20 + 'px' });
      w.max = true; w.snapped = false;
    }
  },
  focusNext() {
    let best = null, bz = -1;
    for (const w of this.wins.values()) { if (w.min) continue; const z = +w.el.style.zIndex || 0; if (z > bz) { bz = z; best = w; } }
    if (best) this.focus(best);
    else { this.cur = null; if (mbAppEl) mbAppEl.textContent = 'bitos'; dockSync(); }
  }
};

/* Raise a window while keeping every window below the chrome layer. */
function raiseZ() {
  if (++zTop > Z_MAX) {
    const ws = [...WM.wins.values()].sort((a, b) => (+a.el.style.zIndex || 0) - (+b.el.style.zIndex || 0));
    ws.forEach((w, i) => { w.el.style.zIndex = Z_BASE + i; });
    zTop = Z_BASE + ws.length;
  }
  return zTop;
}

export function dockSync() {
  const count = new Map();
  for (const w of WM.wins.values()) count.set(w.id, (count.get(w.id) || 0) + 1);
  document.querySelectorAll('.dk[data-app]').forEach(d => {
    const id = d.dataset.app, n = count.get(id) || 0;
    d.classList.toggle('running', n > 0);
    d.classList.toggle('active', !!WM.cur && !WM.cur.min && WM.cur.id === id);
    const c = d.querySelector('.wcount');
    if (c) { c.textContent = n > 1 ? String(n) : ''; c.classList.toggle('on', n > 1); }
  });
}

/* Pulse the dock button so minimize reads as "into the icon" and restore as
 * "out of it". Animated CSS is suppressed under reduce-motion. */
export function dockFeedback(id, cls = 'launch') {
  const dk = document.querySelector(`.dk[data-app="${id}"]`);
  if (!dk) return;
  dk.classList.remove('launch', 'recv'); void dk.offsetWidth;
  dk.classList.add(cls);
  setTimeout(() => dk.classList.remove(cls), 560);
}
