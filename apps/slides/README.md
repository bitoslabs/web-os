# Slides

Presentation editor for the Bitos office suite. Part of **Bitos Office**
alongside `apps/docs` and `apps/sheets`.

State: the deck (slides, title, notes, images, shapes) persists through
`src/office/store.js` (IndexedDB `office` store with a `localStorage` mirror and
fallback), so embedded images are not capped by the localStorage quota.

Add, reorder, and delete slides; edit slide title and body on the stage and
speaker notes below. Insert one picture per slide (Home → Insert tab → media);
the image renders behind the text and present mode shows it full-bleed. Add
rectangles or ellipses (Insert tab → shapes): drag to move, the corner handle to
resize, double-click to edit the label, `delete` to remove the selected shape.
`present` (or `F5`) enters a full-screen preview; use `←`/`→`/`space` to
navigate and `esc` to exit. `ctrl/⌘ + n` adds a slide, `ctrl/⌘ + s` saves.

Import and export: **open** reads `.pptx` through `src/office/pptx.js` (title,
body, speaker-notes, shapes, and the first picture per slide); **save** writes a
`.pptx` (ZIP + PresentationML with a slide master, one layout, a theme, notes
master and notes slides when notes exist, embedded media for pictures, and
preset-geometry shapes with fills and text). The Files app dispatches `.pptx`
here.

Native requirements: none in the preview. The booted OS should keep decks on the
user data partition and write bytes back through `fs.writeBytes`.

Acceptance checks:

- edits autosave and reload the deck.
- reordering moves the selected slide and keeps the selection.
- present mode navigates and exits cleanly.
- save `.pptx`, reopen it, and see the same slide titles, body text, notes, and pictures.
