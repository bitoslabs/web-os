'use strict';
/* OS shell module: desktop launch surface for the pinned app catalog. Icons
 * flow top-to-bottom then wrap into columns so they never run off the screen.
 * Right-clicking an icon opens macOS-style actions; right-clicking the desktop
 * opens desktop actions (sort, clean up, wallpaper, spotlight, launchpad). */
import { $, el, icon, store, APPS } from '../core/index.js';
import { SHELL_APPS } from './launchers.js';
import { WM } from './window-manager.js';
import { deskEl } from './state.js';
import { openContextMenu, toggleIcons } from './menus.js';
import { openCC } from './control-center.js';
import { openSpot } from './search.js';
import { openLP } from './launchpad.js';

let host = null, bound = false;

export function buildDesktopIcons() {
  host = $('#dicons');
  if (!store.d.hinted) {
    const hint = el('div', '', 'click the <b>dock</b> below, or press <b>ctrl space</b>');
    hint.id = 'hint'; deskEl.append(hint);
  }
  if (!bound) {
    bound = true;
    deskEl.addEventListener('pointerdown', e => {
      if (e.target === deskEl || e.target.id === 'wall') clearSel();
    });
    deskEl.addEventListener('contextmenu', desktopMenu);
  }
  renderIcons();
}

function order() {
  return store.d.iconSort === 'name'
    ? [...SHELL_APPS].sort((a, b) => a[1].localeCompare(b[1]))
    : SHELL_APPS;
}

function renderIcons() {
  host.innerHTML = '';
  order().forEach(([id, label, ic]) => {
    const dicon = el('div', 'dicon', `<div class="tile">${icon(ic, 24)}</div><span>${label}</span>`);
    dicon.title = label + ' — click twice to open, right-click for actions';
    dicon.addEventListener('click', () => {
      const was = dicon.classList.contains('sel');
      clearSel();
      if (was) { WM.open(id); } else dicon.classList.add('sel');
    });
    dicon.addEventListener('contextmenu', e => {
      e.preventDefault();
      clearSel();
      dicon.classList.add('sel');
      const items = [{ t: 'open ' + label, ic, fn: () => WM.open(id) }];
      if (APPS[id] && APPS[id].multi)
        items.push({ t: 'new window', ic: 'win', fn: () => WM.open(id, { fresh: true }) });
      const open = [...WM.wins.values()].filter(w => w.id === id);
      if (open.length) items.push('-', { t: 'quit ' + label, ic: 'pow', fn: () => open.forEach(w => WM.close(w)) });
      openContextMenu(e.clientX, e.clientY, items);
    });
    host.append(dicon);
  });
  host.style.display = store.d.icons ? '' : 'none';
}

function clearSel() { document.querySelectorAll('.dicon').forEach(x => x.classList.remove('sel')); }

function setIconSort(v) { store.d.iconSort = v; store.save(); renderIcons(); }

function desktopMenu(e) {
  if (e.target !== deskEl && e.target.id !== 'wall') return;
  e.preventDefault();
  clearSel();
  const sorted = store.d.iconSort === 'name';
  openContextMenu(e.clientX, e.clientY, [
    { t: 'sort by name', check: sorted, fn: () => setIconSort('name') },
    { t: 'clean up', fn: () => setIconSort('default') }, '-',
    { t: 'change wallpaper…', ic: 'pic', fn: () => openCC(true) },
    { t: 'open spotlight', ic: 'mag', k: '<kbd>ctrl space</kbd>', fn: openSpot },
    { t: 'show launchpad', ic: 'grid', k: '<kbd>F4</kbd>', fn: openLP }, '-',
    { t: 'desktop icons', check: store.d.icons, fn: toggleIcons }
  ]);
}
