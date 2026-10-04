'use strict';
/* OS shell module: searches registered local apps and trusted Handbook content.
 * Remote results must never inherit privileged shell actions. */
import { $, el, esc, icon, copyText, store, APPS, onEcosystemChange } from '../core/index.js';
import { WM } from './window-manager.js';
import { installedLaunchEntries, openInstalled } from './installed-apps.js';
import { HBDATA } from '../data/handbook.js';
import { setAccent, ACCENT_SWATCHES } from './menubar.js';
import { openCC, syncCC } from './control-center.js';
import { newNote, toggleBig, toggleWall } from './menus.js';
import { mark } from './tour.js';
import { openLP } from './launchpad.js';

export let spotRes = [], spotSel = 0;

export function spotIndex() {
  const ix = [];
  Object.entries(APPS).forEach(([id, a]) => ix.push({ k: 'app', t: a.title, s: a.sub || 'app', ic: a.icon, fn: () => WM.open(id) }));
  installedLaunchEntries().forEach(e => ix.push({ k: 'app', t: e.def.title, s: e.def.sub || 'installed', ic: e.def.icon, fn: () => openInstalled(e.key) }));
  HBDATA.forEach(s => ix.push({
    k: 'doc', t: s.t, s: 'handbook · ' + s.n, ic: 'book',
    fn: () => { const w = WM.open('handbook'); setTimeout(() => w.goto && w.goto(s.n), 40); }
  }));
  ix.push({ k: 'action', t: 'post a note', ic: 'bolt', fn: newNote });
  ACCENT_SWATCHES.forEach(a => ix.push({
    k: 'action', t: 'accent: ' + a, ic: 'sl',
    fn: () => { setAccent(a); mark('accent'); syncCC(); }
  }));
  ix.push({ k: 'action', t: 'larger text', ic: 'sl', fn: () => { toggleBig(); syncCC(); } });
  ix.push({ k: 'action', t: 'wallpaper on / off', ic: 'sl', fn: () => { toggleWall(); syncCC(); } });
  ix.push({ k: 'action', t: 'control center', ic: 'sl', fn: () => openCC(true) });
  ix.push({ k: 'action', t: 'launchpad — all apps', ic: 'grid', fn: openLP });
  ix.push({ k: 'action', t: 'copy npub', ic: 'copy', fn: () => copyText(store.d.npub, 'npub copied') });
  ix.push({ k: 'action', t: 'reset demo', ic: 'pow', fn: () => store.reset() });
  ix.push({
    k: 'cmd', t: 'terminal: bitfetch', ic: 'term', s: 'bsh',
    fn: () => { const w = WM.open('terminal'); setTimeout(() => w.run && w.run('bitfetch'), 80); }
  });
  return ix;
}
function score(t, q) {
  t = t.toLowerCase(); const i = t.indexOf(q);
  if (i < 0) { let j = 0; for (const c of t) { if (c === q[j]) j++; } return j === q.length ? 1 : 0; }
  return i === 0 ? 3 : 2;
}
export function renderSpot(q) {
  const raw = spotIndex(); q = q.trim().toLowerCase();
  let res = q ? raw.map(x => { x._s = score(x.t, q) || score(x.s || '', q); return x; }).filter(x => x._s > 0)
    .sort((a, b) => b._s - a._s || a.t.localeCompare(b.t)) : raw.slice(0, 8);
  spotRes = res.slice(0, 9); spotSel = 0;
  const list = $('#spot .sp-list');
  if (!spotRes.length) { list.innerHTML = `<div class="spempty">no matches — try "zap", "handbook" or "terminal"</div>`; return; }
  list.innerHTML = spotRes.map((x, i) => {
    let t = esc(x.t); const qi = q ? x.t.toLowerCase().indexOf(q) : -1;
    if (qi >= 0) t = esc(x.t.slice(0, qi)) + '<b>' + esc(x.t.slice(qi, qi + q.length)) + '</b>' + esc(x.t.slice(qi + q.length));
    return `<div class="spr${i === 0 ? ' on' : ''}" data-i="${i}">${icon(x.ic || 'bolt', 15)}<span>${t}</span><span class="sub">${x.k === 'app' ? 'open' : x.k === 'doc' ? 'read' : x.k === 'cmd' ? 'run' : 'do'} · ${x.s ? esc(x.s) : ''}</span></div>`;
  }).join('');
  [...list.querySelectorAll('.spr')].forEach(r => {
    r.onclick = () => { const x = spotRes[+r.dataset.i]; closeSpot(); x.fn(); };
    r.onmousemove = () => setSpotSel(+r.dataset.i);
  });
}
export function setSpotSel(i) {
  spotSel = i; const rs = [...$('#spot .sp-list').querySelectorAll('.spr')];
  rs.forEach((r, j) => r.classList.toggle('on', j === i));
  rs[i] && rs[i].scrollIntoView({ block: 'nearest' });
}
export function openSpot() {
  $('#spot').classList.remove('hide');
  const inp = $('#spot input'); inp.value = ''; renderSpot(''); setTimeout(() => inp.focus(), 20);
}
export function closeSpot() { $('#spot').classList.add('hide'); }

/* Keep an open spotlight in sync when installs change underneath it. */
onEcosystemChange(() => {
  const s = $('#spot');
  if (s && !s.classList.contains('hide')) renderSpot($('#spot input').value);
});
