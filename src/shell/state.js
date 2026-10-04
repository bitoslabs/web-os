'use strict';
/* ============================================================================
   BITOS WEB / SHELL SHARED STATE
   Mutable shell-wide bindings with explicit setters. Exported `let` bindings
   stay live for importers; only this module mutates them.
   ========================================================================== */

export let deskEl = null;
export let mbAppEl = null;
export let sessionStart = 0;

export function setDeskEl(v) { deskEl = v; }
export function setMbAppEl(v) { mbAppEl = v; }
export function startSessionClock() { sessionStart = Date.now(); }
