'use strict';
/* OS shell module: persistent menu/status bar. Device status must remain marked
 * simulated until supplied by a native service. */
import { $, el, icon, LOGO, BOLTICON, store, hexRgb, lighten } from '../core/index.js';
import { WM } from './window-manager.js';
import { menuEl, menuBtn, toggleMenu } from './menus.js';
import { openSpot } from './search.js';
import { openCC, syncCC } from './control-center.js';
import { wall } from './wallpaper.js';
import { setMbAppEl } from './state.js';
import { SIM } from '../data/sim.js';

let relaySt = null, satsSt = null;
const DAYS_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function buildMenubar() {
  const mb = $('#menubar'); mb.innerHTML = '';
  const logo = el('button', 'mb-logo', LOGO); logo.dataset.menu = 'app'; logo.title = 'bitos';
  const appEl = el('button', 'mb-item mb-app', 'bitos'); appEl.dataset.menu = 'app'; setMbAppEl(appEl);
  const menuButtons = ['file', 'edit', 'view', 'window', 'help'].map(name => {
    const b = el('button', 'mb-item', name); b.dataset.menu = name; return b;
  });
  mb.append(logo, appEl, ...menuButtons);

  const right = el('div', 'mb-r');
  relaySt = el('button', 'mb-st', ''); relaySt.title = 'nostr relays — click to open';
  satsSt = el('button', 'mb-st sats', ''); satsSt.title = 'zaps received — click to open';
  const ccButton = el('button', 'mb-ic', icon('sl', 14)); ccButton.title = 'control center';
  const magButton = el('button', 'mb-ic', icon('mag', 14)); magButton.title = 'spotlight — ctrl space';
  const clock = el('span', 'clockst', '');
  right.append(relaySt, satsSt, ccButton, magButton, clock); mb.append(right);

  [logo, appEl, ...menuButtons].forEach(b => {
    b.addEventListener('click', () => toggleMenu(b, b.dataset.menu));
    b.addEventListener('mouseenter', () => { if (menuEl && menuBtn && menuBtn !== b) toggleMenu(b, b.dataset.menu); });
  });
  relaySt.onclick = () => WM.open('nostr'); satsSt.onclick = () => WM.open('nostr');
  ccButton.onclick = () => openCC(); magButton.onclick = openSpot;
  startMenubarClock(clock);
}

let clockTimer = null;
export function startMenubarClock(clock) {
  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    const n = new Date();
    clock.textContent = `${DAYS_SHORT[n.getDay()]} ${n.getDate()} ${MONTHS_SHORT[n.getMonth()]} ` +
      `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
    clock.title = n.toDateString();
  }, 1000);
}

export function updatePills() {
  if (!relaySt || !satsSt) return;
  const up = SIM.up;
  relaySt.title = `nostr relays — ${SIM.rRelays.length} read · ${SIM.wRelays.length} write · click to manage`;
  relaySt.innerHTML = `<span class="dotp" style="background:${up ? 'var(--ok)' : 'var(--err)'}"></span>${up}/${SIM.relays.length}`;
  satsSt.innerHTML = `${BOLTICON(11)}<span>${store.d.satsIn.toLocaleString()}</span>`;
  syncCC();
}

export function flashSats() {
  updatePills(); satsSt.classList.add('flash');
  setTimeout(() => satsSt.classList.remove('flash'), 450);
}

/* Named theme colors. `nostr` and `bitcoin` are the first two swatches; the
 * zap/phosphor/amber names stay as aliases for older saved state. */
export const ACCENT_COLORS = {
  nostr: '#8b5cf6', bitcoin: '#f7931a', blue: '#0a84ff', purple: '#bf5af2',
  pink: '#ff375f', red: '#ff453a', orange: '#ff9f0a', yellow: '#ffd60a',
  green: '#30d158', graphite: '#8e8e93',
};
export const ACCENT_SWATCHES = Object.keys(ACCENT_COLORS);
const ACCENT_ALIASES = { zap: 'nostr', phosphor: 'green', amber: 'orange' };

export function accentHexOf(name) {
  if (!name) return null;
  if (ACCENT_COLORS[name]) return ACCENT_COLORS[name];
  if (ACCENT_ALIASES[name]) return ACCENT_COLORS[ACCENT_ALIASES[name]];
  return name.startsWith('#') ? name : null;
}
export function accentName() {
  const d = store.d; if (!d) return 'nostr';
  if (d.accent === 'custom') return d.accentHex || 'custom';
  const key = ACCENT_ALIASES[d.accent] || d.accent;
  return ACCENT_COLORS[key] ? key : (d.accent || 'nostr');
}
export function syncAccentUI() {
  const d = store.d; if (!d) return;
  const cur = (d.accent === 'custom' ? (d.accentHex || '') : (accentHexOf(d.accent) || '')).toLowerCase();
  document.querySelectorAll('[data-sw]').forEach(b => {
    const on = b.dataset.sw === 'custom' ? d.accent === 'custom'
      : (d.accent !== 'custom' && ((accentHexOf(b.dataset.sw) || '').toLowerCase() === cur));
    b.classList.toggle('on', on);
  });
  document.querySelectorAll('[data-accname]').forEach(e => { e.textContent = accentName(); });
  document.querySelectorAll('[data-accpick]').forEach(i => { if (d.accentHex) i.value = d.accentHex; });
}
export function setAccent(a, hex) {
  const root = document.documentElement;
  const resolved = a === 'custom' ? (hex || (store.d && store.d.accentHex) || '#8b5cf6') : (accentHexOf(a) || '#8b5cf6');
  const [r, g, b] = hexRgb(resolved);
  root.dataset.acc = a;
  root.style.setProperty('--acc', resolved);
  root.style.setProperty('--acc2', lighten(resolved, .3));
  root.style.setProperty('--acc-t', `rgba(${r},${g},${b},.14)`);
  root.style.setProperty('--acc-t2', `rgba(${r},${g},${b},.30)`);
  if (store.d) { store.d.accent = a; if (a === 'custom' && hex) store.d.accentHex = hex; store.save(); }
  syncAccentUI();
  wall.rebuild();
}
