'use strict';
/* ============================================================================
   BITOS OFFICE / RELEASES
   Semantic-version helpers and the release log per app and for the engine. A
   package build publishes one release per version; the host uses this for update
   checks and record migrations (see docs/OFFICE_SUITE_PLAN.md).
   ========================================================================== */

export function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(v || '').trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || '' };
}

/* -1 | 0 | 1. A version without a prerelease outranks the same version with one. */
export function compareVersions(a, b) {
  const A = parseVersion(a), B = parseVersion(b);
  if (!A || !B) return 0;
  for (const k of ['major', 'minor', 'patch']) {
    if (A[k] !== B[k]) return A[k] < B[k] ? -1 : 1;
  }
  if (A.pre === B.pre) return 0;
  if (!A.pre) return 1;
  if (!B.pre) return -1;
  return A.pre < B.pre ? -1 : 1;
}

export const ENGINE_VERSION = '0.1.0';
export const RELEASES = Object.freeze({
  engine: Object.freeze([{ version: ENGINE_VERSION, date: '2026-10-05', notes: 'docx/xlsx/pptx engine' }]),
  docs: Object.freeze([{ version: '0.1.0', date: '2026-10-05', notes: 'word processing, .docx, comments, headers/footers' }]),
  sheets: Object.freeze([{ version: '0.1.0', date: '2026-10-05', notes: 'spreadsheet, .xlsx, formulas, charts' }]),
  slides: Object.freeze([{ version: '0.1.0', date: '2026-10-05', notes: 'presentations, .pptx, notes, shapes, images' }]),
});

export function latestRelease(id) {
  const list = RELEASES[id] || [];
  return list.length ? list[list.length - 1] : null;
}
