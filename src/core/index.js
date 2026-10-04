'use strict';
/* BITOS WEB / CORE BARREL
   Re-exports the dependency-free core so shell modules and apps can import
   from a single path. Core never imports shell or apps, so this barrel is
   acyclic among its own members. */
export * from './dom.js';
export * from './icons.js';
export * from './identity.js';
export * from './ui.js';
export * from './store.js';
export * from './native.js';
export * from './system.js';
export * from './registry.js';
export * from './ecosystem.js';
export * from './package.js';
export * from './appdoc.js';
export * from './catalog-sign.js';
export * from './catalog-store.js';
