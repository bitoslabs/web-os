/* Built-in app: Handbook. Trusted local design/help content also indexed by
 * the spotlight search. Keep remote content out of this privileged context. */
import { registerApp, el, store, wireComp, drawIdenticon, toast } from '../../src/core/index.js';
import { flashSats } from '../../src/shell/menubar.js';
import { mark } from '../../src/shell/tour.js';
import { openSpot } from '../../src/shell/search.js';
import { HBDATA } from '../../src/data/handbook.js';

registerApp('handbook', {
  title: 'handbook', icon: 'book', sub: 'bitos design system · v2', w: 900, h: 600,
  mount(body, win) {
    body.innerHTML = `<div class="hb"><nav class="hb-nav"></nav><div class="hb-main"></div></div>`;
    const nav = body.querySelector('.hb-nav'), main = body.querySelector('.hb-main');
    const navs = [];
    HBDATA.forEach((s, i) => {
      const n = el('div', 'hn', `<b>${s.n}</b><span>${s.t}</span>`);
      const go = () => {
        navs.forEach(x => x.classList.remove('on')); n.classList.add('on');
        main.innerHTML = `<div class="hb-sec">${s.h(store.d)}</div>`;
        wireComp(main);
        main.querySelectorAll('.seg button').forEach((b, j, all) => b.onclick = () => {
          all.forEach(x => x.classList.remove('on')); b.classList.add('on');
        });
        const cv = main.querySelector('canvas'); if (cv) drawIdenticon(cv, store.d.npub);
        main.scrollTop = 0;
      };
      n.onclick = go; nav.append(n); navs.push(n);
      if (i === 0) n.click();
    });
    win.goto = n => { const i = HBDATA.findIndex(s => s.n === n); if (i >= 0) navs[i].click(); };
    body.querySelector('.hb').addEventListener('click', e => {
      const zd = e.target.closest('[data-zd]');
      if (zd) {
        store.d.satsIn += 21; store.save(); mark('zap'); flashSats();
        toast('handbook demo: <b>+21 sats</b> for the good taste', 'zap');
      }
      const sd = e.target.closest('[data-sd]'); if (sd) openSpot();
      const td = e.target.closest('[data-td]'); if (td) toast('this is what a banner sounds like', 'info');
      const mo = e.target.closest('[data-mo]');
      if (mo) { const t = main.querySelector('.mo-tile'); t.classList.remove('go'); void t.offsetWidth; t.classList.add('go'); }
    });
  }
});
