'use strict';
/* ============================================================================
   BITOS OFFICE / MODEL
   Record shapes for the three office documents. The preview persists them to
   localStorage; the booted OS keeps them on the user data partition. Keep this
   free of DOM access so it can be validated by scripts/test-office.mjs.
   ========================================================================== */

export const DOC = 'docs';
export const SHEET = 'sheets';
export const DECK = 'slides';

export function uid(prefix) {
  return (prefix || 'doc') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function newDoc(over) {
  const now = Date.now();
  return { id: uid('doc'), kind: DOC, title: 'untitled', html: '', created: now, updated: now, ...(over || {}) };
}

export function newSheet(over) {
  const now = Date.now();
  return {
    id: uid('book'), kind: SHEET, title: 'untitled', created: now, updated: now,
    sheets: [{ id: uid('sheet'), name: 'sheet1', cells: {}, cols: 12, rows: 40, charts: [] }],
    active: 0,
    ...(over || {}),
  };
}

export function newDeck(over) {
  const now = Date.now();
  return {
    id: uid('deck'), kind: DECK, title: 'untitled', created: now, updated: now,
    slides: [{ id: uid('slide'), layout: 'title', title: '', body: '', notes: '' }],
    ...(over || {}),
  };
}

export function touch(record) {
  record.updated = Date.now();
  return record;
}

/* Column letters <-> index: 0 -> A, 26 -> AA. */
export function colName(index) {
  let n = Number(index) || 0;
  let out = '';
  do { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return out;
}

export function colIndex(name) {
  let n = 0;
  const s = String(name || '').toUpperCase();
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n - 1;
}
