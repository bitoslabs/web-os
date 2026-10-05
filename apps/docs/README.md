# Docs

Rich-text word processing for the Bitos office suite. Part of **Bitos Office**
alongside `apps/sheets` and `apps/slides`.

State: the in-progress document (`name`, `html`, header/footer, view options)
autosaves while typing through `src/office/store.js` — IndexedDB (`office` store)
with a `localStorage` mirror and fallback, so large documents are not bounded by
the browser storage quota. After each local save it also runs a coalesced
background **cloud sync** (`src/office/sync.js`): with no server configured it
mirrors to a local simulated remote, and with a URL set it PUTs the record to
`<url>/office/<key>`. The document bar shows the sync state (`local only` /
`syncing…` / `synced` / `sync error`); click it to set the server URL. Sync is
opt-in and uploads the record as-is, so use a trusted endpoint. The booted OS
should point sync at the identity's Blossom/relay transport and encrypt payloads
as `cloudfile.js` does for Files.

Docs is a **unified** window. Its **File / Edit / View** commands are contributed
to the global OS menu bar (`win.menu` → `src/shell/menus.js`) while the window is
focused, so they appear under the `docs` app name at the top of the screen
(new/open/save/save-as/print; undo/redo/find/replace; ruler/gridlines/zoom). The
inline window header (`win.tools`) carries the autosave indicator, quick undo/redo,
a centered editable file name, a save-format selector, the sync indicator, and a
search box that jumps to a match (`Enter`). **Save** writes to the opened location
and syncs; **Save as** opens a folder picker.

Features (MVP): a Word-style Home ribbon — font family and size, bold / italic /
underline / strikethrough, subscript and superscript, font and highlight colours,
bullet and numbered lists, alignment (left / centre / right / justify), indent,
a styles gallery (Normal, Heading 1–3, Quote), inline pictures and tables
(Insert → media), editable header and footer bands, clear formatting, native
undo/redo (window header / Edit menu), find (`ctrl/⌘ + f`) and replace
(`ctrl/⌘ + h`), live word and
character count, open/export of `.docx`, `.html`, and `.txt`, and print /
save-as-PDF (`ctrl/⌘ + p`). The View tab toggles a ruler and gridlines, picks the
page size (Letter / A4 / Legal) and orientation (portrait / landscape), and sets
zoom (50–200%); page size and orientation round-trip as `w:pgSz`. The Review tab
adds document comments in a side panel, exported as `word/comments.xml`, and
**tracked changes**: toggle *track*, then *accept* / *reject* the diff against the
baseline. Changes export as `w:ins`/`w:del` (block-level, not word-level).
**Save as** uses the File System Access API to choose a folder (falling back to a
download), while **save** writes to the opened location and syncs. The document
title (document bar) is the file name; the name is shown in the status bar and
used when saving. `.docx` is read and written
with the shared engine in `src/office/` (ZIP + OOXML, no vendored parser): inline
images become `word/media/*` parts with a `document.xml.rels` relationship, tables
round-trip as `w:tbl`, and headers/footers as `word/header1.xml` /
`word/footer1.xml` referenced from `w:sectPr`.

Native requirements: none in the preview. In the OS, saving writes bytes back
through the `fs.writeBytes` broker; the Files app dispatches `.docx` here.

Acceptance checks:

- typing autosaves and reloads the draft.
- save as `.docx` produces a file Word/Google Docs can open.
- opening a `.docx` renders paragraphs, headings, bold/italic/underline, colours,
  sizes, inline pictures, tables, and header/footer text.
- saving shows the file name and uses the document title as the base name.
- `ctrl/⌘ + n / o / s` new, open, save; `ctrl/⌘ + p` prints or saves a PDF.
