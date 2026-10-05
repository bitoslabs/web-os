'use strict';
/* ============================================================================
   BITOS OFFICE / PUBLISHER
   Publisher identity and per-publisher capability caps. First-party apps are
   trusted and can request larger package/data budgets than third-party installs
   (the ecosystem defaults live in src/core/ecosystem.js). A future signed
   release would verify this key against the trust store; here it is metadata.
   ========================================================================== */

export const FIRST_PARTY_KEY = 'bitos';

export const PUBLISHER = Object.freeze({ key: FIRST_PARTY_KEY, name: 'Bitos', trusted: true });

export function isFirstParty(key) { return key === FIRST_PARTY_KEY || key === 'local'; }

export const CAPS = Object.freeze({
  default: Object.freeze({ packageMax: 600 * 1024, dataQuota: 64 * 1024, contentMax: 256 * 1024 }),
  firstParty: Object.freeze({ packageMax: 8 * 1024 * 1024, dataQuota: 16 * 1024 * 1024, contentMax: 4 * 1024 * 1024 }),
});

export function capsFor(key) { return isFirstParty(key) ? CAPS.firstParty : CAPS.default; }
