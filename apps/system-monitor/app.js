/* Built-in app: System Monitor preview. CPU, memory, events, and processes are
 * simulated until a narrow native metrics/process service is implemented. */
import { registerApp, clamp } from '../../src/core/index.js';
import { SIM } from '../../src/data/sim.js';

registerApp('system-monitor', {
  title: 'sysmon', icon: 'act', sub: 'bitos · live', w: 330, h: 450,
  mount(body) {
    body.innerHTML = `<div class="scrolly mon">
    <div class="mrow"><div class="mh"><span class="lbl">cpu</span><span class="mv" data-v="0">–</span></div><canvas data-c="0" width="280" height="44"></canvas></div>
    <div class="mrow"><div class="mh"><span class="lbl">memory</span><span class="mv" data-v="1">–</span></div><canvas data-c="1" width="280" height="44"></canvas></div>
    <div class="mrow"><div class="mh"><span class="lbl">nostr events</span><span class="mv" data-v="2">–</span></div><canvas data-c="2" width="280" height="44"></canvas></div>
    <span class="lbl" style="display:block;margin:8px 0 6px">processes</span>
    <table data-pt></table></div>`;
    const cvs = [...body.querySelectorAll('canvas')], vs = [...body.querySelectorAll('.mv')], pt = body.querySelector('[data-pt]');
    let cpu = 18, mem = 26; const D = [[], [], []];
    function spark(cv, dat, col) {
      const c = cv.getContext('2d'), W = cv.width, H = cv.height;
      c.clearRect(0, 0, W, H); if (dat.length < 2) return; const mx = Math.max(...dat, 1);
      c.strokeStyle = col; c.lineWidth = 1.4; c.beginPath();
      dat.forEach((v, i) => { const x = i / (dat.length - 1) * (W - 6) + 3, y = H - 4 - (v / mx) * (H - 10); i ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.stroke();
      c.fillStyle = col; const ly = H - 4 - (dat[dat.length - 1] / mx) * (H - 10); c.fillRect(W - 5, ly - 1.5, 3, 3);
    }
    const t = setInterval(() => {
      cpu = clamp(cpu + (Math.random() - .48) * 10, 2, 92); mem = clamp(mem + (Math.random() - .5) * 1.6, 16, 38);
      const eps = SIM.hits.filter(x => Date.now() - x < 5000).length / 5;
      D[0].push(cpu); D[1].push(mem); D[2].push(eps + Math.random() * .3);
      D.forEach(x => { while (x.length > 60) x.shift(); });
      vs[0].textContent = cpu.toFixed(0) + '%'; vs[1].textContent = mem.toFixed(0) + '%'; vs[2].textContent = eps.toFixed(1) + '/s';
      spark(cvs[0], D[0], '#58c26c'); spark(cvs[1], D[1], '#54b9c7'); spark(cvs[2], D[2], '#a78bfa');
      pt.innerHTML = [['bitowm', (cpu * .3).toFixed(1), '38m'], ['wpe-bitos', (cpu * .45).toFixed(1), '212m'],
        ['relaysd', (cpu * .1).toFixed(1), '14m'], ['bsh', '0.1', '3m'], ['keysd <span class="c-dim">stub</span>', '0.0', '0m']]
        .map(r => `<tr><td>${r[0]}</td><td>${r[1]}%</td><td>${r[2]}</td></tr>`).join('');
    }, 1000);
    return () => clearInterval(t);
  }
});
