'use strict';
/* ============================================================================
   BITOS WEB / PREVIEW STORE
   Browser preview persists state in localStorage. The booted OS writes through
   the native settings service instead. Never store secrets outside the preview.
   ========================================================================== */
import { toast } from './ui.js';

export const store = {
  key: 'bitos.ui.v1',
  d: null,
  load() { try { this.d = JSON.parse(localStorage.getItem(this.key)) || null; } catch (e) { this.d = null; } return this.d; },
  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.d)); return true; }
    catch (e) { toast('could not save preferences — check available storage', 'err'); return false; }
  },
  reset() { try { localStorage.removeItem(this.key); } catch (e) { } toast('wiping /var/lib/bitos … goodbye', 'info'); setTimeout(() => location.reload(), 500); },
};
