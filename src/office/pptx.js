'use strict';
/* ============================================================================
   BITOS OFFICE / PPTX
   Read and write PresentationML decks (.pptx). The writer emits a complete
   minimal package: presentation, one slide master, one "Title and Content"
   layout, a theme, and one slide per deck slide with title/body placeholders.
   Readers follow the presentation -> slide relationship graph and pull
   placeholder text. Pure XML builders have no DOM dependency; readers use
   DOMParser in-browser. Speaker notes are not written yet (kept in app state).
   ========================================================================== */

import { zipWrite, zipRead } from './zip.js';
import { escapeXml } from './ooxml.js';

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const NVDOC = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';
const IMG_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp' };
const EXT_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };

function dataUrlToBytes(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const mime = m[1] || 'image/png';
  const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;
  return { mime, bytes };
}
function bytesToDataUrl(bytes, mime) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return `data:${mime || 'application/octet-stream'};base64,${btoa(s)}`;
}
function imageOf(slide) {
  if (!slide || !slide.image || !slide.image.dataUrl) return null;
  const decoded = dataUrlToBytes(slide.image.dataUrl);
  if (!decoded) return null;
  const ext = IMG_EXT[decoded.mime] || IMG_EXT[slide.image.mime] || 'png';
  return { ext, mime: EXT_MIME[ext], bytes: decoded.bytes };
}
const TITLE_OFF = '<a:off x="457200" y="274638"/><a:ext cx="11112538" cy="1143000"/>';
const BODY_OFF = '<a:off x="457200" y="1600200"/><a:ext cx="11112538" cy="4525963"/>';

const para = text => (text === '' || text == null)
  ? '<a:p/>'
  : `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${escapeXml(text)}</a:t></a:r></a:p>`;

function shapesXml(shapes) {
  return (shapes || []).map((sh, i) => {
    const x = Math.round(((sh.x || 0)) * 12192000), y = Math.round(((sh.y || 0)) * 6858000);
    const cx = Math.round(((sh.w == null ? 0.2 : sh.w)) * 12192000), cy = Math.round(((sh.h == null ? 0.15 : sh.h)) * 6858000);
    const kind = sh.kind === 'ellipse' ? 'ellipse' : 'rect';
    const fill = String(sh.fill || '4472C4').replace('#', '').toUpperCase();
    const paras = String(sh.text || '').split('\n').map(para).join('') || '<a:p/>';
    return `<p:sp><p:nvSpPr><p:cNvPr id="${10 + i}" name="Shape ${i + 1}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
      `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="${kind}"><a:avLst/></a:prstGeom>` +
      `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>` +
      `<p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp>`;
  }).join('');
}

export function slideXml(slide) {
  const title = para(slide && slide.title ? String(slide.title) : '');
  const body = String((slide && slide.body) || '').split('\n').map(para).join('') || '<a:p/>';
  const titleSp = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>` +
    `<p:spPr><a:xfrm>${TITLE_OFF}</a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/>${title}</p:txBody></p:sp>`;
  const bodySp = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content Placeholder 2"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr>` +
    `<p:spPr><a:xfrm>${BODY_OFF}</a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/>${body}</p:txBody></p:sp>`;
  const pic = imageOf(slide)
    ? '<p:pic><p:nvPicPr><p:cNvPr id="4" name="Picture 1"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
      '<p:blipFill><a:blip r:embed="rId3"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
      '<p:spPr><a:xfrm><a:off x="457200" y="274638"/><a:ext cx="11112538" cy="5500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>'
    : '';
  const shapes = shapesXml(slide && slide.shapes);
  return `${XML_DECL}<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">` +
    `<p:cSld><p:spTree>${NVDOC}${pic}${titleSp}${bodySp}${shapes}</p:spTree></p:cSld>` +
    `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

export function presentationXml(count, hasNotes) {
  const ids = Array.from({ length: count }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${2 + i}"/>`).join('');
  const notesMaster = hasNotes ? `<p:notesMasterIdLst><p:notesMasterId r:id="rId${count + 5}"/></p:notesMasterIdLst>` : '';
  return `${XML_DECL}<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" saveSubsetFonts="1">` +
    `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
    notesMaster +
    `<p:sldIdLst>${ids}</p:sldIdLst>` +
    '<p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/>' +
    '</p:presentation>';
}

export function presentationRelsXml(count, hasNotes) {
  const parts = [`<Relationship Id="rId1" Type="${RT}/slideMaster" Target="slideMasters/slideMaster1.xml"/>`];
  for (let i = 0; i < count; i++) parts.push(`<Relationship Id="rId${2 + i}" Type="${RT}/slide" Target="slides/slide${i + 1}.xml"/>`);
  const n = 2 + count;
  parts.push(`<Relationship Id="rId${n}" Type="${RT}/presProps" Target="presProps.xml"/>`);
  parts.push(`<Relationship Id="rId${n + 1}" Type="${RT}/viewProps" Target="viewProps.xml"/>`);
  parts.push(`<Relationship Id="rId${n + 2}" Type="${RT}/theme" Target="theme/theme1.xml"/>`);
  if (hasNotes) parts.push(`<Relationship Id="rId${n + 3}" Type="${RT}/notesMaster" Target="notesMasters/notesMaster1.xml"/>`);
  return `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${parts.join('')}</Relationships>`;
}

function contentTypesXml(slides) {
  let overrides = '';
  const imgExts = new Set();
  slides.forEach((s, i) => {
    overrides += `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
    if (s && s.notes) overrides += `<Override PartName="/ppt/notesSlides/notesSlide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`;
    const img = imageOf(s);
    if (img) imgExts.add(img.ext);
  });
  const imgDefaults = [...imgExts].map(e => `<Default Extension="${e}" ContentType="${EXT_MIME[e]}"/>`).join('');
  const notesMaster = slides.some(s => s && s.notes)
    ? '<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>' : '';
  return `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' + imgDefaults +
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
    '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>' +
    '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>' +
    notesMaster + overrides + '</Types>';
}

const ROOT_RELS = `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="${RT}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`;

const PRES_PROPS = `${XML_DECL}<p:presentationPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"/>`;
const VIEW_PROPS = `${XML_DECL}<p:viewPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">` +
  '<p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr>' +
  '<p:slideViewPr><p:cSldViewPr><p:cViewPr varScale="1"><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale>' +
  '<p:origin x="-2222" y="-1452"/></p:cViewPr><p:guideLst/></p:cSldViewPr></p:slideViewPr>' +
  '<p:notesTextViewPr><p:cViewPr><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale>' +
  '<p:origin x="0" y="0"/></p:cViewPr></p:notesTextViewPr><p:gridSpacing cx="72008" cy="72008"/></p:viewPr>';

const THEME = `${XML_DECL}<a:theme xmlns:a="${NS_A}" name="Office Theme"><a:themeElements>` +
  '<a:clrScheme name="Office">' +
  '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
  '<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>' +
  '<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>' +
  '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>' +
  '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>' +
  '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>' +
  '<a:fontScheme name="Office">' +
  '<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
  '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
  '<a:fmtScheme name="Office">' +
  '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
  '<a:lnStyleLst>' +
  '<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' +
  '<a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' +
  '<a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' +
  '</a:lnStyleLst>' +
  '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
  '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>' +
  '</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';

const SLIDE_MASTER = `${XML_DECL}<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">` +
  `<p:cSld><p:spTree>${NVDOC}</p:spTree></p:cSld>` +
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
  '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
  '<p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>';

const SLIDE_MASTER_RELS = `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="${RT}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
  `<Relationship Id="rId2" Type="${RT}/theme" Target="../theme/theme1.xml"/></Relationships>`;

const SLIDE_LAYOUT = `${XML_DECL}<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="obj" preserve="1">` +
  '<p:cSld name="Title and Content"><p:spTree>' + NVDOC +
  '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>' +
  `<p:spPr><a:xfrm>${TITLE_OFF}</a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
  '<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>' +
  '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr>' +
  `<p:spPr><a:xfrm>${BODY_OFF}</a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
  '<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>' +
  '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';

const SLIDE_LAYOUT_RELS = `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="${RT}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`;

function slideRelsXml(index, hasNotes, imgExt) {
  const notes = hasNotes
    ? `<Relationship Id="rId2" Type="${RT}/notesSlide" Target="../notesSlides/notesSlide${index + 1}.xml"/>` : '';
  const image = imgExt
    ? `<Relationship Id="rId3" Type="${RT}/image" Target="../media/image${index + 1}.${imgExt}"/>` : '';
  return `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${RT}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>${notes}${image}</Relationships>`;
}

function notesSlideXml(notes) {
  const body = String(notes || '').split('\n').map(para).join('') || '<a:p/>';
  const slideImg = '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>';
  const notesSp = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${body}</p:txBody></p:sp>`;
  return `${XML_DECL}<p:notes xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree>${NVDOC}${slideImg}${notesSp}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}
function notesSlideRelsXml(index) {
  return `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${RT}/slide" Target="../slides/slide${index + 1}.xml"/>` +
    `<Relationship Id="rId2" Type="${RT}/notesMaster" Target="../notesMasters/notesMaster1.xml"/></Relationships>`;
}
const NOTES_MASTER = `${XML_DECL}<p:notesMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree>${NVDOC}</p:spTree></p:cSld>` +
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
  '<p:notesStyle/></p:notesMaster>';
const NOTES_MASTER_RELS = `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="${RT}/theme" Target="../theme/theme1.xml"/></Relationships>`;

export async function deckToPptx(deck) {
  const slides = (deck && deck.slides) || [];
  const hasNotes = slides.some(s => s && s.notes);
  const files = [
    { name: '[Content_Types].xml', data: contentTypesXml(slides) },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'ppt/presentation.xml', data: presentationXml(slides.length, hasNotes) },
    { name: 'ppt/_rels/presentation.xml.rels', data: presentationRelsXml(slides.length, hasNotes) },
    { name: 'ppt/presProps.xml', data: PRES_PROPS },
    { name: 'ppt/viewProps.xml', data: VIEW_PROPS },
    { name: 'ppt/theme/theme1.xml', data: THEME },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: SLIDE_MASTER },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: SLIDE_MASTER_RELS },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: SLIDE_LAYOUT },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: SLIDE_LAYOUT_RELS },
  ];
  if (hasNotes) {
    files.push({ name: 'ppt/notesMasters/notesMaster1.xml', data: NOTES_MASTER });
    files.push({ name: 'ppt/notesMasters/_rels/notesMaster1.xml.rels', data: NOTES_MASTER_RELS });
  }
  slides.forEach((s, i) => {
    const img = imageOf(s);
    files.push({ name: `ppt/slides/slide${i + 1}.xml`, data: slideXml(s) });
    files.push({ name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: slideRelsXml(i, !!(s && s.notes), img && img.ext) });
    if (img) files.push({ name: `ppt/media/image${i + 1}.${img.ext}`, data: img.bytes });
    if (s && s.notes) {
      files.push({ name: `ppt/notesSlides/notesSlide${i + 1}.xml`, data: notesSlideXml(s.notes) });
      files.push({ name: `ppt/notesSlides/_rels/notesSlide${i + 1}.xml.rels`, data: notesSlideRelsXml(i) });
    }
  });
  return zipWrite(files);
}

/* ---- readers (browser) ---- */

const textOf = bytes => (bytes ? new TextDecoder().decode(bytes) : '');
function parseXml(text, what) {
  const doc = new DOMParser().parseFromString(String(text || ''), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(`invalid ${what || 'xml'}`);
  return doc;
}
function parseRels(xml) {
  const map = {}; const types = {};
  if (!xml) return { map, types };
  for (const rel of parseXml(xml, 'rels').getElementsByTagName('Relationship')) {
    map[rel.getAttribute('Id')] = rel.getAttribute('Target');
    types[rel.getAttribute('Id')] = rel.getAttribute('Type') || '';
  }
  return { map, types };
}
function resolvePart(files, baseDir, target) {
  const want = String(target || '').replace(/^\//, '');
  if (!want) return null;
  if (files.has(want)) return files.get(want);
  if (files.has(baseDir + want)) return files.get(baseDir + want);
  const stripped = want.replace(/^(\.\.\/)+/, '');
  if (files.has('ppt/' + stripped)) return files.get('ppt/' + stripped);
  return null;
}
function paragraphs(textBody) {
  if (!textBody) return '';
  return [...textBody.getElementsByTagName('a:p')]
    .map(p => [...p.getElementsByTagName('a:t')].map(t => t.textContent || '').join(''))
    .join('\n');
}
function parseSlide(xml) {
  const doc = parseXml(xml, 'slide');
  let title = '', body = '';
  const shapes = [];
  for (const sp of doc.getElementsByTagName('p:sp')) {
    const ph = sp.getElementsByTagName('p:ph')[0];
    const tx = sp.getElementsByTagName('p:txBody')[0];
    if (ph) {
      const type = ph.getAttribute('type') || '';
      const text = paragraphs(tx);
      if (type === 'title' || type === 'ctrTitle') title = text;
      else if (type === 'body' || type === 'subTitle' || ph.getAttribute('idx')) body = body ? `${body}\n${text}` : text;
      continue;
    }
    const xfrm = sp.getElementsByTagName('a:xfrm')[0];
    const prst = sp.getElementsByTagName('a:prstGeom')[0];
    if (!xfrm || !prst) continue;
    const off = xfrm.getElementsByTagName('a:off')[0];
    const ext = xfrm.getElementsByTagName('a:ext')[0];
    const clr = sp.getElementsByTagName('a:srgbClr')[0];
    shapes.push({
      id: 'shape-' + Date.now().toString(36) + shapes.length,
      kind: prst.getAttribute('prst') === 'ellipse' ? 'ellipse' : 'rect',
      x: off ? (+off.getAttribute('x')) / 12192000 : 0,
      y: off ? (+off.getAttribute('y')) / 6858000 : 0,
      w: ext ? (+ext.getAttribute('cx')) / 12192000 : 0.2,
      h: ext ? (+ext.getAttribute('cy')) / 6858000 : 0.15,
      text: paragraphs(tx),
      fill: clr ? clr.getAttribute('val') : '4472C4',
    });
  }
  return { id: 'slide-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), layout: 'title', title, body, notes: '', shapes };
}
function parseNotes(xml) {
  if (!xml) return '';
  const doc = parseXml(xml, 'notes');
  for (const sp of doc.getElementsByTagName('p:sp')) {
    const ph = sp.getElementsByTagName('p:ph')[0];
    if (ph && (ph.getAttribute('type') === 'body' || ph.getAttribute('idx'))) {
      const text = paragraphs(sp.getElementsByTagName('p:txBody')[0]);
      if (text) return text;
    }
  }
  return '';
}

export async function pptxToDeck(input) {
  const files = await zipRead(input);
  const presText = textOf(files.get('ppt/presentation.xml'));
  if (!presText) throw new Error('not a presentation (missing ppt/presentation.xml)');
  const { map } = parseRels(textOf(files.get('ppt/_rels/presentation.xml.rels')));
  const doc = parseXml(presText, 'presentation');
  let ids = [...doc.getElementsByTagName('p:sldId')];
  let slides = ids.map(sl => {
    const target = map[sl.getAttribute('r:id')] || '';
    const part = resolvePart(files, 'ppt/', target);
    if (!part) return null;
    const slide = parseSlide(textOf(part));
    const base = String(target).split('/').pop();
    const relsBytes = files.get('ppt/slides/_rels/' + base + '.rels');
    if (relsBytes) {
      const nr = parseRels(textOf(relsBytes));
      for (const id of Object.keys(nr.types)) {
        if (/notesSlide$/.test(nr.types[id])) {
          const npart = resolvePart(files, 'ppt/', nr.map[id]);
          if (npart) slide.notes = parseNotes(textOf(npart));
        } else if (/\/image$/.test(nr.types[id]) && !slide.image) {
          const ip = resolvePart(files, 'ppt/', nr.map[id]);
          if (ip) {
            const ext = String(nr.map[id]).split('.').pop().toLowerCase();
            slide.image = { mime: EXT_MIME[ext] || 'image/png', dataUrl: bytesToDataUrl(ip, EXT_MIME[ext] || 'image/png') };
          }
        }
      }
    }
    return slide;
  }).filter(Boolean);
  if (!slides.length) {
    slides = [...files.keys()].filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k))
      .sort((a, b) => parseInt(a.match(/(\d+)/)[1], 10) - parseInt(b.match(/(\d+)/)[1], 10))
      .map(k => parseSlide(textOf(files.get(k))));
  }
  if (!slides.length) throw new Error('presentation has no slides');
  return { kind: 'slides', title: 'imported', slides, created: Date.now(), updated: Date.now() };
}
