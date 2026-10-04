# Settings

Device and user preferences for the web preview. Sections mirror the target
desktop settings app (GUI-03): General/session, Appearance, Display, Sound,
Network, Power, Storage, Privacy, Data, and Danger.

## State (preview)

Persisted to `localStorage` via `store.d` (see `src/core/store.js`):

| Key | Meaning |
| --- | --- |
| `theme` | `dark`, `light`, or `auto` (follow `prefers-color-scheme`) |
| `accent`, `accentHex` | accent preset name (`zap`/`phosphor`/`amber`) or `custom` + hex |
| `fs` | interface scale (`0.9`, `1`, `1.15`, `1.3`); `big` stays in sync for menus/search |
| `bright` | preview brightness (40–120) applied as a CSS filter |
| `vol`, `mute`, `alerts` | preview sound values; device audio needs the native sound service |
| `power` | preview power mode (`saver`/`balanced`/`performance`) |
| `telemetry`, `crashes` | privacy opt-ins (off / on by default) |
| `wall`, `icons`, `motion` | wallpaper, desktop icons, reduce motion |
| `host`, `pet`, `keymap`, `npub` | session identity |

## Controls

- **Appearance** — theme card picker (light / dark / auto), applying `data-theme`
  on `<html>` from tokens in `styles/style.css`; auto tracks
  `prefers-color-scheme`. Theme color is a macOS-style swatch row: a custom
  color picker plus the named palette (nostr, bitcoin, blue, purple, pink, red,
  orange, yellow, green, graphite) with the active name below. Any swatch
  installs a custom accent by overriding `--acc`, `--acc2`, `--acc-t`, and
  `--acc-t2` on `<html>`. Also wallpaper, desktop icons, and reduce motion.
- **Display** — text size (four steps, applied with CSS `zoom` on `<html>`) and
  a preview brightness filter.
- **Sound** — volume, mute, alert sounds. Preview only until a native audio
  service exists; the UI says so.
- **Network** — Wi-Fi is marked unavailable in the browser and the relay summary
  links to the nostr app.
- **Power** — power mode is a preview value; restart and shut down call
  `system.requestPowerAction` and stay disabled until the native bridge exists.
- **Storage** — preview estimate of the data partition.
- **Privacy** — anonymous usage and crash-report opt-ins plus clear local data.
- **Danger** — two-step reset that wipes preview state and reboots into setup.

## Native requirements

Accent, theme, text size, wallpaper, icons, motion, privacy flags, and session
fields are local. Brightness, volume, Wi-Fi, storage, and power need the typed
native methods in `docs/NATIVE_API.md`. Every unavailable control states why
rather than pretending to work.
