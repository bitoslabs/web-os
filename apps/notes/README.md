# Notes

Quick notes with a title, body, search, and autosave. Right-click a note to
delete it.

State: notes persist in `localStorage` under `bitos.ui.notes.v1` in the preview;
autosave runs 350 ms after typing and on window close. The booted OS should keep
notes on the persistent user data partition instead.

Native requirements: none to run; bundling notes with user files needs a scoped
storage or `fs.*` service.
