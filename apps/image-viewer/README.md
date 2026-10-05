# Image Viewer

Opens local images with fit, 1:1, and stepped zoom, rotation, pan, a filmstrip,
and drag-and-drop. Arrow keys step, `0` fits, `1` is actual size, `r` rotates.

State: images are held as object URLs for the session only; nothing is uploaded
or persisted. Declares `opens: ['image/*', '*.png', …]` so Files can dispatch
images here; when opened from Files the seed arrives as `win.opts.file`
(`{name, mime, size, url}`, an object URL that this window then owns).

Native requirements: the OS reads images through scoped `fs.*` methods and
decodes them natively; only files under the session home may be opened.
