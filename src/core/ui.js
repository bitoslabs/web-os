'use strict';
/* ============================================================================
   BITOS WEB / UI PRIMITIVES
   Notifications, clipboard, modal dialog, and shared widget wiring.
   ========================================================================== */
import { $, el, esc } from './dom.js';
import { icon } from './icons.js';

/* ================= toasts (macOS banners, top-right) ================= */
export function toast(msg, kind = 'ok', action) {
  if (document.body.classList.contains('no-toasts')) return;
  const box = $('#toasts');
  while (box.children.length > 4) box.firstChild.remove();
  const ic = kind === 'ok' ? 'check' : kind === 'err' ? 'help' : kind === 'zap' ? 'bolt' : 'mag';
  const t = el('div', 'toast ' + (kind || 'ok'),
    `<span class="tico">${icon(ic, 13)}</span><span class="tm">${msg}</span>${action ? `<button class="ta">${action.label}</button>` : ''}<button class="tx" title="dismiss" aria-label="dismiss">${icon('close', 11)}</button>`);
  const auto = action ? 6500 : 4200;
  let timer = null;
  const arm = ms => { clearTimeout(timer); timer = setTimeout(() => dismiss(), ms); };
  const dismiss = dir => {
    if (!t.isConnected) return;
    clearTimeout(timer);
    if (dir == null) { t.style.transition = ''; t.style.transform = ''; t.style.opacity = ''; t.classList.add('out'); }
    else {
      t.style.transition = 'transform 200ms var(--ease), opacity 200ms var(--ease)';
      t.style.transform = `translateX(${dir * 110}%)`; t.style.opacity = '0';
    }
    setTimeout(() => t.remove(), 240);
  };
  if (action) t.querySelector('.ta').onclick = () => { action.fn(); dismiss(1); };
  t.querySelector('.tx').onclick = () => dismiss(1);
  /* swipe to close: drag a banner left or right past a third of its width, or flick it */
  let sx = 0, dx = 0, vx = 0, lastX = 0, lastT = 0, dragging = false;
  t.addEventListener('pointerdown', e => {
    if (e.target.closest('.ta,.tx')) return;
    dragging = true; sx = lastX = e.clientX; lastT = e.timeStamp; dx = 0; vx = 0;
    clearTimeout(timer);
    t.style.transition = 'none'; t.style.cursor = 'grabbing'; t.style.userSelect = 'none';
    try { t.setPointerCapture(e.pointerId); } catch (err) { }
  });
  t.addEventListener('pointermove', e => {
    if (!dragging) return;
    dx = e.clientX - sx;
    const dt = e.timeStamp - lastT;
    if (dt > 0) { vx = (e.clientX - lastX) / dt; lastX = e.clientX; lastT = e.timeStamp; }
    t.style.transform = `translateX(${dx}px)`;
    t.style.opacity = String(Math.max(.35, 1 - Math.abs(dx) / (t.offsetWidth || 320)));
  });
  const end = () => {
    if (!dragging) return; dragging = false;
    t.style.cursor = ''; t.style.userSelect = '';
    const w = t.offsetWidth || 320;
    if (Math.abs(dx) > w * 0.35 || Math.abs(vx) > 0.6) { dismiss(Math.sign(dx) || 1); return; }
    t.style.transition = 'transform 220ms var(--ease), opacity 220ms var(--ease)';
    t.style.transform = ''; t.style.opacity = '';
    arm(dx === 0 ? auto : Math.min(auto, 2600));
    setTimeout(() => { if (t.isConnected) t.style.transition = ''; }, 240);
  };
  t.addEventListener('pointerup', end);
  t.addEventListener('pointercancel', end);
  box.append(t); arm(auto);
}
export function copyText(txt, msg) {
  const done = () => toast(msg || 'copied to clipboard', 'ok');
  if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt).then(done).catch(fb); } else fb();
  function fb() {
    const a = el('textarea'); a.value = txt; document.body.append(a); a.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('clipboard blocked by browser', 'err'); } a.remove();
  }
}

/* ================= modal dialog =================
   dialog({title, body, input, value, placeholder, ok, danger})
   resolves the trimmed field value for prompts, true/false for confirms,
   or null/false when cancelled. */
export function dialog(o) {
  o = o || {};
  return new Promise(resolve => {
    const box = el('div', 'modal');
    box.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-t">${esc(o.title || '')}</div>
      ${o.body ? `<div class="modal-b">${esc(o.body)}</div>` : ''}
      ${o.input ? `<input class="modal-in" spellcheck="false" placeholder="${esc(o.placeholder || '')}" value="${esc(o.value || '')}">` : ''}
      <div class="modal-act">
        <button class="btn sm ghost" data-c>cancel</button>
        <button class="btn sm ${o.danger ? 'danger' : 'pri'}" data-k>${esc(o.ok || 'ok')}</button>
      </div></div>`;
    const previousFocus = document.activeElement;
    box.querySelector('[role="dialog"]').setAttribute('aria-label', o.title || 'Confirmation');
    const field = box.querySelector('.modal-in'), okBtn = box.querySelector('[data-k]');
    const done = v => { box.remove(); document.removeEventListener('keydown', key); if (previousFocus && previousFocus.isConnected) previousFocus.focus(); resolve(v); };
    const accept = () => done(o.input ? (field ? field.value.trim() : '') : true);
    const cancel = () => done(o.input ? null : false);
    okBtn.onclick = accept;
    box.querySelector('[data-c]').onclick = cancel;
    box.addEventListener('pointerdown', e => { if (e.target === box) cancel(); });
    if (o.input) { const sync = () => { okBtn.disabled = !field.value.trim(); }; field.addEventListener('input', sync); sync(); }
    const key = e => {
      if (e.key === 'Tab') {
        const controls = [...box.querySelectorAll('input,button')].filter(x => !x.disabled);
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      } else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (!o.input || document.activeElement === field) accept(); }
    };
    document.addEventListener('keydown', key);
    document.body.append(box);
    if (field) { field.focus(); field.select(); } else okBtn.focus();
  });
}

export function wireComp(scope) {
  scope.querySelectorAll('.sw2').forEach(t => { if (t.dataset.w) return; t.dataset.w = 1; t.onclick = () => t.classList.toggle('on'); });
  scope.querySelectorAll('[data-copy]').forEach(b => { if (b.dataset.w) return; b.dataset.w = 1; b.onclick = () => copyText(b.dataset.copy); });
}
