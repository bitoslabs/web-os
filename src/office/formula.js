'use strict';
/* ============================================================================
   BITOS OFFICE / FORMULA
   A small spreadsheet formula evaluator. It is given the formula source and a
   `resolve(ref)` callback that returns the raw cell string for a reference like
   'A1'. It returns { value, error }. Supported: + - * / ^, unary sign,
   parentheses, comparisons, cell refs, ranges (A1:B9), and the functions SUM,
   AVERAGE/AVG, MIN, MAX, COUNT, and IF. No DOM dependency.
   ========================================================================== */

import { colIndex, colName } from './model.js';

const FUNCS = {
  SUM: vals => nums(vals).reduce((a, b) => a + b, 0),
  AVERAGE: vals => { const n = nums(vals); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : err('#DIV/0!'); },
  AVG: vals => FUNCS.AVERAGE(vals),
  MIN: vals => { const n = nums(vals); return n.length ? Math.min(...n) : 0; },
  MAX: vals => { const n = nums(vals); return n.length ? Math.max(...n) : 0; },
  COUNT: vals => nums(vals).length,
};

function err(code) { throw { cellError: code }; }
function nums(vals) {
  const out = [];
  for (const v of vals) {
    if (Array.isArray(v)) { out.push(...nums(v)); continue; }
    if (typeof v === 'number') out.push(v);
    else if (typeof v === 'boolean') out.push(v ? 1 : 0);
    else if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) out.push(Number(v));
  }
  return out;
}
function num(v) {
  if (Array.isArray(v)) err('#VALUE!');
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v == null || String(v).trim() === '') return 0;
  const n = Number(v);
  if (isNaN(n)) err('#VALUE!');
  return n;
}
function str(v) { return Array.isArray(v) ? err('#VALUE!') : (v == null ? '' : String(v)); }

export function parseRef(ref) {
  const m = /^([A-Za-z]+)([0-9]+)$/.exec(String(ref || '').trim());
  if (!m) return null;
  return { col: colIndex(m[1]), row: parseInt(m[2], 10) - 1, ref: m[1].toUpperCase() + m[2] };
}

function expandRange(a, b) {
  const A = parseRef(a), B = parseRef(b);
  if (!A || !B) err('#REF!');
  const refs = [];
  for (let r = Math.min(A.row, B.row); r <= Math.max(A.row, B.row); r++)
    for (let c = Math.min(A.col, B.col); c <= Math.max(A.col, B.col); c++)
      refs.push({ col: c, row: r, ref: null });
  return refs;
}

function tokenize(src) {
  const s = String(src == null ? '' : src);
  const toks = [];
  let i = 0;
  const REF = /([A-Za-z]+[0-9]+)/y;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      const m = /^[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?/.exec(s.slice(i));
      toks.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue;
    }
    if (ch === '"') {
      let j = i + 1, out = '';
      while (j < s.length) { if (s[j] === '"') { if (s[j + 1] === '"') { out += '"'; j += 2; continue; } break; } out += s[j++]; }
      toks.push({ t: 'str', v: out }); i = j + 1; continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      REF.lastIndex = i;
      const m = REF.exec(s);
      if (m && m.index === i) { toks.push({ t: 'ref', v: m[1] }); i += m[1].length; continue; }
      let j = i;
      while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
      toks.push({ t: 'ident', v: s.slice(i, j) }); i = j; continue;
    }
    const two = s.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') { toks.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/^()=<>:,;%'.includes(ch)) {
      if (ch === '(') toks.push({ t: 'lparen' });
      else if (ch === ')') toks.push({ t: 'rparen' });
      else if (ch === ':' || ch === ',' || ch === ';') toks.push({ t: 'sep', v: ch === ';' ? ',' : ch });
      else toks.push({ t: 'op', v: ch });
      i++; continue;
    }
    err('#NAME?');
  }
  toks.push({ t: 'eof' });
  return toks;
}

export function evaluateFormula(src, resolve) {
  try {
    const toks = tokenize(String(src == null ? '' : src).replace(/^=/, ''));
    let p = 0;
    const peek = () => toks[p];
    const next = () => toks[p++];
    const isOp = v => peek().t === 'op' && peek().v === v;
    const value = ref => {
      const parsed = typeof ref === 'string' ? parseRef(ref) : ref;
      if (!parsed) err('#REF!');
      const raw = resolve ? resolve(parsed.ref || (colName(parsed.col) + (parsed.row + 1))) : '';
      if (raw == null || String(raw).trim() === '') return '';
      return raw;
    };

    function expr() { return compare(); }
    function compare() {
      let a = add();
      while (peek().t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(peek().v)) {
        const op = next().v; const b = add();
        const na = num(a), nb = num(b);
        a = op === '=' ? na === nb : op === '<>' ? na !== nb : op === '<' ? na < nb : op === '>' ? na > nb : op === '<=' ? na <= nb : na >= nb;
      }
      return a;
    }
    function add() { let a = mul(); while (peek().t === 'op' && (peek().v === '+' || peek().v === '-')) { const op = next().v; const b = mul(); a = op === '+' ? num(a) + num(b) : num(a) - num(b); } return a; }
    function mul() { let a = unary(); while (peek().t === 'op' && ['*', '/'].includes(peek().v)) { const op = next().v; const b = unary(); if (op === '/') { const d = num(b); if (d === 0) err('#DIV/0!'); a = num(a) / d; } else a = num(a) * num(b); } return a; }
    function unary() { if (peek().t === 'op' && (peek().v === '-' || peek().v === '+')) { const op = next().v; const v = unary(); return op === '-' ? -num(v) : num(v); } return power(); }
    function power() { const a = primary(); if (isOp('^')) { next(); const b = unary(); return Math.pow(num(a), num(b)); } return a; }
    function primary() {
      const t = next();
      if (t.t === 'num') return t.v;
      if (t.t === 'str') return t.v;
      if (t.t === 'ref') {
        if (peek().t === 'sep' && peek().v === ':') { next(); const b = next(); if (b.t !== 'ref') err('#REF!'); return expandRange(t.v, b.v).map(r => value(r)); }
        return value(t.v);
      }
      if (t.t === 'lparen') { const v = expr(); if (next().t !== 'rparen') err('#VALUE!'); return v; }
      if (t.t === 'ident') {
        const name = t.v.toUpperCase();
        if (next().t !== 'lparen') { if (name === 'TRUE') return true; if (name === 'FALSE') return false; err('#NAME?'); }
        const args = [];
        if (peek().t !== 'rparen') {
          args.push(expr());
          while (peek().t === 'sep') { next(); args.push(expr()); }
        }
        if (next().t !== 'rparen') err('#VALUE!');
        if (name === 'IF') return num(args[0]) ? (args.length > 1 ? args[1] : true) : (args.length > 2 ? args[2] : false);
        if (!FUNCS[name]) err('#NAME?');
        return FUNCS[name](args);
      }
      err('#VALUE!');
    }

    const result = expr();
    if (peek().t !== 'eof') err('#VALUE!');
    if (Array.isArray(result)) err('#VALUE!');
    return { value: result };
  } catch (e) {
    return { error: (e && e.cellError) || '#ERROR!' };
  }
}
