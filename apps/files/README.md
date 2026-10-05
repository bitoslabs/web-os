# Files

Finder-style manager for the user's Home, Documents, Downloads, Pictures, Trash, and mounted removable storage. `app.js` owns both the preview storage adapter and Files window. The native adapter uses scoped file methods for list, read, write, move, copy, and delete. Never resolve arbitrary native paths in JavaScript. See GUI-02 in `docs/GUI_APPS.md`.

Opening a file is dispatched by type: `resolveOpener(name, mime, 'files')` (`src/core/registry.js`) returns the first registered app whose `opens` glob patterns match. Images go to `image-viewer` (object URL), text and code go to `text-editor` with a `save` callback that writes back through `fs.*`, and text with no app falls back to the inline editor; binary with no app shows a "save a copy" hint. Each opener receives the file as `win.opts.file`.

Finder-style manager with a unified window toolbar (`unified:true`): no centered title, with back/forward/up, breadcrumb, an icon view switcher (grid / list / columns / large icons), a sort dropdown (name / size / date / type + descending), upload, new window, refresh, and search rendered into `win.tools`. The window also supports multiple tabs and multiple windows (`WM.open('files',{key,title})`). Files are managed from the right-click context menu (`openContextMenu`) only: items offer open, save a copy, encrypt & upload or restore from cloud, rename, and delete, while the folder background offers new folder, new file, upload file, refresh, and open in new window. Renaming is inline in the list/grid; create, upload, and delete go through the shared `dialog()` modal.

## Upload

Files and folders created by the toolbar upload button and by drag-and-drop onto the window (`<input type=file multiple>` and a drop zone). The browser adapter stores bytes in the IndexedDB `files` store and a size/mime marker in the localStorage tree, so localStorage stays small and text-only; the native adapter uses `fs.readBytes`/`fs.writeBytes` with base64 on the bridge. Names that already exist are suffixed ` 2`, ` 3`, … so an upload never silently overwrites.

## Encrypt to server (Blossom)

`encrypt & upload` on a file asks for a passphrase, encrypts the bytes on-device with a fresh AES-256-GCM key, wraps that key with a PBKDF2-derived KEK, and uploads only the ciphertext to a Blossom server (BUD-02/11, authorized by a Schnorr-signed `kind:24242` token). The passphrase is never stored or sent. A `<name>.cloud.json` sidecar manifest records the ciphertext `sha256`, server list, wrapped key, and KDF salt; `restore from cloud` reads it, fetches and re-hashes the ciphertext, then decrypts. Core modules: `src/core/crypt.js`, `src/core/blob.js`, `src/core/cloudfile.js`.

The preview uses a local simulated Blossom store (same content-addressing, IndexedDB-backed) until a server is configured in localStorage `bitos.ui.blossom.v1` as `{ "server": "https://…", "seckey": "<64-hex>" }`; a signing key is generated and persisted on first use. The curated server list is `src/data/trusted-blossom.js` and ships empty. Publishing the manifest as a NIP-94 `kind:1063` event over relays is follow-up work.
