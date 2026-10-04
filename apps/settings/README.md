# Settings

Device and user preferences for the web preview, laid out like macOS System
Settings: a sidebar with a search field and grouped items, and a detail pane for
the selected category.

```text
+----------------+-------------------------------+
| search         |  category title               |
| profile card   |  +---------------------------+ |
| you            |  | row · row · row           | |
|  identity      |  +---------------------------+ |
|  appearance    |                               |
|  desktop & dock|                               |
|  display       |                               |
|  sound         |                               |
|  notifications |                               |
| system         |                               |
|  network ...   |                               |
+----------------+-------------------------------+
```

Search filters the sidebar; a query shows a flat result list across categories,
and picking a result opens its category with the matching row highlighted and
scrolled into view.

## State (preview)

Persisted to `localStorage` via `store.d` (see `src/core/store.js`):

| Key | Meaning |
| --- | --- |
| `theme` | `dark`, `light`, or `auto` (follow `prefers-color-scheme`) |
| `accent`, `accentHex` | named color (`nostr`, `bitcoin`, …) or `custom` + hex |
| `fs` | interface scale (`0.9`, `1`, `1.15`, `1.3`); `big` stays in sync |
| `bright` | preview brightness (40–120) applied as a CSS filter |
| `vol`, `mute`, `alerts` | preview sound values; device audio needs native |
| `power` | preview power mode (`saver`/`balanced`/`performance`) |
| `telemetry`, `crashes` | privacy opt-ins (off / on by default) |
| `wall`, `icons`, `motion` | wallpaper, desktop icons, reduce motion |
| `resize`, `toasts` | window resizing, toast banners |
| `host`, `pet`, `keymap`, `npub` | session identity |
| `name`, `bio` | profile display name and about line |
| `avatar` | profile image data URL (empty → identicon) |
| `nip05`, `website`, `lud16` | nostr profile metadata (preview) |

## Categories

- **Identity** — machine fields: hostname, keymap dropdown, and a preview
  lock-screen action.
- **Profile** (opened from the sidebar profile card or search) — large avatar
  (upload/remove an image, centre-cropped to 160px; falls back to the identicon),
  display name, about line, handle, nostr metadata (nip05, website, lightning
  address, publish preview), click-to-copy npub, reveal-and-copy nsec
  (auto-hides after 20s), key backup download, inline rotate-key, and lock
  screen. The card, detail, and lock-screen avatar update live on rename,
  avatar change, and rotate.
- **Appearance** — theme cards (light / dark / auto via `data-theme` on
  `<html>`), accent swatch row (custom + nostr, bitcoin, blue, purple, pink,
  red, orange, yellow, green, graphite), reduce motion.
- **Desktop & Dock** — wallpaper, desktop icons, window resizing.
- **Display** — text size (four steps, CSS `zoom` on `<html>`) and preview
  brightness.
- **Sound** — volume and mute. Preview only until a native audio service exists.
- **Notifications** — toast banners and alert sounds.
- **Network** — Wi-Fi (marked unavailable in the browser) and relay manager.
- **Power** — power mode plus restart / shut down, disabled until the native
  bridge exposes `system.requestPowerAction`.
- **Storage** — preview estimate of the data partition.
- **Privacy & Security** — anonymous usage, crash reports, clear local data.
- **General** — device, version, account age, handbook / sysmon links, and the
  two-step reset.

## Missing / recommended

Not yet implemented; each needs either a native method or a small shell feature:

1. **Wi-Fi list and join** — `network.listWifi` / `connectWifi` (native).
2. **Software update** — version check and apply (native + signed images).
3. **Date, time, and timezone** — currently only the menu-bar clock.
4. **Language & region** — locale, formats, keymap switching after first boot.
5. **Keyboard** — repeat rate, shortcuts editing (the shortcuts app is read-only).
6. **Display resolution / refresh / night light** — needs the display service.
7. **Battery** — charge, health, and low-power threshold from a power service.
8. **Users & accounts** — multiple identities and per-account data.
9. **Profile publishing** — sign and broadcast the kind:0 metadata event
   (needs a signing service); NIP-05 verification.
10. **Accessibility** — contrast, cursor size, reduced transparency, sticky keys.
11. **Sharing / AirDrop-equivalent** — local file and clipboard sharing.
12. **Dock options** — position, size, magnification toggle (magnification is
    always on).
13. **Default apps** — choose the handler per file type.

## Native requirements

Theme, accent, text size, wallpaper, icons, motion, resize, toasts, privacy
flags, and session fields are local. Brightness, volume, Wi-Fi, storage, and
power need the typed native methods in `docs/NATIVE_API.md`. Every unavailable
control states why rather than pretending to work.
