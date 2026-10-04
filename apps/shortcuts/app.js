/* Built-in app: Shortcuts. Documents global shell input behavior. */
import { registerApp } from '../../src/core/index.js';

registerApp('shortcuts', {
  title: 'shortcuts', icon: 'help', sub: 'press ? anytime', w: 470, h: 460,
  mount(body) {
    body.innerHTML = `<div class="scrolly keys">
    <span class="lbl kg">keyboard</span>
    <div class="kr"><span class="kk"><kbd>ctrl</kbd><kbd>space</kbd></span>spotlight — everything, one keystroke</div>
    <div class="kr"><span class="kk"><kbd>ctrl</kbd><kbd>alt</kbd><kbd>t</kbd></span>new terminal window</div>
    <div class="kr"><span class="kk"><kbd>?</kbd></span>this panel</div>
    <div class="kr"><span class="kk"><kbd>alt</kbd><kbd>t</kbd></span>new terminal window (file menu)</div>
    <div class="kr"><span class="kk"><kbd>alt</kbd><kbd>shift</kbd><kbd>t</kbd></span>new terminal tab</div>
    <div class="kr"><span class="kk"><kbd>alt</kbd><kbd>w</kbd></span>close window · <span class="mono-dim">browsers reserve ⌘W, so we use ⌥</span></div>
    <div class="kr"><span class="kk"><kbd>alt</kbd><kbd>m</kbd></span>minimize window</div>
    <div class="kr"><span class="kk"><kbd>alt</kbd><kbd>,</kbd></span>settings</div>
    <div class="kr"><span class="kk"><kbd>esc</kbd></span>close menu / spotlight</div>
    <span class="lbl kg">mouse &amp; gestures</span>
    <div class="kr"><span class="kk">dock</span>hover magnifies · dot = running · click opens, click again docks</div>
    <div class="kr"><span class="kk">right-click dock icon</span>new window · show all · quit</div>
    <div class="kr"><span class="kk">traffic lights</span>red close · yellow docks · green zooms</div>
    <div class="kr"><span class="kk">drag title bar</span>move the window</div>
    <div class="kr"><span class="kk">drag to screen edge</span>snap — left/right = half · top = zoom</div>
    <div class="kr"><span class="kk">drag a zoomed window</span>pulls it off at full size, under your cursor</div>
    <div class="kr"><span class="kk">double-click title bar</span>zoom / restore</div>
    <div class="kr"><span class="kk">corner grip</span>resize</div>
    <div class="kr"><span class="kk">control center</span>top-right sliders — accent, text, wallpaper</div>
    <div class="kr"><span class="kk">menu bar</span>real menus — window list lives under "window"</div>
    <p class="note">also in the handbook → motion, and section 08 — ux patterns.</p></div>`;
  }
});
