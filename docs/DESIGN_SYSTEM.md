# Bitos design system

Status: implemented in the browser preview (`ui/style.css`, the modules under `ui/`, and the programs under `apps/`). The Handbook app renders the design rules live.

Bitos is honest software wearing a familiar skin. Underneath: the same alphabet as the machine — one accent, hairlines, status as text, ANSI semantics. On top: gestures everyone already knows — dock, spotlight, traffic lights, working menus, frosted materials.

Implementing this UI means implementing the shell in `ui/`; it is not yet the booted OS. Persistence is browser `localStorage` in the preview and must move behind the native channel in [NATIVE_API.md](NATIVE_API.md).

## Principles

1. **Honest like a terminal.** States are text, progress is countable, errors say what failed and where.
2. **One accent.** The accent is reserved for focus, selection, identity, and primary actions. If something is accent-colored, you can interact with it, or it is about you.
3. **ANSI semantics.** Green ok, yellow caution, red failure, cyan metadata — the color language users already speak.
4. **A familiar skin.** Every gesture is real: every menu item works, every dock click does something, spotlight reaches everything. No decorative chrome.

## Files

| File | Role |
| --- | --- |
| `ui/index.html` | Document shell: mount points for boot, setup, OS, lock, spotlight, control center, toasts. |
| `ui/style.css` | Design tokens and components. All tokens are CSS custom properties on `:root`. |
| `ui/main.js` | App registry and desktop-session coordinator. |
| `ui/apps.js` | Built-in program loader; its `BUILT_IN_APPS` list names every `apps/<app-id>/`. |
| `ui/boot`, `ui/setup`, `ui/shell`, `ui/shared` | Boot, first-boot, desktop, and shared runtime modules. |
| `apps/<app-id>/app.js` | Individual program registration and behavior. |
| `ui/vendor/van-1.6.1.nomodule.min.js` | Vendored VanJS (1.6.1) used by the `vanjs` demo app. Kept local so the shell renders offline. |
| `ui/vendor/fonts/` | Vendored IBM Plex Mono/Sans woff2 (latin, latin-ext), `fonts.css`, and the OFL license. No Google Fonts CDN at runtime. |

VanJS is loaded from `ui/vendor/`, never a CDN, so graphical boot stays offline-safe. The `vanjs` app renders the [VanJS getting-started](https://vanjs.org/start) example, and the Files window (`apps/files/app.js`) uses `van.state`/`van.tags`/`van.add` for its render tree and state; its `fs.*` adapter and the shared `dialog()`/`openContextMenu()`/`toast()` helpers stay imperative.

Accents switch at runtime by setting `data-acc` on `<html>` (`zap`, `phosphor`, `amber`).

## Color and materials

Backgrounds (one ramp):

| Token | Value | Use |
| --- | --- | --- |
| `--bg0` | `#0a0a0f` | void — wallpaper, terminal |
| `--bg1` | `#14141c` | surface — window bodies |
| `--bg2` | `#1b1b25` | toolbars, raised chrome |
| `--bg3` | `#24242f` | hover — feedback only |

Ink:

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#eceae7` | primary text |
| `--ink2` | `#a6a4ae` | secondary, labels |
| `--ink3` | `#6b6a74` | faint, timestamps |

Accent (the only brand color, plus two alternates):

| Token | Value | Use |
| --- | --- | --- |
| `--acc` | `#8b5cf6` (`zap`) | focus, selection, identity, zaps |
| `--acc2` | `#a78bfa` | accent text on dark |
| `--acc-t` | `rgba(139,92,246,.14)` | selected backgrounds |
| `--acc-t2` | `rgba(139,92,246,.30)` | chart fills, stronger states |

Accent alternates: `phosphor` `#3ed685`, `amber` `#e0a94a`.

ANSI semantics:

| Token | Value | Meaning |
| --- | --- | --- |
| `--ok` | `#58c26c` | success, switch ON |
| `--warn` | `#e0a94a` | caution, connecting |
| `--err` | `#e5484d` | failure, secrets |
| `--cyan` | `#54b9c7` | metadata, paths |

Window controls: close `#ff5f57`, minimize `#febc2e`, zoom `#28c840`; unfocused `#52525c`.

**Materials rule.** Frosted glass (`--mat` `rgba(22,22,31,.72)` + `blur(26px) saturate(1.6)`, token `--blur`) is allowed only on chrome that floats *over* content: menu bar, dock, menus, spotlight, control center, notifications. Window bodies stay opaque for readability. Hairlines (`--hair` `rgba(255,255,255,.10)`) run white at 10–16% alpha, never gray-on-gray.

## Type

Two stacks, two audiences:

- `--fys` — system sans (SF Pro on Apple, Segoe UI on Windows) for humans: menus, prose, notes, settings.
- `--fm` — IBM Plex Mono for the machine: terminal, keys, npub/nsec, badges, timestamps, relays.
- `--fs` — IBM Plex Sans for long-form prose (handbook, setup copy).

If a string could be typed at a prompt, it is mono. Numbers are tabular and right-aligned. Never center paragraphs.

Scale: 32 display (lock clock, about), 18 section heads, 15 handbook h1 and handles, 13 UI base (menus, notes, settings), 12 buttons and labels, 11 keys/badges/meta, 10 uppercase micro-labels (`.lbl`, tracked `.12em`). Base body is `13px/1.5`.

## Space and shape

- Spacing is a 4px grid; the wallpaper dot grid is 24px.
- Radii: `10px` windows (`--tlr`), `8px` menus and cards (`--mr`), `6px` buttons and inputs (`--br`), `4px` chips and badges, full-round switches and dock lights.
- Minimum hit target 28px.
- Hairlines at `rgba(255,255,255,.10–.16)`.

## Motion

One curve family, `--ease: cubic-bezier(.2,.8,.25,1)`, three durations:

- `130ms` — hover, menus (scale `.97`).
- `200ms` — window open (scale `.96`).
- `320ms` — minimize toward the dock; window restore.

The dock magnifies under the pointer with falloff to neighbors (120px range). Spotlight and control center pop in with `menuin` (`scale(.97) translateY(-3px)`). Snap shows a dashed preview of the exact landing zone while dragging.

`prefers-reduced-motion: reduce` removes all animation and transitions; the interface must survive that (the wallpaper draws one static frame instead of animating).

## Components

All components are defined in `ui/style.css`.

- **Buttons** (`.btn`): default, `.pri` (accent), `.ghost`, `.danger`, `.sm`; `.armed` is the two-step destructive state. Active state scales to `.97`.
- **Switch** (`.sw2`): on state uses ANSI green; keyboard-focusable button with an inner `<i>` knob.
- **Segmented control** (`.seg`): pill group with an `.on` item; used for accents and binary choices.
- **Fields** (`.field`): dark inputs with accent focus ring (`0 0 0 3px var(--acc-t)`); `.sel` adds a custom caret.
- **Traffic lights** (`.wtl`): 12px close/minimize/zoom; gray when the window is unfocused; glyphs reveal on hover.
- **Badges** (`.kb`): mono kind chips; `k1` cyan, `k3`/`k7` neutral, `kz` accent.
- **Key chips** (`.key`): always-copyable npub/nsec; `.rev` is the err-red reveal state.
- **Keyboard** (`kbd`): bordered key caps with a 2px bottom edge.
- **Keys + modifiers** (`.key`, `.key.rev`) and **kbd** rows appear in the shortcut panel.
- **Toasts** (`.toast`): top-right banners, kinds `ok`/`err`/`zap`/`info`, optional action button; max four stacked.
- **Menus** (`.menu`): real menus; `.mi`, `.chk`, `.msep`, `.dis`. The app menu renames itself to the focused window. `openContextMenu(x,y,items)` reuses the same component for right-click menus.
- **Modal dialog** (`.modal`): centered card for confirm/prompt flows via `dialog({title,body,input,placeholder,ok,danger})`; resolves the field value, `true`/`false`, or `null` when cancelled. Enter confirms, Escape cancels, and empty prompts keep the confirm button disabled.
- **Windows** (`.win`): `10px` radius, `40px` centered header, opaque body, `18px` corner grip. Focused windows get a deeper shadow and lighter hairline. An app can set `unified:true` to drop the centered title and render its own toolbar into the header via `win.tools` (used by Files, Finder-style); the header ignores drag on `button/input/select/textarea/a/[data-no-drag]`.
- **Chrome**: menu bar (`.mb-*`, height `--mbh`), dock (`.dk`/`.dtil`, zone `--dkz`), spotlight (`#spot`), launchpad (`#lp`), control center (`#cc`), lock (`#lock`).
- **Utilities** (`.u-*`): small composable helpers (`u-row`, `u-col`, `u-grow`, `u-gap-4/6/8`, `u-nowrap`, `u-mono`, `u-muted`, `u-small`, `u-mt-14`) for layout and text repeated across apps, so one-off inline styles are avoided. `.mono-dim` is the shared mono-faint text class.

Windows are keyed by a window key (`WM.open(id,{key,title})`); multiple windows can share one app id, and dock "running" reflects whether any window for that app is open.

## Layers (z-index)

`desktop content 2–16` → `windows 20–590` → `dock, menu bar 600` → `menus, control center 900` → `spotlight 1000` → `launchpad 1050` → `toasts 1100` → `lock 1500` → `boot 2000`. Window stacking is capped below the dock/menu bar (`Z_MAX = 590`) and renormalized, so a focused or zoomed window never covers the chrome.

## Voice

System copy is lowercase and calm. Status messages start with a bracketed prefix — `[ ok ]`, `[ !! ]`, `[ zap ]` — repeated as color on the notification icon, so meaning survives without reading.

- Do: `[ ok ] relay purplerelay.com connected · 38ms`
- Don't: `Great news! Your relay was connected successfully!!`
- Do: `[ !! ] relay nos.lol timed out — retrying in 30s`
- Don't: `Oops! Something went wrong :(`
- Do: `[ !! ] relay nos.lol timed out · [rejoin]`
- Don't: `An error occurred. (code 0x8002)`

Numbers are right-aligned and tabular. No exclamation marks — excitement is a color, not a punctuation mark.

## UX patterns

- **Everything is one keystroke away.** Spotlight (`ctrl space`) indexes apps, handbook sections, actions, and commands. If a feature exists, you can type its name.
- **Menus are real.** Every menu item does something — no decorative menus, no grayed-out lies.
- **Control center.** The three things people actually change — accent, text size, wallpaper — live one click from anywhere in a popover, not buried in settings.
- **Identity is presence, not password.** The lock screen shows the identicon and handle; enter or click and you are in. Keys do the security, not typing.
- **Actionable banners.** Zap → open feed. Relay down → rejoin. Never a dead end.
- **Empty states are instructions.** A blank feed says "all relays offline — join one below".
- **Safety by default.** Destructive buttons arm before firing; secrets auto-hide with a countdown.
- **Teach by doing.** The getting-started checklist is real actions with real effects — 5/5 is earned.

## Keyboard and gestures

| Input | Action |
| --- | --- |
| `ctrl space` / `ctrl k` | Spotlight |
| `ctrl alt t` / `alt t` | New terminal window |
| `alt shift t` | New terminal tab |
| `?` | Shortcuts panel |
| `alt w` | Close window |
| `alt m` | Minimize window |
| `alt ,` | Settings |
| `esc` | Close menu / spotlight |
| Drag title bar | Move window |
| Drag to screen edge | Snap — left/right half, top zoom |
| Double-click title bar | Zoom / restore |
| Window edges and corners | Resize |

Browsers reserve `cmd/ctrl W`, so the shell uses `alt` for window actions.

## Extending

1. Add tokens to `:root` in `ui/style.css`; add an accent by defining a `[data-acc="name"]` block.
2. Add a component as a new section in `ui/style.css`, then document it here.
3. Add an app with `registerApp()` in `apps/<app-id>/app.js`, register its ID in `ui/apps.js`, and optionally pin it in `ui/shell/launchers.js`. Search indexes registered apps automatically.
4. Route every native capability through the broker contract in [NATIVE_API.md](NATIVE_API.md); never expose raw shell, D-Bus, or filesystem access to page content.
