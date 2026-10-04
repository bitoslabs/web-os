# Terminal

The current browser preview implements a safe simulated shell (`bsh`) in `app.js`, including its commands, help, completion, and display data. It does not execute host commands. A native terminal, if shipped, must run as the logged-in user and must never expose a hidden root bridge to web content.

The window supports multiple tabs and multiple windows, matching Files. Each tab is an independent shell session with its own output, input, and history. The tab strip carries a `+` button; the window header also exposes a new-window button. New windows use `WM.open('terminal', { fresh: true })`, which keys each instance separately so the dock continues to focus the top-most terminal. Global shortcuts: `alt t` new window, `alt shift t` new tab in the focused terminal. In-shell: `newtab`, `newwindow`, `tabs`, and `exit` (closes the tab, then the window).
