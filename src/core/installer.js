'use strict';
/* ============================================================================
   BITOS WEB / LOCAL INSTALL SERVICE (APP-06, preview)
   One place for preview -> validate -> cache -> activate -> remove. Accepts a
   descriptor object or a `.bitos-app` package. Package bytes are validated here
   and cached by digest; the signed-release binding and IndexedDB storage are
   later tasks. Keeping this out of the Store means other surfaces can reuse it.
   ========================================================================== */
import { validatePackage } from './package.js';
import {
  validateDescriptor, install as ecoInstall, uninstall as ecoUninstall,
  putPackage, removePackage, hasPackage, getPackage, getInstall, listInstalls,
} from './ecosystem.js';

function descriptorFromManifest(m, digest) {
  return {
    schema: 1, publisherKey: 'local', appId: m.id, version: m.version, name: m.name,
    summary: m.description || '', entry: m.entry,
    icon: /^[a-z0-9]{1,16}$/i.test(m.icon || '') ? m.icon : 'grid',
    minBitosApi: m.minBitosApi || 1, permissions: m.permissions || [], packageDigest: digest || '',
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
  putPackage(res.digest, pkg.files, res.manifest);
  try {
    return ecoInstall(descriptorFromManifest(res.manifest, res.digest), { source: (opts && opts.source) || 'local-file' });
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

export { getInstall, listInstalls, hasPackage, getPackage };
export const remove = ecoUninstall;
