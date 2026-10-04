'use strict';
/* OS shell module: preview lock screen. It is not an authentication boundary
 * until backed by a native session and credential service. */
import { $, el, esc, store, drawIdenticon } from '../core/index.js';

const LOCK_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const LOCK_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];

export function lockFlow(unlock) {
  const lk = $('#lock'); lk.classList.remove('hide'); lk.innerHTML = '';
  const n = new Date();
  const card = el('div', 'lk', `
    <div class="clock">${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}</div>
    <div class="date">${LOCK_DAYS[n.getDay()]} ${n.getDate()} ${LOCK_MONTHS[n.getMonth()]}</div>
    <div class="avwrap"><canvas width="84" height="84"></canvas>
      <span class="pname">${esc(store.d.pet)}</span>
      <span class="hintlk">press enter or click to log in</span></div>`);
  lk.append(card);
  const cv = card.querySelector('canvas');
  if (store.d.avatar) {
    const img = document.createElement('img');
    img.src = store.d.avatar; img.alt = ''; img.width = 84; img.height = 84;
    cv.replaceWith(img);
  } else drawIdenticon(cv, store.d.npub);

  const timer = startLockClock(card);
  let done = false;
  const go = () => {
    if (done) return; done = true; clearInterval(timer);
    lk.classList.add('hide'); lk.innerHTML = '';
    document.removeEventListener('keydown', onKey);
    unlock();
  };
  const onKey = e => { if (e.key === 'Enter' || e.key === 'Escape') go(); };
  document.addEventListener('keydown', onKey);
  lk.addEventListener('pointerdown', go);
}

function startLockClock(card) {
  const clock = card.querySelector('.clock');
  return setInterval(() => {
    const x = new Date();
    clock.textContent = `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
  }, 1000);
}
