# Installable app starter

This is a standalone web app and a **proposed** Bitos package. It runs in a regular browser today; Bitos cannot install it until the App Store runtime exists. See [the developer guide](../../docs/APP_DEVELOPER_GUIDE.md).

Serve this repository with `make serve`, then open `/templates/installable-app/`. Copy this folder for a new app, choose a lowercase kebab-case ID, and replace the name, text, icon, and package metadata. Keep scripts and assets inside the package.

`counter-sample.html` is a dependency-free single-file app that the Store can install and run today in the sandboxed runtime. It calls `window.bitos.ready()`, `window.bitos.storage.*`, and `window.bitos.window.*`; the runtime denies every method unless the matching grant is enabled. The multi-file `index.html` + `app.js` + `style.css` layout packs into one `.bitos-app` and runs the same way: the runtime inlines its stylesheets, scripts, and assets into a single sandboxed document.

Build a package with `make pack SRC=templates/installable-app` (or `node scripts/pack.mjs templates/installable-app`). It reads `app.json`, hashes every listed file, writes `<id>-<version>.bitos-app`, and validates the result first; the placeholder digests are replaced automatically. `README.md` is not listed in `app.json`, so it stays out of the package. The container is specified in [package format](../../docs/PACKAGE_FORMAT.md).
