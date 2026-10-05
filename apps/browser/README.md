# Browser

Renders remote pages in a sandboxed cross-origin iframe.

Security: the frame has no access to shell DOM, storage, or the native bridge,
uses `referrerpolicy="no-referrer"`, and is sandboxed. Address entry normalizes
bare hosts to `https://` and falls back to a DuckDuckGo search. Pages that refuse
framing (`X-Frame-Options` or a restrictive `frame-ancestors`) will not embed;
use **open in a new tab**.

Native requirements: a native browser, if shipped, must keep remote content in a
separate sandbox with no broker access.
