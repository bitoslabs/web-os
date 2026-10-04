/* Built-in app: Terminal preview. bsh is a JavaScript command simulation and
 * cannot execute host commands. It is not a Linux shell or privilege boundary. */
import { registerApp, store, esc, el, icon, APPS, SYSINFO, genKey, petname, trunc, lev } from '../../src/core/index.js';
import { WM } from '../../src/shell/window-manager.js';
import { openSpot } from '../../src/shell/search.js';
import { setAccent, ACCENT_SWATCHES } from '../../src/shell/menubar.js';
import { syncCC } from '../../src/shell/control-center.js';
import { mark } from '../../src/shell/tour.js';
import { sessionStart } from '../../src/shell/state.js';
import { SIM } from '../../src/data/sim.js';
import { SAMPLE_FILES } from '../../src/data/sample-files.js';

const BOLT = ['        ▐█▌', '        ▐█▌', '       ▄▄█▌', '   ▄▄▄▄█▌▀▀', '   ▀▀▀▀█▌', '       ▀█▌', '       ▄█▀', '       ▀▀'];
const MAN = {
  help: 'you are reading it', ls: 'ls [dir] — list dir (home or /etc)',
  cat: 'cat FILE — print a file. try: cat README, cat /etc/motd',
  open: 'open APP — launch a window. run: apps',
  nostr: 'nostr [status|npub|gen] — relay status, your key, or rotate identity',
  theme: 'theme [zap|phosphor|amber] — swap the accent token live',
  bitfetch: 'system summary, obviously', sats: 'zap balance', reset: 'wipe state and reboot into setup',
  spot: 'open the spotlight', keys: 'the shortcut panel', start: 'the getting-started checklist', man: 'yes.',
  newtab: 'newtab — open a new shell tab (alt shift t)', newwindow: 'newwindow — open a new terminal window (alt t)',
  tabs: 'tabs — list the shell tabs in this window', exit: 'exit — close this tab, or the window if it is the last one'
};

function termApi(out) {
  const print = (h, cls) => { out.append(el('div', 'tl ' + (cls || ''), h)); out.scrollTop = out.scrollHeight; };
  const promptHTML = () => `<span class="c-ok">${esc(store.d.pet)}</span><span class="c-dim">@</span><span class="c-cy">${esc(store.d.host)}</span><span class="c-dim">:~$</span> `;
  return { print, promptHTML, clear() { out.innerHTML = ''; } };
}

function termCommands(api, ctx) {
  const p = api.print; const C = {};
  C.help = ['list commands', () => {
    p('<span class="c-dim">bsh 0.1 — type a name · tab completes · ↑ recalls history</span>');
    [['getting around', [['help', 'this list'], ['spot', 'spotlight — everything, one keystroke'], ['apps', 'launchable apps'], ['open APP', 'launch a window'], ['keys', 'shortcut panel'], ['start', 'getting-started checklist'], ['clear', 'wipe screen']]],
    ['files', [['ls / cat', 'look around'], ['man CMD', 'one-line manuals'], ['echo TXT', 'say it back']]],
    ['system', [['bitfetch', 'the banner'], ['theme X', 'zap | phosphor | amber'], ['sats', 'zap balance'], ['whoami / uname / uptime', 'the usual']]],
    ['tabs & windows', [['newtab', 'new shell tab — alt shift t'], ['newwindow', 'new window — alt t'], ['tabs', 'list open tabs'], ['exit', 'close tab, then window']]],
    ['nostr', [['nostr status', 'relays + key'], ['nostr gen', 'rotate identity']]],
    ['careful', [['reset', 'wipe demo · reboot setup'], ['exit', 'close this window']]]]
      .forEach(([g, rows]) => {
        p('<span class="c-acc">' + g + '</span>');
        rows.forEach(r => p('  ' + r[0].padEnd(16) + '<span class="c-dim">' + r[1] + '</span>'));
      });
  }];
  C.clear = ['clear the screen', () => api.clear()];
  C.spot = ['open the spotlight', () => openSpot()];
  C.apps = ['list launchable apps', () => p(Object.keys(APPS).map(a => '  ' + a).join('\n'))];
  C.keys = ['the shortcut panel', () => WM.open('shortcuts')];
  C.start = ['getting-started checklist', () => WM.open('get-started')];
  C.ls = ['list files', a => {
    a = a.replace(/^~|^\//, '').replace(/^(home\/)?(user\/)?/, '');
    if (a === 'etc') { p('/etc:'); p('  bitos.conf  hostname  motd'); }
    else { p('README  notes.txt  <span class="c-dim">.profile</span>'); }
  }];
  C.cat = ['print a file', a => {
    const f = SAMPLE_FILES[a.split('/').pop()];
    f ? p(esc(f), 'pre') : p(`<span class="c-err">cat: ${esc(a || '')}: no such file</span> <span class="c-dim">— try: ls</span>`);
  }];
  C.man = ['read a manual page', a => {
    a = (a || '').trim();
    MAN[a] ? p('  ' + esc(MAN[a])) : p(`<span class="c-err">man: no entry for '${esc(a)}'</span>`);
  }];
  C.whoami = ['print user', () => p(store.d.pet)];
  C.hostname = ['print hostname', () => p(store.d.host)];
  C.uname = ['system information', () => p('BitOS ' + store.d.host + ' 0.1.0-photon #1 SMP PREEMPT_DYNAMIC ' + (SYSINFO ? SYSINFO.cpuArch : 'x86_64') + ' GNU/Linux')];
  C.uptime = ['session uptime', () => {
    const s = Math.floor((Date.now() - sessionStart) / 1000);
    p(`up ${Math.floor(s / 60)}m ${s % 60}s · 1 user · load 0.42 0.35 0.31`);
  }];
  C.date = ['print date', () => p(new Date().toString())];
  C.echo = ['echo args', a => p(esc(a))];
  C.pwd = ['print working dir', () => p('/home/' + store.d.pet)];
  C.sats = ['zap balance', () => {
    p(`in  <span class="c-acc">${store.d.satsIn.toLocaleString()}</span> sats`);
    p(`out <span class="c-acc">${store.d.satsOut.toLocaleString()}</span> sats`);
  }];
  C.theme = ['set accent', a => {
    const ok = ACCENT_SWATCHES;
    if (!a) p('usage: theme <span class="c-dim">' + ok.join('|') + '</span> · current: ' + store.d.accent);
    else if (ok.includes(a)) { if (store.d.accent !== a) mark('accent'); setAccent(a); syncCC(); p(`<span class="c-ok">[ ok ]</span> accent → ${a}`); }
    else p(`<span class="c-err">theme: unknown accent '${esc(a)}'</span>`);
  }];
  C.nostr = ['nostr identity + relays', a => {
    a = a || 'status';
    if (a === 'npub') { p(store.d.npub); p('<span class="c-dim">select the line above to copy it</span>'); }
    else if (a === 'gen') {
      const k = genKey(); store.d.npub = k.npub; store.d.nsec = k.nsec; store.d.pet = petname(k.npub); store.save();
      p('<span class="c-warn">[ !! ] identity rotated — old key is gone</span>'); p('npub: <span class="c-acc">' + store.d.npub + '</span>');
    }
    else {
      SIM.relays.forEach(r => p(`${r.on ? '<span class="c-ok">up</span>  ' : '<span class="c-dim">off</span> '} ${r.host.padEnd(20)} <span class="c-dim">${r.on ? r.ping + 'ms' : '—'}</span>`));
      p(`<span class="c-dim">${SIM.relays.filter(r => r.on).length}/4 up · ${store.d.seen} events seen · npub ${trunc(store.d.npub)}</span>`);
    }
  }];
  C.bitfetch = ['system summary', () => {
    const up = SIM.relays.filter(r => r.on).length;
    const s = Math.floor((Date.now() - sessionStart) / 1000);
    const info = [['user', store.d.pet + '@' + store.d.host], ['os', 'bitos 0.1.0 (photon) ' + (SYSINFO ? SYSINFO.cpuArch : 'x86_64 · simulated')],
    ['kernel', '6.6.x-bitos'], ['wm', 'bitowm (html · aqua)'], ['shell', 'bsh 0.1'],
    ['ui', 'wpe-webkit · plex mono'], ['key', trunc(store.d.npub)],
    ['relays', up + '/4 up'], ['zaps', store.d.satsIn.toLocaleString() + ' sats in'],
    ['uptime', Math.floor(s / 60) + 'm' + (s % 60) + 's']];
    const bw = Math.max(...BOLT.map(l => l.length));
    for (let i = 0; i < Math.max(BOLT.length, info.length); i++) {
      const b = (BOLT[i] || '').padEnd(bw), inf = info[i] || ['', ''];
      p(`<span class="c-acc">${b}</span>   <span class="c-dim">${inf[0].padEnd(8)}</span> ${esc(inf[1])}`, 'pre');
    }
  }];
  C.neofetch = ['alias of bitfetch', C.bitfetch[1]];
  C.open = ['launch an app', a => { a ? ctx.launch(a, api) : p('usage: open <span class="c-dim">app</span> — run: apps'); }];
  C.newtab = ['open a new tab', () => ctx.newTab()];
  C.newwindow = ['open a new window', () => ctx.newWindow()];
  C.tabs = ['list open tabs', () => ctx.listTabs().forEach(t => p((t.active ? '<span class="c-ok">*</span> ' : '  ') + esc(t.label)))];
  C.reset = ['wipe state and reboot', () => { p('<span class="c-warn">[ !! ]</span> wiping /var/lib/bitos …'); store.reset(); }];
  C.exit = ['close this tab or window', () => ctx.exit()];
  return C;
}
function suggest(c, C) {
  const ks = Object.keys(C); let best = '', bd = 1e9;
  for (const k of ks) { const d = lev(c, k); if (d < bd) { bd = d; best = k; } }
  return bd <= Math.max(2, Math.floor(c.length / 3)) ? best : null;
}

registerApp('terminal', {
  title: 'terminal', icon: 'term', sub: 'bsh — /home/user', w: 660, h: 430, multi: true,
  mount(body, win) {
    body.classList.add('term');
    const bar = el('div', 'term-tabs');
    const tablist = el('div', 'term-tablist');
    const addBtn = el('button', 'term-btn', '+'); addBtn.title = 'new tab (alt shift t)'; addBtn.setAttribute('aria-label', 'new tab');
    const winBtn = el('button', 'term-btn'); winBtn.innerHTML = icon('win', 15);
    winBtn.title = 'new window (alt t)'; winBtn.setAttribute('aria-label', 'new window');
    bar.append(tablist, addBtn, winBtn);
    const panes = el('div', 'term-panes');
    body.append(bar, panes);

    const sessions = []; let ti = 0, tabSeq = 0;

    function openApp(t, api) {
      const id = Object.keys(APPS).find(k => k === t);
      if (id) { WM.open(id); api.print(`<span class="c-ok">[ ok ]</span> launched ${t}`); }
      else api.print(`<span class="c-err">open: unknown app '${esc(t)}'</span> <span class="c-dim">— run: apps</span>`);
    }

    function newSession() {
      tabSeq++;
      const s = { n: tabSeq, label: 'bsh ' + tabSeq, pane: el('div', 'term-pane'), out: el('div', 't-out'), hist: [], hi: 0 };
      const line = el('div', 't-line');
      const inp = el('input', 't-in'); inp.spellcheck = false; inp.autocomplete = 'off';
      inp.placeholder = 'type help · tab completes · ↑ history';
      line.append(el('span', 't-p', ''), inp); s.pane.append(s.out, line); s.inp = inp;
      const api = termApi(s.out); s.api = api;
      line.querySelector('.t-p').innerHTML = api.promptHTML();
      const ctx = {
        launch: (t, a) => openApp(t, a),
        newTab: () => addTab(),
        newWindow: () => WM.open('terminal', { fresh: true }),
        exit: () => { if (sessions.length > 1) closeTab(sessions.indexOf(s)); else WM.close(win); },
        listTabs: () => sessions.map((x, i) => ({ label: x.label, active: i === ti }))
      };
      const C = termCommands(api, ctx); s.C = C;
      s.exec = raw => {
        s.out.append(el('div', 'tl', api.promptHTML() + `<span class="c-ink2">${esc(raw)}</span>`));
        const parts = raw.trim().split(/\s+/), c = (parts.shift() || '').toLowerCase(), arg = parts.join(' ');
        if (c && C[c]) C[c][1](arg);
        else if (c) {
          const sug = suggest(c, C);
          api.print(`<span class="c-err">bsh: ${esc(c)}: command not found</span>` +
            (sug ? ` <span class="c-dim">— did you mean</span> <span class="c-acc">${sug}</span><span class="c-dim">?</span>`
              : ' <span class="c-dim">— type help</span>'));
        }
        s.out.scrollTop = s.out.scrollHeight;
      };
      s.pane.addEventListener('click', () => { if (!getSelection().toString()) inp.focus(); });
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') { const v = inp.value; inp.value = ''; if (v.trim()) { s.hist.push(v); s.hi = s.hist.length; } s.exec(v); }
        else if (e.key === 'ArrowUp') { if (s.hi > 0) { s.hi--; inp.value = s.hist[s.hi] || ''; } e.preventDefault(); }
        else if (e.key === 'ArrowDown') { if (s.hi < s.hist.length) { s.hi++; inp.value = s.hist[s.hi] || ''; } e.preventDefault(); }
        else if (e.key === 'Tab') {
          e.preventDefault(); const v = inp.value.trim().toLowerCase();
          if (!v) return; const m = Object.keys(C).filter(k => k.startsWith(v));
          if (m.length === 1) inp.value = m[0] + ' '; else if (m.length > 1) api.print('<span class="c-dim">' + m.join('  ') + '</span>');
        }
        else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); api.clear(); }
      });
      return s;
    }

    function renderTabs() {
      tablist.innerHTML = '';
      sessions.forEach((s, i) => {
        const b = el('button', 'term-tab' + (i === ti ? ' on' : '')); b.title = s.label;
        const n = el('span', 'term-tab-n', ''); n.textContent = s.label; b.append(n);
        if (sessions.length > 1) {
          const x = el('span', 'term-tab-x', '×'); x.title = 'close tab';
          x.onclick = ev => { ev.stopPropagation(); closeTab(i); };
          b.append(x);
        }
        b.onclick = ev => { if (ev.target.closest('.term-tab-x')) return; activate(i, true); };
        tablist.append(b);
      });
    }
    function activate(i, focus) {
      ti = i;
      sessions.forEach((s, x) => s.pane.classList.toggle('on', x === i));
      renderTabs();
      if (focus !== false && sessions[i]) sessions[i].inp.focus();
    }
    function addTab() {
      const s = newSession(); sessions.push(s); panes.append(s.pane);
      activate(sessions.length - 1, true);
    }
    function closeTab(i) {
      if (sessions.length < 2) return;
      const gone = sessions.splice(i, 1)[0]; gone.pane.remove();
      if (ti >= sessions.length) ti = sessions.length - 1; else if (i < ti) ti--;
      activate(ti, true);
    }
    addBtn.onclick = () => addTab();
    winBtn.onclick = () => WM.open('terminal', { fresh: true });
    win.run = raw => { const s = sessions[ti]; s && s.exec(raw); };
    win.focusInput = () => { const s = sessions[ti]; s && s.inp.focus(); };
    win.newTab = () => addTab();
    win.newWindow = () => WM.open('terminal', { fresh: true });

    const first = newSession(); sessions.push(first); panes.append(first.pane);
    first.out.append(el('div', 'tl c-dim', esc(SAMPLE_FILES['motd'])), el('div', 'tl', ''));
    if (!store.d.termSeen) {
      store.d.termSeen = true; store.save();
      first.api.print('<span class="c-dim">new here? this shell is a toy with training wheels:</span>');
      first.exec('help');
    }
    activate(0, false);
  }
});
