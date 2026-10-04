/* Built-in app: Get Started. Onboarding actions launch registered local apps. */
import { registerApp, store } from '../../src/core/index.js';
import { WM } from '../../src/shell/window-manager.js';

registerApp('get-started', {
  title: 'get started', icon: 'check', sub: '2 minutes · 5 steps', w: 480, h: 500,
  mount(body, win) {
    const items = [
      ['term', 'launch the terminal', 'from the dock, spotlight, or ctrl alt t. type help.', 'terminal'],
      ['book', 'read the handbook', 'every color, gesture and rule — live and clickable.', 'handbook'],
      ['note', 'publish a note', 'a kind:1 event goes out to your relays. enter publishes.', 'nostr'],
      ['zap', 'send a zap', '21 sats to a stranger. lightning fast, literally.', 'nostr'],
      ['accent', 'try another accent', 'control center, top right — one variable repaints the os.', 'settings']];
    win.render = render;
    function render() {
      const t = store.d.tour || {}; const n = items.filter(i => t[i[0]]).length;
      body.innerHTML = `<div class="scrolly gs">
        <div class="gs-h"><span class="lbl">bitos · first session</span>
          <div class="pr"><i style="width:${n / 5 * 100}%"></i></div>
          <span class="mono-dim">${n}/5 — ${n === 5 ? 'complete. bitos is yours.' : 'no rush — progress is saved'}</span></div>
        ${items.map(([k, tt, desc, app]) => `
          <div class="gs-i ${t[k] ? 'done' : ''}">
            <span class="gs-c">${t[k] ? '✓' : '·'}</span>
            <div><div class="gs-t">${tt}</div><div class="gs-d">${desc}</div></div>
            ${t[k] ? '' : `<button class="btn sm" data-go="${app}">do it →</button>`}
          </div>`).join('')}
        <p class="note">checked items persist. lost? press <b>ctrl space</b> (spotlight) or
        <b>?</b> (shortcuts). reset the demo from the <b>bitos</b> menu, top-left.</p></div>`;
      body.querySelectorAll('[data-go]').forEach(b => b.onclick = () => WM.open(b.dataset.go));
    }
    render();
  }
});
