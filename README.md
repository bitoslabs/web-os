# Bitos OS — web

A no-build, dependency-free ES-module version of the Bitos desktop shell,
derived from `bitos/os/ui` and `bitos/os/apps`. It renders the real shell as a
standalone web app: animated boot, first-boot setup, desktop, dock, menu bar,
spotlight, control center, and first-party programs.

The upstream `bitos/os` tree keeps ordered classic scripts because WPE WebKit and
the `file://` preview need one static bundle. This project trades that for real
ES modules with explicit imports, which is cleaner to develop and deploy as a
website.

## Run it

Module scripts do not run from `file://`, so serve the folder over HTTP:

```sh
make serve            # python3 -m http.server 8000
# open http://127.0.0.1:8000/
```

Any static host works (GitHub Pages, Netlify, S3, nginx). There is no build step
and no npm dependency. Validate structure with:

```sh
make check            # node scripts/check.mjs — ESM syntax + import resolution
```

## Layout

```text
os-web/
  index.html          DOM mount points; loads vendored VanJS + src/main.js
  src/
    main.js           entrypoint: load apps, then runBoot()
    apps.js           built-in app manifest; dynamic import() per app folder
    session.js        desktop assembly (menubar, dock, icons, wallpaper, CC)
    core/             dependency-free primitives
      dom.js          $, el, esc, clamp, rint, pick, hexRgb, lev
      icons.js        inline SVG icons, logo, traffic-light marks
      identity.js     bech32, prototype keys, petnames, identicons
      ui.js           toast, clipboard, modal dialog, widget wiring
      store.js        preview state (localStorage)
      native.js       window.__bitosNative bridge (absent in the browser)
      system.js       live/simulated system info and boot state
      registry.js     APPS + registerApp()
      index.js        barrel re-export of the core
    data/             content and simulation, separated from programs
      handbook.js     HBDATA design-system sections
      sim.js          SIM nostr relay/event simulation
      sample-files.js SAMPLE_FILES preview filesystem content
    shell/            desktop-wide behavior
      state.js        shared shell bindings (desk element, session start)
      launchers.js    pinned dock/desktop catalog
      wallpaper.js    canvas wallpaper
      window-manager.js  window lifecycle, focus, move, resize, minimize
      menus.js        menu bar/context/popup menus and view toggles
      search.js       spotlight over apps, handbook, actions, commands
      control-center.js  quick appearance settings
      menubar.js      status bar, clock, accent
      dock.js         pinned launcher + magnification + running dots
      desktop-icons.js   desktop launch surface
      global-input.js global pointer/keyboard routing
      lock.js         preview lock screen
      tour.js         getting-started progress marks
    boot/boot.js      startup sequence and recovery screen
    setup/setup.js    first-boot workflow
  apps/
    <app-id>/app.js   one ES module per program; calls registerApp()
    _template/        starting point for a new program
  styles/
    style.css         shared design tokens and components (from ui/style.css)
    fonts/            vendored IBM Plex woff2 + fonts.css
  vendor/             vendored VanJS (classic global)
  scripts/check.mjs   structural check (syntax + import resolution)
  docs/               upstream reference docs
```

## How modules fit together

- `core/` never imports `shell/`, `data/`, or `apps/`, so it is acyclic.
- `data/` holds shared content/simulation and may read core.
- `shell/` modules import each other freely; a few cycles exist but every
  cross-reference is used inside a function, never during module evaluation.
- Apps import `registerApp` and shared helpers from `../../src/core/index.js`,
  and shell services from `../../src/shell/*.js`.
- `main.js` dynamically imports every id in `BUILT_IN_APPS`, waits for all
  registrations, then starts boot.

## Add a program

1. Copy `apps/_template/` to `apps/<app-id>/` (lowercase kebab-case).
2. Rename `app.js.example` to `app.js` and call `registerApp('<app-id>', {...})`
   once. Implement `mount(body, win)`.
3. Add the id to `BUILT_IN_APPS` in `src/apps.js`.
4. Add it to `SHELL_APPS` in `src/shell/launchers.js` only if it should be pinned.

## Native boundary

In the booted OS the launcher injects `window.__bitosNative`; `src/core/native.js`
wraps it and everything degrades to the localStorage simulation when it is
absent. Never expose the bridge to remote web content.

## Relationship to `bitos/os`

`os-web` is a web-focused sibling, not a replacement for the OS source. The OS
tree remains the authority for Buildroot packaging, WPE boot, and native
services. If a change should land in both, apply it here in module form and
mirror the behavior (not necessarily the module syntax) upstream.
