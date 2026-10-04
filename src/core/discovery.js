'use strict';
/* ============================================================================
   BITOS WEB / LISTING DISCOVERY MERGE
   Combine discovered listing candidates into the Store's view. Candidates are
   keyed by publisher/app so a newer report replaces an older one; nothing here
   trusts a candidate — status comes from the verifier that produced it.
   ========================================================================== */
import { deriveTrustBindings } from './trust-registry.js';

export function listingKey(c) {
  const d = (c && c.descriptor) || {};
  return d.publisherKey + '/' + d.appId;
}

export function mergeCandidates(existing, incoming) {
  const out = new Map((existing || []).map(c => [listingKey(c), c]));
  for (const c of incoming || []) {
    if (!c || !c.descriptor || !c.descriptor.appId) continue;
    out.set(listingKey(c), c);
  }
  return [...out.values()];
}

export function verifiedBindings(candidates) { return deriveTrustBindings(candidates); }
