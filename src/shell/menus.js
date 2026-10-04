'use strict';
/* OS shell module: menu presentation and system-wide actions. App-specific
 * commands belong to the owning app. */
import { $, el, icon, clamp, copyText, toast, store, uiZoom } from '../core/index.js';
import { WM } from './window-manager.js';
import { wall } from './wallpaper.js';
import { openSpot } from './search.js';
import { openCC, syncCC } from './control-center.js';

export let menuEl = null, menuBtn = null;

export function closeMenu() {
  if (menuEl) { menuEl.remove(); menuEl = null; }
  if (menuBtn) { menuBtn.classList.remove('open'); menuBtn = null; }
}
export function openMenu(anchor, items, dir = 'down', opts) {
  closeMenu();
  const hasCheck = items.some(m => m && m !== '-' && m.check !== undefined);
  menuEl = el('div', 'menu' + ((opts && opts.compact) ? ' compact' : ''));
  items.forEach(m => {
    if (m === '-') { menuEl.append(el('div', 'msep')); return; }
    if (m.dis) { menuEl.append(el('div', 'mi dis', `<span>${m.t}</span>`)); return; }
    const mi = el('div', 'mi', `${m.ic ? icon(m.ic, 14) : ''}<span>${m.t}</span>${m.k ? `<span class="k">${m.k}</span>` : ''}${hasCheck ? `<span class="chk">${m.check ? icon('check', 13) : ''}</span>` : ''}`);
    mi.onclick = () => { closeMenu(); m.fn(); };
    menuEl.append(mi);
  });
  menuEl.style.visibility = 'hidden'; document.body.append(menuEl);
  const z = uiZoom();
  const r = anchor.getBoundingClientRect(), mr = menuEl.getBoundingClientRect();
  const mw = mr.width / z, mh = mr.height / z;
  let x = clamp(r.left / z, 8, innerWidth / z - mw - 8);
  let y = dir === 'down' ? r.bottom / z + 4 : r.top / z - mh - 8;
  y = clamp(y, 8, innerHeight / z - mh - 8);
  menuEl.style.left = x + 'px'; menuEl.style.top = y + 'px'; menuEl.style.visibility = '';
}
export function openContextMenu(x, y, items) {
  openMenu({ getBoundingClientRect: () => ({ left: x, top: y, right: x, bottom: y, width: 0, height: 0 }) }, items, 'down', { compact: true });
}
export function togglePopup(anchor, items, dir = 'down') {
  if (menuEl && menuBtn === anchor) { closeMenu(); return; }
  openMenu(anchor, items, dir, { compact: true }); anchor.classList.add('open'); menuBtn = anchor;
}
export function toggleMenu(btn, which, dir = 'down') {
  if (menuEl && menuBtn === btn) { closeMenu(); return; }
  openMenu(btn, menuItems(which), dir); btn.classList.add('open'); menuBtn = btn;
}
export function menuItems(which) {
  const d = store.d;
  switch (which) {
    case 'app': return [
      { t: 'about bitos', ic: 'bolt', fn: () => WM.open('about') }, '-',
      { t: 'getting started…', ic: 'check', fn: () => WM.open('get-started') },
      { t: 'handbook…', ic: 'book', fn: () => WM.open('handbook') },
      { t: 'shortcuts…', ic: 'help', fn: () => WM.open('shortcuts') }, '-',
      { t: 'reset demo…', ic: 'pow', fn: () => store.reset() }];
    case 'file': return [
      { t: 'new note', ic: 'bolt', fn: newNote },
      { t: 'new terminal', ic: 'term', k: '<kbd>alt t</kbd>', fn: () => WM.open('terminal', { fresh: true }) },
      { t: 'new terminal tab', ic: 'term', k: '<kbd>alt shift t</kbd>', fn: newTermTab }, '-',
      { t: 'close window', k: '<kbd>alt w</kbd>', fn: () => { WM.cur && WM.close(WM.cur); } }];
    case 'edit': return [
      { t: 'copy npub', ic: 'copy', fn: () => copyText(d.npub, 'npub copied') },
      { t: 'copy secret key', ic: 'copy', fn: () => { copyText(d.nsec, 'secret copied — guard it'); toast('nsec in clipboard — clear it when done', 'err'); } }, '-',
      { t: 'settings…', k: '<kbd>alt ,</kbd>', fn: () => WM.open('settings') }];
    case 'view': return [
      { t: 'wallpaper', check: d.wall, fn: () => { toggleWall(); openCC(false); } },
      { t: 'larger text', check: d.big, fn: () => { toggleBig(); openCC(false); } },
      { t: 'desktop icons', check: d.icons, fn: toggleIcons }];
    case 'window': {
      const out = [
        { t: 'minimize', k: '<kbd>alt m</kbd>', fn: () => { WM.cur && WM.minimize(WM.cur); } },
        { t: 'zoom', fn: () => { WM.cur && WM.toggleMax(WM.cur); } },
        { t: 'minimize all', fn: () => { for (const w of WM.wins.values()) if (!w.min) WM.minimize(w); } }, '-'];
      const ws = [...WM.wins.values()];
      if (!ws.length) out.push({ t: 'no windows', dis: true });
      ws.forEach(w => out.push({
        t: w.app.title, check: WM.cur === w && !w.min,
        fn: () => { if (w.min) WM.restore(w); else WM.focus(w); }
      }));
      return out;
    }
    case 'help': return [
      { t: 'shortcuts', ic: 'help', k: '<kbd>?</kbd>', fn: () => WM.open('shortcuts') },
      { t: 'handbook', ic: 'book', fn: () => WM.open('handbook') },
      { t: 'spotlight', ic: 'mag', k: '<kbd>ctrl space</kbd>', fn: openSpot }];
  }
}
export function newNote() {
  const w = WM.open('nostr');
  setTimeout(() => { const i = w.el.querySelector('[data-post]'); i && i.focus(); }, 60);
}
export function newTermTab() {
  const wins = [...WM.wins.values()].filter(x => x.id === 'terminal');
  const w = (WM.cur && WM.cur.id === 'terminal') ? WM.cur : wins[0] || WM.open('terminal');
  if (!w) return;
  if (w.min) WM.restore(w); else WM.focus(w);
  if (w.newTab) w.newTab();
}
export function toggleWall() { store.d.wall = !store.d.wall; store.save(); wall.setOn(store.d.wall); syncCC(); }
export function toggleIcons() { store.d.icons = !store.d.icons; store.save(); $('#dicons').style.display = store.d.icons ? '' : 'none'; }

/* ---- appearance appliers -------------------------------------------------
 * Text size scales the whole interface with CSS zoom (set on <html>, which
 * keeps fixed chrome anchored). brightness and reduce-motion are preview-level
 * display controls; the device backlight and compositor belong to native. */
export const FS_STEPS = [['s', .9], ['m', 1], ['l', 1.15], ['xl', 1.3]];
export function fontScale() { const d = store.d; return d.fs != null ? d.fs : (d.big ? 1.15 : 1); }
export function applyFont() {
  const s = fontScale();
  document.documentElement.style.zoom = s === 1 ? '' : String(s);
}
export function setFontScale(s) { store.d.fs = s; store.d.big = s > 1; store.save(); applyFont(); syncCC(); }
export function toggleBig() { setFontScale(fontScale() > 1 ? 1 : 1.15); }
export function applyBright() {
  const b = store.d.bright == null ? 100 : store.d.bright;
  document.body.style.filter = b === 100 ? '' : `brightness(${b / 100})`;
}
export function setBright(v) { store.d.bright = clamp(Math.round(v), 40, 120); store.save(); applyBright(); }
export function applyMotion() { document.body.classList.toggle('reduce-motion', !!store.d.motion); }
export function setMotion(v) { store.d.motion = !!v; store.save(); applyMotion(); }
export function applyResize() { document.body.classList.toggle('no-resize', store.d.resize === false); }
export function setResize(v) { store.d.resize = !!v; store.save(); applyResize(); }
export function applyToasts() { document.body.classList.toggle('no-toasts', store.d.toasts === false); }
export function setToasts(v) { store.d.toasts = !!v; store.save(); applyToasts(); }
let themeMq = null;
export function resolveTheme() {
  const t = store.d.theme || 'dark';
  if (t === 'auto') return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  return t === 'light' ? 'light' : 'dark';
}
export function applyTheme() {
  if (!themeMq) {
    themeMq = matchMedia('(prefers-color-scheme: light)');
    themeMq.addEventListener('change', () => { if ((store.d.theme || 'dark') === 'auto') { applyTheme(); syncCC(); } });
  }
  document.documentElement.dataset.theme = resolveTheme();
  wall.rebuild();
}
export function setTheme(t) { store.d.theme = t; store.save(); applyTheme(); syncCC(); }
export function applyAppearance() { applyFont(); applyBright(); applyMotion(); applyResize(); applyToasts(); applyTheme(); }
