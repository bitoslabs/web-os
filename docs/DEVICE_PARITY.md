# Device parity handoff (APP-15)

Status: handoff spec. `os-web` implements the app ecosystem in the browser. This
document is the checklist for mirroring it in the booted OS (`bitos/os`) so an
install behaves the same on both. It is the only APP-15 deliverable `os-web` can
produce; the OS work lives in the sibling repository.

## 1. Formats to keep byte-identical

- **Package v1** — [PACKAGE_FORMAT.md](PACKAGE_FORMAT.md). Canonical JSON
  container, `{format,version,manifest,files}`, per-file `sha256-<hex>`, payload
  digest over the canonical payload (excludes the `release` envelope), optional
  Ed25519 `release` envelope. `os-web`'s `src/core/package.js` and
  `scripts/pack.mjs` are the reference implementation.
- **Listing event** — NIP-89-style kind `31990`, `d`=appId, `version` tag, JSON
  content with `appId/version/digest/name/permissions/minBitosApi/releaseKey`.
  Event id is the NIP-01 hash; signature is BIP-340. See `src/core/nostr-event.js`.
- **Release manifest** — canonical
  `{schema,publisherKey,appId,version,digest,permissions,minBitosApi}`, Ed25519
  signed. See `src/core/release-sign.js`.
- **Catalog snapshot** — canonical `{meta,entries}`, Ed25519 signed. See
  `src/core/catalog-sign.js` and `src/data/catalog-signature.js`.

## 2. Persistent state to mirror

`os-web` uses IndexedDB DB `bitos-apps` (version 4) with these stores, plus a
localStorage mirror `bitos.apps.v1` for migration/fallback. `os` should use a
single versioned store (SQLite or equivalent) with the same logical records and
keep the localStorage/IDB split only if it also ships a web shell.

| Store | Key | Value |
| --- | --- | --- |
| `installs` | stable key `publisherKey/appId` | install record (see §3) |
| `grants` | stable key | `{ permission: { granted, at } }` |
| `appData` | stable key | private app namespace object (64 KiB quota) |
| `packages` | package digest | `{ files, manifest, at }` |
| `releases` | `key@version#digest` | `{ key, version, digest, source, permissions, at }` |
| `listings` | `snapshot/publisherKey/appId` | `{ snapshot, publisherKey, appId, version, digest, status }` |
| `catalog` | `current` | `{ meta, verification, at, count }` |
| `trust` | publisherKey | `[ed25519 release keys]` |

`os-web`'s `src/core/idb.js` and `src/core/ecosystem.js` are the reference.
Metadata is currently localStorage in the browser; `os` should not depend on
that and must treat the records above as the source of truth.

## 3. Install record fields

`publisherKey, appId, name, version, installedVersion, installedDigest,
previousVersion, previousDigest, permissions[], minBitosApi, source, entry,
entryUrl, content, packageUrl, packageDigest, releaseVerified, releaseTrusted,
releaseKey, pinned, state (installing|updating|ready|broken), installedAt,
updatedAt`. `state !== 'ready'` installs never launch and must stay removable.
On startup, recover interrupted writes: an interrupted update rolls back to the
previous version; an interrupted fresh install becomes `broken`.

## 4. Host API to reproduce (v1)

An installed app runs isolated (`sandbox="allow-scripts"`, opaque origin, CSP
`default-src 'none'`) and talks only over `postMessage`. The host validates the
frame source, request size, method, and a **live** grant on every call.

| Method | Permission | Notes |
| --- | --- | --- |
| `app.ready` | — | app identity, API version, per-permission state |
| `app.storage.get/set/remove/keys/usage/clear` | `app.storage` | 64 KiB quota |
| `app.window.setTitle/resize/close` | `app.window` | validated + clamped |

Reference: `src/shell/app-frame.js`. Never expose a raw native bridge to the
frame. On `os`, the isolation boundary is the OS sandbox/process, not an iframe,
but the message contract and per-call grant checks must match.

## 5. Trust and verification rules

1. **Curated catalog**: an install is allowed only when the entry's exact
   `(publisherKey, appId, version, digest)` matches an approved snapshot row
   (`curatedDecision`/`installCurated`). Withdrawn/revoked/unapproved/unknown
   are blocked; an invalid snapshot signature blocks all curated installs.
2. **Release envelope**: if present, Ed25519 must verify before activation; a
   bad signature refuses the install. When a trust registry is supplied, an
   unlisted signer is refused.
3. **Publishing**: listings must be BIP-340 valid; only verified listings feed
   the publisher→signer trust map. Never auto-install from relay results.
4. **Relays**: NIP-65 read/write roles, curated trust list, multi-relay quorum.

## 6. Parity checklist

- [ ] Package parser/validator matches v1 error codes and limits.
- [ ] Pack tool produces byte-identical digests for the same input.
- [ ] Install/update/rollback/uninstall with staged writes and recovery.
- [ ] Permissions default-deny, revocable live, enforce per host-API call.
- [ ] App data is per-app, quota-limited, and survives reinstall when kept.
- [ ] Package bytes and records survive reboot; interrupted writes recover.
- [ ] Built-ins are system-managed and cannot be uninstalled.
- [ ] Launchpad/Spotlight/dock/desktop reflect install/update/uninstall live.
- [ ] Curated + Nostr trust rules reproduced; no auto-install.
- [ ] Host API v1 contract identical; no raw native access to app code.

## 7. Known gaps carried over

- `src/core/schnorr.js` is a preview, **unaudited** BIP-340 implementation
  (passes the official vectors). Replace with a vetted library before device
  release.
- The browser runs apps in an iframe; the OS must use its native sandbox. The
  message contract is the portability boundary.
- Relay-management UI and NIP-65 peer discovery are not yet built.
