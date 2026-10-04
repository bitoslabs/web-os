# Installable app starter

This is a standalone web app and a **proposed** Bitos package. It runs in a regular browser today; Bitos cannot install it until the App Store runtime exists. See [the developer guide](../../docs/APP_DEVELOPER_GUIDE.md).

Serve this repository with `make serve`, then open `/templates/installable-app/`. Copy this folder for a new app, choose a lowercase kebab-case ID, and replace the name, text, icon, and package metadata. Keep scripts and assets inside the package.

Before packaging, replace each `sha256-REPLACE_WITH_HEX_DIGEST` in `app.json` with `sha256-` followed by the 64-character lowercase hex SHA-256 of that file. Do not include `README.md` in the archive. The package format and installer are still being designed, so this example is a development template rather than a publishable package.
