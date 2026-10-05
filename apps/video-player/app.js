/* Built-in app: Video Player. Plays local video files with a playlist, file
 * drop, a custom transport bar (scrub, time, volume, loop, fullscreen), and
 * keyboard control. Files are held as object URLs for the session only;
 * nothing is uploaded or persisted. */
import { registerApp, esc, icon, toast } from '../../src/core/index.js';

const fmtSize = n => n < 1024 ? n + ' B' : n < 1024 * 1024 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const fmtTime = s => {
  if (!isFinite(s) || s < 0) return '0:00';
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(sec).padStart(2, '0');
};

registerApp('video-player', {
  title: 'videos', icon: 'film', sub: 'local · playlist', w: 820, h: 540,
  opens: ['video/*', '*.mp4', '*.m4v', '*.webm', '*.mov', '*.ogv', '*.ogg', '*.mkv', '*.avi'],
  mount(body, win) {
    const items = [];
    let sel = -1, loopOn = false, listOn = true, scrubbing = false;

    body.innerHTML = `<div class="vp">
      <div class="vp-tools">
        <button class="btn sm ghost" data-open title="open videos">${icon('film', 14)} open</button>
        <span class="vp-title" data-name>no video</span>
        <span class="vp-flex"></span>
        <span class="vp-meta mono-dim" data-meta></span>
        <button class="btn sm ghost" data-list title="toggle playlist" aria-label="toggle playlist">${icon('list', 14)}</button>
        <button class="btn sm ghost danger" data-del title="remove from playlist" aria-label="remove">${icon('trash', 14)}</button>
      </div>
      <div class="vp-main">
        <div class="vp-stage" data-stage>
          <video data-v playsinline preload="metadata"></video>
          <button class="vp-bigplay" data-bigplay aria-label="play">${icon('play', 30)}</button>
          <div class="vp-empty" data-empty>drop videos here<br><span class="mono-dim">or use open — nothing is uploaded</span></div>
        </div>
        <aside class="vp-side" data-side>
          <div class="vp-side-h"><span>playlist</span><span class="mono-dim" data-count></span></div>
          <div class="vp-list" data-list-el></div>
        </aside>
      </div>
      <div class="vp-bar" data-bar>
        <div class="vp-scrub" data-scrub role="slider" tabindex="0" aria-label="seek" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0">
          <i class="vp-buf" data-buf></i>
          <i class="vp-prog" data-prog></i>
          <i class="vp-knob" data-knob></i>
          <span class="vp-tip mono-dim" data-tip></span>
        </div>
        <div class="vp-ctl">
          <div class="vp-tcell"><span data-cur>0:00</span><span class="dim"> / </span><span class="dim" data-dur>0:00</span></div>
          <div class="vp-ccell">
            <button data-prev aria-label="previous" title="previous (←)">${icon('chevl', 16)}</button>
            <button class="vp-round" data-play aria-label="play/pause" title="play/pause (space)">${icon('play', 18)}</button>
            <button data-next aria-label="next" title="next (→)">${icon('chevr', 16)}</button>
          </div>
          <div class="vp-rcell">
            <button data-mute aria-label="mute" title="mute (m)">${icon('vol', 15)}</button>
            <input type="range" data-vol min="0" max="1" step="0.01" value="1" aria-label="volume">
            <button data-loop aria-label="loop" title="loop (l)">${icon('loop', 15)}</button>
            <button data-full aria-label="fullscreen" title="fullscreen (f)">${icon('max', 15)}</button>
          </div>
        </div>
      </div>
      <input type="file" data-file accept="video/*" multiple class="hide">
    </div>`;

    const root = body.querySelector('.vp');
    const video = body.querySelector('[data-v]');
    const stage = body.querySelector('[data-stage]');
    const bigplay = body.querySelector('[data-bigplay]');
    const emptyEl = body.querySelector('[data-empty]');
    const file = body.querySelector('[data-file]');
    const bar = body.querySelector('[data-bar]');
    const scrub = body.querySelector('[data-scrub]');
    const bufEl = body.querySelector('[data-buf]');
    const progEl = body.querySelector('[data-prog]');
    const knobEl = body.querySelector('[data-knob]');
    const tipEl = body.querySelector('[data-tip]');
    const curEl = body.querySelector('[data-cur]');
    const durEl = body.querySelector('[data-dur]');
    const nameEl = body.querySelector('[data-name]');
    const metaEl = body.querySelector('[data-meta]');
    const countEl = body.querySelector('[data-count]');
    const listEl = body.querySelector('[data-list-el]');
    const playBtn = body.querySelector('[data-play]');
    const muteBtn = body.querySelector('[data-mute]');
    const loopBtn = body.querySelector('[data-loop]');
    const volEl = body.querySelector('[data-vol]');
    const cur = () => items[sel] || null;

    function syncPlay() {
      const has = !!cur();
      playBtn.innerHTML = icon(!has || video.paused ? 'play' : 'pause', 18);
      bigplay.classList.toggle('hide', !has || !video.paused);
    }
    function syncMute() {
      const muted = video.muted || video.volume === 0;
      muteBtn.innerHTML = icon(muted ? 'mute' : 'vol', 15);
      muteBtn.classList.toggle('on', muted);
      volEl.value = muted ? 0 : video.volume;
    }
    function syncLoop() { loopBtn.classList.toggle('on', loopOn); }
    function meta() {
      const it = cur();
      nameEl.textContent = it ? it.name : 'no video';
      nameEl.title = it ? it.name : '';
      metaEl.textContent = it ? [it.w && it.h ? `${it.w}×${it.h}` : '', isFinite(it.dur) ? fmtTime(it.dur) : '', fmtSize(it.size)].filter(Boolean).join(' · ') : '';
    }
    function renderList() {
      root.classList.toggle('side', listOn && items.length > 1);
      countEl.textContent = items.length ? String(items.length) : '';
      listEl.innerHTML = items.map((it, i) => `<button class="vp-item${i === sel ? ' on' : ''}" data-i="${i}" title="${esc(it.name)}">
        <span class="vp-n mono-dim">${i + 1}</span>
        <span class="vp-iname">${esc(it.name)}</span>
        <span class="vp-idur mono-dim">${isFinite(it.dur) ? fmtTime(it.dur) : ''}</span></button>`).join('');
    }
    function position() {
      const p = isFinite(video.duration) && video.duration > 0 ? video.currentTime / video.duration : 0;
      const pct = Math.max(0, Math.min(1, p)) * 100;
      progEl.style.width = pct + '%';
      knobEl.style.left = pct + '%';
      scrub.setAttribute('aria-valuemax', String(Math.round(video.duration || 0)));
      scrub.setAttribute('aria-valuenow', String(Math.round(video.currentTime || 0)));
      scrub.setAttribute('aria-valuetext', `${fmtTime(video.currentTime)} of ${fmtTime(video.duration)}`);
    }
    function buffer() {
      let end = 0;
      try { for (let i = 0; i < video.buffered.length; i++) if (video.buffered.start(i) <= video.currentTime) end = video.buffered.end(i); } catch { /* noop */ }
      bufEl.style.width = (isFinite(video.duration) && video.duration > 0 ? Math.min(1, end / video.duration) : 0) * 100 + '%';
    }
    function setEnabled(on) { bar.classList.toggle('off', !on); }
    function responsive(width) {
      root.classList.toggle('narrow', width < 560);
      root.classList.toggle('tiny', width < 420);
    }
    function show(i, autoplay) {
      if (i < 0 || i >= items.length) return;
      sel = i;
      const it = cur();
      video.src = it.url;
      video.loop = loopOn;
      emptyEl.classList.add('hide');
      renderList(); meta(); syncPlay();
      if (autoplay !== false) video.play().catch(() => {});
    }
    function probe(it) {
      const v = document.createElement('video');
      v.preload = 'metadata'; v.muted = true;
      v.addEventListener('loadedmetadata', () => { it.dur = v.duration; renderList(); if (it === cur()) meta(); v.removeAttribute('src'); v.load(); });
      v.src = it.url;
    }
    function add(files) {
      const vids = [...files].filter(f => /^video\//.test(f.type) || /\.(mp4|m4v|webm|mov|ogv|ogg|mkv|avi)$/i.test(f.name));
      if (!vids.length) { toast('no videos in that selection', 'err'); return; }
      const start = items.length;
      vids.forEach(f => { const it = { name: f.name, url: URL.createObjectURL(f), size: f.size, mime: f.type || '', w: 0, h: 0, dur: NaN }; items.push(it); probe(it); });
      show(start);
      toast(`added ${vids.length} video${vids.length === 1 ? '' : 's'}`, 'ok');
    }
    function step(d) { if (items.length < 2) return; show((sel + d + items.length) % items.length); }
    function toggle() { if (!cur()) return; if (video.paused) video.play().catch(() => {}); else video.pause(); }
    function seek(t) { if (isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(video.duration, t)); }
    function remove() {
      const it = cur(); if (!it) return;
      URL.revokeObjectURL(it.url); items.splice(sel, 1);
      if (!items.length) { sel = -1; video.removeAttribute('src'); video.load(); emptyEl.classList.remove('hide'); setEnabled(false); renderList(); meta(); syncPlay(); position(); bufEl.style.width = '0%'; return; }
      show(Math.min(sel, items.length - 1), false);
    }
    function fullscreen() {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
    }

    video.addEventListener('loadedmetadata', () => {
      const it = cur(); if (!it) return;
      it.dur = video.duration; it.w = video.videoWidth; it.h = video.videoHeight;
      renderList(); meta(); durEl.textContent = fmtTime(video.duration); position(); buffer();
    });
    video.addEventListener('timeupdate', () => { if (!scrubbing) { curEl.textContent = fmtTime(video.currentTime); position(); } });
    video.addEventListener('progress', buffer);
    video.addEventListener('play', syncPlay);
    video.addEventListener('pause', syncPlay);
    video.addEventListener('volumechange', syncMute);
    video.addEventListener('click', toggle);
    video.addEventListener('dblclick', fullscreen);
    video.addEventListener('error', () => { if (cur()) toast(`cannot play <b>${esc(cur().name)}</b>`, 'err'); });

    body.querySelector('[data-open]').onclick = () => file.click();
    file.onchange = () => { add(file.files); file.value = ''; };
    body.querySelector('[data-prev]').onclick = () => step(-1);
    body.querySelector('[data-next]').onclick = () => step(1);
    playBtn.onclick = toggle;
    body.querySelector('[data-list]').onclick = () => { listOn = !listOn; renderList(); };
    body.querySelector('[data-del]').onclick = remove;
    body.querySelector('[data-full]').onclick = fullscreen;
    loopBtn.onclick = () => { loopOn = !loopOn; video.loop = loopOn; syncLoop(); };
    muteBtn.onclick = () => { video.muted = !video.muted; syncMute(); };
    volEl.oninput = () => { video.volume = +volEl.value; video.muted = +volEl.value === 0; syncMute(); };
    bigplay.onclick = toggle;
    listEl.onclick = e => { const b = e.target.closest('.vp-item'); if (b) show(+b.dataset.i); };

    /* scrubber: click/drag to seek, hover to preview the time */
    const ratioAt = e => { const r = scrub.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
    scrub.addEventListener('pointerdown', e => {
      if (!cur() || !isFinite(video.duration)) return;
      scrubbing = true; scrub.setPointerCapture(e.pointerId); scrub.classList.add('grab');
      const r = ratioAt(e); curEl.textContent = fmtTime(r * video.duration); position();
      video.currentTime = r * video.duration;
    });
    scrub.addEventListener('pointermove', e => {
      if (!cur() || !isFinite(video.duration)) return;
      const r = ratioAt(e);
      tipEl.textContent = fmtTime(r * video.duration);
      tipEl.style.left = (r * 100) + '%';
      scrub.classList.add('hovering');
      if (scrubbing) { curEl.textContent = fmtTime(r * video.duration); video.currentTime = r * video.duration; }
    });
    scrub.addEventListener('pointerleave', () => { tipEl.textContent = ''; scrub.classList.remove('hovering'); });
    const endScrub = () => { scrubbing = false; scrub.classList.remove('grab'); };
    scrub.addEventListener('pointerup', endScrub);
    scrub.addEventListener('pointercancel', endScrub);

    ['dragenter', 'dragover'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); stage.classList.add('drop'); }));
    ['dragleave', 'drop'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); if (t === 'drop') add(e.dataTransfer.files); stage.classList.remove('drop'); }));

    body.tabIndex = -1;
    body.addEventListener('keydown', e => {
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      const k = e.key;
      if (k === ' ') { toggle(); e.preventDefault(); }
      else if (k === 'ArrowLeft') { seek(video.currentTime - 5); e.preventDefault(); }
      else if (k === 'ArrowRight') { seek(video.currentTime + 5); e.preventDefault(); }
      else if (k === 'ArrowUp') { video.volume = Math.min(1, video.volume + 0.05); video.muted = false; e.preventDefault(); }
      else if (k === 'ArrowDown') { video.volume = Math.max(0, video.volume - 0.05); e.preventDefault(); }
      else if (k === 'm' || k === 'M') { video.muted = !video.muted; syncMute(); }
      else if (k === 'l' || k === 'L') { loopOn = !loopOn; video.loop = loopOn; syncLoop(); }
      else if (k === 'f' || k === 'F') fullscreen();
      else if (k === 'n' || k === 'N') step(1);
      else if (k === 'p' || k === 'P') step(-1);
    });

    const seed = win && win.opts && win.opts.file;
    if (seed && seed.url) {
      const it = { name: seed.name || 'video', url: seed.url, size: seed.size || 0, mime: seed.mime || '', w: 0, h: 0, dur: NaN };
      items.push(it); probe(it); show(0);
    } else {
      emptyEl.classList.remove('hide'); setEnabled(false);
    }
    const ro = new ResizeObserver(en => responsive(en[0].contentRect.width));
    ro.observe(body);
    responsive(body.clientWidth);
    syncPlay(); syncMute(); syncLoop(); renderList(); meta(); position();
    setTimeout(() => body.focus(), 0);
    return () => {
      ro.disconnect();
      try { video.pause(); video.removeAttribute('src'); video.load(); } catch { /* noop */ }
      items.forEach(it => URL.revokeObjectURL(it.url));
    };
  }
});
