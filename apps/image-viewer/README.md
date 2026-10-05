# Image Viewer

Opens local images with fit, 1:1, and stepped zoom, rotation, pan, a filmstrip,
and drag-and-drop. Arrow keys step, `0` fits, `1` is actual size, `r` rotates,
`i` toggles the file info panel, and double-clicking the stage toggles fit/1:1.

Fit is recomputed from the stage's layout size on open and on every resize,
maximize, or panel toggle, so a freshly opened image always fits its window.
The inspect panel (`i`) shows a thumbnail plus dimensions, aspect ratio,
megapixels, size, type, current zoom, rotation, and modified date when known.
The toolbar keeps a compact `dimensions · size` summary; opening a wider window
is recommended when inspecting rather than just viewing.

State: images are held as object URLs for the session only; nothing is uploaded
or persisted. Declares `opens: ['image/*', '*.png', …]` so Files can dispatch
images here; when opened from Files the seed arrives as `win.opts.file`
(`{name, mime, size, url}`, an object URL that this window then owns).

Native requirements: the OS reads images through scoped `fs.*` methods and
decodes them natively; only files under the session home may be opened.
