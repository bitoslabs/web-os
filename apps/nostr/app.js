/* Built-in app: Nostr preview. Relay traffic, events, keys, and zaps here are
 * simulations; they are not a production network or cryptographic service.
 * The shared simulation state lives in src/data/sim.js. */
import { registerApp, store, esc, el, icon, toast, BOLTICON, trunc, drawIdenticon, wireComp } from '../../src/core/index.js';
import { WM } from '../../src/shell/window-manager.js';
import { flashSats } from '../../src/shell/menubar.js';
import { mark } from '../../src/shell/tour.js';
import { SIM } from '../../src/data/sim.js';

const age = ts => {
  const s = (Date.now() - ts) / 1000;
  return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : Math.floor(s / 3600) + 'h';
};
function evNode(ev) {
  const n = el('div', 'ev' + (ev.kind === 9735 ? ' zapev' : ''));
  const kb = ev.kind === 9735 ? '<span class="kb kz">kind:9735</span>'
    : ev.kind === 1 ? '<span class="kb k1">kind:1</span>' : `<span class="kb k${ev.kind}">kind:${ev.kind}</span>`;
  const bd = ev.kind === 9735 ? `zap · ${ev.amt} sats → @${esc(ev.author)}`
    : ev.kind === 1 ? esc(ev.text) : `<span class="c-dim">${esc(ev.text || '')}</span>`;
  n.innerHTML = `<div class="evh">${kb}<span class="an">${ev.me ? 'you' : esc(ev.author)}</span>
    <span class="np c-dim">${ev.me ? trunc(store.d.npub) : 'npub1···'}</span><time data-ts="${ev.ts}" title="${new Date(ev.ts).toLocaleString()}">${age(ev.ts)}</time></div>
    <div class="evb">${bd}</div>
    <div class="evf">${ev.kind === 1 ? `<button class="zb" data-zap title="zap 21 sats">${BOLTICON(10)}<span>zap 21</span></button>` : ''}
    <span class="c-dim" style="font-size:10px">via ${esc(ev.relay)}</span></div>`;
  const z = n.querySelector('[data-zap]');
  if (z) z.onclick = () => {
    store.d.satsOut += 21; store.save(); mark('zap'); flashSats();
    const w = WM.wins.get('nostr'); if (w && w.renderBal) w.renderBal();
  };
  return n;
}

registerApp('nostr', {
  title: 'nostr', icon: 'bolt', sub: 'identity · feed · relays via settings', w: 860, h: 580,
  mount(body, win) {
    const SECTIONS = [
      { id: 'feed', name: 'feed', icon: 'list', sub: 'kind:1 notes and zaps from your relays' },
      { id: 'identity', name: 'identity', icon: 'bolt', sub: 'prototype keys · keysvc pending' },
    ];
    let cur = 'feed';

    /* ---------- shell: sidebar + detail, like Settings ---------- */
    body.innerHTML = `<div class="set-shell no-shell">
      <aside class="set-side no-side">
        <div class="set-prof no-prof" data-prof title="open identity">
          <div class="av av-card"><canvas width="38" height="38"></canvas></div>
          <div><div class="pn" data-prof-name>${esc(store.d.pet)}</div><div class="pk">${esc(trunc(store.d.npub))}</div></div>
        </div>
        <div class="set-list" data-nav></div>
        <div class="no-bal">
          <span class="lbl">zap balance</span>
          <div class="no-balv" data-bal></div>
        </div>
      </aside>
      <section class="set-detail no-main">
        <div class="set-h"><h1 data-h>feed</h1><div class="sub" data-sub></div></div>
        <div class="no-view" data-view></div>
      </section>
    </div>`;
    drawIdenticon(body.querySelector('.no-prof canvas'), store.d.npub);

    /* ---------- views ---------- */
    const view = body.querySelector('[data-view]');
    const feedView = el('div', 'no-feed');
    feedView.innerHTML = `<div id="feed"></div>
      <div class="no-comp">
        <input data-post placeholder="type a note — enter publishes" maxlength="140" aria-label="compose a note">
        <span class="cc" data-cc>140</span>
        <button class="btn pri sm" data-send>post</button>
      </div>`;
    const idView = el('div', 'no-pane set-body set');
    idView.innerHTML = `<div class="grpbox"><span class="lbl">profile</span>
        <div class="row"><div class="rt"><span class="lbl">handle</span>your petname — press enter to save</div>
          <input data-handle value="${esc(store.d.pet)}" spellcheck="false" maxlength="32" aria-label="your handle"></div>
        <div class="row"><div class="rt"><span class="lbl">public key</span>share freely — click to copy</div>
          <button class="key" data-copy="${esc(store.d.npub)}" title="copy full npub">${icon('copy', 11)}<span>${esc(trunc(store.d.npub))}</span></button></div>
        <div class="row"><div class="rt"><span class="lbl">secret key</span>never share — guard it like cash</div>
          <div class="secwrap"><span class="secmask">nsec1····························</span>
            <button class="btn ghost sm" data-sec>show secret</button></div></div>
      </div>
      <div class="grpbox"><span class="lbl">zap balance</span>
        <div class="row"><div class="rt"><span class="lbl">received</span>sats in from incoming zaps</div><span class="mono-dim" data-in>0</span></div>
        <div class="row"><div class="rt"><span class="lbl">sent</span>sats out from zapping notes</div><span class="mono-dim" data-out>0</span></div>
      </div>
      <p class="note">Keys, relays, and zaps here are a <b>simulation</b> — not a production network or cryptographic service.</p>`;
    view.append(feedView, idView);

    /* ---------- navigation ---------- */
    const nav = body.querySelector('[data-nav]');
    nav.innerHTML = `<div class="set-cap">nostr</div>` + SECTIONS.map(s =>
      `<button class="set-item" data-section="${s.id}"><span class="sv">${icon(s.icon, 16)}</span><b>${esc(s.name)}</b></button>`).join('');
    nav.onclick = e => { const b = e.target.closest('[data-section]'); if (b) showSection(b.dataset.section); };
    body.querySelector('[data-prof]').onclick = () => showSection('identity');

    function syncHeader() {
      const s = SECTIONS.find(x => x.id === cur);
      body.querySelector('[data-h]').textContent = s.name;
      body.querySelector('[data-sub]').textContent = s.sub;
    }
    function showSection(id) {
      cur = id;
      feedView.classList.toggle('hide', id !== 'feed');
      idView.classList.toggle('hide', id !== 'identity');
      body.querySelectorAll('.set-item').forEach(b => b.classList.toggle('on', b.dataset.section === id));
      body.querySelector('[data-prof]').classList.toggle('on', id === 'identity');
      syncHeader();
    }

    /* ---------- feed ---------- */
    const feed = feedView.querySelector('#feed');
    function addEvent(ev) {
      feed.prepend(evNode(ev));
      while (feed.children.length > 40) feed.lastChild.remove(); renderBal();
    }
    function renderBal() {
      const f = n => n.toLocaleString();
      body.querySelector('[data-bal]').innerHTML =
        `<span class="c-acc">${f(store.d.satsIn)}</span> in · <span class="c-acc">${f(store.d.satsOut)}</span> out`;
      const i = idView.querySelector('[data-in]'), o = idView.querySelector('[data-out]');
      if (i) i.textContent = f(store.d.satsIn);
      if (o) o.textContent = f(store.d.satsOut);
    }

    /* ---------- identity ---------- */
    const handle = idView.querySelector('[data-handle]');
    handle.onchange = () => {
      const v = handle.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (v) {
        store.d.pet = v; store.save();
        handle.value = v; body.querySelector('[data-prof-name]').textContent = v;
        toast('you are now known as <b>' + esc(v) + '</b>', 'ok');
      } else handle.value = store.d.pet;
    };
    const secbtn = idView.querySelector('[data-sec]'), secmask = idView.querySelector('.secmask');
    let secT = null, secCd = null;
    secbtn.onclick = () => {
      if (secT) { clearTimeout(secT); clearInterval(secCd); secT = null; }
      if (secmask.classList.contains('rev')) {
        secmask.classList.remove('rev');
        secmask.textContent = 'nsec1····························'; secbtn.textContent = 'show secret';
      } else {
        secmask.classList.add('rev'); secmask.textContent = store.d.nsec; secbtn.textContent = 'hide secret';
        toast('secret revealed — auto-hides in 10s', 'err'); let n = 10;
        secCd = setInterval(() => { n--; secbtn.textContent = 'hide (' + n + ')'; if (n <= 0) clearInterval(secCd); }, 1000);
        secT = setTimeout(() => secbtn.click(), 10000);
      }
    };

    /* ---------- composer ---------- */
    const send = feedView.querySelector('[data-send]'), post = feedView.querySelector('[data-post]'),
      cc = feedView.querySelector('[data-cc]');
    post.oninput = () => {
      cc.textContent = 140 - post.value.length;
      cc.classList.toggle('low', post.value.length > 120);
    };
    function doSend() {
      const v = post.value.trim(); if (!v) return;
      const wr = SIM.wRelays;
      if (!wr.length) { toast('no write relays — enable write on a relay before posting', 'err'); return; }
      post.value = ''; cc.textContent = '140'; cc.classList.remove('low');
      const prim = SIM.primary && wr.includes(SIM.primary) ? SIM.primary : null;
      const ev = { ts: Date.now(), kind: 1, me: true, author: store.d.pet, relay: (prim || wr[0]).host, text: v };
      SIM.events.unshift(ev); addEvent(ev); mark('note');
      toast(`published to <b>${wr.length}</b> write relay${wr.length === 1 ? '' : 's'}${prim ? ' · primary ' + esc(prim.host) : ''}`, 'ok');
    }
    send.onclick = doSend;
    post.onkeydown = e => { if (e.key === 'Enter') doSend(); };

    /* ---------- seed + timers ---------- */
    SIM.events.slice(0, 40).forEach(e => feed.append(evNode(e)));
    renderBal(); wireComp(body); showSection('feed');
    win.addEvent = addEvent; win.renderBal = renderBal;
    const ti2 = setInterval(() => feed.querySelectorAll('time').forEach(t => {
      t.textContent = age(+t.dataset.ts);
    }), 30000);
    return () => { clearInterval(ti2); };
  }
});
