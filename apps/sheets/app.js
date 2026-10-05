/* Built-in app: Sheets. Spreadsheet in the Bitos office suite. Cells hold raw
 * input; formulas evaluate through src/office/formula.js. The preview persists
 * workbooks to localStorage; the booted OS keeps them on the user partition. */
import { registerApp, esc, icon, toast, dialog, appStorage } from '../../src/office/host.js';
import { evaluateFormula, colName, newSheet, workbookToXlsx, xlsxToWorkbook, chartSvg, parseRef, bindRibbon, setupOverflow } from '../../src/office/index.js';
import { MANIFESTS } from '../../src/office/manifests.js';

const KEY = 'bitos.ui.sheets.v1';
const store = appStorage('sheets');

function defaultBook() {
  const book = newSheet();
  book.sheets[0].cells = { A1: { v: 'item' }, B1: { v: 'amount' }, A2: { v: 'coffee' }, B2: { v: '3.5' }, A3: { v: 'lunch' }, B3: { v: '12' }, A4: { v: 'total' }, B4: { v: '=SUM(B2:B3)' } };
  return book;
}
function persist(data) { store.save(KEY, data); return true; }
const refAt = (c, r) => colName(c) + (r + 1);

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = String(text == null ? '' : text);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') { q = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function toCSV(rows) {
  return rows.map(r => r.map(v => {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
}

registerApp(MANIFESTS.sheets.id, {
  ...MANIFESTS.sheets,
  mount(body, win) {
    const payload = (win && win.opts && win.opts.file) || null;
    const data = defaultBook();
    let active = Math.min(data.active || 0, data.sheets.length - 1);
    let sel = 'A1', selEnd = 'A1', dragging = false;
    const visiting = new Set();

    body.innerHTML = `<div class="ds">
      <div class="ds-bar ribbon">
        <div class="ribbon-tabs">
          <button class="ribbon-tab on" data-tab="home">Home</button>
          <button class="ribbon-tab" data-tab="insert">Insert</button>
          <button class="ribbon-tab" data-tab="view">View</button>
        </div>
        <div class="ribbon-body">
          <div class="ribbon-panel on" data-panel="home">
            <div class="rgroup"><div class="rgroup-items">
              <button class="rbtn" data-import title="import .xlsx or .csv"><span class="ric">${icon('upload', 17)}</span>import</button>
              <button class="rbtn" data-save title="save .xlsx"><span class="ric">${icon('down', 17)}</span>save</button>
              <button class="rbtn" data-export title="export csv"><span class="ric">${icon('doc', 17)}</span>csv</button>
            </div><div class="rgroup-label">file</div></div>
            <div class="rgroup"><div class="rgroup-items">
              <button class="rbtn sq" data-bold title="bold"><b>B</b></button>
              <button class="rbtn sq" data-clear title="clear cell">${icon('close', 13)}</button>
              <div class="rstack"><select class="rselect" data-numfmt aria-label="number format" title="number format"><option value="general">general</option><option value="number">number</option><option value="currency">currency</option><option value="percent">percent</option></select><span class="rmini">number</span></div>
              <div class="rstack"><select class="rselect" data-fill aria-label="fill colour" title="fill colour"><option value="">no fill</option><option value="FFF2CC">yellow</option><option value="C6EFCE">green</option><option value="FFC7CE">red</option><option value="BDD7EE">blue</option></select><span class="rmini">fill</span></div>
            </div><div class="rgroup-label">cells</div></div>
            <div class="rgroup"><div class="rgroup-items">
              <button class="rbtn" data-sortasc title="sort the selected range ascending by its first column"><span class="ric">${icon('sort', 17)}</span>A-Z</button>
              <button class="rbtn" data-sortdesc title="sort the selected range descending"><span class="ric">${icon('sort', 17)}</span>Z-A</button>
            </div><div class="rgroup-label">sort</div></div>
          </div>
          <div class="ribbon-panel" data-panel="insert">
            <div class="rgroup"><div class="rgroup-items">
              <div class="rstack"><select class="rselect" data-charttype aria-label="chart type"><option value="bar">bar</option><option value="line">line</option><option value="pie">pie</option></select><span class="rmini">type</span></div>
              <button class="rbtn" data-chart title="insert chart"><span class="ric">${icon('act', 17)}</span>chart</button>
            </div><div class="rgroup-label">charts</div></div>
          </div>
          <div class="ribbon-panel" data-panel="view">
            <div class="rgroup"><div class="rgroup-items">
              <div class="rbtn" style="pointer-events:none"><span class="ric" data-chartnum>0</span>charts</div>
              <div class="rbtn" style="pointer-events:none"><span class="ric" data-sheetnum>0</span>sheets</div>
            </div><div class="rgroup-label">workbook</div></div>
          </div>
        </div>
      </div>
      <div class="ds-fx">
        <span class="ds-ref" data-ref>A1</span>
        <span class="ds-eq">fx</span>
        <input class="ds-input" data-fx spellcheck="false" aria-label="formula bar">
      </div>
      <div class="ds-grid" data-grid></div>
      <div class="ds-charts" data-charts hidden></div>
      <div class="ds-tabs" data-tabs></div>
      <div class="statusbar"><span data-name></span><span data-selstat></span><span class="sb-fx"></span><span data-refstat></span><span class="mono-dim">sheets · .xlsx</span></div>
      <input type="file" data-file class="hide" accept=".xlsx,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain">
    </div>`;

    const gridEl = body.querySelector('[data-grid]');
    const tabsEl = body.querySelector('[data-tabs]');
    const fxEl = body.querySelector('[data-fx]');
    const refEl = body.querySelector('[data-ref]');
    const nameEl = body.querySelector('[data-name]');
    const fileEl = body.querySelector('[data-file]');
    const chartsEl = body.querySelector('[data-charts]');
    const refStatEl = body.querySelector('[data-refstat]');
    const numFmtEl = body.querySelector('[data-numfmt]');
    const fillEl = body.querySelector('[data-fill]');
    const sheet = () => data.sheets[active];
    const chartType = () => ((body.querySelector('.ribbon-panel.on [data-charttype]') || body.querySelector('[data-charttype]')) || { value: 'bar' }).value;
    const ribbonEl = body.querySelector('.ribbon');
    bindRibbon(ribbonEl);
    const ribbonOverflow = setupOverflow(ribbonEl);
    for (const s of body.querySelectorAll('[data-charttype]')) {
      s.addEventListener('change', () => { for (const o of body.querySelectorAll('[data-charttype]')) o.value = s.value; });
    }
    numFmtEl.addEventListener('change', () => setMeta(sel, { n: numFmtEl.value === 'general' ? null : numFmtEl.value }));
    fillEl.addEventListener('change', () => setMeta(sel, { bg: fillEl.value || null }));
    const rawAt = r => (sheet().cells[r] && sheet().cells[r].v) || '';

    function rangeRect() {
      const a = parseRef(sel), b = parseRef(selEnd || sel);
      if (!a || !b) { const p = a || b || { col: 0, row: 0 }; return { c0: p.col, c1: p.col, r0: p.row, r1: p.row }; }
      return { c0: Math.min(a.col, b.col), c1: Math.max(a.col, b.col), r0: Math.min(a.row, b.row), r1: Math.max(a.row, b.row) };
    }
    const rangeIsSingle = () => { const r = rangeRect(); return r.c0 === r.c1 && r.r0 === r.r1; };
    const rangeLabel = () => { const r = rangeRect(); return rangeIsSingle() ? sel : `${colName(r.c0)}${r.r0 + 1}:${colName(r.c1)}${r.r1 + 1}`; };
    function selectionStats() {
      const r = rangeRect();
      let count = 0, sum = 0;
      for (let row = r.r0; row <= r.r1; row++) for (let col = r.c0; col <= r.c1; col++) {
        const v = cellValue(refAt(col, row));
        if (v === '' || v == null) continue;
        const n = Number(String(v).replace(/[^0-9.eE+-]/g, ''));
        if (!isNaN(n)) { count++; sum += n; }
      }
      if (!count) return '';
      const f = x => x.toLocaleString('en-US', { maximumFractionDigits: 2 });
      return `sum ${f(sum)} · avg ${f(sum / count)} · count ${count}`;
    }
    function updateSelectionUI() {
      const r = rangeRect();
      const multi = !rangeIsSingle();
      for (const td of gridEl.querySelectorAll('.ds-cell')) {
        const p = parseRef(td.dataset.ref);
        const inR = p.col >= r.c0 && p.col <= r.c1 && p.row >= r.r0 && p.row <= r.r1;
        td.classList.toggle('rng', multi && inR);
        td.classList.toggle('on', td.dataset.ref === sel);
      }
      refEl.textContent = rangeLabel();
      const statEl = body.querySelector('[data-selstat]');
      if (statEl) statEl.textContent = selectionStats();
    }

    function cellValue(ref) {
      const raw = rawAt(ref);
      if (raw === '') return '';
      if (String(raw).charAt(0) === '=') {
        if (visiting.has(ref)) return '#CYCLE!';
        visiting.add(ref);
        const { value, error } = evaluateFormula(raw, cellValue);
        visiting.delete(ref);
        if (error) return error;
        if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
        return value;
      }
      return raw;
    }
    function save() { sheet().updated = Date.now(); data.updated = Date.now(); persist(data); }
    function setMeta(ref, patch) {
      const cell = sheet().cells[ref];
      if (!cell) return;
      for (const k of Object.keys(patch)) {
        const v = patch[k];
        if (v == null || v === '') delete cell[k]; else cell[k] = v;
      }
      save(); renderGrid(); renderCharts();
    }
    function formatValue(v, n) {
      if (v === '' || v == null) return v;
      const num = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.eE+-]/g, ''));
      if (isNaN(num)) return v;
      if (n === 'number') return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (n === 'currency') return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (n === 'percent') return (num * 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) + '%';
      return v;
    }
    function displayAt(ref) {
      const cell = sheet().cells[ref];
      const v = cellValue(ref);
      return cell && cell.n ? formatValue(v, cell.n) : v;
    }
    function setRaw(ref, v) {
      const cells = sheet().cells;
      if (v === '' || v == null) delete cells[ref];
      else cells[ref] = { ...(cells[ref] || {}), v: String(v) };
      save();
    }
    function renderGrid() {
      const cols = sheet().cols || 12, rows = sheet().rows || 40;
      let html = '<table class="ds-table"><thead><tr><th class="ds-corner"></th>';
      for (let c = 0; c < cols; c++) html += `<th data-col="${c}">${colName(c)}</th>`;
      html += '</tr></thead><tbody>';
      for (let r = 0; r < rows; r++) {
        html += `<tr><th class="ds-rowh" data-row="${r}">${r + 1}</th>`;
        for (let c = 0; c < cols; c++) {
          const ref = refAt(c, r);
          const cell = sheet().cells[ref];
          const shown = displayAt(ref);
          const bold = cell && cell.b;
          const bg = cell && cell.bg ? ` style="background:#${cell.bg}"` : '';
          html += `<td class="ds-cell${ref === sel ? ' on' : ''}${bold ? ' b' : ''}" data-ref="${ref}"${bg}><span class="ds-view">${esc(shown)}</span></td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
      gridEl.innerHTML = html;
      fxEl.value = rawAt(sel);
      nameEl.textContent = `${sheet().name} · ${cols}×${rows}`;
      if (refStatEl) refStatEl.textContent = rangeLabel();
      const cell = sheet().cells[sel];
      if (numFmtEl) numFmtEl.value = (cell && cell.n) || 'general';
      if (fillEl) fillEl.value = (cell && cell.bg) || '';
      updateSelectionUI();
    }
    function renderTabs() {
      const sheetNumEl = body.querySelector('[data-sheetnum]');
      if (sheetNumEl) sheetNumEl.textContent = String(data.sheets.length);
      tabsEl.innerHTML = data.sheets.map((s, i) =>
        `<button class="ds-tab${i === active ? ' on' : ''}" data-tab="${i}">${esc(s.name)}</button>`
      ).join('') + '<button class="ds-tab add" data-addtab title="add sheet">+</button>';
    }
    function select(ref) { sel = ref; selEnd = ref; renderGrid(); }

    /* ---- charts ---- */
    function rangeValues(range) {
      const m = /^([A-Za-z]+[0-9]+)\s*:\s*([A-Za-z]+[0-9]+)$/.exec(String(range || '').trim());
      if (!m) return [];
      const a = parseRef(m[1]), b = parseRef(m[2]);
      if (!a || !b) return [];
      const out = [];
      for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) {
        const row = [];
        for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) row.push(cellValue(refAt(c, r)));
        if (!row.some(v => String(v) !== '')) continue;
        const last = String(row[row.length - 1]);
        const n = Number(last.replace(/[^0-9.eE+-]/g, ''));
        out.push({ label: row.length > 1 ? String(row[0]) : String(r + 1), value: isNaN(n) ? 0 : n });
      }
      return out;
    }
    function defaultRange() {
      const refs = Object.keys(sheet().cells || {});
      if (!refs.length) return 'A1:B4';
      let minC = Infinity, minR = Infinity, maxC = 0, maxR = 0;
      for (const ref of refs) {
        const p = parseRef(ref); if (!p) continue;
        minC = Math.min(minC, p.col); minR = Math.min(minR, p.row);
        maxC = Math.max(maxC, p.col); maxR = Math.max(maxR, p.row);
      }
      return `${colName(minC)}${minR + 1}:${colName(maxC)}${maxR + 1}`;
    }
    function renderCharts() {
      const charts = sheet().charts || [];
      const numEl = body.querySelector('[data-chartnum]');
      if (numEl) numEl.textContent = String(charts.length);
      chartsEl.hidden = !charts.length;
      chartsEl.innerHTML = charts.length
        ? `<div class="ds-ch-head lbl">charts</div><div class="ds-ch-row">` + charts.map(c =>
          `<figure class="ds-chart"><div class="ds-ch-svg">${chartSvg({ type: c.type, data: rangeValues(c.range), title: c.range })}</div>` +
          `<figcaption><span class="mono-dim">${esc(c.type)} · ${esc(c.range)}</span>` +
          `<button class="dc-tb" data-delchart="${esc(c.id)}" title="remove chart">${icon('trash', 12)}</button></figcaption></figure>`
        ).join('') + '</div>'
        : '';
    }
    chartsEl.addEventListener('click', e => {
      const b = e.target.closest('[data-delchart]'); if (!b) return;
      sheet().charts = (sheet().charts || []).filter(c => c.id !== b.dataset.delchart);
      save(); renderCharts();
    });
    async function addChart() {
      const range = await dialog({ title: 'chart data range', input: true, value: defaultRange(), placeholder: 'A1:B5', ok: 'chart' });
      if (!range) return;
      if (!/^[A-Za-z]+[0-9]+\s*:\s*[A-Za-z]+[0-9]+$/.test(range.trim())) { toast('range must look like <b>a1:b5</b>', 'err'); return; }
      (sheet().charts || (sheet().charts = [])).push({
        id: 'chart-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        type: chartType(), range: range.trim().toUpperCase(),
      });
      save(); renderCharts();
    }

    function commitFX() {
      const cells = sheet().cells;
      let target = sel;
      if (!cells[target] && fxEl.value === '') return;
      setRaw(target, fxEl.value);
      visiting.clear();
      renderGrid(); renderCharts();
    }

    async function saveXlsx() {
      try {
        const bytes = await workbookToXlsx(data);
        if (payload && typeof payload.save === 'function') await payload.save(bytes);
        else {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
          a.download = (data.title || 'sheet') + '.xlsx';
          document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        }
        toast('saved', 'ok');
      } catch (e) { toast(`save: ${esc(e.message || 'error')}`, 'err'); }
    }
    async function loadPayload() {
      if (!payload || !payload.bytes) return;
      try { adopt(await xlsxToWorkbook(payload.bytes)); toast(`opened <b>${esc(payload.name || 'workbook')}</b>`, 'ok'); }
      catch (e) { toast(`open: ${esc(e.message || 'error')}`, 'err'); }
    }
    function adopt(book) {
      data.title = book.title || data.title;
      data.sheets = book.sheets;
      active = 0; sel = selEnd = 'A1';
      persist(data); visiting.clear(); renderTabs(); renderGrid(); renderCharts();
    }

    function sortRange(dir) {
      const r = rangeRect();
      if (rangeIsSingle()) { toast('select a range to sort', 'info'); return; }
      const rows = [];
      for (let row = r.r0; row <= r.r1; row++) {
        const part = [];
        for (let col = r.c0; col <= r.c1; col++) {
          const ref = refAt(col, row);
          part.push(sheet().cells[ref] ? { ...sheet().cells[ref] } : null);
        }
        rows.push(part);
      }
      const keyOf = row => {
        const v = row[0] ? String(row[0].v == null ? '' : row[0].v) : '';
        const n = Number(v.replace(/[^0-9.eE+-]/g, ''));
        return { v, n: v.trim() !== '' && !isNaN(n) ? n : null };
      };
      rows.sort((a, b) => {
        const ka = keyOf(a), kb = keyOf(b);
        const cmp = (ka.n != null && kb.n != null) ? ka.n - kb.n : ka.v.localeCompare(kb.v);
        return dir < 0 ? -cmp : cmp;
      });
      rows.forEach((row, ri) => row.forEach((cell, ci) => {
        const ref = refAt(r.c0 + ci, r.r0 + ri);
        if (cell) sheet().cells[ref] = cell; else delete sheet().cells[ref];
      }));
      save(); visiting.clear(); renderGrid(); renderCharts();
    }

    body.querySelector('.ds-bar').onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.import != null) fileEl.click();
      else if (b.dataset.save != null) saveXlsx();
      else if (b.dataset.export != null) {
        const cols = sheet().cols || 12, rows = sheet().rows || 40;
        const out = [];
        for (let r = 0; r < rows; r++) { const row = []; for (let c = 0; c < cols; c++) row.push(rawAt(refAt(c, r))); out.push(row); }
        while (out.length && out[out.length - 1].every(v => v === '')) out.pop();
        const blob = new Blob([toCSV(out)], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (data.title || 'sheet') + '.csv';
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        toast('exported csv', 'ok');
      } else if (b.dataset.bold != null) {
        const c = sheet().cells[sel] || (sheet().cells[sel] = {});
        c.b = !c.b; save(); renderGrid();
      } else if (b.dataset.clear != null) {
        setRaw(sel, ''); renderGrid(); renderCharts();
      } else if (b.dataset.chart != null) {
        addChart();
      } else if (b.dataset.sortasc != null) {
        sortRange(1);
      } else if (b.dataset.sortdesc != null) {
        sortRange(-1);
      }
    };
    tabsEl.onclick = e => {
      const b = e.target.closest('.ds-tab'); if (!b) return;
      if (b.dataset.addtab != null) { data.sheets.push({ id: 'sheet-' + Date.now().toString(36), name: 'sheet' + (data.sheets.length + 1), cells: {}, cols: 12, rows: 40, charts: [] }); active = data.sheets.length - 1; persist(data); renderTabs(); renderGrid(); renderCharts(); return; }
      active = +b.dataset.tab; data.active = active; sel = selEnd = 'A1'; persist(data); renderTabs(); renderGrid(); renderCharts();
    };
    tabsEl.oncontextmenu = async e => {
      const b = e.target.closest('.ds-tab'); if (!b || b.dataset.tab == null) return;
      e.preventDefault();
      const i = +b.dataset.tab;
      const nm = await dialog({ title: 'rename sheet', input: true, value: data.sheets[i].name, ok: 'rename' });
      if (nm) { data.sheets[i].name = nm; persist(data); renderTabs(); renderGrid(); }
    };
    const endDrag = () => { dragging = false; };
    gridEl.addEventListener('mousedown', e => {
      const td = e.target.closest('.ds-cell'); if (!td) return;
      dragging = true;
      sel = selEnd = td.dataset.ref;
      renderGrid();
    });
    gridEl.addEventListener('mousemove', e => {
      if (!dragging) return;
      const td = e.target.closest('.ds-cell'); if (!td) return;
      if (td.dataset.ref !== selEnd) {
        selEnd = td.dataset.ref; updateSelectionUI();
        if (refStatEl) refStatEl.textContent = rangeLabel();
      }
    });
    gridEl.addEventListener('mouseleave', endDrag);
    document.addEventListener('mouseup', endDrag);
    gridEl.addEventListener('dblclick', e => {
      const td = e.target.closest('.ds-cell'); if (!td) return;
      const ref = td.dataset.ref;
      const input = document.createElement('input');
      input.className = 'ds-edit';
      input.value = rawAt(ref);
      td.innerHTML = ''; td.append(input); input.focus(); input.select();
      let finished = false;
      const done = commit => {
        if (finished) return;
        finished = true;
        if (commit) { setRaw(ref, input.value); visiting.clear(); }
        sel = selEnd = ref; renderGrid(); renderCharts();
      };
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); done(true); }
        else if (ev.key === 'Escape') { ev.preventDefault(); done(false); }
      });
      input.addEventListener('blur', () => done(true));
    });
    fxEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commitFX(); gridEl.querySelector('.ds-cell.on')?.focus(); }
      else if (e.key === 'Escape') { fxEl.value = rawAt(sel); }
    });
    fxEl.addEventListener('change', commitFX);

    fileEl.onchange = async () => {
      const f = fileEl.files && fileEl.files[0]; if (!f) return;
      try {
        if (/\.xlsx$/i.test(f.name)) {
          adopt(await xlsxToWorkbook(await f.arrayBuffer()));
        } else {
          const rows = parseCSV(await f.text());
          const cells = {};
          rows.forEach((row, r) => row.forEach((v, c) => { if (v !== '') cells[refAt(c, r)] = { v }; }));
          sheet().cells = cells;
          sheet().cols = Math.max(12, ...rows.map(r => r.length));
          sheet().rows = Math.max(40, rows.length);
          persist(data); visiting.clear(); renderGrid(); renderCharts();
        }
        toast(`imported <b>${esc(f.name)}</b>`, 'ok');
      } catch (e) { toast(`import: ${esc(e.message || 'error')}`, 'err'); }
      fileEl.value = '';
    };

    renderTabs(); renderGrid(); renderCharts();
    loadPayload();
    store.load(KEY, null).then(saved => {
      if (payload || !saved || !Array.isArray(saved.sheets) || !saved.sheets.length) return;
      data.title = saved.title || data.title;
      data.sheets = saved.sheets;
      active = Math.min(saved.active || 0, data.sheets.length - 1);
      sel = selEnd = 'A1';
      renderTabs(); renderGrid(); renderCharts();
    });
    return () => { document.removeEventListener('mouseup', endDrag); if (ribbonOverflow) ribbonOverflow(); persist(data); };
  }
});
