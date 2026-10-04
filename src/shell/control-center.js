'use strict';
/* OS shell module: quick settings. Relay/zap values are preview simulations;
 * device settings require permission-checked native methods. */
import { $, toast, store } from '../core/index.js';
import { setAccent, syncAccentUI, ACCENT_COLORS, ACCENT_SWATCHES } from './menubar.js';
import { toggleWall, FS_STEPS, fontScale, setFontScale, setTheme } from './menus.js';
import { mark } from './tour.js';
import { SIM } from '../data/sim.js';

let ccEl = null;
export let ccOpen = false;

export function buildCC() {
  ccEl = $('#cc');
  ccEl.innerHTML = `
    <div class="ccrow"><span class="ccl">theme</span>
      <div class="seg">${['auto', 'light', 'dark'].map(t => `<button data-theme-opt="${t}">${t}</button>`).join('')}</div></div>
    <div class="ccrow"><span class="ccl">accent</span>
      <div class="swatches" data-ccacc>
        <label class="sw custom" data-sw="custom" title="custom"><input type="color" class="pick" data-accpick value="${store.d.accentHex || '#8b5cf6'}" aria-label="custom accent color"></label>
        ${ACCENT_SWATCHES.map(n => `<button class="sw" data-sw="${n}" title="${n}" style="background:${ACCENT_COLORS[n]}"></button>`).join('')}
      </div></div>
    <div class="ccrow"><span class="ccl">text size</span>
      <div class="seg">${FS_STEPS.map(([k, v]) => `<button data-fs="${v}">${k}</button>`).join('')}</div></div>
    <div class="ccrow"><span class="ccl">wallpaper</span><button class="sw2" data-ccwall><i></i></button></div>
    <div class="ccsep"></div>
    <div class="ccrow"><span class="ccl">relays</span><span class="ccv" data-ccrel></span></div>
    <div class="ccrow"><span class="ccl">zaps in</span><span class="ccv" data-ccsats></span></div>`;
  ccEl.querySelectorAll('.sw:not(.custom)').forEach(b => b.onclick = () => {
    setAccent(b.dataset.sw); mark('accent'); syncCC();
    toast('accent → <b>' + b.dataset.sw + '</b>', 'ok');
  });
  ccEl.querySelector('[data-accpick]').oninput = e => {
    setAccent('custom', e.target.value); mark('accent'); syncCC();
  };
  ccEl.querySelectorAll('.seg button[data-fs]').forEach(b => b.onclick = () => {
    setFontScale(parseFloat(b.dataset.fs)); syncCC();
  });
  ccEl.querySelector('[data-ccwall]').onclick = () => { toggleWall(); };
  ccEl.querySelectorAll('.seg button[data-theme-opt]').forEach(b => b.onclick = () => { setTheme(b.dataset.themeOpt); syncCC(); });
  syncCC();
  syncAccentUI();
}
export function syncCC() {
  if (!ccEl) return;
  ccEl.querySelectorAll('.seg button[data-theme-opt]').forEach(b => b.classList.toggle('on', b.dataset.themeOpt === (store.d.theme || 'dark')));
  const fs = fontScale();
  ccEl.querySelectorAll('.seg button[data-fs]').forEach(b => b.classList.toggle('on', parseFloat(b.dataset.fs) === fs));
  ccEl.querySelector('[data-ccwall]').classList.toggle('on', store.d.wall);
  const up = SIM.up;
  ccEl.querySelector('[data-ccrel]').innerHTML =
    `<span class="dotp" style="background:${up ? 'var(--ok)' : 'var(--err)'}"></span>${up}/${SIM.relays.length}`;
  ccEl.querySelector('[data-ccsats]').textContent = store.d.satsIn.toLocaleString() + ' sats';
}
export function openCC(v) {
  ccOpen = v === undefined ? !ccOpen : v;
  ccEl.classList.toggle('hide', !ccOpen);
}
