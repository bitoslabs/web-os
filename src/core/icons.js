'use strict';
/* ============================================================================
   BITOS WEB / ICONS
   Inline SVG icon paths, the Bitos logo, and small status marks.
   ========================================================================== */

export const ICONS = {
  term: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M7 9.5l3.2 3-3.2 3"/><path d="M12.5 15.5H17"/>',
  bolt: '<path d="M13 2 5 13.5h5.2L9 22l8-11.5h-5.2z" fill="currentColor" stroke="none"/>',
  book: '<path d="M4 5.5C6.5 4 9 4.5 12 5.5c3-1 5.5-1.5 8 0V19c-2.5-1.5-5-1-8 0-3-1-5.5-1.5-8 0Z"/><path d="M12 5.5V19"/>',
  act: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  sl: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/><circle cx="9" cy="6.5" r="2.1" style="fill:var(--bg2)"/><circle cx="15" cy="12" r="2.1" style="fill:var(--bg2)"/><circle cx="7" cy="17.5" r="2.1" style="fill:var(--bg2)"/>',
  pow: '<path d="M12 3v8"/><path d="M6.8 6a7.3 7.3 0 1 0 10.4 0"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="1"/><path d="M15.5 5.5h-10v10"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  help: '<path d="M9 9a3 3 0 1 1 4.2 2.8c-.9.4-1.2 1-1.2 2v.5"/><path d="M12 17.2v.1"/>',
  mag: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13"/><path d="M10 11v6M14 11v6"/>',
  fold: '<path d="M3.5 6.8V5.4c0-.8.6-1.4 1.4-1.4h3.6l1.8 2.2h7.8c.8 0 1.4.6 1.4 1.4v9c0 1.1-.9 2-2 2H5.5c-1.1 0-2-.9-2-2z"/>',
  doc: '<path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4"/>',
  pen: '<path d="M4 20l3.6-.8L18.4 8.4a1.8 1.8 0 0 0 0-2.5l-.3-.3a1.8 1.8 0 0 0-2.5 0L4.8 16.4z"/><path d="M14.9 6.9l2.2 2.2"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5V9h-4.5"/>',
  ext: '<path d="M14 5h5v5"/><path d="M19 5l-7.5 7.5"/><path d="M18 14v4H6V6h4"/>',
  win: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 9h17"/>',
  home: '<path d="M3.8 11.6 12 4.4l8.2 7.2"/><path d="M6.2 10.4V20h11.6v-9.6"/><path d="M10 20v-5h4v5"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="5" cy="6.5" r="1.3"/><circle cx="5" cy="12" r="1.3"/><circle cx="5" cy="17.5" r="1.3"/>',
  grid: '<rect x="3.8" y="3.8" width="7" height="7" rx="1.2"/><rect x="13.2" y="3.8" width="7" height="7" rx="1.2"/><rect x="3.8" y="13.2" width="7" height="7" rx="1.2"/><rect x="13.2" y="13.2" width="7" height="7" rx="1.2"/>',
  cols: '<rect x="3.5" y="4.5" width="7" height="15" rx="1.4"/><rect x="13.5" y="4.5" width="7" height="15" rx="1.4"/>',
  max: '<path d="M9.5 4H4v5.5"/><path d="M14.5 4H20v5.5"/><path d="M4 14.5V20h5.5"/><path d="M20 14.5V20h-5.5"/><path d="M12 8.5v7M8.5 12h7"/>',
  chevl: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  chevr: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  chevu: '<path d="M5.5 14.5 12 8l6.5 6.5"/>',
  sort: '<path d="M4 7h16M7 12h10M10 17h4"/>',
  arru: '<path d="M12 19V5"/><path d="M6.5 10.5 12 5l5.5 5.5"/>',
  arrd: '<path d="M12 5v14"/><path d="M6.5 13.5 12 19l5.5-5.5"/>',
  down: '<path d="M12 4v10"/><path d="M7.8 9.8 12 14l4.2-4.2"/><path d="M4.5 19.5h15"/>',
  pic: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M5 17.2l4.8-4.8 3.6 3.6 2.6-2.6 3 3"/>',
};
export const icon = (n, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="square">${ICONS[n] || ''}</svg>`;
export const LOGO = `<svg width="18" height="18" viewBox="0 0 18 18"><rect x="1" y="1" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-opacity=".4"/><path d="M10.2 3.2 5.4 10h2.8L7.2 14.8 12.6 8H9.8z" fill="#8b5cf6"/></svg>`;
export const BOLTICON = (s = 11) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24">${ICONS.bolt}</svg>`;
export const TSVG = {
  c: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3.5 3.5l5 5M8.5 3.5l-5 5"/></svg>',
  m: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2.5 6h7"/></svg>',
  z: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 10 10 2M2 2v2.8M2 2h2.8M10 10V7.2M10 10H7.2"/></svg>',
};
