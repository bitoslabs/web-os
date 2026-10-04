'use strict';
/* BITOS GRAPHICAL STARTUP UI
 * Chooses setup or desktop. Current device/driver lines are preview presentation
 * data, not measured hardware facts or verified native boot diagnostics. */
import { $, el, esc, store, bootState, primeSysInfo } from '../core/index.js';
import { startSetup } from '../setup/setup.js';
import { startOS } from '../session.js';

const bootEl = $('#boot');

export function showRecovery(title, error) {
  console.error(title, error);
  let screen = document.querySelector('#recovery');
  if (!screen) { screen = document.createElement('section'); screen.id = 'recovery'; document.body.append(screen); }
  screen.className = 'recovery'; screen.setAttribute('role', 'alertdialog');
  screen.setAttribute('aria-label', title); screen.tabIndex = -1;
  screen.innerHTML = `<div class="recovery-card"><h1>${esc(title)}</h1>
    <p>Your session could not start. Retry to reconnect to system services.</p>
    <p class="mono-dim">${esc(error && error.code || 'STARTUP_ERROR')}</p>
    <button class="btn pri" type="button">restart desktop</button></div>`;
  screen.querySelector('button').onclick = () => location.reload(); screen.focus();
}

export async function runBoot() {
  bootEl.textContent = 'starting Bitos…';
  const state = await bootState();
  bootEl.textContent = '';
  primeSysInfo();
  const L = [
    ['', '<span class="c-acc">BitOS</span> 0.1.0 (photon) — tty1'],
    ['0.000', 'bitos: x86_64 boot · qemu/pc compatible'],
    ['0.041', 'cpu0: 8 threads / 4 cores · microcode ok'],
    ['0.087', 'memory: 16384M available'],
    ['0.132', 'drm: bound virtio_gpu · eDP-1 1920x1080@60'],
    ['0.218', 'input: atkbd · ps2-touchpad'],
    ['0.261', 'net: eth0 link up · 1000Mb/s'],
    ['0.294', 'snd: hda codec configured'],
    ['0.331', 'wayland: compositor <span class="c-acc">bitowm</span> started'],
    ['0.365', 'wpe: ui bundle mounted /usr/share/bitos/ui'],
    ['0.402', 'keysd: not present — using <span class="c-warn">prototype keys</span>'],
    ['0.448', 'relaysd: 4 relays from /etc/relay.d'],
    ['0.501', state ? `firstboot: state found · <span class="c-ok">${esc(store.d.pet)}@${esc(store.d.host)}</span>`
      : 'firstboot: <span class="c-warn">no state — entering setup</span>'],
    ['ok', 'reached target graphical.target'],
  ];
  const cur = el('div', 'bl', '<span class="cur"></span>'); let i = 0, done = false;
  bootEl.append(el('div', 'skip', 'click to skip'), cur);
  function addLine() {
    if (done) return;
    if (i >= L.length) { finish(); return; }
    const [t, m] = L[i++];
    bootEl.insertBefore(el('div', 'bl', t === 'ok' ? `<span class="c-ok">[ ok ]</span> ${m}`
      : `<span class="b-t">[ ${(t || '').padStart(7)} ]</span> ${m}`), cur);
    setTimeout(addLine, 55 + Math.random() * 110);
  }
  function finish() {
    if (done) return; done = true;
    while (i < L.length) {
      const [t, m] = L[i++];
      bootEl.insertBefore(el('div', 'bl', t === 'ok' ? `<span class="c-ok">[ ok ]</span> ${m}`
        : `<span class="b-t">[ ${(t || '').padStart(7)} ]</span> ${m}`), cur);
    }
    setTimeout(() => {
      try { bootEl.classList.add('hide'); state ? startOS(false) : startSetup(); }
      catch (error) { showRecovery('Could not open the desktop', error); }
    }, 520);
  }
  bootEl.addEventListener('pointerdown', finish); window.addEventListener('keydown', finish, { once: true });
  setTimeout(addLine, 260);
}
