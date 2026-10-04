/* Built-in app: About. Uses native system info when available; otherwise its
 * device line is explicitly simulated preview data. */
import { registerApp, LOGO, esc, SYSINFO } from '../../src/core/index.js';
import { sessionStart } from '../../src/shell/state.js';
import { WM } from '../../src/shell/window-manager.js';

registerApp('about', {
  title: 'about', icon: 'bolt', sub: '0.1.0-photon', w: 400, h: 340,
  mount(body) {
    body.innerHTML = `<div class="scrolly about"><div class="big">${LOGO}</div>
    <h1>bitos</h1><div class="vv">0.1.0-photon · experimental linux + web ui</div>
    <div class="vv" data-dev>${SYSINFO ? esc(SYSINFO.deviceName + ' · ' + SYSINFO.cpuArch + ' · native api v' + SYSINFO.apiVersion) : 'device info — simulated preview'}</div>
    <div class="vv" data-up>up 0m</div>
    <div class="btns"><button class="btn sm" data-hb>handbook</button>
    <button class="btn ghost sm" data-gs>getting started</button></div></div>`;
    const up = body.querySelector('[data-up]');
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - sessionStart) / 1000);
      up.textContent = `up ${Math.floor(s / 60)}m ${s % 60}s`;
    }, 1000);
    body.querySelector('[data-hb]').onclick = () => WM.open('handbook');
    body.querySelector('[data-gs]').onclick = () => WM.open('get-started');
    return () => clearInterval(t);
  }
});
