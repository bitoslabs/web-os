# App Store and Nostr app submissions

Status: architecture plan. A preview Store, app-management layer, package format v1 (`src/core/package.js`, `scripts/pack.mjs`), and a sandboxed runtime that inlines validated packages (`src/core/appdoc.js`, `src/shell/app-frame.js`) exist. The catalog snapshot is Ed25519-signed and verified (exact-tuple approval); signed per-release binding, IndexedDB catalog/listings stores, and live Nostr publishing are not implemented.

For a developer-facing walkthrough and sample app, see the [developer guide](APP_DEVELOPER_GUIDE.md) and [installable app template](../templates/installable-app/README.md). The [ecosystem data model](ECOSYSTEM_DATA_MODEL.md) defines identities, release records, catalog decisions, and local storage.
The [implementation tasks](APP_ECOSYSTEM_TASKS.md) track current feature gaps and acceptance checks.

## Decision

Keep the current ES-module registry for trusted built-in apps. Installable apps use a separate package format and run in isolated frames managed by the desktop. Use Nostr for signed app listings and submissions; host the package bytes at HTTPS URLs and verify their hashes before installation. The first release should support a curated publisher list and manual package import, then add broader discovery.

This applies first to `os-web`. The booted `bitos/os` needs its own package storage, launcher isolation, and broker policy before it can install the same packages.

## Why the existing loader cannot install third-party JS

`src/apps.js` imports built-ins directly, and `registerApp()` stores a `mount()` function in the shared page. Code loaded this way can reach shell state, browser storage, and any bridge visible to the shell. Installed code therefore must not be imported into the shell or call `registerApp()` directly. The shell registers a trusted wrapper that creates an isolated app frame instead.

## Package contract, version 1

An installable package is a size-limited archive containing `app.json`, `index.html`, scripts, styles, and assets. Paths must be relative, normalized, unique, and confined to the archive. Reject symlinks, executable/native payloads, external imports, unlisted files, and archives that exceed compressed or expanded size limits. The installer validates the manifest before writing any app data.

```json
{
  "schema": 1,
  "id": "example-notes",
  "version": "1.0.0",
  "name": "Example Notes",
  "entry": "index.html",
  "icon": "icon.png",
  "minBitosApi": 1,
  "permissions": [],
  "files": {
    "index.html": "sha256-...",
    "app.js": "sha256-...",
    "icon.png": "sha256-..."
  }
}
```

The exact canonical manifest encoding and archive format must be fixed before publishing packages. App identity is the pair `(publisher public key, app ID)`, not the display name or app ID alone. A version must resolve to one package digest. Changing bytes requires a new version.

## Runtime and permissions

- Open each installed app inside a sandboxed frame with scripts enabled and without same-origin access to the shell. Apply a restrictive content security policy to package content. A frame may request only versioned, typed host methods through `postMessage`; validate the frame source, app identity, request size, method, and granted permissions on every call.
- Start with `app.storage` (private, quota-limited) and `app.window` (title, size, close) only. Add explicit file picker, clipboard, or network permissions later with visible prompts and persistent grants. Never forward raw `window.__bitosNative` or arbitrary `native.call()` methods.
- On the booted OS, the launcher and broker must independently enforce app identity and capability policy. An iframe alone is insufficient as a native security boundary. Keep installed content out of the trusted shell bridge context.
- Close running windows before update or removal. Keep the previous verified package until a new version starts successfully; rollback on failure. Uninstall removes code and grants, and asks separately whether to delete app data.

## Nostr listing format and submission

Use [NIP-78 `kind:30078`](https://github.com/nostr-protocol/nips/blob/master/78.md) for Bitos-specific, addressable events. The publisher signs a version-specific release event with `d = bitos.release.<app-id>.<version>` and an app listing with `d = bitos.app.<app-id>` that points to the recommended release. The release holds the package URL, SHA-256, version, compatibility, and permissions. Include the verified publisher public key in the displayed identity. [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) makes the `(kind, pubkey, d)` tuple addressable; newer listings can replace older ones on relays. See the [data model](ECOSYSTEM_DATA_MODEL.md) for conflict handling and local records.

Optionally publish a [NIP-94 `kind:1063` file metadata event](https://github.com/nostr-protocol/nips/blob/master/94.md) for the package URL, MIME type, size, and SHA-256 digest. The listing can reference that event. Nostr events provide discovery and publisher signatures; they do not host package bytes or make code safe. Installation must download over HTTPS, compare the package digest to the signed listing, verify every file against the manifest, and show the publisher and permissions before committing.

Publisher flow:

1. Build and validate the package locally. Compute its SHA-256 digest and upload the immutable archive to an HTTPS host.
2. Create the NIP-94 file event if desired. Sign the NIP-78 release event and app listing with the publisher's Nostr key using a trusted signer. Never send the secret key to the Store or package build service.
3. Publish to several configured relays. Treat relay acknowledgements as delivery evidence, not approval.
4. Submit the app listing and release event addresses to the Bitos curated catalog. Review the package, publisher, permissions, and metadata. Record the approved `(publisher, app ID, version, digest)` in the catalog.
5. Store clients fetch listings from the approved publisher/catalog set, validate Nostr signatures and field bounds, then display available versions. They never auto-install a new listing merely because a relay returned it.

For user-submitted apps outside the curated catalog, provide an explicit “Install from Nostr address” flow with the same validation and a clear unknown-publisher label. Keep relay URLs configurable; show when a listing is unavailable or stale. A publisher key rotation requires a separately reviewed migration, because a different public key is a different app identity.

## Implementation order

| Phase | Deliverable | Acceptance check |
| --- | --- | --- |
| 1 | Package schema, validator, local import, IndexedDB package storage | Reject malformed paths, missing files, hash mismatches, oversized archives, and duplicate identities |
| 2 | Isolated app frame, message API, installed-app registry, Launchpad/search integration | App opens without access to shell storage or native bridge; permissions are denied by default |
| 3 | Store UI with installed/update/remove views and a static curated catalog | Install, rollback, and uninstall survive reload; app data deletion is a separate choice |
| 4 | Nostr listing reader, signature validation, and publisher submission tooling | Signed listings resolve to the exact verified package; unapproved listings cannot enter curated results |
| 5 | Booted OS installer, storage, launcher isolation, and broker policy | The same package runs with per-app identity and enforced capabilities after reboot |

## Code locations

For `os-web`, add package validation and persistence under `src/core/`, installed-app loading under `src/apps.js`, the isolated frame wrapper under `src/shell/`, and the Store UI under `apps/store/`. Keep the Store itself built in. Add Nostr listing and catalog code separately from the existing simulated `apps/nostr/` feed. In `bitos/os`, mirror the package contract and implement native installation and isolation in the launcher/broker before enabling real installs.

## Open design choices

- Select a fixed archive format, canonical manifest encoding, and package size limits.
- Choose whether package network access is fully denied initially or routed through a scoped host API.
- Define catalog governance, review criteria, and how users report or revoke a malicious listing.
- Decide which Nostr signing options the publisher tool supports. The current Nostr preview uses simulated keys and cannot publish real listings.
