# Built-in programs

Each built-in program has one source folder. Functional preview apps call `registerApp()` from their folder's `app.js`; planned apps currently contain a README only. OS boot, setup, and desktop behavior stay under `ui/`.

```text
apps/
  files/          File manager (Finder-style)
  settings/       Device and user settings
  screenshots/    Screen capture UI and save flow
  notes/          Quick notes with autosave
  text-editor/    Plain-text file editing
  image-viewer/   Local image viewing
  browser/        Web browsing without native privilege
  calculator/     Offline calculator
  system-monitor/ CPU, memory, processes, disk, and network
  terminal/       Safe preview shell; native terminal policy comes later
```

## Current app folder contract

When implemented, each folder should contain:

```text
apps/<app-id>/
  app.js         Preview registration and behavior
  README.md      Scope, state, native methods, and acceptance checks
  style.css      Optional app-specific styles; must be linked explicitly
```

Start from `apps/_template/`. Use a lowercase kebab-case folder and app ID. `app.js` must call `registerApp(id, definition)` once. A definition requires `title`, `icon`, dimensions, and `mount(body, window)`. Add the ID to the `BUILT_IN_APPS` list in `ui/apps.js`, which loads every program after the registry and before `ui/bootstrap.js`. Add it to `SHELL_APPS` in `ui/shell/launchers.js` only when it should be pinned; all registered apps are searchable automatically.

Shared UI components and the typed native API client belong in `ui/shared/` when extraction begins. The desktop/window manager belongs in `ui/shell/`. Native services and Buildroot packages remain in `br2-external/package/`. Do not put privileged native code inside an app folder or grant every app the same capabilities.

The preview loads each functional `app.js` from `ui/apps.js`, whose `BUILT_IN_APPS` list is verified against `apps/*/app.js` by `tests/ui_structure_test.py`. The production build should copy built-in assets to a read-only system location and register them from validated manifests. Per-user content belongs on persistent user storage, not in app source folders. A future `app.json` manifest may describe identity, entrypoint, version, and capabilities, but the current runtime does not read manifests.

See the [UI development guide](../docs/UI_DEVELOPMENT.md), [GUI apps backlog](../docs/GUI_APPS.md), and [native API contract](../docs/NATIVE_API.md).
