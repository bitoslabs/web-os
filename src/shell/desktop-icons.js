'use strict';
/* OS shell module: desktop launch surface for the pinned app catalog. */
import { $, el, icon, store } from '../core/index.js';
import { SHELL_APPS } from './launchers.js';
import { WM } from './window-manager.js';
import { deskEl } from './state.js';

export function buildDesktopIcons() {
  const host = $('#dicons');
  SHELL_APPS.forEach(([id, label, ic]) => {
    const dicon = el('div', 'dicon', `<div class="tile">${icon(ic, 24)}</div><span>${label}</span>`);
    dicon.title = label + ' — click twice to open';
    dicon.addEventListener('click', () => {
      const was = dicon.classList.contains('sel');
      document.querySelectorAll('.dicon').forEach(x => x.classList.remove('sel'));
      if (was) { WM.open(id); } else dicon.classList.add('sel');
    });
    host.append(dicon);
  });
  host.style.display = store.d.icons ? '' : 'none';
  if (!store.d.hinted) {
    const hint = el('div', '', 'click the <b>dock</b> below, or press <b>ctrl space</b>');
    hint.id = 'hint'; deskEl.append(hint);
  }
  deskEl.addEventListener('pointerdown', e => {
    if (e.target === deskEl || e.target.id === 'wall')
      document.querySelectorAll('.dicon').forEach(x => x.classList.remove('sel'));
  });
}
