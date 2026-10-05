# Video Player

Plays local video files with a custom transport bar (scrub/drag seek, buffered
track, time, volume, loop, fullscreen), a collapsible playlist sidebar, and
drag-and-drop. The header shows the current file name plus resolution,
duration, and size. Space toggles playback, `←`/`→` seek ±5s, `↑`/`↓` adjust
volume, `m` mutes, `l` toggles loop, `f` toggles fullscreen, and `n`/`p` step
the playlist.

State: videos are held as object URLs for the session only; nothing is uploaded
or persisted. Declares `opens: ['video/*', '*.mp4', …]` so Files can dispatch
video files here; when opened from Files the seed arrives as `win.opts.file`
(`{name, mime, size, url}`, an object URL that this window then owns).

Native requirements: the OS reads videos through scoped `fs.*` methods and
decodes them natively; only files under the session home may be opened.
