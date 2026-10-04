'use strict';
/* BITOS FIRST-BOOT SETUP UI
 * Real setup screen source. Browser state is a preview; the OS commits through
 * the native setup service. Key derivation here is prototype cryptography. */
import { $, el, esc, icon, LOGO, store, native, wireComp, toast, genKey, petname, trunc } from '../core/index.js';
import { startOS } from '../session.js';

const suEl = $('#setup');

export function startSetup() {
  suEl.classList.remove('hide');
  let step = 1, host = 'bitos', keymap = 'us', keys = null, saved = false;
  const pool = new Uint8Array(32); let pidx = 0, bits = 0;
  const djb = () => { let h = 5381; for (const b of pool) h = (Math.imul(h, 33) ^ b) >>> 0; return h.toString(16).padStart(8, '0'); };
  const titles = { 1: 'name & keyboard', 2: 'your key', 3: 'review' };

  const card = el('div', 'su');
  card.innerHTML = `<div class="su-h">${LOGO}<div><div class="lbl">bitos first-boot</div><div class="t">graphical setup</div></div></div>
    <div class="su-b"></div>
    <div class="su-f"><div class="su-dots"><i></i><i></i><i></i></div>
    <div style="display:flex;gap:8px"><button class="btn ghost" data-back>back</button><button class="btn pri" data-next>next</button></div></div>`;
  suEl.append(card);
  const body = card.querySelector('.su-b'), dots = [...card.querySelectorAll('.su-dots i')];
  const back = card.querySelector('[data-back]'), next = card.querySelector('[data-next]');

  let lx = 0, ly = 0;
  suEl.addEventListener('pointermove', e => {
    if (Math.hypot(e.clientX - lx, e.clientY - ly) < 4) return;
    lx = e.clientX; ly = e.clientY; addEntropy(2, e.clientX ^ e.clientY);
  });
  suEl.addEventListener('keydown', e => addEntropy(6, e.keyCode));
  function addEntropy(n, data) {
    bits = Math.min(256, bits + n);
    if (data != null) { pool[pidx] ^= data & 255; pidx = (pidx + 1) % 32; }
    if (!keys) renderMeter();
  }
  function renderMeter() {
    const em = body.querySelector('.em i'); if (!em) return;
    em.style.width = (bits / 256 * 100) + '%';
    body.querySelector('.bits').textContent = bits + ' / 256 bits' + (bits >= 256 ? ' · strong' : bits >= 128 ? ' · ok' : ' · keep going');
    body.querySelector('.poolhex').textContent = 'pool ' + djb();
    const g = body.querySelector('[data-gen]'); if (g) g.disabled = bits < 128;
  }

  function show() {
    body.innerHTML = ''; back.style.visibility = step === 1 ? 'hidden' : 'visible';
    dots.forEach((d, i) => { d.className = i < step - 1 ? 'done' : i === step - 1 ? 'on' : ''; });
    card.querySelector('.su-h .t').textContent = 'setup · ' + titles[step];
    if (step === 1) {
      body.innerHTML = `<p class="su-p">three quick questions and the desktop is yours.
        everything you choose is written to <code>/var/lib/bitos</code> and never leaves this machine.</p>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          <div class="field" style="flex:1;min-width:220px"><span class="lbl">hostname — what other machines call it</span>
            <input data-host value="${host}" maxlength="20" spellcheck="false"></div>
          <div class="field" style="width:200px"><span class="lbl">keymap — your layout</span>
            <div class="sel"><select data-km>${['us', 'us-intl', 'de', 'fr', 'es', 'se', 'br', 'jp'].map(k => `<option ${k === keymap ? 'selected' : ''}>${k}</option>`).join('')}</select></div></div>
        </div>
        <p class="note" style="margin-top:14px">hostname: lowercase · digits · dashes. it shows up in your shell prompt.</p>`;
      const h = body.querySelector('[data-host]');
      h.oninput = () => { host = h.value.toLowerCase().replace(/[^a-z0-9-]/g, '') || 'bitos'; h.value = host; };
      h.onkeydown = e => { if (e.key === 'Enter') next.click(); }; h.focus();
      body.querySelector('[data-km]').onchange = e => keymap = e.target.value;
      next.textContent = 'next';
    }
    if (step === 2) {
      if (keys) { showKeys(); }
      else {
        body.innerHTML = `<p class="su-p">bitos has no passwords. your account is a keypair:
        <strong>npub</strong> (public — like a handle) and <strong>nsec</strong> (secret — like a house key).
        stir the pool by moving the mouse and typing, or let the machine do it.</p>
        <span class="lbl">entropy pool</span>
        <div class="em"><i></i></div>
        <div style="display:flex;justify-content:space-between"><span class="bits">0 / 256 bits</span><span class="poolhex">pool ${djb()}</span></div>
        <div class="field" style="margin-top:16px"><span class="lbl">keyboard / entropy sink — type anything</span>
          <input class="stir" data-stir spellcheck="false" placeholder="type here to add entropy"></div>
        <div style="display:flex;gap:12px;align-items:center;margin-top:18px;flex-wrap:wrap">
          <button class="btn pri" data-gen disabled>generate keys</button>
          <span class="linkbtn" style="font:400 12px var(--fys);color:var(--acc2);text-decoration:underline dotted;cursor:pointer" data-quick>in a hurry? generate instantly →</span></div>`;
        renderMeter();
        body.querySelector('[data-stir]').oninput = e => { e.target.value = ''; };
        body.querySelector('[data-gen]').onclick = () => { keys = genKey(pool); showKeys(); };
        body.querySelector('[data-quick]').onclick = () => {
          if (keys) return;
          const iv = setInterval(() => {
            bits = Math.min(256, bits + 36); renderMeter();
            if (bits >= 256) { clearInterval(iv); setTimeout(() => { keys = genKey(pool); showKeys(); }, 240); }
          }, 70);
        };
      }
      next.textContent = 'next';
    }
    if (step === 3) {
      body.innerHTML = `<p class="su-p">one look before we write it. after this: a mac-style desktop —
        dock, spotlight (<b>ctrl space</b>), working menus. press <b>?</b> if you ever feel lost.</p>
        <div class="sum">
          <div class="row"><b>hostname</b><span>${esc(host)}</span></div>
          <div class="row"><b>keymap</b><span>${esc(keymap)}</span></div>
          <div class="row"><b>identity</b><span class="c-acc">${trunc(keys.npub)}</span></div>
          <div class="row"><b>known as</b><span>${esc(petname(keys.npub))}</span></div>
          <div class="row"><b>accent</b><span>zap (violet) — change anytime in control center</span></div>
        </div>`;
      next.textContent = 'start session';
    }
    next.disabled = (step === 2) && (!keys || !saved);
  }
  function showKeys() {
    body.innerHTML = `<span class="lbl">public key — share freely</span>
      <div style="display:flex;gap:8px;margin-top:8px">
        <input readonly value="${keys.npub}" style="flex:1;min-width:0;background:rgba(0,0,0,.3);border:1px solid var(--hair);border-radius:6px;padding:9px 11px;font:400 11.5px var(--fm);color:var(--acc2)">
        <button class="key" data-copy="${keys.npub}">${icon('copy', 11)}</button></div>
      <div class="nsec-box"><span class="lbl" style="color:var(--err)">secret key — shown once</span>
        <div class="val">${keys.nsec}</div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn sm" data-dl>save key file</button>
          <span class="mono-dim">offline backup · bitos will not show this again</span></div></div>
      <label class="chk"><input type="checkbox" data-saved><span>i have stored my secret key somewhere safe</span></label>`;
    wireComp(body);
    body.querySelector('[data-saved]').onchange = e => { saved = e.target.checked; next.disabled = !saved; };
    body.querySelector('[data-dl]').onclick = () => {
      const txt = `bitos key backup\ncreated: ${new Date().toISOString()}\nhandle: ${petname(keys.npub)}\n\n` +
        `npub (public — share freely):\n${keys.npub}\n\n` +
        `nsec (secret — never share, never screenshot):\n${keys.nsec}\n\n` +
        `store this offline. bitos will not show the secret again.\n`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
      a.download = `bitos-key-${host}.txt`; a.click(); URL.revokeObjectURL(a.href);
      toast('key file saved — treat it like cash', 'ok');
    };
  }
  back.onclick = () => { step = Math.max(1, step - 1); show(); };
  next.onclick = async () => {
    if (step < 3) { step++; show(); return; }
    next.disabled = true; back.disabled = true; next.textContent = 'saving setup…';
    const previousState = store.d;
    try {
      if (native) await native.setupComplete({ language: keymap, displayName: host, hostname: host, npub: keys.npub, nsec: keys.nsec });
      store.d = {
        v: 1, host, keymap, npub: keys.npub, nsec: keys.nsec, pet: petname(keys.npub),
        accent: 'zap', wall: true, icons: true, big: false, resize: true, toasts: true,
        satsIn: 0, satsOut: 0, seen: 0, born: Date.now(),
      };
      if (!store.save() && !native) throw new Error('setup could not be saved');
      toast('setup saved', 'ok');
      suEl.classList.add('hide'); startOS(true);
    } catch (e) {
      store.d = previousState; next.disabled = false; back.disabled = false;
      next.textContent = 'retry saving setup';
      toast('setup was not completed — ' + esc(e.message || e.code || 'please retry'), 'err');
    }
  };
  show();
}
