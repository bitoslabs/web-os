'use strict';
/* ============================================================================
   BITOS WEB / CURATED BLOSSOM SERVER LIST
   Blossom (BUD-02) media servers the client will upload encrypted blobs to by
   default. Kept here so core stays free of data; callers pass the list as
   `servers`. Empty until a reviewed list ships — with no server configured the
   Files app falls back to the local simulated store. Build this from each
   identity's NIP-B7 `kind:10063` server list once relay discovery ships.
   ========================================================================== */

export const TRUSTED_BLOSSOM = Object.freeze([]);

function hostOf(url) {
  return String(url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
}
export function isTrustedBlossomServer(url) {
  const h = hostOf(url);
  return TRUSTED_BLOSSOM.some(s => hostOf(s) === h);
}
export function trustedBlossomServers() { return TRUSTED_BLOSSOM.slice(); }
