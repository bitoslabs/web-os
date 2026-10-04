# Build an app for Bitos

Status: developer proposal. Built-in apps run now. A preview Store manages install, update, rollback, and uninstall records and runs a single-document app in a sandboxed iframe with a versioned host API (`src/shell/app-frame.js`); it does not download signed package bytes or load multi-file packages, and Nostr publishing tools are planned in [App Store plan](APP_STORE_PLAN.md). This guide gives developers a target without implying that the full installer works.

## Choose an app type

| Type | Who uses it | Entry point | Runtime today |
| --- | --- | --- | --- |
| Built-in program | Bitos maintainers and trusted contributors | `apps/<id>/app.js` calls `registerApp()` | Working in `os-web` |
| Installable app | Independent developers and Store publishers | Packaged `index.html` plus `app.json` | Packed and validated by `make pack`; runs in the sandboxed runtime with files inlined |

Built-in apps share shell code and can use internal modules. Installable apps are ordinary offline web apps in isolated windows. They must not import `src/core`, call `registerApp()`, depend on shell CSS, or access `window.__bitosNative`. The Store itself will be built in.

## Start an installable app

1. Copy [the starter](../templates/installable-app/README.md) to a new folder and choose a lowercase kebab-case app ID.
2. Edit `app.json` with a unique ID, name, semantic version, entry page, icon, minimum API version, and the smallest set of permissions needed. The example requests none.
3. Build the interface with local HTML, CSS, JS, and assets. Use relative paths. Avoid CDN scripts, remote fonts, external imports, and inline event handlers. The initial package policy aims for offline operation.
4. Run `make serve` from the repo root and open `http://127.0.0.1:8000/templates/installable-app/` to preview the untouched starter. For a copied folder, serve and open that folder instead.
5. Check keyboard access, readable contrast, narrow window layout, startup without network, and clean behavior after reload. Test errors and empty states for real apps.
6. Build the package with `make pack SRC=<app-folder>` (or `node scripts/pack.mjs <app-folder>`). The tool reads `app.json`, hashes every listed file, writes `<id>-<version>.bitos-app`, and validates the result before writing. The placeholder digests in the starter are replaced automatically. Optionally sign it with `make sign-release FILE=<id>-<version>.bitos-app`, which embeds an Ed25519 `release` envelope without changing the payload digest. Validate fixtures with `make check-package`.

7. Optionally publish a listing: `make list-release FILE=<id>-<version>.bitos-app KEY=<64-hex nostr secret>` builds and BIP-340-signs a NIP-89 listing event and prints it for a relay. The secret key stays in the process.

The [package format](PACKAGE_FORMAT.md) is frozen for v1 (canonical JSON container, SHA-256 per file and per package). Relay trust policy and broadcasting are still open (APP-13/14).

## Manifest and identity

The proposed manifest fields are shown in [the starter manifest](../templates/installable-app/app.json); the [ecosystem data model](ECOSYSTEM_DATA_MODEL.md) defines records and identity keys. The archive and manifest encoding remain open design decisions. Treat `(Nostr publisher public key, app ID)` as the permanent identity. Use a new version for any changed package bytes; never replace a released archive at the same URL. Display names can change without changing identity.

Permission names and host message methods are still provisional. The first runtime targets private quota-limited storage and window controls. Do not build against an undocumented `postMessage` shape. A future SDK will expose the versioned message API and reject calls for ungranted capabilities. Keep user data separate from app code so updates and uninstall can preserve data when chosen.

## Prepare a Store submission

1. Test the final package and record its SHA-256 digest and size. Upload immutable package bytes to an HTTPS URL.
2. Sign a version-specific release and an app listing with the publisher Nostr key. Both use [NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md) `kind:30078`: `d = bitos.release.<app-id>.<version>` holds URL, digest, compatibility, and permissions; `d = bitos.app.<app-id>` holds display metadata and points to that release. A [NIP-94](https://github.com/nostr-protocol/nips/blob/master/94.md) file event may also describe the package.
3. Publish the listing to configured relays and send its event address to the Bitos curated catalog for review. A relay accepting an event does not mean the Store approved it.
4. Keep the signing key outside the app package and build artifacts. Store clients verify the event signature, catalog approval, archive digest, manifest, and file hashes before install.

There is no live submission endpoint or production signing flow in this repository yet. The existing `apps/nostr/` program is a simulated preview.

## Release and support expectations

- Publish a clear description, screenshots, version notes, support contact, and privacy information for data the app handles.
- Declare permissions accurately and explain why each is needed. Updates that add permissions should require a new user decision.
- Keep older releases available for rollback, and publish a new version to correct a bad release.
- Plan migration of app-owned data between versions. Uninstall should let users choose whether to delete that data.
- Provide a way to report security issues and revoke or withdraw a compromised release. Catalog policy and mechanics are still to be defined.

## Built-in contributors

For a trusted program shipped with the shell, use [the built-in template](../apps/_template/README.md), add the ID to `BUILT_IN_APPS` in `src/apps.js`, and run `make check`. Built-in code is reviewed as part of the OS itself and is not submitted to the Store.
