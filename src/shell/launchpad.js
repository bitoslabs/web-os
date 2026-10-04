'use strict';
/* OS shell module: Launchpad — a full-screen grid of every registered program.
 * It reads the app registry, not the pinned catalog, so new apps appear here
 * automatically. Open with F4, the dock tile, or the app menu. */
import { $, esc, icon, APPS, onEcosystemChange } from '../core/index.js';
import { WM } from './window-manager.js';
import { installedLaunchEntries } from './installed-apps.js';

let lpEl = null, gridEl = null, inputEl = null;
let matches = [], sel = 0;

export function buildLaunchpad() {
  lpEl = $('#lp'); if (!lpEl) return;
  lpEl.innerHTML = `<div class="lp-wrap">
    <div class="lp-search">${icon('mag', 17)}<input placeholder="search apps" spellcheck="false" aria-label="search apps"></div>
    <div class="lp-grid" role="listbox" aria-label="applications"></div>
    <div class="lp-foot"><kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>enter</kbd> open · <kbd>F4</kbd> · <kbd>esc</kbd> close</div>
  </div>`;
  gridEl = lpEl.querySelector('.lp-grid');
  inputEl = lpEl.querySelector('input');
  inputEl.addEventListener('input', () => render(inputEl.value));
  inputEl.addEventListener('keydown', onLPKey);
  lpEl.addEventListener('pointerdown', e => { if (!e.target.closest('.lp-app,.lp-search,.lp-foot')) closeLP(); });
  /* Installed apps appear and disappear as the ecosystem changes. */
  onEcosystemChange(() => { if (lpOpen()) render(inputEl.value); });
}

export function openLP() {
  if (!lpEl) buildLaunchpad();
  if (!lpEl) return;
  inputEl.value = ''; render('');
  lpEl.classList.remove('hide');
  setTimeout(() => inputEl.focus(), 20);
}
export function closeLP() { if (lpEl) lpEl.classList.add('hide'); }
export function lpOpen() { return !!lpEl && !lpEl.classList.contains('hide'); }

function catalog() {
  const builtins = Object.entries(APPS).map(([id, a]) => ({ id, a, installed: false }));
  const installed = installedLaunchEntries().map(e => ({ id: e.key, a: e.def, installed: true }));
  return [...builtins, ...installed].sort((x, y) => x.a.title.localeCompare(y.a.title));
}

function render(q) {
  q = q.trim().toLowerCase();
  const all = catalog();
  matches = q
    ? all.filter(x => (x.a.title + ' ' + (x.a.sub || '') + ' ' + x.id).toLowerCase().includes(q))
    : all;
  sel = 0;
  if (!matches.length) {
    gridEl.innerHTML = `<div class="lp-empty">no apps match “${esc(q)}”</div>`;
    return;
  }
  const running = new Set([...WM.wins.values()].map(w => w.id));
  gridEl.innerHTML = matches.map((x, i) => `
    <button class="lp-app${running.has(x.id) ? ' running' : ''}" data-i="${i}" role="option" aria-label="${esc(x.a.title)}">
      <span class="lp-tile">${icon(x.a.icon, 30)}<i class="dot"></i></span>
      <span class="lp-name">${esc(x.a.title)}</span>
      <span class="lp-sub">${esc(x.a.sub || '')}</span>
    </button>`).join('');
  gridEl.querySelectorAll('.lp-app').forEach(b => {
    b.onclick = () => launch(+b.dataset.i);
    b.onmouseenter = () => setSel(+b.dataset.i, false);
  });
  setSel(0, false);
}

function launch(i) {
  const x = matches[i]; if (!x) return;
  closeLP();
  if (x.installed) WM.open(x.id, { def: x.a, title: x.a.title });
  else WM.open(x.id);
}

function setSel(i, scroll = true) {
  const els = [...gridEl.querySelectorAll('.lp-app')];
  if (!els.length) return;
  sel = Math.max(0, Math.min(i, els.length - 1));
  els.forEach((b, j) => b.classList.toggle('on', j === sel));
  if (scroll) els[sel].scrollIntoView({ block: 'nearest' });
}

function onLPKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeLP(); }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setSel(sel + 1); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setSel(sel - 1); }
  else if (e.key === 'Enter') { e.preventDefault(); launch(sel); }
}
