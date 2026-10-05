'use strict';
/* OS shell module: global pointer/keyboard routing. Keep app-only shortcuts in
 * their app unless the shell must own them for every focused program. */
import { $ } from '../core/index.js';
import { WM } from './window-manager.js';
import { menuEl, closeMenu, newTermTab } from './menus.js';
import { ccOpen, openCC } from './control-center.js';
import { spotRes, spotSel, setSpotSel, openSpot, closeSpot, renderSpot } from './search.js';
import { openLP, closeLP, lpOpen } from './launchpad.js';

export function bindGlobalInput() {
  document.addEventListener('pointerdown', onGlobalPointerDown);
  document.addEventListener('keydown', onGlobalKey);
  bindSpotlightInput();
}

function onGlobalPointerDown(e) {
  if (menuEl && !e.target.closest('.menu') && !e.target.closest('.mb-item') && !e.target.closest('.dk') && !e.target.closest('[data-pop]')) closeMenu();
  if (ccOpen && !e.target.closest('#cc') && !e.target.closest('.mb-ic')) openCC(false);
}

function onGlobalKey(e) {
  if (e.target.closest('.modal,.recovery')) return;
  if ($('#os').classList.contains('hide')) return;
  if (e.key === 'Escape') { closeMenu(); openCC(false); if (lpOpen()) closeLP(); if (!$('#spot').classList.contains('hide')) closeSpot(); }
  if (e.key === 'F4') { e.preventDefault(); lpOpen() ? closeLP() : openLP(); }
  if (e.code === 'KeyT' && e.ctrlKey && e.altKey) { e.preventDefault(); WM.open('terminal', { fresh: true }); }
  if (e.code === 'KeyT' && e.altKey && !e.ctrlKey && e.shiftKey) { e.preventDefault(); newTermTab(); }
  if (e.code === 'KeyT' && e.altKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); WM.open('terminal', { fresh: true }); }
  if (e.code === 'KeyW' && e.altKey) { e.preventDefault(); WM.cur && WM.close(WM.cur); }
  if (e.code === 'KeyM' && e.altKey) { e.preventDefault(); WM.cur && WM.minimize(WM.cur); }
  if (e.code === 'Comma' && e.altKey) { e.preventDefault(); WM.open('settings'); }
  if (e.code === 'KeyF' && e.ctrlKey && e.metaKey) { e.preventDefault(); WM.cur && WM.toggleFull(WM.cur); }
  if (e.code === 'Space' && e.ctrlKey) { e.preventDefault(); openSpot(); }
  if (e.code === 'KeyK' && e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    if (!$('#spot').classList.contains('hide')) closeSpot(); else openSpot();
  }
  if (e.key === '?' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { e.preventDefault(); WM.open('shortcuts'); }
}

function bindSpotlightInput() {
  const input = $('#spot input');
  input.addEventListener('input', () => renderSpot(input.value));
  input.addEventListener('keydown', onSpotlightKey);
  $('#spot').addEventListener('pointerdown', e => { if (e.target.id === 'spot') closeSpot(); });
}

function onSpotlightKey(e) {
  if (e.key === 'ArrowDown') { e.preventDefault(); setSpotSel(Math.min(spotSel + 1, spotRes.length - 1)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); setSpotSel(Math.max(spotSel - 1, 0)); }
  else if (e.key === 'Enter') { const x = spotRes[spotSel]; if (x) { closeSpot(); x.fn(); } }
  else if (e.key === 'Escape') closeSpot();
}
