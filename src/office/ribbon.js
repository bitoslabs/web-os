'use strict';
/* ============================================================================
   BITOS OFFICE / RIBBON
   Office-style tabbed ribbon: wires tab buttons to panels. Markup convention:
     .ribbon > .ribbon-tabs > .ribbon-tab[data-tab]
              > .ribbon-body > .ribbon-panel[data-panel]
   The active tab/panel carry `.on`. Apps keep their own action attributes on
   the buttons; this only handles switching.
   ========================================================================== */

export function bindRibbon(root) {
  if (!root) return;
  const tabs = [...root.querySelectorAll('.ribbon-tab')];
  const panels = [...root.querySelectorAll('.ribbon-panel')];
  const activate = id => {
    for (const t of tabs) t.classList.toggle('on', t.dataset.tab === id);
    for (const p of panels) p.classList.toggle('on', p.dataset.panel === id);
    root.setAttribute('data-tab', id);
  };
  const bar = root.querySelector('.ribbon-tabs');
  if (bar) bar.addEventListener('click', e => {
    const t = e.target.closest('.ribbon-tab');
    if (t) activate(t.dataset.tab);
  });
  const current = tabs.find(t => t.classList.contains('on')) || tabs[0];
  if (current) activate(current.dataset.tab);
}

/* Collapse groups that do not fit into a "…" popup, Office-style. Groups are
   moved between the panel and the popup (not cloned) so control listeners and
   native selects/inputs keep working. */
export function setupOverflow(root) {
  if (!root) return;
  const body = root.querySelector('.ribbon-body');
  if (!body) return;
  const panels = [...root.querySelectorAll('.ribbon-panel')];
  for (const panel of panels) for (const g of panel.querySelectorAll(':scope > .rgroup')) g.__panel = panel;

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'ribbon-more';
  more.title = 'more controls';
  more.setAttribute('aria-label', 'more controls');
  more.setAttribute('aria-haspopup', 'true');
  more.textContent = '…';
  more.hidden = true;
  const pop = document.createElement('div');
  pop.className = 'ribbon-pop';
  pop.hidden = true;
  root.append(more, pop);

  const activePanel = () => root.querySelector('.ribbon-panel.on') || panels[0];
  function layout() {
    for (const g of [...pop.children]) g.__panel.append(g); // restore
    pop.hidden = true; more.hidden = true;
    const panel = activePanel();
    if (!panel) return;
    const avail = body.clientWidth - 8;
    let used = 0;
    const overflow = [];
    for (const g of panel.querySelectorAll(':scope > .rgroup')) {
      const w = g.offsetWidth;
      if (overflow.length || used + w > avail - 34) overflow.push(g);
      else used += w;
    }
    if (overflow.length) {
      more.hidden = false;
      for (const g of overflow) pop.append(g);
    }
  }
  more.addEventListener('click', e => { e.stopPropagation(); pop.hidden = !pop.hidden; });
  const onDoc = e => { if (!pop.hidden && !pop.contains(e.target) && e.target !== more) pop.hidden = true; };
  document.addEventListener('pointerdown', onDoc, true);
  const bar = root.querySelector('.ribbon-tabs');
  const onTab = () => setTimeout(layout, 0);
  if (bar) bar.addEventListener('click', onTab);
  let t = null;
  const onResize = () => { clearTimeout(t); t = setTimeout(() => { pop.hidden = true; layout(); }, 80); };
  window.addEventListener('resize', onResize);
  setTimeout(layout, 0);
  return function destroy() {
    document.removeEventListener('pointerdown', onDoc, true);
    window.removeEventListener('resize', onResize);
    if (bar) bar.removeEventListener('click', onTab);
  };
}
