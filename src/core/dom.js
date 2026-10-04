'use strict';
/* ============================================================================
   BITOS WEB / CORE DOM HELPERS
   Small, dependency-free DOM and math helpers used across the shell and apps.
   ========================================================================== */

export const $ = s => document.querySelector(s);
export const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
export const esc = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const hexRgb = h => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
export const rgbHex = (r, g, b) => '#' + [r, g, b]
  .map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export const lighten = (hex, t) => { const [r, g, b] = hexRgb(hex); return rgbHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t); };
/* Current interface scale (set on <html> for text size). Pointer math that mixes
 * getBoundingClientRect() with layout px must divide by this value. */
export const uiZoom = () => parseFloat(document.documentElement.style.zoom) || 1;
export function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => { const r = Array(n + 1).fill(0); r[0] = i; return r; });
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
