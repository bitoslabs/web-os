'use strict';
/* ============================================================================
   BITOS WEB / LOCAL INSTALL SERVICE (APP-06, preview)
   One place for preview -> validate -> cache -> activate -> remove. Accepts a
   descriptor object or a `.bitos-app` package. Package bytes are validated here
   and cached by digest; the signed-release binding and IndexedDB storage are
   later tasks. Keeping this out of the Store means other surfaces can reuse it.
   ========================================================================== */
import { validatePackage } from './package.js';
import { verifyRelease } from './release-sign.js';
import {
  validateDescriptor, install as ecoInstall, uninstall as ecoUninstall,
  putPackage, removePackage, hasPackage, getPackage, getInstall, listInstalls,
} from './ecosystem.js';

function descriptorFromManifest(m, digest, release, trusted) {
  const pk = release && /^[0-9a-f]{64}$/.test(release.publisherKey || '') ? release.publisherKey : 'local';
  return {
    schema: 1, publisherKey: pk, appId: m.id, version: m.version, name: m.name,
    summary: m.description || '', entry: m.entry,
    icon: /^[a-z0-9]{1,16}$/i.test(m.icon || '') ? m.icon : 'grid',
    minBitosApi: m.minBitosApi || 1, permissions: m.permissions || [], packageDigest: digest || '',
    releaseVerified: !!release, releaseTrusted: !!trusted, releaseKey: (release && release.publicKey) || '',
  };
}

export async function previewPackage(pkg) {
  const res = await validatePackage(pkg);
  if (!res.ok) return { ok: false, kind: 'package', errors: res.errors, permissions: [] };
  return {
    ok: true, kind: 'package', errors: [], manifest: res.manifest, digest: res.digest,
    name: res.manifest.name, version: res.manifest.version, permissions: res.manifest.permissions || [],
  };
}

export function previewDescriptor(desc) {
  const v = validateDescriptor(desc);
  if (!v.ok) return { ok: false, kind: 'descriptor', errors: v.errors, permissions: [] };
  return {
    ok: true, kind: 'descriptor', errors: [], manifest: desc, digest: desc.packageDigest || '',
    name: desc.name, version: desc.version, permissions: desc.permissions || [],
  };
}

export function preview(source) {
  return source && typeof source === 'object' && source.format === 'bitos-app'
    ? previewPackage(source)
    : Promise.resolve(previewDescriptor(source));
}

export async function installPackage(pkg, opts) {
  const res = await validatePackage(pkg);
  if (!res.ok) {
    const e = new Error('invalid package — ' + res.errors[0].code + ' ' + res.errors[0].message);
    e.errors = res.errors;
    throw e;
  }
  let release = null, trusted = false;
  if (pkg.release) {
    const vr = await verifyRelease(res.manifest, res.digest, pkg.release, (opts && opts.trustedKeys) || null);
    if (!vr.ok) throw new Error('release signature rejected — ' + (vr.reason || vr.status));
    release = pkg.release;
    trusted = vr.trusted === true;
  }
  putPackage(res.digest, pkg.files, res.manifest);
  try {
    return ecoInstall(descriptorFromManifest(res.manifest, res.digest, release, trusted), { source: (opts && opts.source) || 'local-file' });
  } catch (e) {
    removePackage(res.digest);
    throw e;
  }
}

export function install(source, opts) {
  return source && typeof source === 'object' && source.format === 'bitos-app'
    ? installPackage(source, opts)
    : ecoInstall(source, opts || {});
}

/* ================= catalog trust =================
   Approval is one exact tuple, never an open-ended publisher or URL approval.
   `catalog` is injected so core does not import the data layer. A curated
   install is refused unless the entry's (publisherKey, appId, version, digest)
   matches an approved catalog row. */
export function curatedDecision(entry, catalog) {
  if (!entry || !Array.isArray(catalog)) return { status: 'unknown', approved: false, reason: 'no catalog' };
  const found = catalog.find(e => e.publisherKey === entry.publisherKey && e.appId === entry.appId);
  if (!found) return { status: 'unknown', approved: false, reason: 'publisher or app is not in the catalog' };
  const status = (found.catalog && found.catalog.status) || 'approved';
  const sameTuple = found.version === entry.version && (found.digest || '') === (entry.digest || '');
  if (status === 'approved' && sameTuple) return { status: 'approved', approved: true, reason: '' };
  if (status === 'approved') return { status: 'unapproved', approved: false, reason: 'version or digest is not the approved tuple' };
  return { status, approved: false, reason: 'catalog status: ' + status };
}

export function installCurated(entry, catalog, opts) {
  const decision = curatedDecision(entry, catalog);
  if (!decision.approved) {
    const e = new Error('not an approved catalog release — ' + (decision.reason || decision.status));
    e.decision = decision;
    throw e;
  }
  return ecoInstall(entry, { source: (opts && opts.source) || 'catalog' });
}

export { getInstall, listInstalls, hasPackage, getPackage };
export const remove = ecoUninstall;
