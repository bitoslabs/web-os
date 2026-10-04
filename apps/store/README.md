# App Store (built-in)

Scope: browse a curated catalog, install from a local descriptor file, and
manage installed apps — permissions, updates, rollback, uninstall, and the
separate app-data choice.

State: the Store writes installation, grant, and app-data records through
`src/core/ecosystem.js` (localStorage, `bitos.apps.v1`). The catalog is the
static snapshot in `src/data/store-catalog.js`. Installed apps appear in
Launchpad and Spotlight via `src/shell/installed-apps.js`.

Runtime: an app whose record has `entryUrl` or inline `content` opens in a
`sandbox="allow-scripts"` iframe (opaque origin) via `src/shell/app-frame.js`,
with a restrictive CSP and a versioned host API. Host calls are checked per
request for source identity, size, method, and a live permission grant.

Host API `v1` (`window.bitos` in the frame):

| Call | Permission | Notes |
| --- | --- | --- |
| `ready()` | — | app identity, API version, per-permission state |
| `storage.get/set/remove/keys/usage/clear` | `app.storage` | private namespace, 64 KiB quota |
| `window.setTitle/resize/close` | `app.window` | validated and clamped by the shell |

**Install from file…** accepts a descriptor JSON or a validated `.bitos-app`
package. Package import runs the v1 validator (`src/core/package.js`), caches
the file set by digest, and the runtime inlines CSS/JS/assets into one
sandboxed document (`src/core/appdoc.js`).

Trust: Browse shows each listing's catalog state — approved, withdrawn,
revoked, unapproved version, or unknown publisher. Only the exact approved
`(publisherKey, appId, version, digest)` tuple installs from the catalog
(`curatedDecision`/`installCurated`); a changed version or digest is refused.
Local files and packages are explicit unverified actions. The snapshot is
signed with Ed25519 and verified via WebCrypto (`src/core/catalog-sign.js`,
`src/data/catalog-signature.js`); an invalid snapshot blocks curated installs.
The accepted snapshot and listings cache in IndexedDB (`src/core/catalog-store.js`)
so the Store renders immediately (and offline) before re-verifying. Per-release
publisher trust is still open.

Release signing: a package may carry an Ed25519 `release` envelope
(`make sign-release FILE=…`). The installer verifies it before activation and
the Installed detail shows **release signed**, or **trusted publisher** when the
signer is listed in `src/data/trusted-keys.js`. Passing `trustedKeys` to the
installer makes an unlisted signer a hard refusal. The map is curated for now;
it is built from Nostr identities later.

Package bytes and install/grant/app-data metadata persist in IndexedDB
(`src/core/idb.js`), hydrated at boot with a migration from the older
localStorage records (which stay as a mirror). An interrupted install/update recovers to the previous version (or shows a
`broken` state that stays removable). Every installed `(version, digest)` is
recorded in the IndexedDB `releases` store and shown as version history on the
Installed detail. Not yet: signed release binding, catalog
approval, and verifying staged bytes against a signed release. Records without a
runtime source show verified identity instead of running code. See
[app ecosystem tasks](../../docs/APP_ECOSYSTEM_TASKS.md) for the remaining work
(APP-03, APP-06, APP-12–15).

## Manual checks

1. Browse **Example Counter**, install it, and open it; the bundled sample runs
   in the sandbox, counts, and survives reload.
2. Toggle a permission on the Installed detail and reload; the grant persists.
3. Revoke `app.storage` while the sample is running; its next storage call is
   denied without a reload.
4. Install a local descriptor with a higher version over an installed app,
   then roll back; both versions stay launchable.
5. Uninstall with **keep data**, reinstall the same identity, and confirm the
   data usage is unchanged. Repeat with **delete data**.
6. Feed a malformed descriptor or package to **install from file…** and confirm
   nothing is installed, an error code is shown, and no stray package is cached.
7. Build the starter with `make pack` and install the `.bitos-app`; it opens in
   the sandbox with its CSS, script, and icon inlined.
8. Open the sample, then update or uninstall; the running window closes first,
   and the uninstall choice keeps or deletes app data.
9. Focus the app list and use ↑/↓/Home/End then Enter to run the primary action.
10. Install two catalog apps, bump a catalog version, and use **update all**.
