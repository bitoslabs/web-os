'use strict';
/* ============================================================================
   BITOS OFFICE / XLSX
   Read and write SpreadsheetML workbooks (.xlsx). Writes inline strings so no
   sharedStrings part is needed, plus a two-font styles part for bold. Reads the
   parts Excel and Google Sheets emit, including sharedStrings and cell styles.
   Pure XML builders have no DOM dependency; readers use DOMParser in-browser.
   ========================================================================== */

import { zipWrite, zipRead } from './zip.js';
import { escapeXml } from './ooxml.js';
import { colIndex } from './model.js';

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const REF_RE = /^([A-Za-z]+)([0-9]+)$/;
const isNumeric = s => /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s);

function cellXml(ref, cell, styleIndex) {
  const raw = cell ? String(cell.v == null ? '' : cell.v) : '';
  if (raw === '') return '';
  const style = styleIndex ? ` s="${styleIndex}"` : '';
  if (raw.charAt(0) === '=') return `<c r="${ref}"${style}><f>${escapeXml(raw.slice(1))}</f></c>`;
  if (isNumeric(raw)) return `<c r="${ref}"${style}><v>${escapeXml(raw)}</v></c>`;
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(raw)}</t></is></c>`;
}

export function worksheetXml(cells, cols, rows, styleOf) {
  const style = typeof styleOf === 'function' ? styleOf : (c => (c && c.b ? 1 : 0));
  const byRow = new Map();
  for (const ref of Object.keys(cells || {})) {
    const m = REF_RE.exec(ref);
    if (!m) continue;
    const r = +m[2];
    if (!byRow.has(r)) byRow.set(r, []);
    byRow.get(r).push([m[1].toUpperCase(), m[2], cells[ref]]);
  }
  const body = [...byRow.keys()].sort((a, b) => a - b).map(r => {
    const cs = byRow.get(r).sort((a, b) => colIndex(a[0]) - colIndex(b[0]))
      .map(([col, row, cell]) => cellXml(col + row, cell, style(cell))).join('');
    return `<row r="${r}">${cs}</row>`;
  }).join('');
  return `${XML_DECL}<worksheet xmlns="${NS_MAIN}"><sheetData>${body}</sheetData></worksheet>`;
}

export function workbookXml(sheets) {
  const list = (sheets || []).map((s, i) =>
    `<sheet name="${escapeXml(s.name || ('sheet' + (i + 1)))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  return `${XML_DECL}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>${list}</sheets></workbook>`;
}

export function workbookRelsXml(count) {
  const list = Array.from({ length: count }, (_, i) =>
    `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  return `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list}</Relationships>`;
}

function contentTypesXml(count) {
  const overrides = Array.from({ length: count }, (_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  return `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    overrides + '</Types>';
}

const ROOT_RELS = `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const CURRENCY_FMT_ID = 164;
const BUILTIN_FMT_ID = { general: 0, number: 2, percent: 9 };
const normHex = h => String(h || '').replace('#', '').toUpperCase().slice(0, 6);

/* Collect the cell formats a workbook actually uses into a shared stylesheet. */
function createStyles() {
  /* Index 0 is the default "Normal" xf, so plain cells omit `s`. */
  const st = {
    fills: [{}, { gray: true }], fillId: {},
    xfs: [{ fontId: 0, fillId: 0, numFmtId: 0 }],
    xfKey: new Map([['0||general', 0]]),
    numFmts: new Set(), boldUsed: false,
  };
  st.styleOf = cell => {
    const bold = !!(cell && cell.b);
    const bg = normHex(cell && cell.bg);
    const n = (cell && cell.n) || 'general';
    const key = `${bold ? 1 : 0}|${bg}|${n}`;
    if (st.xfKey.has(key)) return st.xfKey.get(key);
    let fid = 0;
    if (bg) { if (st.fillId[bg] == null) { st.fillId[bg] = st.fills.length; st.fills.push({ solid: bg }); } fid = st.fillId[bg]; }
    if (bold) st.boldUsed = true;
    const numFmtId = n === 'currency' ? CURRENCY_FMT_ID : (BUILTIN_FMT_ID[n] || 0);
    if (n === 'currency') st.numFmts.add(numFmtId);
    const idx = st.xfs.length;
    st.xfs.push({ fontId: bold ? 1 : 0, fillId: fid, numFmtId });
    st.xfKey.set(key, idx);
    return idx;
  };
  return st;
}

function stylesXml(st) {
  const numFmts = st.numFmts.size
    ? `<numFmts count="${st.numFmts.size}"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts>` : '';
  const fonts = `<fonts count="${st.boldUsed ? 2 : 1}"><font><sz val="11"/><name val="Calibri"/></font>` +
    (st.boldUsed ? '<font><b/><sz val="11"/><name val="Calibri"/></font>' : '') + '</fonts>';
  const fills = `<fills count="${st.fills.length}">` + st.fills.map(f =>
    f.solid ? `<fill><patternFill patternType="solid"><fgColor rgb="FF${f.solid}"/><bgColor indexed="64"/></patternFill></fill>`
      : f.gray ? '<fill><patternFill patternType="gray125"/></fill>'
        : '<fill><patternFill patternType="none"/></fill>').join('') + '</fills>';
  const borders = '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>';
  const cellStyleXfs = '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>';
  const cellXfs = `<cellXfs count="${st.xfs.length}">` + st.xfs.map(xf =>
    `<xf numFmtId="${xf.numFmtId}" fontId="${xf.fontId}" fillId="${xf.fillId}" borderId="0" xfId="0"` +
    `${xf.numFmtId ? ' applyNumberFormat="1"' : ''}${xf.fontId ? ' applyFont="1"' : ''}${xf.fillId ? ' applyFill="1"' : ''}/>`).join('') + '</cellXfs>';
  return XML_DECL + `<styleSheet xmlns="${NS_MAIN}">${numFmts}${fonts}${fills}${borders}${cellStyleXfs}${cellXfs}` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}

export async function workbookToXlsx(book) {
  const sheets = (book && book.sheets) || [];
  const st = createStyles();
  const sheetXmls = sheets.map(s => worksheetXml(s.cells, s.cols, s.rows, st.styleOf));
  const files = [
    { name: '[Content_Types].xml', data: contentTypesXml(sheets.length) },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'xl/workbook.xml', data: workbookXml(sheets) },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml(sheets.length) },
    { name: 'xl/styles.xml', data: stylesXml(st) },
  ];
  sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXmls[i] }));
  return zipWrite(files);
}

/* ---- readers (browser) ---- */

const textOf = bytes => (bytes ? new TextDecoder().decode(bytes) : '');
function parseXml(text, what) {
  const doc = new DOMParser().parseFromString(String(text || ''), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(`invalid ${what || 'xml'}`);
  return doc;
}
function tagText(el) { return el ? (el.textContent || '') : ''; }

function parseSharedStrings(xml) {
  if (!xml) return [];
  const doc = parseXml(xml, 'sharedStrings');
  return [...doc.getElementsByTagName('si')].map(si => tagText(si));
}
const NUMFMT_NAME = { 0: 'general', 2: 'number', 9: 'percent', 164: 'currency' };
function parseStyles(xml) {
  if (!xml) return () => ({});
  const doc = parseXml(xml, 'styles');
  const bold = [...doc.getElementsByTagName('font')].map(f => f.getElementsByTagName('b').length > 0);
  const custom = {};
  for (const nf of doc.getElementsByTagName('numFmt')) custom[+nf.getAttribute('numFmtId')] = nf.getAttribute('formatCode') || '';
  const fills = [...doc.getElementsByTagName('fill')].map(f => {
    const pf = f.getElementsByTagName('patternFill')[0];
    if (!pf || (pf.getAttribute('patternType') || '') !== 'solid') return null;
    const fg = pf.getElementsByTagName('fgColor')[0];
    const rgb = fg ? (fg.getAttribute('rgb') || '') : '';
    return rgb ? rgb.slice(-6).toUpperCase() : null;
  });
  const xfGroup = doc.getElementsByTagName('cellXfs')[0];
  const xfs = (xfGroup ? [...xfGroup.getElementsByTagName('xf')] : []).map(xf => ({
    fontId: parseInt(xf.getAttribute('fontId') || '0', 10),
    fillId: parseInt(xf.getAttribute('fillId') || '0', 10),
    numFmtId: parseInt(xf.getAttribute('numFmtId') || '0', 10),
  }));
  const nameFor = id => {
    if (NUMFMT_NAME[id]) return NUMFMT_NAME[id];
    const code = custom[id] || '';
    if (/%/.test(code)) return 'percent';
    if (/\$/.test(code)) return 'currency';
    if (/0\.0/.test(code)) return 'number';
    return 'general';
  };
  return s => {
    const i = parseInt(s, 10);
    if (isNaN(i) || !xfs[i]) return {};
    const xf = xfs[i];
    const out = {};
    if (bold[xf.fontId]) out.b = true;
    if (fills[xf.fillId]) out.bg = fills[xf.fillId];
    const n = nameFor(xf.numFmtId);
    if (n !== 'general') out.n = n;
    return out;
  };
}
function parseRels(xml) {
  const map = {};
  if (!xml) return map;
  const doc = parseXml(xml, 'rels');
  for (const rel of doc.getElementsByTagName('Relationship')) map[rel.getAttribute('Id')] = rel.getAttribute('Target');
  return map;
}

function parseSheetXml(xml, shared, styleAt) {
  const doc = parseXml(xml, 'worksheet');
  const cells = {};
  let maxCol = 0, maxRow = 0;
  for (const row of doc.getElementsByTagName('row')) {
    for (const c of row.getElementsByTagName('c')) {
      const ref = c.getAttribute('r');
      if (!ref) continue;
      const m = REF_RE.exec(ref); if (!m) continue;
      maxCol = Math.max(maxCol, colIndex(m[1])); maxRow = Math.max(maxRow, +m[2]);
      const type = c.getAttribute('t') || 'n';
      const f = c.getElementsByTagName('f')[0];
      let value;
      if (f) value = '=' + tagText(f);
      else if (type === 's') value = shared[parseInt(tagText(c.getElementsByTagName('v')[0]), 10)] || '';
      else if (type === 'inlineStr') value = [...c.getElementsByTagName('t')].map(tagText).join('');
      else if (type === 'b') value = tagText(c.getElementsByTagName('v')[0]) === '1' ? 'TRUE' : 'FALSE';
      else value = tagText(c.getElementsByTagName('v')[0]);
      if (value === '' && !f) continue;
      cells[ref.toUpperCase()] = { v: value, ...styleAt(c.getAttribute('s')) };
    }
  }
  return { cells, maxCol, maxRow };
}

function resolvePart(files, target, fallbackIndex) {
  const want = String(target || '').replace(/^\//, '');
  if (want && files.has(want)) return files.get(want);
  if (want && files.has('xl/' + want)) return files.get('xl/' + want);
  const guess = 'xl/worksheets/sheet' + (fallbackIndex + 1) + '.xml';
  return files.get(guess) || null;
}

export async function xlsxToWorkbook(input) {
  const files = await zipRead(input);
  const shared = parseSharedStrings(textOf(files.get('xl/sharedStrings.xml')));
  const styleAt = parseStyles(textOf(files.get('xl/styles.xml')));
  const wbText = textOf(files.get('xl/workbook.xml'));
  if (!wbText) throw new Error('not a spreadsheet (missing xl/workbook.xml)');
  const rels = parseRels(textOf(files.get('xl/_rels/workbook.xml.rels')));
  const sheetEls = [...parseXml(wbText, 'workbook').getElementsByTagName('sheet')];
  const sheets = sheetEls.map((se, i) => {
    const name = se.getAttribute('name') || ('sheet' + (i + 1));
    const target = rels[se.getAttribute('r:id') || se.getAttribute('id')];
    const parsed = parseSheetXml(textOf(resolvePart(files, target, i)), shared, styleAt);
    return {
      id: 'sheet-' + Date.now().toString(36) + i,
      name,
      cells: parsed.cells,
      cols: Math.max(12, parsed.maxCol + 1),
      rows: Math.max(40, parsed.maxRow + 1),
    };
  });
  if (!sheets.length) throw new Error('workbook has no sheets');
  return { kind: 'sheets', title: 'imported', sheets, active: 0, created: Date.now(), updated: Date.now() };
}
