'use strict';
/* ============================================================================
   BITOS WEB / TRUSTED PUBLISHER KEYS
   Maps a publisher identity to the Ed25519 public keys allowed to sign its
   releases. Empty by default: integrity-only verification still runs, but no
   signer is treated as trusted until registered here. In production this map is
   built from Nostr identity bindings (APP-13) rather than shipped by hand.
   ========================================================================== */

export const TRUSTED_KEYS = Object.freeze({
  // 'f2e240b54df3d0fe3ff9e6c520a54b2d260a63b5eb94e227217276ab1a6c67e6': ['<base64 ed25519 public key>'],
});

export function isTrustedSigner(publisherKey, publicKey) {
  const list = TRUSTED_KEYS[publisherKey];
  return Array.isArray(list) && list.includes(publicKey);
}
