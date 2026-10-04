'use strict';
/* ============================================================================
   BITOS WEB / PACKAGE DOCUMENT BUILDER
   Turns a validated package's entry file plus its files map into one
   self-contained document by inlining stylesheets, scripts, and asset
   references. Pure and dependency-free so it can be tested without a browser.
   ========================================================================== */

const MIME = {
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon', avif: 'image/avif',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm',
};
function ext(p) { const m = /\.([a-z0-9]+)$/i.exec(p || ''); return m ? m[1].toLowerCase() : ''; }
function mime(p) { return MIME[ext(p)] || 'application/octet-stream'; }

/* Resolve a package-relative reference against the referencing file. Absolute,
 * remote, and fragment refs return null so they are left untouched. */
export function normalizePath(ref, base) {
  if (!ref || /^(https?:|data:|blob:|mailto:|tel:|#|\/\/)/i.test(ref)) return null;
  let p = ref.split('#')[0].split('?')[0];
  if (!p || p.startsWith('/')) return null;
  const dir = base && base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  const out = [];
  for (const seg of (dir + p).split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/') || null;
}

export function assetUrl(path, file) {
  if (!file || typeof file.data !== 'string') return null;
  const type = mime(path);
  if (file.encoding === 'base64') return 'data:' + type + ';base64,' + file.data;
  if (file.encoding === 'utf8') return 'data:' + type + ',' + encodeURIComponent(file.data);
  return null;
}

function attr(tag, name) {
  const m = new RegExp(name + '\\s*=\\s*(["\'])(.*?)\\1', 'i').exec(tag);
  return m ? m[2] : null;
}

function inlineCss(css, cssPath, files) {
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (m, q, ref) => {
    const p = normalizePath(ref, cssPath);
    const url = p && files[p] ? assetUrl(p, files[p]) : null;
    return url ? 'url("' + url + '")' : m;
  });
}

function inlineLink(tag, entryPath, files) {
  const href = attr(tag, 'href');
  if (href == null) return tag;
  const p = normalizePath(href, entryPath);
  const file = p && files[p];
  if (!file) return tag;
  if (/rel\s*=\s*["']?stylesheet/i.test(tag) && file.encoding === 'utf8') {
    return '<style>\n' + inlineCss(file.data, p, files) + '\n</style>';
  }
  const url = assetUrl(p, file);
  return url ? tag.replace(href, url) : tag;
}

export function inlineDocument(entryHtml, files, entryPath) {
  if (typeof entryHtml !== 'string') return '';
  files = files || {};
  entryPath = entryPath || 'index.html';
  let html = entryHtml;

  html = html.replace(/<link\b[^>]*?>/gi, tag => inlineLink(tag, entryPath, files));

  html = html.replace(/<script\b([^>]*?)\bsrc\s*=\s*(["'])([^"']+)\2([^>]*)>\s*<\/script>/gi,
    (m, pre, q, src, post) => {
      const p = normalizePath(src, entryPath);
      const file = p && files[p];
      if (!file || file.encoding !== 'utf8') return m;
      return '<script' + pre + post + '>\n' + file.data.replace(/<\/script>/gi, '<\\/script>') + '\n</script>';
    });

  html = html.replace(/(<(?:img|source|input|video|audio)\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/gi,
    (m, pre, q, src) => {
      const p = normalizePath(src, entryPath);
      const url = p && files[p] ? assetUrl(p, files[p]) : null;
      return url ? pre + q + url + q : m;
    });

  html = html.replace(/(<(?:img|source)\b[^>]*?\bposter\s*=\s*)(["'])([^"']+)\2/gi,
    (m, pre, q, src) => {
      const p = normalizePath(src, entryPath);
      const url = p && files[p] ? assetUrl(p, files[p]) : null;
      return url ? pre + q + url + q : m;
    });

  html = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
    (m, attrs, css) => '<style' + attrs + '>' + inlineCss(css, entryPath, files) + '</style>');

  return html;
}
