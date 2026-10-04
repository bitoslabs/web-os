# App template

Copy this folder to `apps/<app-id>/`, rename `app.js.example` to `app.js`, and update the ID and metadata. Add the folder ID to the `BUILT_IN_APPS` list in `ui/apps.js` so the preview loads it before `ui/bootstrap.js`, and optionally add it to `SHELL_APPS` in `ui/shell/launchers.js` to pin it in the dock. Keep app data out of the source folder; use a scoped native service or preview adapter.
