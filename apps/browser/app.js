/* Built-in app: Browser. Loads remote pages in a cross-origin sandboxed frame
 * that has no shell or native bridge. Embedding depends on each site's frame
 * policy, so an open-in-new-tab fallback is always available. */
import { registerApp, esc, icon } from '../../src/core/index.js';

const BOOKMARKS = [
  ['duckduckgo', 'https://duckduckgo.com/'],
  ['wikipedia', 'https://en.wikipedia.org/'],
  ['hacker news', 'https://news.ycombinator.com/'],
  ['example.com', 'https://example.com/'],
  ['bitos.space', 'https://bitos.space/'],
];
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals';

function normalize(v) {
  v = String(v || '').trim();
  if (!v) return '';
  if (/^(https?|ftp|file|about|data):/i.test(v)) return v;
  if (/^[^\s/]+\.[^\s/]{2,}(\/|$|:)/.test(v) || /^localhost(:\d+)?(\/|$)/i.test(v)) return 'https://' + v;
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(v);
}

registerApp('browser', {
  title: 'browser', icon: 'globe', sub: 'web · sandboxed', w: 880, h: 580, unified: true,
  mount(body, win) {
    let hist = [''], hi = 0;

    const tools = document.createElement('div');
    tools.className = 'br-tools';
    tools.innerHTML = `<button class="btn sm ghost" data-back title="back" aria-label="back">${icon('chevl', 15)}</button>
      <button class="btn sm ghost" data-fwd title="forward" aria-label="forward">${icon('chevr', 15)}</button>
      <button class="btn sm ghost" data-reload title="reload" aria-label="reload">${icon('refresh', 15)}</button>
      <button class="btn sm ghost" data-home title="home" aria-label="home">${icon('home', 15)}</button>
      <form class="br-url" data-form><span>${icon('globe', 13)}</span><input data-url placeholder="search or enter an address" spellcheck="false" autocomplete="off" aria-label="address"></form>
      <button class="btn sm ghost" data-ext title="open in a new tab">${icon('ext', 14)}</button>`;

    body.innerHTML = `<div class="br">
      <div class="br-stage">
        <iframe data-frame class="br-frame hide" sandbox="${SANDBOX}" referrerpolicy="no-referrer" title="web content"></iframe>
        <div class="br-home" data-home-view>
          <div class="br-hi">${icon('globe', 34)}</div>
          <h1>browser</h1>
          <p class="mono-dim">remote pages run cross-origin in a sandbox and cannot reach the shell or the native bridge.</p>
          <div class="br-bm" data-bm></div>
          <p class="br-note">pages that send <b>X-Frame-Options</b> or a restrictive <b>frame-ancestors</b> policy will not embed — use <b>open in a new tab</b>.</p>
        </div>
        <div class="br-loading hide" data-loading><i></i></div>
      </div>
      <div class="br-bar"><span class="c-dim" data-status>home</span></div>
    </div>`;

    const frame = body.querySelector('[data-frame]');
    const homeView = body.querySelector('[data-home-view]');
    const loadingEl = body.querySelector('[data-loading]');
    const statusEl = body.querySelector('[data-status]');
    const urlEl = tools.querySelector('[data-url]');
    const backBtn = tools.querySelector('[data-back]');
    const fwdBtn = tools.querySelector('[data-fwd]');
    const bmEl = body.querySelector('[data-bm]');

    if (win && win.tools) win.tools.append(tools);
    else body.querySelector('.br').insertBefore(tools, body.querySelector('.br-stage'));

    bmEl.innerHTML = BOOKMARKS.map(([n, u]) => `<button class="br-b" data-u="${u}">${esc(n)}<span class="mono-dim">${esc(u.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</span></button>`).join('');

    function syncButtons() { backBtn.disabled = hi <= 0; fwdBtn.disabled = hi >= hist.length - 1; }
    function showHome() {
      frame.classList.add('hide'); frame.removeAttribute('src');
      homeView.classList.remove('hide'); loadingEl.classList.add('hide');
      urlEl.value = ''; statusEl.textContent = 'home'; syncButtons();
    }
    function load(url, push) {
      url = normalize(url);
      if (!url) { showHome(); return; }
      if (push !== false) { hist = hist.slice(0, hi + 1); hist.push(url); hi = hist.length - 1; }
      frame.classList.remove('hide'); frame.classList.add('loading');
      homeView.classList.add('hide'); loadingEl.classList.remove('hide');
      urlEl.value = url; statusEl.textContent = url;
      frame.src = url;
      syncButtons();
    }

    tools.querySelector('[data-back]').onclick = () => { if (hi > 0) { hi--; load(hist[hi], false); } };
    tools.querySelector('[data-fwd]').onclick = () => { if (hi < hist.length - 1) { hi++; load(hist[hi], false); } };
    tools.querySelector('[data-reload]').onclick = () => { if (frame.src) { frame.classList.add('loading'); loadingEl.classList.remove('hide'); frame.src = frame.src; } };
    tools.querySelector('[data-home]').onclick = showHome;
    const openExt = () => { const u = frame.src || urlEl.value; if (u) window.open(u, '_blank', 'noopener'); };
    tools.querySelector('[data-ext]').onclick = openExt;
    tools.querySelector('[data-form]').onsubmit = e => { e.preventDefault(); load(urlEl.value); };
    urlEl.addEventListener('focus', () => urlEl.select());
    body.querySelector('[data-bm]').onclick = e => { const b = e.target.closest('[data-u]'); if (b) load(b.dataset.u); };
    frame.addEventListener('load', () => { frame.classList.remove('loading'); loadingEl.classList.add('hide'); if (frame.src && frame.src !== 'about:blank') statusEl.textContent = frame.src; });
    frame.addEventListener('error', () => { frame.classList.remove('loading'); loadingEl.classList.add('hide'); });

    showHome();
    return () => { try { frame.removeAttribute('src'); } catch (e) { } };
  }
});
