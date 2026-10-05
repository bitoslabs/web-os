# Bitos Office — suite plan

A first-party office suite for Bitos web: **Docs**, **Sheets**, and **Slides**.
It is a no-build, dependency-free ES-module feature. Documents are read and
written as real OOXML (`.docx` / `.xlsx` / `.pptx`) using browser-native ZIP and
compression APIs, with no vendored parser.

## Suite name

Primary: **Bitos Office**, app trio **Docs · Sheets · Slides**. The names mirror
the file extensions, so file association needs no explanation.

Alternatives considered: **Bitos Bureau** (desk/office), **Bitos Studio**
(creative-leaning), **Bitos Workbench** (power-user/Sheets-leaning). Thematic app
names were considered (`Scribe` / `Abacus` / `Deck`) but rejected for a
file-type-driven launcher; clarity wins.

## Apps

| Folder | id | icon | opens | status |
|---|---|---|---|---|
| `apps/docs` | `docs` | `doc` | `*.docx` | MVP shipped |
| `apps/sheets` | `sheets` | `grid` | `*.xlsx`, `text/csv` | MVP shipped |
| `apps/slides` | `slides` | `cols` | `*.pptx` | MVP shipped |

All three are `multi: true`, ~860–960 wide, registered in `BUILT_IN_APPS`, and
read/write their OOXML formats (`.docx`, `.xlsx`, `.pptx`).

## Shared engine (`src/office/`)

One library, three thin apps. The engine imports core only; apps import both.

| Module | Responsibility |
|---|---|
| `zip.js` | Minimal ZIP read/write. STORE on write; inflate deflate entries on read via `DecompressionStream('deflate-raw')`. Dependency-free CRC32. |
| `ooxml.js` | Block model (`p`/`h1`-`h3`/`li`/`blockquote` + formatted runs) and the `.docx` package reader/writer. |
| `xlsx.js` | `.xlsx` (SpreadsheetML) package reader/writer: inline strings, formulas, bold, number formats, fills, sharedStrings/styles import. |
| `pptx.js` | `.pptx` (PresentationML) package reader/writer: slide master, one layout, theme, title/body placeholders. |
| `formula.js` | Spreadsheet formula evaluator (arithmetic, refs/ranges, `SUM`/`AVERAGE`/`MIN`/`MAX`/`COUNT`/`IF`). |
| `chart.js` | Dependency-free SVG chart renderer (`bar`/`line`/`pie`) from `{ label, value }`. |
| `store.js` | Document persistence: IndexedDB (`office` store) with a `localStorage` mirror/fallback, a serialized autosave queue, and `createStore(id)` for app-scoped (`<id>:`) keys with migration. |
| `sync.js` | Background server sync with a local simulated remote fallback. |
| `host.js` | The single app↔OS boundary (UI, storage, sync); apps import runtime services from here so a sandboxed host can replace it. |
| `manifests.js` | App metadata consumed by `registerApp` and serializable by a future package builder. |
| `bridge.js` | Host bridge protocol (request/response/error, method→permission map, reference host) for the sandboxed build. |
| `suite.js` | Single suite entry: `loadOfficeApps()` (used by `src/apps.js`) and `packageManifest()` (ecosystem descriptor). |
| `publisher.js` | First-party publisher identity + per-publisher capability caps. |
| `releases.js` | Semver compare, engine version, and the per-app release log. |
| `model.js` | Document/sheet/deck record shapes, ids, timestamps, column addressing. |
| `history.js` | Bounded undo/redo stack (for Sheets/Slides; Docs uses native `execCommand` undo). |
| `index.js` | Barrel re-export. |

OOXML is ZIP + XML; the browser's own `CompressionStream` / `DecompressionStream`
is the key enabler that keeps the suite dependency-free.

## Packaging

Office ships as **built-in system apps** (`apps/docs`, `apps/sheets`,
`apps/slides` + `src/office/*`), loaded as one suite via `src/office/suite.js`
(called from `src/apps.js`) and registered through `src/core/registry.js`. They
are not installable packages and are not listed in the Store. This is deliberate while the suite needs direct host access (Files
`fs.*`, print, the global menu bar via `win.menu`, and the shared office engine
imported with relative paths).

The installable path (`src/core/ecosystem.js`, `src/shell/app-frame.js`) runs
isolated single-document apps with an `app.storage` / `app.window` permission set
and ~600KB package / 64KB data caps, and does not execute third-party code until
the APP-05 frame runtime ships. Moving Office there would require a
self-contained bundle, a host bridge (files/print/window/menu) with new
permissions, higher limits, and a first-party publisher/signing path — deferred
until that runtime and bridge exist.

### Forward-compatible path (do while built-in)

Keep the engine (`src/office/*`, zero-dependency, node-tested) separate from the
host so a later package is a wrapper, not a rewrite:

1. **Host adapter** — `src/office/host.js` exposing `openFile/saveFile/storage/
   sync/print/dialog/toast/window/menu`. The built-in host wraps `src/core`; a
   future sandboxed host speaks the APP-05 postMessage bridge. Apps call
   `host.*`, giving one swap point at package time.
2. **Manifests** — a `manifest` object per app (`id/title/icon/opens/permissions/
   version/entry`) that `registerApp` consumes and a package builder serializes.
3. **Storage behind host** — route `store.js`/`sync.js` through
   `host.storage`/`host.sync` so data is app-scoped (`app.storage`), not the
   shared `office` store.
4. **Bridge protocol + permissions** — map messages to permissions (files →
   `fs.files`, print → `app.print`, title/menu → `app.window`/`app.menu`) and
   raise the caps for first-party.
5. **Bundle** — one `bitos-office` package built from the manifests; keep exports
   tree-shakeable and DOM confined to the browser-only parsers.
6. **Trust/versioning** — first-party publisher key + releases; semver per app and
   engine for updates and record migrations.

Status: **1–4 done.** Apps import UI/storage/sync from `src/office/host.js`,
register from `src/office/manifests.js`, use `appStorage(id)` (namespaced `<id>:`
keys with migration), and the bridge contract lives in `src/office/bridge.js`
(method→permission map + reference host); the ecosystem permission set now
includes `app.menu`, `app.print`, and `fs.files`; and the suite is a single unit:
`src/office/suite.js` (`loadOfficeApps()` is what `src/apps.js` loads, and
`packageManifest()` yields the ecosystem descriptor). **6 (trust/versioning) is in
place** via `publisher.js` (first-party identity + capability caps) and
`releases.js` (semver + release log), both surfaced on `packageManifest()`
(`publisher`, `trusted`, `caps`, `releases`). All six preparation steps are done;
the remaining work to ship installable is wiring the APP-05 frame runtime to
`bridge.js` and pointing an installer at `packageManifest()`.

## Interface (Office-style ribbon)

All three apps share an Office-style ribbon instead of a flat toolbar: a tab
strip (**Home / Insert / View**) over grouped controls separated by labelled
dividers, with large icon buttons and compact square toggles. `src/office/ribbon.js`
(`bindRibbon`) handles tab switching; the look lives in the `office: shared` CSS
section (`.ribbon`, `.ribbon-tabs`, `.rgroup`, `.rbtn`). Groups use a single
content baseline with a shared label row; Docs uses a two-tier font group
(family/size over formatting toggles) to stay close to Word. Groups that do not
fit are moved (not cloned) into a "…" overflow popup so their controls keep
working; the ribbon body also scrolls with a slim scrollbar, and controls carry
`:focus-visible` rings. Docs is a **unified** window: it contributes File/Edit/View
commands to the global OS menu bar (`win.menu`, consumed by `src/shell/menus.js`)
and mounts an inline header bar (`win.tools`) with the autosave indicator, quick
undo/redo, a centered editable file name, a save-format selector, a sync
indicator, and a search box. A bottom status bar shows document state: file name and
word count (Docs), sheet name and active cell (Sheets), slide count and position
(Slides).

## Feature scope

**Docs — MVP (shipped).** Rich text via `contenteditable`: bold/italic/underline,
H1–H3, bullet and numbered lists, alignment, links, clear formatting, findable
word/character count, title, autosave, open/export of `.docx`, `.html`, `.txt`,
and print / save-as-PDF. The Home ribbon also carries font family/size, font and
highlight colours, subscript/superscript, indent, a styles gallery, and
find/replace; those run properties round-trip to `.docx` (`w:color`, `w:sz`,
`w:strike`, `w:vertAlign`). Opens `.docx` (and `.html`/`.txt`/`.md` through its
own file picker). Inline pictures become media parts with a document relationship
and read back on import; tables round-trip as `w:tbl`; header/footer text
round-trips via `word/header1.xml`/`footer1.xml` and `w:sectPr` references; page
size (Letter/A4/Legal) and orientation round-trip as `w:pgSz`. The View tab
toggles a ruler and gridlines and sets zoom (50–200%). Document comments live in
a side panel and round-trip as `word/comments.xml` (document-level, not yet
anchored to ranges). Tracked changes diff the current document against a baseline
(Review → track / accept / reject) and export as `w:ins`/`w:del` (block-level).
Save-as opens the File System Access picker to choose a folder. The document title (document bar) is the file name, shown in the status
bar and used when saving. Later: word-level tracked changes and anchored comments.

**Sheets — MVP (shipped).** Editable grid with double-click edit and a formula
bar, cell/range refs, formulas (`SUM/AVERAGE/MIN/MAX/COUNT/IF` + arithmetic and
comparisons) through `src/office/formula.js` with `#CYCLE!` detection, multiple
sheets as tabs, range selection with `sum / avg / count` stats, sorting the
selected range, bold, number/currency/percent formats, fill colours, bar/line/pie
charts as inline SVG, and CSV/TSV import-export. These styles round-trip through
a generated `.xlsx` stylesheet. Later: freeze panes, filters, date formats.

**Slides — MVP (shipped).** Deck editor with a slide list, editable title/body
stage, speaker notes, one picture per slide, draggable/resizable rectangle and
ellipse shapes with editable labels, add/reorder/delete, full-screen present
mode, and `.pptx` read/write including speaker notes, embedded media, and
preset-geometry shapes. Later: text-box layouts, transitions, extra
masters/layouts, multi-element z-order.

## Phasing

1. **Phase 0 — shared engine.** `src/office/` + `scripts/test-office.mjs`. Done.
2. **Phase 1 — Docs MVP.** Done.
3. **Phase 2 — Sheets MVP.** Done (formula evaluator with cycle detection).
4. **Phase 3 — Slides MVP.** Done (deck editor + present mode).
5. **Phase 4 — Fidelity (in progress).** `.xlsx`, `.pptx` (incl. speaker notes),
   Docs print/PDF, Sheets charts, slide images/shapes, and IndexedDB persistence
   done. Remaining: the `fs.*` broker via `native.js` and verification against a
   real Office/LibreOffice install.

## Integration

- Register each id in `BUILT_IN_APPS` (`src/apps.js`). Keep `opens` patterns
  disjoint from `text-editor` (which keeps `*.md`, `*.csv`, `*.html`); Docs claims
  `*.docx` only, so `resolveOpener` order (`src/core/registry.js:34`) is not
  load-bearing.
- Pin in `SHELL_APPS` (`src/shell/launchers.js`) only when it should sit in the
  dock.
- `apps/files` dispatches by `resolveOpener`; `.docx` opens in Docs with bytes
  and a save-back callback over `fs.readBytes` / `fs.writeBytes`.
- Persistence: `src/office/store.js` writes records to the IndexedDB `office`
  store (`src/core/idb.js`) with a best-effort `localStorage` mirror and legacy
  key migration, then runs a coalesced background sync (`src/office/sync.js`).
  Sync mirrors to a local simulated remote by default and PUTs to
  `<url>/office/<key>` when a server is configured; encrypting payloads via
  `src/core/cloudfile.js` or the Blossom/relay transport is planned.

## Open decisions / risks

- OOXML write fidelity is the largest lift. Import-first (render existing files)
  matters more than perfect export round-trips. Docs exports valid but simple
  `.docx`: paragraphs, headings, bold/italic/underline, alignment; lists render
  as paragraphs until `numbering.xml` lands.
- `DecompressionStream('deflate-raw')` requires a modern browser (Chrome 103+,
  Safari 16.4+, Firefox 113+). Write path uses STORE and works everywhere.
- Full `.docx`/`.pptx` import needs `[Content_Types].xml` relationship handling
  beyond the current minimal package reader.
- The `.pptx` writer emits one master/layout and title+body placeholders only;
  slides with images, shapes, transitions, or extra layouts are flattened. Notes
  are not exported. Tests assert the package is internally consistent
  (relationships resolve, every part has a content type) but it has not been
  opened in PowerPoint/LibreOffice here, so round-trip against real editors is
  still unverified.
