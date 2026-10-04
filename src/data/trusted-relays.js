'use strict';
/* ============================================================================
   BITOS WEB / CURATED RELAY TRUST LIST
   Relays the client will subscribe to and publish to by default. Read/write
   role selection (NIP-65) narrows this further. Kept here so core stays free of
   data; callers pass the list as `trustedRelays`. Build this from NIP-65
   discovery when relay management ships.
   ========================================================================== */

export const TRUSTED_RELAYS = Object.freeze(['relay.damus.io', 'nos.lol']);

function hostOf(url) {
  return String(url || '').replace(/^wss?:\/\//, '').replace(/\/+$/, '').toLowerCase();
}
export function isTrustedRelay(url) {
  return TRUSTED_RELAYS.includes(hostOf(url));
}
export function trustedRelayHosts() { return TRUSTED_RELAYS.slice(); }
