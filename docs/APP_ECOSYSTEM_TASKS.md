# App ecosystem implementation tasks

Status: planning backlog, checked against `os-web` source on 2026-10-04. No task below is complete unless marked `Done`. This is the execution checklist for the [App Store plan](APP_STORE_PLAN.md), [data model](ECOSYSTEM_DATA_MODEL.md), and [developer guide](APP_DEVELOPER_GUIDE.md).

## Current feature audit

| Capability | Current state | Evidence / gap |
| --- | --- | --- |
| List and search built-in apps | Done | `src/apps.js` imports a fixed list; `src/core/registry.js` stores it; Launchpad and Spotlight read `APPS` |
| Launch and close built-in windows | Done | `src/shell/window-manager.js` opens and closes registered `mount()` functions |
| Pin built-ins in dock and desktop | Done | Static `SHELL_APPS` in `src/shell/launchers.js` |
| List installed third-party apps | Missing | No persisted installation records or runtime hydration |
| Install from local file or catalog | Missing | No package parser, validator, package store, or installer |
| Update, rollback, uninstall | Missing | Registry has no removal/change API; no package lifecycle or app-data policy |
| Manage apps and permissions in UI | Missing | No Store or installed-app management screen |
| Isolate installed code | Missing | Built-in modules execute in the trusted shell page |
| Live Nostr submission/discovery | Missing | `apps/nostr/app.js` is explicitly simulated; no signed listing reader or publisher tooling |
| Booted OS install support | Outside this repo | Requires work in sibling `bitos/os` launcher, broker, and persistent storage |

`make check` currently verifies JavaScript syntax and relative imports. It does not test package integrity, isolation, persistence, or app lifecycle.

## Target user flows

1. **Browse:** Store shows curated apps with publisher, version, permissions, compatibility, and install state. Launchpad and Spotlight show only built-ins and ready installed apps.
2. **Install:** user picks a listing or local package, sees source and permission details, confirms, then gets a ready app in Launchpad. Invalid packages never appear as installed.
3. **Manage:** Installed tab lists built-ins as system managed and third-party apps with open, update, permissions, and uninstall actions. App data deletion is a separate choice.
4. **Update:** Store shows version changes and any new permissions. It preserves the prior working package until the new version launches successfully; failed updates roll back.
5. **Remove:** running windows close, launcher/search entries disappear immediately, code and grants are removed, and app data follows the user's choice.
6. **Submit:** a developer publishes a verifiable package and signed Nostr release/listing; catalog review approves one exact `(publisher, app, version, digest)` tuple.

## Work items

Each task should be a separate reviewable change. Keep the acceptance checks with the task when moving it to an issue tracker.

### Foundation

- [ ] **APP-01 — Freeze package format and identity.** Choose archive type, canonical manifest serialization, hash encoding, size/file/path limits, ID and version rules, and error codes. Specify how local-file imports get a publisher identity or a clearly separate local identity. Update `ECOSYSTEM_DATA_MODEL.md`, starter manifest, and developer guide. **Done when:** a valid sample package and malformed fixtures have deterministic expected results.
- [ ] **APP-02 — Build package validator and pack tool.** Add a tool under `scripts/` and a browser validator module under `src/core/`; enforce archive and file hashes, exact manifest file set, path confinement, compatibility, and resource limits. The same fixtures must pass or fail in both contexts. **Depends on:** APP-01. **Done when:** corrupt bytes, traversal, duplicate paths, symlinks, missing files, unlisted files, oversized packages, and manifest mismatches are rejected.
- [ ] **APP-03 — Persist ecosystem records.** Implement versioned IndexedDB stores for releases, packages, installations, grants, and app data from `ECOSYSTEM_DATA_MODEL.md`. Include migrations, quota errors, and recovery from interrupted writes. **Depends on:** APP-01. **Done when:** records survive reload and a failed staged install leaves the previous ready state intact.
- [ ] **APP-04 — Separate installed-app registry from built-ins.** Keep `registerApp()` for trusted built-ins. Add a registry API that hydrates only ready installations, uses compound publisher/app identity internally, and emits change events. Define a stable launcher key so duplicate app IDs from different publishers do not collide with each other or built-ins. **Depends on:** APP-03. **Done when:** two publishers can install the same app ID, both appear separately, and removal clears the correct entry.

### Runtime and lifecycle

- [ ] **APP-05 — Build isolated frame runtime.** Add a window wrapper for installed apps, local asset loading, restrictive CSP/sandbox policy, and a versioned `postMessage` host API. Verify that the frame cannot read shell DOM/storage or reach `window.__bitosNative`. Do not expose raw native calls. **Depends on:** APP-02, APP-04. **Done when:** the sample app opens and a hostile fixture is denied shell/native access.
- [ ] **APP-06 — Implement local install service.** Add `preview`, `install`, `list`, and `get` operations. Verify before staging, show source and permissions, store the package, then activate the registry entry in one recoverable flow. Support explicit local-file import before network discovery. **Depends on:** APP-02, APP-03, APP-05. **Done when:** a valid sample appears and launches after reload; canceled or invalid installs leave no active app.
- [ ] **APP-07 — Implement update and rollback.** Compare semantic versions and exact digests; reject conflicting bytes for a version. Stage new code while the current version remains usable, close or defer running windows, require new permission decisions, and retain the prior package for rollback. **Depends on:** APP-06. **Done when:** a failed update restores the prior launchable version and its data.
- [ ] **APP-08 — Implement uninstall and data choice.** Stop all app windows, remove package references and grants, clear launch surfaces, and offer keep/delete for private app data. Protect built-ins from uninstall. **Depends on:** APP-06. **Done when:** uninstall survives reload; kept data is available on reinstall of the same app identity; deleting data removes it.
- [ ] **APP-09 — Enforce app permissions and quotas.** Implement scoped `app.storage` and `app.window` methods, grant persistence and revocation, bounded messages, and per-app storage quota. New permissions on update start denied. **Depends on:** APP-05, APP-06. **Done when:** one app cannot read another app's data or invoke an ungranted method, including after reload or revocation.

### Shell and Store experience

- [ ] **APP-10 — Integrate installed apps into shell navigation.** Update `src/shell/launchpad.js`, `search.js`, `window-manager.js`, dock pinning, and desktop icons to use stable installed-app keys and registry change events. Handle unavailable/broken apps and app-specific icons safely. **Depends on:** APP-04, APP-06. **Done when:** install adds an app without a page reload; subsequent update and uninstall events refresh Launchpad/Spotlight; built-ins still work.
- [ ] **APP-11 — Build the built-in Store app.** Add `apps/store/` to `BUILT_IN_APPS`, with Browse, Installed, Updates, and app detail views. Start with a static curated catalog; include local-file import, install progress/errors, app source, publisher, permission review, open, update, uninstall, and app-data choice. **Depends on:** APP-06 through APP-10. **Done when:** all local lifecycle flows are operable by keyboard and pointer without developer tools.
- [ ] **APP-12 — Add catalog ingestion and trust UI.** Authenticate catalog snapshots or responses; approve exact release tuples; show revoked, withdrawn, incompatible, or unknown-publisher states; never auto-install from relay results. **Depends on:** APP-11. **Done when:** changing a package URL or digest outside an approved tuple cannot result in a curated install.

### Nostr and booted OS

- [ ] **APP-13 — Read signed Nostr listings.** Validate NIP-01 event IDs/signatures and Bitos NIP-78 field bounds; resolve app listing to version-specific release; deduplicate relays and quarantine conflicting digests. Keep relay traffic outside installed-app code. **Depends on:** APP-01, APP-12. **Done when:** valid multi-relay listings resolve to one verified release and malformed/conflicting events are rejected.
- [ ] **APP-14 — Build publisher submission tooling.** Package, hash, sign through a trusted signer, publish release and app listing events, report relay acknowledgement, and output addresses for catalog review. Never collect or store a raw publisher secret key in the Store. **Depends on:** APP-02, APP-13. **Done when:** a developer can create a verifiable release from the template and submit its event addresses.
- [ ] **APP-15 — Port installation to booted Bitos OS.** In `bitos/os`, add persistent package/app-data storage, isolated installed-app context in the launcher, and per-app capability enforcement in the broker. Align package validation with `os-web`. **Depends on:** APP-01, APP-05, APP-09. **Done when:** install, launch, reboot, update, and uninstall work in a booted image, and installed code cannot inherit the trusted shell bridge.

## Delivery gates

| Milestone | Required tasks | User-visible result |
| --- | --- | --- |
| M1: local install preview | APP-01–06, APP-09, APP-10 | Install and launch a local package in `os-web` |
| M2: app management | APP-07, APP-08, APP-11 | Installed list, updates, rollback, and uninstall |
| M3: curated ecosystem | APP-12–14 | Browse verified catalog releases and submit through Nostr |
| M4: device install | APP-15 | Same lifecycle on booted Bitos OS |

Before marking a milestone done, run `make check` plus the focused package, persistence, isolation, and lifecycle tests added by those tasks. Validate one complete path with the example app. Record remaining browser-versus-device differences in the release notes.
