# Built-in programs

Each built-in program has one source folder. Every folder ships an `app.js` that calls `registerApp()` and a `README.md`. OS boot, setup, and desktop behavior stay under `src/`.

```text
apps/
  _template/        Starter for a new built-in program
  about/            Bitos version and project information
  browser/          Web browsing without native privilege
  calculator/       Offline calculator
  docs/             Word processing (.docx) — Bitos Office
  sheets/           Spreadsheet with formulas — Bitos Office
  slides/           Presentation editor — Bitos Office
  files/            File manager (Finder-style)
  get-started/      First-session onboarding checklist
  handbook/         Offline help and live design-system reference
  image-viewer/     Local image viewing
  video-player/     Local video playback with a playlist
  notes/            Quick notes with autosave
  nostr/            Preview identity, relay, feed, and zap experience
  screenshots/      Screen capture UI and save flow
  settings/         Device and user settings
  shortcuts/        Keyboard and pointer shortcut reference
  store/            App Store — browse, install, and manage apps
  system-monitor/   CPU, memory, processes, disk, and network
  terminal/         Safe preview shell; native terminal policy comes later
  text-editor/      Plain-text file editing
  vanjs/            Development demo for the vendored runtime
```

## Current app folder contract

When implemented, each folder should contain:

```text
apps/<app-id>/
  app.js         Preview registration and behavior
  README.md      Scope, state, native methods, and acceptance checks
  style.css      Optional app-specific styles; must be linked explicitly
```

Start from `apps/_template/`. Use a lowercase kebab-case folder and app ID. `app.js` must call `registerApp(id, definition)` once. A definition requires `title`, `icon`, dimensions, and `mount(body, window)`. Add the ID to the `BUILT_IN_APPS` list in `src/apps.js`, which loads every program after the registry and before `src/main.js` starts boot. Add it to `SHELL_APPS` in `src/shell/launchers.js` only when it should be pinned; all registered apps are searchable automatically.

Shared UI components and the typed native API client belong in `src/shared/` when extraction begins. The desktop/window manager belongs in `src/shell/`. Native services and Buildroot packages remain in `br2-external/package/`. Do not put privileged native code inside an app folder or grant every app the same capabilities.

The preview loads each functional `app.js` from `src/apps.js` via `loadApps()`. `make check` parses every module and resolves relative imports. The production build should copy built-in assets to a read-only system location and register them from validated manifests. Per-user content belongs on persistent user storage, not in app source folders. A future `app.json` manifest may describe identity, entrypoint, version, and capabilities, but the current runtime does not read manifests.

See the [UI development guide](../docs/UI_DEVELOPMENT.md), [app ecosystem tasks](../docs/APP_ECOSYSTEM_TASKS.md), and [native API contract](../docs/NATIVE_API.md).
