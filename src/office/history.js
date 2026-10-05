'use strict';
/* ============================================================================
   BITOS OFFICE / HISTORY
   Bounded undo/redo stack over opaque snapshots. Sheets and Slides record a
   snapshot per edit; Docs relies on the browser's native contenteditable undo.
   ========================================================================== */

export function createHistory(limit) {
  const cap = limit || 100;
  let past = [];
  let future = [];
  let current;
  return {
    reset(state) { past = []; future = []; current = state; },
    push(state) {
      if (state === current) return;
      past.push(current);
      if (past.length > cap) past.shift();
      current = state;
      future = [];
    },
    undo() { if (!past.length) return current; future.push(current); current = past.pop(); return current; },
    redo() { if (!future.length) return current; past.push(current); current = future.pop(); return current; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    get state() { return current; },
  };
}
