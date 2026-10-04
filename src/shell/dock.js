'use strict';
/* OS shell module: pinned launcher and running-window indicator. App IDs come
 * from launchers.js and must exist in the validated registry. Right-click (or
 * the menu key) opens per-app actions: new window, show all windows, quit. */
import { $, el, icon, toast, store, APPS, onEcosystemChange } from '../core/index.js';
import { SHELL_APPS } from './launchers.js';
import { pinnedLaunchEntries } from './installed-apps.js';
import { WM, dockFeedback } from './window-manager.js';
import { openMenu, openContextMenu } from './menus.js';
import { openLP } from './launchpad.js';

const DOCK_TRASH = ['trash', 'reset demo', 'trash'];
const DOCK_LAUNCHPAD = ['launchpad', 'launchpad', 'grid'];
let lastPinSig = null;

function pinSig() { return pinnedLaunchEntries().map(e => e.id).join(','); }

export function buildDock() {
  const dock = $('#dock'); if (!dock) return; dock.innerHTML = '';
  const items = [...SHELL_APPS];
  pinnedLaunchEntries().forEach(p => items.push([p.id, p.label, p.ic, p.def]));
  items.push(DOCK_LAUNCHPAD, 'sep', DOCK_TRASH);
  items.forEach(it => {
    if (it === 'sep') { dock.append(el('span', 'dksep')); return; }
    const [id, label, ic, def] = it;
    const dk = el('div', 'dk');
    if (id !== 'trash' && id !== 'launchpad') dk.dataset.app = id;
    dk.dataset.label = label;
    dk.setAttribute('role', 'button');
    dk.setAttribute('aria-label', label);
    dk.tabIndex = 0;
    dk.innerHTML = `<div class="dtil">${icon(ic, 22)}<span class="wcount"></span></div><span class="dot"></span><span class="dlab">${label}</span>`;
    dk.onclick = () => handleDockClick(id, dk, def, label);
    dk.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (id === 'trash') openTrashMenu(dk);
      else if (id === 'launchpad') openLP();
      else openDockMenu(id, label, e.clientX, e.clientY, def);
    });
    dk.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (id === 'trash') openTrashMenu(dk);
      else if (id === 'launchpad') openLP();
      else handleDockClick(id, dk, def, label);
    });
    dock.append(dk);
  });
  attachDockMagnification(dock);
  lastPinSig = pinSig();
}

/* Rebuild only when the pinned set changes (install/update/uninstall/pin). */
onEcosystemChange(() => {
  const sig = pinSig();
  if (sig !== lastPinSig) { lastPinSig = sig; buildDock(); }
});

function openEntry(id, def, label, opts) {
  WM.open(id, def ? { ...(opts || {}), def, title: label } : opts);
}

function handleDockClick(id, anchor, def, label) {
  if (id === 'trash') { openTrashMenu(anchor); return; }
  if (id === 'launchpad') { openLP(); return; }
  const wins = [...WM.wins.values()].filter(w => w.id === id);
  const top = wins.sort((a, b) => (+b.el.style.zIndex || 0) - (+a.el.style.zIndex || 0))[0];
  if (!top) { openEntry(id, def, label); dockFeedback(id); return; }
  if (top.min) WM.restore(top);
  else if (WM.cur === top && wins.length === 1) WM.minimize(top);
  else WM.focus(top);
}

function openDockMenu(id, label, x, y, def) {
  const wins = [...WM.wins.values()].filter(w => w.id === id);
  const multi = !!(def ? def.multi : (APPS[id] && APPS[id].multi));
  const items = [];
  if (wins.length) {
    if (multi) items.push({ t: 'new window', ic: 'win', fn: () => openEntry(id, def, label, { fresh: true }) });
    if (wins.length > 1) {
      items.push({ t: 'show all windows', ic: 'win', fn: () => showAll(id) });
      items.push({ t: 'minimize all', fn: () => wins.forEach(w => { if (!w.min) WM.minimize(w); }) });
    }
    items.push('-', { t: 'quit ' + label, ic: 'pow', fn: () => quitApp(id) });
  } else {
    items.push({ t: 'open ' + label, ic: 'win', fn: () => openEntry(id, def, label) });
  }
  openContextMenu(x, y, items);
}

function showAll(id) {
  const wins = [...WM.wins.values()].filter(w => w.id === id);
  wins.forEach(w => { if (w.min) WM.restore(w); });
  const top = wins.sort((a, b) => (+b.el.style.zIndex || 0) - (+a.el.style.zIndex || 0))[0];
  if (top) WM.focus(top);
}

function quitApp(id) {
  [...WM.wins.values()].filter(w => w.id === id).forEach(w => WM.close(w));
}

function openTrashMenu(anchor) {
  openMenu(anchor, [
    {
      t: 'reset demo…', ic: 'pow', fn: () => {
        openMenu(anchor, [{ t: 'wipe everything — sure?', ic: 'pow', fn: () => store.reset() },
          { t: 'never mind', fn: () => { } }], 'up');
      }
    },
    { t: 'what is this?', fn: () => toast('reset wipes the demo state and reboots into first-boot setup', 'info') }], 'up');
}

function attachDockMagnification(dock) {
  const DOCK_RANGE = 110, DOCK_SCALE = .48, DOCK_LIFT = 18, DOCK_GAP = 3;
  const dkEls = [...dock.querySelectorAll('.dk')];
  const rest = () => {
    dkEls.forEach(dk => {
      ['--x', '--lift', '--s'].forEach(v => dk.style.removeProperty(v));
      dk.style.zIndex = ''; dk.classList.remove('up');
    });
  };
  dock.addEventListener('mousemove', e => {
    const n = dkEls.length;
    const c = new Array(n), h = new Array(n), s = new Array(n);
    let a = 0, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const dk = dkEls[i], half = dk.offsetWidth / 2;
      // The dock is fixed and centered. Its children's rectangles already use
      // viewport coordinates, which are the same coordinates as clientX.
      c[i] = dk.getBoundingClientRect().left + half;
      const u = Math.abs(c[i] - e.clientX) / DOCK_RANGE;
      const f = u >= 1 ? 0 : (1 + Math.cos(Math.PI * u)) / 2;
      s[i] = 1 + DOCK_SCALE * f;
      h[i] = half * s[i];
      const dist = Math.abs(c[i] - e.clientX);
      if (dist < bd) { bd = dist; a = i; }
    }
    const d = new Array(n).fill(0);
    for (let i = a + 1; i < n; i++) d[i] = d[i - 1] + Math.max(0, h[i - 1] + h[i] - (c[i] - c[i - 1]) + DOCK_GAP);
    for (let i = a - 1; i >= 0; i--) d[i] = d[i + 1] - Math.max(0, h[i] + h[i + 1] - (c[i + 1] - c[i]) + DOCK_GAP);
    for (let i = 0; i < n; i++) {
      dkEls[i].style.setProperty('--x', d[i].toFixed(2) + 'px');
      dkEls[i].style.setProperty('--lift', ((s[i] - 1) * DOCK_LIFT).toFixed(2) + 'px');
      dkEls[i].style.setProperty('--s', s[i].toFixed(3));
      dkEls[i].style.zIndex = String(Math.round(s[i] * 100));
      dkEls[i].classList.toggle('up', s[i] > 1.015);
    }
  });
  dock.addEventListener('mouseleave', rest);
}
