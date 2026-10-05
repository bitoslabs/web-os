'use strict';
/* ============================================================================
   BITOS OFFICE / OOXML
   A small block model shared by the office apps and the .docx package
   reader/writer. A document is an array of blocks:
     { type: 'p'|'h1'|'h2'|'h3'|'li'|'blockquote', align, runs: [run] }
   A run is { text, b, i, u, link }. Pure helpers (plainToBlocks, blocksToHtml,
   blocksToPlain, blocksToDocumentXml) have no DOM dependency so they can be
   unit-tested under node. The html/document XML parsers use DOMParser and run in
   the browser only.
   ========================================================================== */

import { zipWrite, zipRead } from './zip.js';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const XML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
export function escapeXml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => XML_ESCAPE[c]); }
const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => HTML_ESCAPE[c]); }

/* Legacy <font size="1..7"> -> points, and CSS colours -> RRGGBB hex. */
const FONT_PT = { 1: 8, 2: 10, 3: 12, 4: 14, 5: 18, 6: 24, 7: 36 };
function cssColor(v) {
  const s = String(v || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.slice(1).toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return s.slice(1).split('').map(c => c + c).join('').toUpperCase();
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (!m) return null;
  const [r, g, b] = m[1].split(',').map(x => parseInt(x, 10));
  if ([r, g, b].some(isNaN)) return null;
  const h = n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0').toUpperCase();
  return h(r) + h(g) + h(b);
}

/* ---- pure helpers ---- */

export function plainToBlocks(text) {
  const lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
  const blocks = lines.map(line => ({ type: 'p', align: null, runs: line ? [{ text: line }] : [] }));
  return blocks.length ? blocks : [{ type: 'p', align: null, runs: [] }];
}

export function blocksToPlain(blocks) {
  return (blocks || []).map(b => (b.runs || []).map(r => r.text).join('')).join('\n');
}

export function blocksToHtml(blocks) {
  const body = (blocks || []).map(b => {
    if (b.type === 'table') {
      const rows = (b.rows || []).map(r => `<tr>${(r || []).map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
      return `<table class="dc-table">${rows}</table>`;
    }
    if (b.type === 'img') {
      const w = b.width ? ` width="${Math.round(b.width)}"` : '';
      const h = b.height ? ` height="${Math.round(b.height)}"` : '';
      const style = b.align ? ` style="text-align:${escapeHtml(b.align)}"` : '';
      return `<p${style}><img src="${escapeHtml(b.src || '')}"${w}${h} alt=""></p>`;
    }
    const tag = { p: 'p', h1: 'h1', h2: 'h2', h3: 'h3', li: 'li', blockquote: 'blockquote' }[b.type] || 'p';
    const style = b.align ? ` style="text-align:${escapeHtml(b.align)}"` : '';
    const inner = (b.runs || []).map(r => {
      let t = escapeHtml(r.text).replace(/\n/g, '<br>');
      if (r.b) t = `<strong>${t}</strong>`;
      if (r.i) t = `<em>${t}</em>`;
      if (r.u) t = `<u>${t}</u>`;
      if (r.s) t = `<s>${t}</s>`;
      if (r.vert === 'superscript') t = `<sup>${t}</sup>`;
      else if (r.vert === 'subscript') t = `<sub>${t}</sub>`;
      const styles = [];
      if (r.color) styles.push(`color:${r.color}`);
      if (r.size) styles.push(`font-size:${r.size}pt`);
      if (styles.length) t = `<span style="${styles.join(';')}">${t}</span>`;
      if (r.link) t = `<a href="${escapeHtml(r.link)}">${t}</a>`;
      return t;
    }).join('');
    return `<${tag}${style}>${inner || '<br>'}</${tag}>`;
  }).join('');
  return body || '<p><br></p>';
}

function drawingXml(block, relId) {
  const cx = Math.round((block.width || 300) * 9525);
  const cy = Math.round((block.height || 200) * 9525);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" ` +
    `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Picture"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="0" name="Picture"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

function blockSignature(b) {
  if (b.type === 'img') return 'img:' + (b.src || '');
  if (b.type === 'table') return 'table:' + JSON.stringify(b.rows || []);
  return b.type + '|' + blocksToPlain([b]);
}

/* LCS diff of two block lists for tracked changes. Ops: same | ins | del. */
export function diffBlocks(oldBlocks, newBlocks) {
  const A = oldBlocks || [], B = newBlocks || [];
  const a = A.map(blockSignature), b = B.map(blockSignature);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ op: 'same', block: B[j] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ op: 'del', block: A[i] }); i++; }
    else { ops.push({ op: 'ins', block: B[j] }); j++; }
  }
  while (i < n) ops.push({ op: 'del', block: A[i++] });
  while (j < m) ops.push({ op: 'ins', block: B[j++] });
  return ops;
}

export function blocksToDocumentXml(blocks, imageMap, refs, track) {
  const STYLE = { h1: 'Heading1', h2: 'Heading2', h3: 'Heading3', blockquote: 'Quote', li: 'ListParagraph' };
  const trackMeta = (track && Array.isArray(track.baseline) && track.author)
    ? { author: String(track.author), date: track.date || new Date().toISOString(), id: 0 }
    : null;
  const revision = (tag, inner) => `<w:${tag} w:id="${++trackMeta.id}" w:author="${escapeXml(trackMeta.author)}" w:date="${trackMeta.date}">${inner}</w:${tag}>`;
  const tableXml = b => {
    const rows = b.rows || [];
    const cols = Math.max(1, ...rows.map(r => (r || []).length));
    const width = Math.floor(9360 / cols);
    const grid = Array.from({ length: cols }, () => `<w:gridCol w:w="${width}"/>`).join('');
    const border = side => `<${side} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`;
    const trs = rows.map(r => `<w:tr>${(r || []).map(cell =>
      `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${para({ type: 'p', runs: [{ text: String(cell == null ? '' : cell) }] })}</w:tc>`
    ).join('')}</w:tr>`).join('');
    return '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>' +
      border('w:top') + border('w:left') + border('w:bottom') + border('w:right') + border('w:insideH') + border('w:insideV') +
      `</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${trs}</w:tbl>`;
  };
  const para = (b, mode) => {
    if (b.type === 'table') return tableXml(b);
    if (b.type === 'img') {
      const rel = imageMap && b.src ? imageMap.get(b.src) : null;
      return rel ? `<w:p>${drawingXml(b, rel)}</w:p>` : '';
    }
    const props = [];
    if (STYLE[b.type]) props.push(`<w:pStyle w:val="${STYLE[b.type]}"/>`);
    if (b.align) props.push(`<w:jc w:val="${escapeXml(b.align)}"/>`);
    const ppr = props.length ? `<w:pPr>${props.join('')}</w:pPr>` : '';
    const del = mode === 'del';
    const runs = (b.runs || []).map(r => {
      const rp = [];
      if (r.b) rp.push('<w:b/>');
      if (r.i) rp.push('<w:i/>');
      if (r.u) rp.push('<w:u w:val="single"/>');
      if (r.s) rp.push('<w:strike/>');
      if (r.color) rp.push(`<w:color w:val="${escapeXml(r.color)}"/>`);
      if (r.size) rp.push(`<w:sz w:val="${Math.round(r.size * 2)}"/><w:szCs w:val="${Math.round(r.size * 2)}"/>`);
      if (r.vert) rp.push(`<w:vertAlign w:val="${r.vert === 'superscript' ? 'superscript' : 'subscript'}"/>`);
      const rpr = rp.length ? `<w:rPr>${rp.join('')}</w:rPr>` : '';
      const tag = del ? 'w:delText' : 'w:t';
      return String(r.text == null ? '' : r.text).split('\n').map((line, i) =>
        (i ? '<w:r><w:br/></w:r>' : '') + `<w:r>${rpr}<${tag} xml:space="preserve">${escapeXml(line)}</${tag}></w:r>`
      ).join('');
    }).join('');
    const wrapped = mode === 'ins' ? revision('ins', runs) : mode === 'del' ? revision('del', runs) : runs;
    return `<w:p>${ppr}${wrapped}</w:p>`;
  };
  refs = refs || {};
  const refXml = (refs.header ? `<w:headerReference w:type="default" r:id="${refs.header}"/>` : '') +
    (refs.footer ? `<w:footerReference w:type="default" r:id="${refs.footer}"/>` : '');
  const bodyOps = trackMeta ? diffBlocks(track.baseline, blocks) : (blocks || []).map(b => ({ op: 'same', block: b }));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<w:body>${bodyOps.map(o => para(o.block, o.op)).join('')}` +
    `<w:sectPr>${refXml}<w:pgSz w:w="${(refs.page && refs.page.w) || 12240}" w:h="${(refs.page && refs.page.h) || 15840}"${refs.page && refs.page.orient ? ` w:orient="${refs.page.orient}"` : ''}/>` +
    `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>` +
    `</w:body></w:document>`;
}

/* ---- .docx package ---- */

const IMG_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp' };
const EXT_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };

function dataUrlInfo(src) {
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(String(src || ''));
  if (!m) return null;
  const mime = m[1] || 'image/png';
  const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;
  return { mime, ext: IMG_EXT[mime] || 'png', bytes };
}
function contentTypes(exts, hasHeader, hasFooter, hasComments) {
  const defs = (exts || []).map(e => `<Default Extension="${e}" ContentType="${EXT_MIME[e]}"/>`).join('');
  const hdr = hasHeader ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : '';
  const ftr = hasFooter ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : '';
  const cmt = hasComments ? '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>' : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' + defs +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    hdr + ftr + cmt + '</Types>';
}

function commentsXml(comments) {
  const items = (comments || []).map((c, i) => {
    const date = new Date(c.created || Date.now()).toISOString();
    return `<w:comment w:id="${i + 1}" w:author="${escapeXml(c.author || 'Bitos')}" w:date="${date}">` +
      `<w:p><w:r><w:t xml:space="preserve">${escapeXml(c.text || '')}</w:t></w:r></w:p></w:comment>`;
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${items}</w:comments>`;
}

const ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '</Relationships>';

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PAGE_TWIPS = { letter: { w: 12240, h: 15840 }, a4: { w: 11906, h: 16838 }, legal: { w: 12240, h: 20160 } };
function hdrXml(text, root) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:${root} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p></w:${root}>`;
}

export async function blocksToDocx(blocks, opts) {
  opts = opts || {};
  const header = String(opts.header || '').trim();
  const footer = String(opts.footer || '').trim();
  const comments = (opts.comments || []).filter(c => c && c.text);
  const list = blocks || [];
  const seen = new Map();
  const images = [];
  for (const b of list) {
    if (b.type !== 'img' || !b.src || seen.has(b.src)) continue;
    const info = dataUrlInfo(b.src);
    if (!info) continue;
    const n = images.length + 1;
    const entry = { rid: 'rId' + (100 + n), name: `media/image${n}.${info.ext}`, ext: info.ext, bytes: info.bytes };
    seen.set(b.src, entry); images.push(entry);
  }
  const imageMap = new Map([...seen.entries()].map(([src, v]) => [src, v.rid]));
  const rels = [];
  const refs = {};
  const base = PAGE_TWIPS[opts.pageSize] || PAGE_TWIPS.letter;
  const landscape = opts.orientation === 'landscape';
  refs.page = { w: landscape ? base.h : base.w, h: landscape ? base.w : base.h, orient: landscape ? 'landscape' : 'portrait' };
  if (header) { refs.header = 'rId1'; rels.push(`<Relationship Id="rId1" Type="${REL}/header" Target="header1.xml"/>`); }
  if (footer) { refs.footer = header ? 'rId2' : 'rId1'; rels.push(`<Relationship Id="${refs.footer}" Type="${REL}/footer" Target="footer1.xml"/>`); }
  if (comments.length) rels.push(`<Relationship Id="rId3" Type="${REL}/comments" Target="comments.xml"/>`);
  for (const im of images) rels.push(`<Relationship Id="${im.rid}" Type="${REL}/image" Target="${im.name}"/>`);

  const exts = [...new Set(images.map(i => i.ext))];
  const files = [
    { name: '[Content_Types].xml', data: contentTypes(exts, !!header, !!footer, comments.length > 0) },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'word/document.xml', data: blocksToDocumentXml(list, imageMap, refs, opts.track) },
  ];
  if (rels.length) {
    files.push({
      name: 'word/_rels/document.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels.join('') + '</Relationships>',
    });
  }
  if (header) files.push({ name: 'word/header1.xml', data: hdrXml(header, 'hdr') });
  if (footer) files.push({ name: 'word/footer1.xml', data: hdrXml(footer, 'ftr') });
  if (comments.length) files.push({ name: 'word/comments.xml', data: commentsXml(comments) });
  for (const im of images) files.push({ name: 'word/' + im.name, data: im.bytes });
  return zipWrite(files);
}

export async function docxToDocument(input) {
  const files = await zipRead(input);
  const xmlBytes = files.get('word/document.xml');
  if (!xmlBytes) throw new Error('not a word document (missing word/document.xml)');
  const xml = new TextDecoder().decode(xmlBytes);
  const imageMap = {};
  const relMap = {};
  const relsXml = files.get('word/_rels/document.xml.rels');
  if (relsXml) {
    for (const rel of parseXmlDoc(new TextDecoder().decode(relsXml), 'rels').getElementsByTagName('Relationship')) {
      const type = rel.getAttribute('Type') || '';
      const target = String(rel.getAttribute('Target') || '').replace(/^\//, '');
      const part = files.get(target.startsWith('word/') ? target : 'word/' + target);
      relMap[rel.getAttribute('Id')] = { type, target };
      if (!/image$/.test(type) || !part) continue;
      const ext = target.split('.').pop().toLowerCase();
      const mime = EXT_MIME[ext] || 'image/png';
      let bin = '';
      for (let i = 0; i < part.length; i++) bin += String.fromCharCode(part[i]);
      imageMap[rel.getAttribute('Id')] = `data:${mime};base64,${btoa(bin)}`;
    }
  }
  const blocks = documentXmlToBlocks(xml, imageMap);
  const doc = parseXmlDoc(xml, 'document');
  const sect = doc.getElementsByTagName('w:sectPr')[0];
  const readRef = el => {
    if (!el) return '';
    const rel = relMap[el.getAttribute('r:id') || el.getAttribute('id')];
    if (!rel) return '';
    const t = rel.target.replace(/^\//, '');
    const part = files.get(t.startsWith('word/') ? t : 'word/' + t);
    if (!part) return '';
    const pd = parseXmlDoc(new TextDecoder().decode(part), 'part');
    return [...pd.getElementsByTagName('w:t')].map(x => x.textContent).join('');
  };
  const headerRef = sect ? sect.getElementsByTagName('w:headerReference')[0] : null;
  const footerRef = sect ? sect.getElementsByTagName('w:footerReference')[0] : null;
  const pg = sect ? sect.getElementsByTagName('w:pgSz')[0] : null;
  const pw = pg ? +pg.getAttribute('w:w') : 0, ph = pg ? +pg.getAttribute('w:h') : 0;
  let pageSize = 'letter', orientation = 'portrait';
  if (pw && ph) {
    if (pw > ph) orientation = 'landscape';
    for (const [name, tw] of Object.entries(PAGE_TWIPS)) {
      if ((Math.abs(tw.w - pw) <= 60 && Math.abs(tw.h - ph) <= 60) || (Math.abs(tw.h - pw) <= 60 && Math.abs(tw.w - ph) <= 60)) { pageSize = name; break; }
    }
  }
  const comments = [];
  for (const id of Object.keys(relMap)) {
    if (!/\/comments$/.test(relMap[id].type)) continue;
    const t = relMap[id].target.replace(/^\//, '');
    const part = files.get(t.startsWith('word/') ? t : 'word/' + t);
    if (!part) continue;
    const cd = parseXmlDoc(new TextDecoder().decode(part), 'comments');
    for (const el of cd.getElementsByTagName('w:comment')) {
      comments.push({
        id: el.getAttribute('w:id') || '',
        author: el.getAttribute('w:author') || '',
        text: [...el.getElementsByTagName('w:t')].map(x => x.textContent).join(''),
        created: Date.parse(el.getAttribute('w:date')) || Date.now(),
      });
    }
  }
  return { blocks, header: readRef(headerRef), footer: readRef(footerRef), pageSize, orientation, comments };
}

export async function docxToBlocks(input) {
  return (await docxToDocument(input)).blocks;
}

/* DOMParser wrapper usable before the browser-only parsers below. */
function parseXmlDoc(text, what) {
  const doc = new DOMParser().parseFromString(String(text || ''), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(`could not parse ${what || 'xml'}`);
  return doc;
}

/* ---- DOM-backed parsers (browser) ---- */

export function documentXmlToBlocks(xml, imageMap) {
  const doc = parseXmlDoc(xml, 'document');
  const out = [];
  const STYLE_BY_ID = { Heading1: 'h1', Heading2: 'h2', Heading3: 'h3', Quote: 'blockquote', ListParagraph: 'li' };

  const pushParagraph = p => {
    const styleEl = p.getElementsByTagName('w:pStyle')[0];
    const jcEl = p.getElementsByTagName('w:jc')[0];
    const align = jcEl ? (jcEl.getAttribute('w:val') || null) : null;
    const type = STYLE_BY_ID[styleEl ? styleEl.getAttribute('w:val') : ''] || 'p';
    const runs = [];
    const flush = () => { if (runs.length) out.push({ type, align, runs: runs.splice(0) }); };
    for (const node of p.childNodes) {
      if (node.nodeType !== 1 || node.nodeName !== 'w:r') continue;
      const drawing = node.getElementsByTagName('w:drawing')[0];
      if (drawing) {
        const blip = drawing.getElementsByTagName('a:blip')[0];
        const rid = blip ? (blip.getAttribute('r:embed') || blip.getAttribute('embed')) : null;
        const src = rid && imageMap ? imageMap[rid] : null;
        if (src) {
          flush();
          const ext = drawing.getElementsByTagName('wp:extent')[0];
          const cx = ext ? +ext.getAttribute('cx') : 0, cy = ext ? +ext.getAttribute('cy') : 0;
          out.push({ type: 'img', align, src, width: cx ? Math.round(cx / 9525) : null, height: cy ? Math.round(cy / 9525) : null });
        }
        continue;
      }
      const props = node.getElementsByTagName('w:rPr')[0];
      const has = tag => props && props.getElementsByTagName(tag).length > 0;
      const run = { b: has('w:b'), i: has('w:i') };
      const uEl = props && props.getElementsByTagName('w:u')[0];
      run.u = !!uEl && (uEl.getAttribute('w:val') || 'single') !== 'none';
      if (has('w:strike')) run.s = true;
      const colorEl = props && props.getElementsByTagName('w:color')[0];
      if (colorEl && colorEl.getAttribute('w:val')) run.color = colorEl.getAttribute('w:val').toUpperCase();
      const szEl = props && props.getElementsByTagName('w:sz')[0];
      if (szEl && +szEl.getAttribute('w:val')) run.size = +szEl.getAttribute('w:val') / 2;
      const vertEl = props && props.getElementsByTagName('w:vertAlign')[0];
      if (vertEl && vertEl.getAttribute('w:val')) run.vert = vertEl.getAttribute('w:val');
      let text = '';
      for (const child of node.childNodes) {
        if (child.nodeName === 'w:t') text += child.textContent;
        else if (child.nodeName === 'w:br') text += '\n';
        else if (child.nodeName === 'w:tab') text += '\t';
      }
      if (text) runs.push({ text, ...run });
    }
    flush();
  };

  const pushTable = tbl => {
    const rows = [];
    for (const tr of tbl.getElementsByTagName('w:tr')) {
      const cells = [];
      for (const tc of tr.childNodes) {
        if (tc.nodeType !== 1 || tc.nodeName !== 'w:tc') continue;
        cells.push([...tc.getElementsByTagName('w:p')].map(p => [...p.getElementsByTagName('w:t')].map(t => t.textContent).join('')).join('\n'));
      }
      rows.push(cells);
    }
    if (rows.length) out.push({ type: 'table', rows });
  };

  const body = doc.getElementsByTagName('w:body')[0] || doc.documentElement;
  for (const node of body.childNodes) {
    if (node.nodeType !== 1) continue;
    if (node.nodeName === 'w:p') pushParagraph(node);
    else if (node.nodeName === 'w:tbl') pushTable(node);
  }
  return out.length ? out : [{ type: 'p', align: null, runs: [] }];
}

export function htmlToBlocks(html) {
  const doc = new DOMParser().parseFromString(`<div id="office-root">${html || ''}</div>`, 'text/html');
  const root = doc.getElementById('office-root');
  const out = [];
  const runOf = root => {
    const runs = [];
    const walk = (node, fmt) => {
      if (node.nodeType === 3) { if (node.nodeValue) runs.push({ text: node.nodeValue, ...fmt }); return; }
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toLowerCase();
      if (tag === 'br') { runs.push({ text: '\n', ...fmt }); return; }
      const next = { ...fmt };
      if (tag === 'b' || tag === 'strong') next.b = true;
      if (tag === 'i' || tag === 'em') next.i = true;
      if (tag === 'u') next.u = true;
      if (tag === 's' || tag === 'strike' || tag === 'del') next.s = true;
      if (tag === 'sub') next.vert = 'subscript';
      if (tag === 'sup') next.vert = 'superscript';
      if (tag === 'a') next.link = node.getAttribute('href') || undefined;
      if (tag === 'font') {
        const sz = node.getAttribute('size');
        if (sz && FONT_PT[sz]) next.size = FONT_PT[sz];
        const col = node.getAttribute('color');
        if (col) next.color = cssColor(col);
      }
      if (node.style) {
        const w = node.style.fontWeight;
        if (w === 'bold' || parseInt(w, 10) >= 600) next.b = true;
        if (node.style.fontStyle === 'italic') next.i = true;
        if (/underline/.test(node.style.textDecoration || '')) next.u = true;
        if (/line-through/.test(node.style.textDecoration || '')) next.s = true;
        if (node.style.color) next.color = cssColor(node.style.color) || next.color;
        if (node.style.fontSize) { const px = parseFloat(node.style.fontSize); if (px) next.size = Math.round(px * 0.75 * 10) / 10; }
      }
      for (const child of node.childNodes) walk(child, next);
    };
    for (const child of root.childNodes) walk(child, {});
    return runs;
  };
  for (const node of root.childNodes) {
    if (node.nodeType === 3) {
      if (node.nodeValue && node.nodeValue.trim()) out.push({ type: 'p', align: null, runs: [{ text: node.nodeValue }] });
      continue;
    }
    if (node.nodeType !== 1) continue;
    const tag = node.tagName.toLowerCase();
    if (tag === 'img') { out.push(imgBlock(node)); continue; }
    if (tag === 'table') {
      const rows = [];
      for (const tr of node.querySelectorAll('tr')) {
        const cells = [];
        for (const td of tr.children) if (td.tagName && /^(TD|TH)$/i.test(td.tagName)) cells.push((td.innerText != null ? td.innerText : td.textContent) || '');
        rows.push(cells);
      }
      if (rows.length) out.push({ type: 'table', rows });
      continue;
    }
    if (tag === 'ul' || tag === 'ol') {
      for (const li of node.children) out.push({ type: 'li', align: null, runs: runOf(li) });
      continue;
    }
    const type = { h1: 'h1', h2: 'h2', h3: 'h3', blockquote: 'blockquote', li: 'li' }[tag] || 'p';
    const cssAlign = node.style ? node.style.textAlign : '';
    const align = ['left', 'right', 'center'].includes(cssAlign) ? cssAlign : (node.getAttribute('align') || null);
    for (const im of node.querySelectorAll('img')) out.push(imgBlock(im, align));
    const runs = runOf(node).filter(r => r.text);
    if (runs.length) out.push({ type, align, runs });
  }
  function imgBlock(el, align) {
    const w = parseFloat(el.getAttribute('width')) || (el.style && parseFloat(el.style.width)) || null;
    const h = parseFloat(el.getAttribute('height')) || (el.style && parseFloat(el.style.height)) || null;
    return { type: 'img', align: align || null, src: el.getAttribute('src') || '', width: w, height: h };
  }
  return out.length ? out : [{ type: 'p', align: null, runs: [] }];
}
