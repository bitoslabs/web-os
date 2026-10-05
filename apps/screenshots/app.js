/* Built-in app: Screenshots. Captures the screen with getDisplayMedia, lets the
 * user take frames from a live preview, and saves them as PNG. On the booted OS
 * capture goes through a permissioned portal instead of the browser API. */
import { registerApp, icon, toast } from '../../src/core/index.js';

const fmtTime = t => new Date(t).toLocaleTimeString();

registerApp('screenshots', {
  title: 'screenshots', icon: 'cam', sub: 'capture · save', w: 720, h: 520,
  mount(body) {
    const shots = [];
    let stream = null, video = null;

    body.innerHTML = `<div class="sc">
      <div class="sc-tools">
        <button class="btn sm pri" data-start>${icon('cam', 14)} start capture</button>
        <button class="btn sm" data-shot disabled>${icon('down', 14)} take shot</button>
        <button class="btn sm ghost" data-stop disabled>stop</button>
        <span class="sc-flex"></span>
        <span class="mono-dim" data-note>screen capture needs a secure context</span>
      </div>
      <div class="sc-stage" data-stage>
        <video data-video muted playsinline></video>
        <div class="sc-hint" data-hint>${icon('cam', 30)}<span>start capture, then take shots from the live view</span></div>
      </div>
      <div class="sc-gal" data-gal></div>
      <div class="sc-view hide" data-view><img data-view-img alt=""><button class="btn sm ghost sc-vx" data-view-close>close</button></div>
    </div>`;

    const videoEl = body.querySelector('[data-video]');
    const hintEl = body.querySelector('[data-hint]');
    const galEl = body.querySelector('[data-gal]');
    const noteEl = body.querySelector('[data-note]');
    const startBtn = body.querySelector('[data-start]');
    const shotBtn = body.querySelector('[data-shot]');
    const stopBtn = body.querySelector('[data-stop]');
    const viewEl = body.querySelector('[data-view]');
    const viewImg = body.querySelector('[data-view-img]');

    function renderGal() {
      if (!shots.length) { galEl.innerHTML = '<div class="sc-empty">no shots yet</div>'; return; }
      galEl.innerHTML = shots.map((s, i) => `<figure class="sc-shot">
        <img src="${s.url}" alt="screenshot ${i + 1}" data-open="${i}">
        <figcaption><span>${s.w}×${s.h} · ${fmtTime(s.at)}</span>
          <span class="sc-act"><button data-dl="${i}" title="download">${icon('down', 13)}</button>
          <button data-rm="${i}" title="delete">${icon('trash', 13)}</button></span></figcaption></figure>`).join('');
    }
    function setLive(on) {
      shotBtn.disabled = !on; stopBtn.disabled = !on; startBtn.disabled = on;
      hintEl.classList.toggle('hide', on);
      videoEl.classList.toggle('on', on);
      noteEl.textContent = on ? 'sharing · frames stay in this window' : 'screen capture needs a secure context';
    }
    function stop() {
      if (video) video.srcObject = null;
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = null; video = null; setLive(false);
    }
    async function start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        toast('screen capture is not available in this browser', 'err'); return;
      }
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      } catch (e) { toast('capture cancelled or blocked', 'err'); return; }
      video = videoEl;
      video.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      if (track) track.addEventListener('ended', stop);
      try { await video.play(); } catch (e) { }
      setLive(true);
      startBtn.disabled = true;
    }
    function shoot() {
      if (!video || !video.videoWidth) { toast('no frame yet — give the preview a moment', 'err'); return; }
      const w = video.videoWidth, h = video.videoHeight;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(video, 0, 0, w, h);
      shots.unshift({ url: c.toDataURL('image/png'), w, h, at: Date.now() });
      renderGal(); toast('screenshot taken', 'ok');
    }

    startBtn.onclick = start;
    shotBtn.onclick = shoot;
    stopBtn.onclick = stop;
    galEl.onclick = e => {
      const dl = e.target.closest('[data-dl]'), rm = e.target.closest('[data-rm]'), op = e.target.closest('[data-open]');
      if (dl) {
        const s = shots[+dl.dataset.dl]; if (!s) return;
        const a = document.createElement('a'); a.href = s.url;
        a.download = `bitos-shot-${new Date(s.at).toISOString().replace(/[:.]/g, '-')}.png`;
        document.body.append(a); a.click(); a.remove();
      } else if (rm) { shots.splice(+rm.dataset.rm, 1); renderGal(); }
      else if (op) { const s = shots[+op.dataset.open]; if (s) { viewImg.src = s.url; viewEl.classList.remove('hide'); } }
    };
    body.querySelector('[data-view-close]').onclick = () => viewEl.classList.add('hide');
    viewEl.addEventListener('click', e => { if (e.target === viewEl) viewEl.classList.add('hide'); });

    renderGal();
    return stop;
  }
});
