# App template

Copy this folder to `apps/<app-id>/` and update the ID and metadata in `app.js`. Add the folder ID to the `BUILT_IN_APPS` list in `src/apps.js` so the preview loads it before `src/main.js` starts boot, and optionally add it to `SHELL_APPS` in `src/shell/launchers.js` to pin it in the dock. Keep app data out of the source folder; use a scoped native service or preview adapter.
