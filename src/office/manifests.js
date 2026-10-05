'use strict';
/* ============================================================================
   BITOS OFFICE / MANIFESTS
   App metadata in one place, consumed by registerApp() for the built-in build
   and serializable by a future package builder (id/title/icon/opens are the
   ecosystem entry fields; permissions/version are packaging metadata).
   ========================================================================== */

export const OFFICE_VERSION = '0.1.0';

export const MANIFESTS = Object.freeze({
  docs: Object.freeze({
    id: 'docs', title: 'docs', icon: 'doc', sub: 'word processing · .docx',
    w: 860, h: 600, multi: true, unified: true, version: OFFICE_VERSION,
    permissions: ['fs.files', 'app.print', 'app.window', 'app.menu'],
    opens: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '*.docx'],
  }),
  sheets: Object.freeze({
    id: 'sheets', title: 'sheets', icon: 'grid', sub: 'spreadsheet · .xlsx',
    w: 940, h: 620, multi: true, version: OFFICE_VERSION,
    permissions: ['fs.files', 'app.window'],
    opens: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '*.xlsx', 'text/csv'],
  }),
  slides: Object.freeze({
    id: 'slides', title: 'slides', icon: 'cols', sub: 'presentations · .pptx',
    w: 960, h: 620, multi: true, version: OFFICE_VERSION,
    permissions: ['fs.files', 'app.window'],
    opens: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', '*.pptx'],
  }),
});
