'use strict';
/* ============================================================================
   BITOS WEB / DESKTOP SESSION
   Assembles the desktop after boot: menu bar, dock, icons, wallpaper, control
   center, global input, and the lock/reveal flow. Program behavior lives in
   apps/<app-id>/; this file only coordinates the session.
   ========================================================================== */
import { $, esc, store, toast, petname, syncFilesOnLogin } from './core/index.js';
import { setDeskEl, startSessionClock } from './shell/state.js';
import { buildMenubar, setAccent, updatePills } from './shell/menubar.js';
import { applyAppearance } from './shell/menus.js';
import { buildDock } from './shell/dock.js';
import { buildDesktopIcons } from './shell/desktop-icons.js';
import { wall } from './shell/wallpaper.js';
import { buildCC } from './shell/control-center.js';
import { bindGlobalInput } from './shell/global-input.js';
import { lockFlow } from './shell/lock.js';
import { WM } from './shell/window-manager.js';
import { openSpot } from './shell/search.js';
import { SIM } from './data/sim.js';

/* ================= desktop session ================= */
export function applySessionDefaults(d) {
  if (d.accent == null) d.accent = 'zap';
  if (d.accentHex == null) d.accentHex = '#8b5cf6';
  if (d.theme == null) d.theme = 'dark';
  if (d.pet == null) d.pet = petname(d.npub || '');
  if (d.name == null) d.name = '';
  if (d.bio == null) d.bio = '';
  if (d.avatar == null) d.avatar = '';
  if (d.nip05 == null) d.nip05 = '';
  if (d.website == null) d.website = '';
  if (d.lud16 == null) d.lud16 = '';
  if (d.fs == null) d.fs = d.big === true ? 1.15 : 1;
  d.big = d.fs > 1;
  if (d.motion == null) d.motion = false;
  if (d.bright == null) d.bright = 100;
  if (d.vol == null) d.vol = 70;
  if (d.mute == null) d.mute = false;
  if (d.alerts == null) d.alerts = true;
  if (d.power == null) d.power = 'balanced';
  if (d.telemetry == null) d.telemetry = false;
  if (d.crashes == null) d.crashes = true;
  if (d.wall == null) d.wall = true;
  if (d.icons == null) d.icons = true;
  if (d.host == null) d.host = 'bitos';
  ['satsIn', 'satsOut', 'seen'].forEach(k => { if (d[k] == null) d[k] = 0; });
  /* relay roster + NIP-65 roles persist here; seed from the simulation once */
  if (!Array.isArray(d.relays) || !d.relays.length) d.relays = SIM.snapshot();
  SIM.hydrate(d.relays);
}

export function startOS(fresh) {
  const d = store.d;
  applySessionDefaults(d);
  startSessionClock();
  applyAppearance();
  setDeskEl($('#desktop'));
  $('#os').classList.remove('hide');

  buildMenubar();
  buildDock();
  buildDesktopIcons();

  wall.init(); wall.setOn(d.wall);
  buildCC(); setAccent(d.accent, d.accentHex); updatePills();
  bindGlobalInput();

  if (!fresh) lockFlow(() => reveal(fresh)); else reveal(fresh);
}

export function reveal(fresh) {
  SIM.start(); updatePills();
  /* Home files/folders sync on login (unlock or first boot). */
  syncFilesOnLogin().then(st => {
    if (st.state === 'pulled') toast('restored your home from sync', 'ok');
    else if (st.state === 'merged') toast('home synced — merged with the remote copy', 'info');
    else if (st.state === 'error') toast('home sync failed — ' + esc(st.error || 'unknown error'), 'err');
  });
  if (fresh) {
    WM.open('get-started');
    toast(`welcome, <b>${esc(store.d.pet)}</b> — your account is your key`, 'zap',
      { label: 'get started', fn: () => WM.open('get-started') });
  } else {
    const w = WM.open('terminal');
    setTimeout(() => { w.run && w.run('bitfetch'); }, 150);
    setTimeout(() => toast('tip: <b>ctrl space</b> opens spotlight', 'info', { label: 'try it', fn: openSpot }), 5000);
  }
}
