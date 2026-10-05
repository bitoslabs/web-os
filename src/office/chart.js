'use strict';
/* ============================================================================
   BITOS OFFICE / CHART
   Dependency-free SVG chart rendering for the spreadsheet. Takes
   [{ label, value }] and returns an SVG string for bar, line, or pie. No DOM
   access, so it can be unit-tested under node and reused by Docs/Slides later.
   ========================================================================== */

const PALETTE = ['#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47', '#264478', '#9e480e'];
const XML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => XML[c]);
const trunc = (s, n) => { const t = String(s == null ? '' : s); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const fmt = n => Math.abs(n) >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : String(Math.round(n * 1000) / 1000);

export function chartSvg(opts) {
  const type = opts && opts.type ? opts.type : 'bar';
  const data = (opts && opts.data) || [];
  const W = (opts && opts.width) || 420;
  const H = (opts && opts.height) || 240;
  const palette = (opts && opts.colors) || PALETTE;
  const title = (opts && opts.title) || '';
  const color = i => palette[i % palette.length];
  const pad = { l: 46, r: 14, t: title ? 32 : 14, b: 36 };
  const plotW = Math.max(10, W - pad.l - pad.r);
  const plotH = Math.max(10, H - pad.t - pad.b);
  const parts = [];
  if (title) parts.push(`<text x="${W / 2}" y="19" text-anchor="middle" font-size="12" font-weight="600" fill="#444">${esc(title)}</text>`);

  const vals = data.map(d => Number(d.value) || 0);

  if (type === 'pie') {
    const total = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1;
    const cx = pad.l + plotW * 0.34;
    const cy = pad.t + plotH / 2;
    const R = Math.max(10, Math.min(plotW * 0.62, plotH) / 2 - 4);
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      const frac = Math.max(0, v) / total;
      if (frac <= 0) return;
      const a1 = a0 + frac * Math.PI * 2;
      const large = frac > 0.5 ? 1 : 0;
      const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
      const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
      parts.push(`<path d="M${cx.toFixed(1)} ${cy.toFixed(1)} L${x0.toFixed(1)} ${y0.toFixed(1)} A${R.toFixed(1)} ${R.toFixed(1)} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z" fill="${color(i)}"/>`);
      a0 = a1;
    });
    const lx = pad.l + plotW * 0.68;
    data.slice(0, 8).forEach((d, i) => {
      const y = pad.t + 8 + i * 18;
      parts.push(`<rect x="${lx.toFixed(1)}" y="${(y - 8).toFixed(1)}" width="10" height="10" rx="2" fill="${color(i)}"/>`);
      parts.push(`<text x="${(lx + 15).toFixed(1)}" y="${y.toFixed(1)}" font-size="10" fill="#555">${esc(trunc(d.label, 16))} · ${esc(fmt(Number(d.value) || 0))}</text>`);
    });
  } else {
    const max = Math.max(0, ...vals, 1);
    parts.push(`<line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + plotH}" stroke="#aab"/>`);
    parts.push(`<line x1="${pad.l}" y1="${pad.t + plotH}" x2="${pad.l + plotW}" y2="${pad.t + plotH}" stroke="#aab"/>`);
    parts.push(`<text x="${pad.l - 6}" y="${pad.t + 4}" text-anchor="end" font-size="9" fill="#888">${esc(fmt(max))}</text>`);
    parts.push(`<text x="${pad.l - 6}" y="${pad.t + plotH + 3}" text-anchor="end" font-size="9" fill="#888">0</text>`);
    const n = Math.max(data.length, 1);
    const slot = plotW / n;
    const yOf = v => pad.t + plotH - (Math.max(0, v) / max) * plotH;
    if (type === 'line') {
      const pts = data.map((d, i) => `${(pad.l + i * slot + slot / 2).toFixed(1)},${yOf(Number(d.value) || 0).toFixed(1)}`);
      parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${color(0)}" stroke-width="2"/>`);
      data.forEach((d, i) => parts.push(`<circle cx="${(pad.l + i * slot + slot / 2).toFixed(1)}" cy="${yOf(Number(d.value) || 0).toFixed(1)}" r="3" fill="${color(0)}"/>`));
    } else {
      const barW = Math.max(2, slot * 0.62);
      data.forEach((d, i) => {
        const v = Number(d.value) || 0;
        const h = Math.max(0, (v / max) * plotH);
        const x = pad.l + i * slot + (slot - barW) / 2;
        const y = pad.t + plotH - h;
        parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${color(i)}"/>`);
      });
    }
    data.forEach((d, i) => {
      const x = pad.l + i * slot + slot / 2;
      parts.push(`<text x="${x.toFixed(1)}" y="${H - 12}" text-anchor="middle" font-size="9" fill="#777">${esc(trunc(d.label, 8))}</text>`);
    });
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(title || type + ' chart')}">${parts.join('')}</svg>`;
}
