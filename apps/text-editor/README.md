# Text Editor

Plain-text editing of local files.

State: **open** reads a file through the browser file picker and `FileReader`;
**save** downloads the buffer as a UTF-8 text file, or, when opened from Files,
writes back through the `save` callback in `win.opts.file`. The current buffer is
stashed in `localStorage` under `bitos.ui.editor.v1`, so a reload restores unsaved
work. Declares `opens: ['text/*', '*.json', …]` for Files file-type dispatch.

Native requirements: the booted OS must read and write scoped files through the
`fs.*` broker used by Files rather than browser downloads.
