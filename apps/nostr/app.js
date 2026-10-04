/* Built-in app: Nostr preview. Relay traffic, events, keys, and zaps here are
 * simulations; they are not a production network or cryptographic service.
 * The shared simulation state lives in src/data/sim.js. */
import { registerApp, store, esc, el, icon, toast, BOLTICON, trunc, drawIdenticon, wireComp } from '../../src/core/index.js';
import { WM } from '../../src/shell/window-manager.js';
import { updatePills, flashSats } from '../../src/shell/menubar.js';
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
    <span class="np c-dim">${ev.me ? trunc(store.d.npub) : 'npub1···'}</span><time data-ts="${ev.ts}">${age(ev.ts)}</time></div>
    <div class="evb">${bd}</div>
    <div class="evf">${ev.kind === 1 ? `<button class="zb" data-zap title="zap 21 sats">${BOLTICON(10)}<span>zap 21</span></button>` : ''}
    <span class="c-dim" style="font-size:10px">via ${ev.relay}</span></div>`;
  const z = n.querySelector('[data-zap]');
  if (z) z.onclick = () => {
    store.d.satsOut += 21; store.save(); mark('zap'); flashSats();
    toast(`you zapped <b>${esc(ev.author)}</b> 21 sats`, 'zap');
  };
  return n;
}

registerApp('nostr', {
  title: 'nostr', icon: 'bolt', sub: 'identity · relays · feed', w: 820, h: 560,
  mount(body, win) {
    body.innerHTML = `<div class="no">
      <div class="no-id"><canvas width="50" height="50"></canvas>
        <div class="who"><input class="pet" value="${esc(store.d.pet)}" spellcheck="false" maxlength="32" title="your handle — press enter to save">
        <button class="key" data-copy="${store.d.npub}" title="copy full npub">${icon('copy', 11)}<span>${trunc(store.d.npub)}</span></button>
        <div class="secrow"><span class="secmask">nsec1····························</span>
          <button class="btn ghost sm" data-sec>show secret</button></div></div>
        <div style="margin-left:auto;text-align:right">
          <div class="lbl">zap balance</div>
          <div class="mono-dim" data-bal style="font:600 12px var(--fm);color:var(--ink)"></div>
          <div class="mono-dim" style="margin-top:4px">prototype keys · keysvc pending</div></div></div>
      <div class="no-grid"><div class="no-rel"><span class="lbl">relays — wss</span><div data-rls></div></div>
      <div class="no-feed"><div id="feed"></div>
        <div class="no-comp"><input data-post placeholder="type a note — enter publishes" maxlength="140">
        <span class="cc" data-cc>140</span>
        <button class="btn pri sm" data-send>post</button></div></div></div></div>`;
    drawIdenticon(body.querySelector('canvas'), store.d.npub);
    const feed = body.querySelector('#feed'), rls = body.querySelector('[data-rls]');
    body.querySelector('.pet').onchange = e => {
      const v = e.target.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (v) { store.d.pet = v; store.save(); toast('you are now known as <b>' + esc(v) + '</b>', 'ok'); }
    };
    const secbtn = body.querySelector('[data-sec]'), secmask = body.querySelector('.secmask');
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
    function renderRelays() {
      rls.innerHTML = '';
      const emp = feed.querySelector('.empty');
      const allOff = SIM.relays.every(r => !r.on);
      if (allOff && !emp) feed.prepend(el('div', 'ev empty',
        'all relays offline — join one from the list on the left'));
      else if (!allOff && emp) emp.remove();
      SIM.relays.forEach(r => {
        const row = el('div', 'rl',
          `<span class="dot ${r.on ? 'on' : ''}"></span><span class="rlh">${r.host}</span>
         <span class="ping">${r.on ? r.ping + 'ms' : 'down'}</span>
         <button class="btn ghost sm">${r.on ? 'leave' : 'join'}</button>`);
        row.querySelector('button').onclick = () => {
          r.on = !r.on; updatePills(); renderRelays();
          toast(`relay <b>${r.host}</b> ${r.on ? 'joined' : 'left'}`, r.on ? 'ok' : 'info');
        };
        rls.append(row);
      });
    }
    function addEvent(ev) {
      feed.prepend(evNode(ev));
      while (feed.children.length > 40) feed.lastChild.remove(); renderBal();
    }
    function renderBal() {
      body.querySelector('[data-bal]').innerHTML =
        `<span class="c-acc">${store.d.satsIn.toLocaleString()}</span> in · <span class="c-acc">${store.d.satsOut.toLocaleString()}</span> out`;
    }
    SIM.events.slice(0, 40).forEach(e => feed.append(evNode(e)));
    renderRelays(); renderBal(); wireComp(body);
    win.addEvent = addEvent; win.renderRelays = renderRelays;
    const send = body.querySelector('[data-send]'), post = body.querySelector('[data-post]'),
      cc = body.querySelector('[data-cc]');
    post.oninput = () => {
      cc.textContent = 140 - post.value.length;
      cc.classList.toggle('low', post.value.length > 120);
    };
    function doSend() {
      const v = post.value.trim(); if (!v) return; post.value = ''; cc.textContent = '140';
      const ev = { ts: Date.now(), kind: 1, me: true, author: store.d.pet, relay: 'you', text: v };
      SIM.events.unshift(ev); addEvent(ev); mark('note');
      toast(`published to <b>${SIM.relays.filter(r => r.on).length}</b> relays`, 'ok');
    }
    send.onclick = doSend; post.onkeydown = e => { if (e.key === 'Enter') doSend(); };
    const ti = setInterval(() => {
      rls.querySelectorAll('.rl').forEach((row, i) => {
        const r = SIM.relays[i]; if (r) row.querySelector('.ping').textContent = r.on ? r.ping + 'ms' : 'down';
      });
    }, 3000);
    const ti2 = setInterval(() => feed.querySelectorAll('time').forEach(t => {
      t.textContent = age(+t.dataset.ts);
    }), 30000);
    return () => { clearInterval(ti); clearInterval(ti2); };
  }
});
