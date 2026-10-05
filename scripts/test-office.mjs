#!/usr/bin/env node
/* Fixtures for the Bitos Office shared engine (src/office).
 * Runs under node: zip store round-trip, CRC32 vector, history stack, column
 * addressing, OOXML block helpers, and the formula evaluator. Browser-only DOM
 * parsers (htmlToBlocks, docxToBlocks) are exercised in the app, not here.
 * Usage: node scripts/test-office.mjs */
import assert from 'node:assert/strict';
import { crc32, zipWrite, zipRead } from '../src/office/zip.js';
import { createHistory } from '../src/office/history.js';
import { newDoc, colName, colIndex } from '../src/office/model.js';
import { plainToBlocks, blocksToPlain, blocksToHtml, blocksToDocumentXml, blocksToDocx, diffBlocks } from '../src/office/ooxml.js';
import { worksheetXml, workbookXml, workbookToXlsx } from '../src/office/xlsx.js';
import { slideXml, presentationXml, deckToPptx } from '../src/office/pptx.js';
import { chartSvg } from '../src/office/chart.js';
import { evaluateFormula } from '../src/office/formula.js';
import { push, pull, syncStatus, configureSync } from '../src/office/sync.js';
import { createStore } from '../src/office/store.js';
import { request, createBridgeHost, allowed } from '../src/office/bridge.js';
import { packageManifest, SUITE_ID, SUITE_APPS } from '../src/office/suite.js';
import { compareVersions, latestRelease } from '../src/office/releases.js';
import { capsFor, isFirstParty } from '../src/office/publisher.js';

let checks = 0;
const ok = (name, fn) => { fn(); checks++; console.log('ok  -', name); };
const okAsync = async (name, fn) => { await fn(); checks++; console.log('ok  -', name); };

const decode = bytes => new TextDecoder().decode(bytes);
function resolveRel(relsPath, target) {
  const part = relsPath.replace(/_rels\/([^/]+)$/, '$1');
  const base = part.slice(0, part.lastIndexOf('/') + 1);
  const segs = target.replace(/^\//, '').split('/');
  const out = [];
  for (const s of (base + segs.join('/')).split('/')) {
    if (s === '..') out.pop(); else if (s && s !== '.') out.push(s);
  }
  return out.join('/');
}
/* Every internal relationship target must resolve to a part in the package. */
function assertRelsResolve(files) {
  for (const name of files.keys()) {
    if (!/\.rels$/.test(name)) continue;
    const xml = decode(files.get(name));
    for (const m of xml.matchAll(/<Relationship\b[^>]*Target="([^"]+)"/g)) {
      const target = m[1];
      if (/^https?:/i.test(target) || target.includes('#')) continue;
      const resolved = resolveRel(name, target);
      assert.equal(files.has(resolved), true, `${name}: unresolved target ${target} -> ${resolved}`);
    }
  }
}
/* Every part must be described by a content-type default or override. */
function assertContentTypes(files) {
  const ct = decode(files.get('[Content_Types].xml'));
  const defaults = new Set([...ct.matchAll(/<Default[^>]*Extension="([^"]+)"/g)].map(m => m[1].toLowerCase()));
  const overrides = new Set([...ct.matchAll(/<Override[^>]*PartName="([^"]+)"/g)].map(m => m[1]));
  for (const name of files.keys()) {
    if (name === '[Content_Types].xml') continue;
    const ext = name.split('.').pop().toLowerCase();
    assert.equal(overrides.has('/' + name) || defaults.has(ext), true, `no content type for ${name}`);
  }
}

await okAsync('crc32 matches the standard vector', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});

await okAsync('zip store round-trip', async () => {
  const files = [
    { name: 'a.txt', data: 'hello world' },
    { name: 'nested/b.xml', data: '<x>1</x>' },
  ];
  const zip = await zipWrite(files);
  assert.equal(zip[0], 0x50);
  assert.equal(zip[1], 0x4B);
  const read = await zipRead(zip);
  assert.equal(new TextDecoder().decode(read.get('a.txt')), 'hello world');
  assert.equal(new TextDecoder().decode(read.get('nested/b.xml')), '<x>1</x>');
  assert.equal(read.size, 2);
});

ok('history undoes, redoes, and clears the future', () => {
  const h = createHistory(4);
  h.reset('a');
  h.push('b'); h.push('c');
  assert.equal(h.state, 'c');
  assert.equal(h.undo(), 'b');
  assert.equal(h.canRedo, true);
  assert.equal(h.redo(), 'c');
  h.undo(); h.push('d');
  assert.equal(h.canRedo, false);
  assert.equal(h.state, 'd');
});

ok('column name/index round-trips', () => {
  assert.equal(colName(0), 'A');
  assert.equal(colName(25), 'Z');
  assert.equal(colName(26), 'AA');
  assert.equal(colIndex('A'), 0);
  assert.equal(colIndex('AA'), 26);
  assert.equal(colIndex('AB'), 27);
});

ok('block helpers escape and round-trip', () => {
  const blocks = plainToBlocks('one\n\ntwo <three>');
  assert.equal(blocksToPlain(blocks), 'one\n\ntwo <three>');
  const html = blocksToHtml([{ type: 'h1', align: 'center', runs: [{ text: 'a & b', b: true }] }]);
  assert.match(html, /<h1 style="text-align:center">/);
  assert.match(html, /<strong>a &amp; b<\/strong>/);
  const xml = blocksToDocumentXml([{ type: 'h2', align: null, runs: [{ text: '<x>', i: true }] }]);
  assert.match(xml, /<w:pStyle w:val="Heading2"\/>/);
  assert.match(xml, /<w:i\/>/);
  assert.match(xml, /&lt;x&gt;/);
});

ok('docx runs carry strike, colour, size, and vertical align', () => {
  const xml = blocksToDocumentXml([{ type: 'p', align: null, runs: [{ text: 'x', b: true, u: true, s: true, color: 'FF0000', size: 14, vert: 'superscript' }] }]);
  assert.match(xml, /<w:strike\/>/);
  assert.match(xml, /<w:color w:val="FF0000"\/>/);
  assert.match(xml, /<w:sz w:val="28"\/>/);
  assert.match(xml, /<w:vertAlign w:val="superscript"\/>/);
  const html = blocksToHtml([{ type: 'p', align: null, runs: [{ text: 'x', s: true, color: 'FF0000', size: 14, vert: 'subscript' }] }]);
  assert.match(html, /<s>/);
  assert.match(html, /<sub>/);
  assert.match(html, /style="color:FF0000;font-size:14pt"/);
});

await okAsync('docx embeds an inline image with media, rel, and content type', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
  const files = await zipRead(await blocksToDocx([{ type: 'img', align: null, src: png, width: 120, height: 80 }]));
  assert.equal(files.has('word/media/image1.png'), true);
  assert.equal(files.has('word/_rels/document.xml.rels'), true);
  const doc = new TextDecoder().decode(files.get('word/document.xml'));
  assert.match(doc, /<a:blip r:embed="rId101"\/>/);
  assert.match(doc, /<wp:extent cx="1143000" cy="762000"\/>/);
  assert.match(new TextDecoder().decode(files.get('[Content_Types].xml')), /Extension="png"/);
  assert.match(new TextDecoder().decode(files.get('word/_rels/document.xml.rels')), /Id="rId101".*media\/image1\.png/);
});

await okAsync('docx writes header and footer parts', async () => {
  const files = await zipRead(await blocksToDocx([{ type: 'p', align: null, runs: [{ text: 'body' }] }], { header: 'My Header', footer: 'Page' }));
  assert.equal(files.has('word/header1.xml'), true);
  assert.equal(files.has('word/footer1.xml'), true);
  const doc = new TextDecoder().decode(files.get('word/document.xml'));
  assert.match(doc, /<w:headerReference w:type="default" r:id="rId1"\/>/);
  assert.match(doc, /<w:footerReference w:type="default" r:id="rId2"\/>/);
  assert.match(new TextDecoder().decode(files.get('[Content_Types].xml')), /wordprocessingml\.header\+xml/);
  const rels = new TextDecoder().decode(files.get('word/_rels/document.xml.rels'));
  assert.match(rels, /Id="rId1".*header1\.xml/);
  assert.match(rels, /Id="rId2".*footer1\.xml/);
});

await okAsync('docx writes the chosen page size', async () => {
  const a4 = new TextDecoder().decode((await zipRead(await blocksToDocx([], { pageSize: 'a4' }))).get('word/document.xml'));
  assert.match(a4, /<w:pgSz w:w="11906" w:h="16838" w:orient="portrait"\/>/);
  const letter = new TextDecoder().decode((await zipRead(await blocksToDocx([], {}))).get('word/document.xml'));
  assert.match(letter, /<w:pgSz w:w="12240" w:h="15840" w:orient="portrait"\/>/);
  const land = new TextDecoder().decode((await zipRead(await blocksToDocx([], { pageSize: 'a4', orientation: 'landscape' }))).get('word/document.xml'));
  assert.match(land, /<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"\/>/);
});

await okAsync('office sync pushes and pulls through the local remote', async () => {
  configureSync({ url: '', enabled: false });
  const res = await push('test-doc', { name: 'x.txt', body: 'hi' });
  assert.equal(res.ok, true);
  assert.equal(syncStatus('test-doc').state, 'synced');
  assert.deepEqual(await pull('test-doc'), { name: 'x.txt', body: 'hi' });
});

await okAsync('docx writes comments.xml with author and date', async () => {
  const files = await zipRead(await blocksToDocx([{ type: 'p', align: null, runs: [{ text: 'x' }] }],
    { comments: [{ author: 'you', text: 'fix this', created: Date.parse('2026-01-02T03:04:05Z') }] }));
  assert.equal(files.has('word/comments.xml'), true);
  const c = new TextDecoder().decode(files.get('word/comments.xml'));
  assert.match(c, /<w:comment w:id="1" w:author="you" w:date="2026-01-02T03:04:05\.000Z">/);
  assert.match(c, /<w:t xml:space="preserve">fix this<\/w:t>/);
  assert.match(new TextDecoder().decode(files.get('[Content_Types].xml')), /wordprocessingml\.comments\+xml/);
  assert.match(new TextDecoder().decode(files.get('word/_rels/document.xml.rels')), /Id="rId3".*comments\.xml/);
});

ok('office suite manifest unions apps, opens, and permissions', () => {
  const m = packageManifest();
  assert.equal(m.appId, SUITE_ID);
  assert.deepEqual(SUITE_APPS, ['docs', 'sheets', 'slides']);
  assert.equal(m.apps.length, 3);
  assert.equal(m.opens.includes('*.docx'), true);
  assert.equal(m.opens.includes('*.xlsx'), true);
  assert.equal(m.opens.includes('*.pptx'), true);
  assert.equal(m.permissions.includes('fs.files'), true);
  assert.equal(m.permissions.includes('app.print'), true);
  assert.equal(m.publisher, 'bitos');
  assert.equal(m.releases.docs.version, '0.1.0');
});

ok('release versions compare and first-party caps are larger', () => {
  assert.equal(compareVersions('0.1.0', '0.1.1'), -1);
  assert.equal(compareVersions('1.0.0', '1.0.0-beta'), 1);
  assert.equal(compareVersions('1.2.0', '1.2.0'), 0);
  assert.equal(latestRelease('slides').version, '0.1.0');
  assert.equal(isFirstParty('bitos'), true);
  assert.equal(capsFor('bitos').packageMax > capsFor('someone').packageMax, true);
});

await okAsync('bridge host enforces permissions and dispatches', async () => {
  const host = createBridgeHost({ permissions: ['app.storage'], handlers: { 'storage.get': ({ key }) => ({ key, value: 1 }) } });
  const ok = await host(request('1', 'storage.get', { key: 'a' }));
  assert.equal(ok.kind, 'res');
  assert.deepEqual(ok.result, { key: 'a', value: 1 });
  const denied = await host(request('2', 'file.open', {}));
  assert.equal(denied.kind, 'err');
  assert.equal(denied.code, 'DENIED');
  assert.equal(allowed('ui.toast', []), true);
  assert.equal(allowed('print', []), false);
});

await okAsync('app-scoped store namespaces keys', async () => {
  const s = createStore('demo');
  assert.equal(s.key('doc'), 'demo:doc');
  await s.save('doc', { v: 1 });
  assert.deepEqual(await s.load('doc', null), { v: 1 });
});

ok('block diff marks insertions and deletions', () => {
  const oldB = [{ type: 'p', align: null, runs: [{ text: 'a' }] }, { type: 'p', align: null, runs: [{ text: 'b' }] }];
  const newB = [{ type: 'p', align: null, runs: [{ text: 'a' }] }, { type: 'p', align: null, runs: [{ text: 'c' }] }];
  assert.deepEqual(diffBlocks(oldB, newB).map(o => o.op), ['same', 'del', 'ins']);
});

ok('tracked docx wraps insertions in w:ins and deletions in w:del', () => {
  const oldB = [{ type: 'p', align: null, runs: [{ text: 'hello' }] }];
  const newB = [{ type: 'p', align: null, runs: [{ text: 'hello world' }] }];
  const xml = blocksToDocumentXml(newB, null, {}, { baseline: oldB, author: 'you', date: '2026-01-02T03:04:05.000Z' });
  assert.match(xml, /<w:ins w:id="\d+" w:author="you" w:date="2026-01-02T03:04:05\.000Z">/);
  assert.match(xml, /<w:del w:id="\d+" w:author="you"/);
  assert.match(xml, /<w:delText xml:space="preserve">hello<\/w:delText>/);
  assert.match(xml, /<w:t xml:space="preserve">hello world<\/w:t>/);
});

ok('docx writes a table and html renders it', () => {
  const blocks = [{ type: 'table', rows: [['a', 'b'], ['c', 'd']] }];
  const xml = blocksToDocumentXml(blocks);
  assert.match(xml, /<w:tbl>/);
  assert.match(xml, /<w:tblGrid><w:gridCol/);
  assert.match(xml, /<w:tr>/);
  assert.match(xml, /<w:tc>/);
  assert.match(xml, /<w:t xml:space="preserve">a<\/w:t>/);
  assert.match(blocksToHtml(blocks), /<table class="dc-table"><tr><td>a<\/td><td>b<\/td><\/tr>/);
});

ok('model creates a fresh doc record', () => {
  const d = newDoc({ title: 'memo' });
  assert.equal(d.kind, 'docs');
  assert.equal(d.title, 'memo');
  assert.equal(typeof d.id, 'string');
});

ok('formula arithmetic and ranges', () => {
  const cells = { A1: '10', A2: '20', A3: '30', B1: '2' };
  const resolve = ref => cells[ref] || '';
  assert.deepEqual(evaluateFormula('=A1+B1*2', resolve), { value: 14 });
  assert.deepEqual(evaluateFormula('=(A1+A2)/3', resolve), { value: 10 });
  assert.deepEqual(evaluateFormula('=SUM(A1:A3)', resolve), { value: 60 });
  assert.deepEqual(evaluateFormula('=AVERAGE(A1:A3)', resolve), { value: 20 });
  assert.deepEqual(evaluateFormula('=MIN(A1:A3)', resolve), { value: 10 });
  assert.deepEqual(evaluateFormula('=MAX(A1:A3)', resolve), { value: 30 });
  assert.deepEqual(evaluateFormula('=COUNT(A1:A3)', resolve), { value: 3 });
});

ok('formula comparisons and IF', () => {
  const resolve = ref => ({ A1: '5', A2: '8' }[ref] || '');
  assert.deepEqual(evaluateFormula('=IF(A1<A2,100,200)', resolve), { value: 100 });
  assert.deepEqual(evaluateFormula('=IF(A1>A2,1,0)', resolve), { value: 0 });
  assert.deepEqual(evaluateFormula('=A1=5', resolve), { value: true });
});

ok('formula reports errors instead of throwing', () => {
  const resolve = () => '';
  assert.deepEqual(evaluateFormula('=1/0', resolve), { error: '#DIV/0!' });
  assert.deepEqual(evaluateFormula('=NOPE(1)', resolve), { error: '#NAME?' });
  assert.deepEqual(evaluateFormula('=1+', resolve).error != null, true);
});

ok('worksheet xml writes strings, numbers, formulas, and bold', () => {
  const xml = worksheetXml({ A1: { v: 'item' }, B1: { v: '2.5' }, B2: { v: '=SUM(A1:A1)', b: true } }, 12, 40);
  assert.match(xml, /<c r="A1" t="inlineStr"><is><t xml:space="preserve">item<\/t><\/is><\/c>/);
  assert.match(xml, /<c r="B1"><v>2\.5<\/v><\/c>/);
  assert.match(xml, /<c r="B2" s="1"><f>SUM\(A1:A1\)<\/f><\/c>/);
  assert.match(xml, /<row r="1"><c r="A1"/);
});

ok('workbook xml escapes sheet names', () => {
  const xml = workbookXml([{ name: 'a & b' }, { name: 'stats' }]);
  assert.match(xml, /name="a &amp; b" sheetId="1" r:id="rId1"/);
  assert.match(xml, /name="stats" sheetId="2" r:id="rId2"/);
});

ok('slide xml writes title and body placeholders', () => {
  const xml = slideXml({ title: 'hello <world>', body: 'one\n\ntwo' });
  assert.match(xml, /<p:ph type="title"\/>/);
  assert.match(xml, /<p:ph idx="1"\/>/);
  assert.match(xml, /<a:t>hello &lt;world&gt;<\/a:t>/);
  assert.match(xml, /<a:t>one<\/a:t><\/a:r><\/a:p><a:p\/><a:p><a:r>/);
});

ok('slide xml writes positioned shapes', () => {
  const xml = slideXml({ title: 't', shapes: [{ kind: 'ellipse', x: 0.1, y: 0.2, w: 0.3, h: 0.4, text: 'hi', fill: 'ff0000' }] });
  assert.match(xml, /<a:prstGeom prst="ellipse">/);
  assert.match(xml, /<a:srgbClr val="FF0000"\/>/);
  assert.match(xml, /<a:off x="1219200" y="1371600"\/>/);
  assert.match(xml, /<a:ext cx="3657600" cy="2743200"\/>/);
  assert.match(xml, /<a:t>hi<\/a:t>/);
});

ok('presentation xml lists one slide id per slide', () => {
  const xml = presentationXml(3);
  assert.equal((xml.match(/<p:sldId /g) || []).length, 3);
  assert.match(xml, /r:id="rId2"\/><p:sldId id="257" r:id="rId3"/);
  assert.match(xml, /<p:sldSz cx="12192000" cy="6858000"/);
});

ok('chart svg renders bar, line, and pie', () => {
  const data = [{ label: 'a', value: 1 }, { label: 'b', value: 2 }, { label: 'c', value: 3 }];
  const bar = chartSvg({ type: 'bar', data, title: 'x & y' });
  assert.match(bar, /<svg /);
  assert.equal((bar.match(/<rect /g) || []).length, 3);
  assert.match(bar, /x &amp; y/);
  const line = chartSvg({ type: 'line', data });
  assert.match(line, /<polyline points=/);
  assert.equal((line.match(/<circle /g) || []).length, 3);
  const pie = chartSvg({ type: 'pie', data });
  assert.equal((pie.match(/<path /g) || []).length, 3);
  assert.doesNotThrow(() => chartSvg({ type: 'bar', data: [] }));
  assert.doesNotThrow(() => chartSvg({}));
});

await okAsync('pptx embeds a slide image with media, rel, and content type', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
  const deck = { slides: [{ title: 'a', body: 'b', image: { dataUrl: png, mime: 'image/png' } }] };
  const files = await zipRead(await deckToPptx(deck));
  assert.equal(files.has('ppt/media/image1.png'), true);
  assert.match(new TextDecoder().decode(files.get('ppt/slides/_rels/slide1.xml.rels')), /rId3.*\/image.*image1\.png/);
  assert.match(new TextDecoder().decode(files.get('ppt/slides/slide1.xml')), /<a:blip r:embed="rId3"\/>/);
  assert.match(new TextDecoder().decode(files.get('[Content_Types].xml')), /Extension="png"/);
  assertRelsResolve(files);
  assertContentTypes(files);
});

await okAsync('pptx package contains master, layout, theme, and slides', async () => {
  const deck = { slides: [{ title: 'a', body: 'b', notes: 'remember this' }, { title: 'c', body: 'd' }] };
  const bytes = await deckToPptx(deck);
  const files = await zipRead(bytes);
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels',
    'ppt/theme/theme1.xml', 'ppt/slideMasters/slideMaster1.xml', 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    'ppt/slideLayouts/slideLayout1.xml', 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    'ppt/slides/slide1.xml', 'ppt/slides/slide2.xml', 'ppt/slides/_rels/slide2.xml.rels',
    'ppt/notesMasters/notesMaster1.xml', 'ppt/notesMasters/_rels/notesMaster1.xml.rels',
    'ppt/notesSlides/notesSlide1.xml', 'ppt/notesSlides/_rels/notesSlide1.xml.rels']) {
    assert.equal(files.has(part), true, `missing ${part}`);
  }
  assert.equal(files.has('ppt/notesSlides/notesSlide2.xml'), false, 'slide without notes should not get a notes part');
  assert.match(new TextDecoder().decode(files.get('ppt/notesSlides/notesSlide1.xml')), /remember this/);
  assertRelsResolve(files);
  assertContentTypes(files);
});

await okAsync('xlsx package contains the workbook parts', async () => {
  const book = { sheets: [{ name: 'sheet1', cells: { A1: { v: 'hi' } } }] };
  const bytes = await workbookToXlsx(book);
  const files = await zipRead(bytes);
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) {
    assert.equal(files.has(part), true, `missing ${part}`);
  }
  assert.match(new TextDecoder().decode(files.get('xl/workbook.xml')), /name="sheet1"/);
  assertRelsResolve(files);
  assertContentTypes(files);
});

await okAsync('xlsx styles carry number formats, fills, and bold', async () => {
  const book = { sheets: [{ name: 's', cells: {
    A1: { v: '1234.5', n: 'currency' },
    A2: { v: '0.5', n: 'percent' },
    A3: { v: 'note', bg: 'FFF2CC' },
    A4: { v: 'x', b: true },
  } }] };
  const files = await zipRead(await workbookToXlsx(book));
  const styles = new TextDecoder().decode(files.get('xl/styles.xml'));
  const sheet = new TextDecoder().decode(files.get('xl/worksheets/sheet1.xml'));
  assert.match(styles, /<numFmt numFmtId="164" formatCode="&quot;\$&quot;#,##0\.00"\/>/);
  assert.match(styles, /numFmtId="9"/);
  assert.match(styles, /<patternFill patternType="solid"><fgColor rgb="FFFFF2CC"\/>/);
  assert.match(styles, /<font><b\/>/);
  assert.match(sheet, /<c r="A1" s="\d+"><v>1234\.5<\/v><\/c>/);
  assertRelsResolve(files);
  assertContentTypes(files);
});

console.log(`\n${checks} office checks passed`);
