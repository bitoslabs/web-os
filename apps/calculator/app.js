/* Built-in app: Calculator. Offline arithmetic with keyboard input and a tape.
 * No native service is required. */
import { registerApp, esc } from '../../src/core/index.js';

function fmt(n) {
  if (Number.isNaN(n)) return 'error';
  if (!isFinite(n)) return n > 0 ? '∞' : '−∞';
  const a = Math.abs(n);
  if (a !== 0 && (a >= 1e12 || a < 1e-9)) return n.toExponential(6).replace(/\.?0+e/, 'e').replace('-', '−');
  const s = String(Math.round(n * 1e10) / 1e10);
  return s.replace('-', '−');
}
function calc(a, op, b) {
  if (op === '+') return a + b;
  if (op === '−') return a - b;
  if (op === '×') return a * b;
  if (op === '÷') return b === 0 ? NaN : a / b;
  return b;
}

registerApp('calculator', {
  title: 'calculator', icon: 'calc', sub: 'offline · keyboard', w: 300, h: 458,
  mount(body) {
    let cur = '0', acc = null, op = null, fresh = true, expr = '';
    const tape = [];
    body.innerHTML = `<div class="calc">
      <div class="calc-tape" data-tape aria-live="polite"></div>
      <div class="calc-out"><div class="calc-expr" data-expr>&nbsp;</div><div class="calc-num" data-num>0</div></div>
      <div class="calc-pad">
        <button class="ck fn" data-k="ac">AC</button>
        <button class="ck fn" data-k="sign">±</button>
        <button class="ck fn" data-k="pct">%</button>
        <button class="ck op" data-k="÷">÷</button>
        <button class="ck" data-k="7">7</button>
        <button class="ck" data-k="8">8</button>
        <button class="ck" data-k="9">9</button>
        <button class="ck op" data-k="×">×</button>
        <button class="ck" data-k="4">4</button>
        <button class="ck" data-k="5">5</button>
        <button class="ck" data-k="6">6</button>
        <button class="ck op" data-k="−">−</button>
        <button class="ck" data-k="1">1</button>
        <button class="ck" data-k="2">2</button>
        <button class="ck" data-k="3">3</button>
        <button class="ck op" data-k="+">+</button>
        <button class="ck fn" data-k="del">⌫</button>
        <button class="ck" data-k="0">0</button>
        <button class="ck" data-k=".">.</button>
        <button class="ck eq" data-k="=">=</button>
      </div></div>`;
    const tapeEl = body.querySelector('[data-tape]');
    const exprEl = body.querySelector('[data-expr]');
    const numEl = body.querySelector('[data-num]');
    const num = () => Number(cur) || 0;

    function show() {
      numEl.textContent = fmt(num());
      exprEl.innerHTML = expr ? esc(expr) : '&nbsp;';
      tapeEl.innerHTML = tape.slice(-40).map(t => `<div class="calc-tr">${esc(t)}</div>`).join('');
      tapeEl.scrollTop = tapeEl.scrollHeight;
    }
    const push = s => { tape.push(s); if (tape.length > 200) tape.shift(); };

    function digit(ch) {
      if (fresh) { cur = ch; fresh = false; }
      else if (cur === '0') cur = ch;
      else if (cur.replace('-', '').length < 16) cur += ch;
    }
    function operator(o) {
      if (op != null && !fresh) {
        const r = calc(acc, op, num());
        push(`${fmt(acc)} ${op} ${fmt(num())} = ${fmt(r)}`);
        acc = r; cur = fmt(r).replace('−', '-');
      } else acc = num();
      if (Number.isNaN(acc) || !isFinite(acc)) { acc = null; op = null; cur = '0'; fresh = true; expr = ''; return; }
      op = o; fresh = true; cur = fmt(acc).replace('−', '-'); expr = `${fmt(acc)} ${o}`;
    }
    function equals() {
      if (op == null) return;
      const b = num(), r = calc(acc, op, b);
      push(`${fmt(acc)} ${op} ${fmt(b)} = ${fmt(r)}`);
      cur = fmt(r).replace('−', '-'); acc = null; op = null; fresh = true; expr = '';
    }
    function input(k) {
      if (/^[0-9]$/.test(k)) digit(k);
      else if (k === '.') { if (fresh) { cur = '0.'; fresh = false; } else if (!cur.includes('.')) cur += '.'; }
      else if (k === 'sign') cur = cur.startsWith('-') ? cur.slice(1) : '-' + cur;
      else if (k === 'pct') { cur = String(num() / 100); fresh = false; }
      else if (k === 'del') { if (fresh) cur = '0'; else { cur = cur.slice(0, -1); if (!cur || cur === '-') cur = '0'; } }
      else if (k === 'ac') { cur = '0'; acc = null; op = null; fresh = true; expr = ''; }
      else if ('+−×÷'.includes(k)) operator(k);
      else if (k === '=') equals();
      show();
    }

    const map = { '*': '×', x: '×', '/': '÷', '-': '−', '+': '+', '=': '=', Enter: '=', Backspace: 'del', Delete: 'ac', Escape: 'ac', c: 'ac', '%': 'pct', '.': '.', ',': '.' };
    body.tabIndex = -1;
    body.addEventListener('keydown', e => {
      const k = /^[0-9]$/.test(e.key) ? e.key : map[e.key];
      if (!k) return;
      e.preventDefault();
      input(k);
    });
    body.querySelector('.calc-pad').onclick = e => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      input(b.dataset.k);
      body.focus();
    };
    show();
    setTimeout(() => body.focus(), 0);
  }
});
