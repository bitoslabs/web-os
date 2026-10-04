# UI and app development

This guide describes the code that exists today. The browser preview and booted WPE shell use the same static HTML, CSS, and JavaScript bundle.

## Ownership

| Location | Owns | Does not own |
| --- | --- | --- |
| `ui/boot/` | Startup progress and recovery entry | First-boot form or apps |
| `ui/setup/` | First-boot workflow | Normal Settings screens |
| `ui/shell/` | Wallpaper, windows, menus, search, control center, menu bar, dock, desktop icons, global input, lock screen | App-specific content |
| `ui/shared/` | Common helpers, state, native client, notifications | Privileged native implementations |
| `ui/main.js` | App registry and desktop-session coordination | Individual app behavior |
| `ui/apps.js` | Loads each built-in program from `apps/<app-id>/app.js` | App behavior itself |
| `apps/<app-id>/` | One program's UI, preview adapter, and documentation | Desktop/window manager or unrestricted system access |

## Script lifecycle

`ui/index.html` loads shared modules first, then `ui/main.js` creates the app registry. `ui/apps.js` injects each built-in program from `apps/<app-id>/app.js` so it registers itself, then `ui/bootstrap.js` calls `runBoot()`. `apps.js` must run during parsing (classic script, not `defer`/module) so loading stays synchronous. Do not call `runBoot()` from another module or load an app after bootstrap.

The project currently uses ordered classic scripts because WPE and direct `file://` browser preview need a simple static bundle. Top-level shared names are therefore visible across scripts. Avoid creating a second declaration with the same name. The combined-script syntax check catches duplicate declarations.

Buildroot preserves the same sibling layout at `/usr/share/bitos/ui` and `/usr/share/bitos/apps`. The launcher permits only those two local prefixes in the privileged shell view. If a new source directory is referenced by the shell, update packaging and launcher policy together.

## Add a shell feature

1. Put boot behavior in `ui/boot/`, setup behavior in `ui/setup/`, or desktop behavior in `ui/shell/`.
2. Put reusable, unprivileged browser helpers in `ui/shared/`.
3. Add the script to `ui/index.html` before `ui/main.js`.
4. Keep startup in `ui/bootstrap.js` and app content out of shell modules.
5. Preview on macOS, then verify native behavior in the booted image.

## Add a program

Run `scripts/new-app.sh <app-id>` to create a lowercase kebab-case app from `apps/_template/`, or copy the template manually.

1. Create the folder from `apps/_template/`.
2. Rename `app.js.example` to `app.js` and call `registerApp()` once with the same ID as the folder.
3. Implement `mount(body, win)`. Treat `body` as the app's root element and attach app cleanup/state to `win` when needed.
4. Document state, native methods, permissions, and acceptance checks in the app README.
5. Add the folder ID to the `BUILT_IN_APPS` list in `ui/apps.js`.
6. Add the app to `SHELL_APPS` in `ui/shell/launchers.js` only if it should be pinned. Search automatically indexes every registered app.

Current registration shape:

```js
registerApp('notes', {
  title: 'Notes',
  icon: 'doc',
  sub: 'personal notes',
  w: 620,
  h: 460,
  mount(body, win) {
    body.textContent = 'Notes';
  },
});
```

The registry rejects invalid IDs, duplicates, and definitions without `mount()`. App scripts should use shell helpers only for presentation and the typed native client for system actions. Remote web content must never receive the native bridge.

## Styling

Global design tokens and existing component classes are in `ui/style.css`. Keep small additions there while the preview remains unbundled. For a large app stylesheet, create `apps/<app-id>/style.css` and link it explicitly in `ui/index.html`. Prefix app-only class names to avoid collisions. Follow `docs/DESIGN_SYSTEM.md` for tokens, focus, motion, and accessibility.

## Validation

Run `make ui-check` after changing UI structure or JavaScript. It verifies script paths/order, folder-to-app IDs, duplicate registrations, installed-image packaging rules, every individual script, and the concatenated load order. Run `make ui-serve` and open `http://127.0.0.1:8000/ui/` to test boot → setup/desktop → app launch. Native API changes also require the broker and bridge tests documented in `docs/TESTING.md`.
