'use strict';
/* OS shell module: getting-started progress. Real actions mark steps; 5/5 is
 * earned. Renders the open checklist window when present. */
import { store, toast } from '../core/index.js';
import { WM } from './window-manager.js';

export function mark(k) {
  if (!store.d) return;
  const t = store.d.tour || (store.d.tour = {});
  if (t[k]) return;
  t[k] = true; store.save();
  const n = Object.values(t).length;
  if (n < 5) toast(`getting started · <b>${n}/5</b>`, 'info', { label: 'open', fn: () => WM.open('get-started') });
  else if (!store.d.tourDone) {
    store.d.tourDone = true; store.save();
    toast('<b>5/5</b> — complete. bitos is yours.', 'zap');
  }
  const w = WM.wins.get('get-started'); if (w && w.render) w.render();
}
