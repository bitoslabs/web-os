'use strict';
/* ============================================================================
   BITOS WEB / HANDBOOK CONTENT
   Trusted local design/help content, also indexed by the spotlight search.
   Each section renders with the current session state `d`. Keep remote
   content out of this privileged context.
   ========================================================================== */
import { TSVG, icon, BOLTICON, trunc, esc } from '../core/index.js';

export const HBDATA = [
  {
    n: '00', t: 'what this is', h: d => `<h1>what this is</h1><div class="sub">bitos design system · v2 — aqua edition</div>
  <div class="prose"><p>bitos is honest software wearing a familiar skin. underneath: the same
  alphabet as the machine — <strong>one accent, hairlines, status as text, ansi semantics</strong>.
  on top: the gestures everyone already knows — <strong>dock, spotlight, traffic lights, working
  menus, frosted materials</strong>. familiar hands, honest machine.</p>
  <p>four principles:</p><ul>
  <li><strong>honest like a terminal.</strong> states are text, progress is countable, errors say
  what failed and where.</li>
  <li><strong>one accent.</strong> zap violet is reserved for focus, selection, identity, zaps.
  if something is purple, you can interact with it — or it is about you.</li>
  <li><strong>ansi semantics.</strong> green ok, yellow caution, red failure, cyan metadata —
  the 16-color language users already speak.</li>
  <li><strong>a familiar skin.</strong> every aqua gesture is real: every menu item works, every
  dock click does something, spotlight reaches everything. no decorative chrome.</li></ul>
  <p>this document is itself a bitos app. if you can read it, the tokens work.</p></div>`
  },
  {
    n: '01', t: 'color & materials', h: d => {
      const G = (t, items) => `<div class="grp"><span class="lbl">${t}</span>${items.map(([n, v, u]) =>
        `<div class="sw"><i style="background:${v}"></i><div><span class="n">${n}</span><span class="v">${v}</span></div><span class="u">${u}</span></div>`).join('')}</div>`;
      return `<h1>color &amp; materials</h1><div class="sub">one ramp · glass only where it floats</div>
  ${G('backgrounds', [['bg0', '#0a0a0f', 'void — wallpaper, terminal'], ['bg1', '#14141c', 'surface — window bodies'],
        ['bg2', '#1b1b25', 'toolbars, raised'], ['bg3', '#24242f', 'hover — feedback only']])}
  ${G('ink', [['ink', '#eceae7', 'primary text'], ['ink2', '#a6a4ae', 'secondary, labels'], ['ink3', '#6b6a74', 'faint, timestamps']])}
  ${G('zap · accent', [['acc', '#8b5cf6', 'focus, selection, zap — the only brand color'],
        ['acc2', '#a78bfa', 'accent text on dark'], ['acc-t', 'rgba(139,92,246,.14)', 'selected backgrounds'],
        ['acc-t2', 'rgba(139,92,246,.30)', 'chart fills']])}
  ${G('ansi semantics', [['ok · ansi 32', '#58c26c', 'success · switch ON'], ['warn · ansi 33', '#e0a94a', 'caution, connecting'],
        ['err · ansi 31', '#e5484d', 'failure, secrets'], ['cyan · ansi 36', '#54b9c7', 'metadata, paths']])}
  ${G('window controls', [['close', '#ff5f57', 'red — closes'], ['minimize', '#febc2e', 'yellow — docks'], ['zoom', '#28c840', 'green — fills screen']])}
  <div class="prose"><p><strong>materials rule:</strong> frosted glass (rgba ~70% + <code>blur(26px)
  saturate(1.6)</code>) is allowed only on chrome that floats <em>over</em> content — menu bar, dock,
  menus, spotlight, control center, notifications. window bodies stay opaque for readability.
  hairlines are white at 10–16% alpha, never gray-on-gray.</p></div>`;
    }
  },
  {
    n: '02', t: 'type', h: d => `<h1>type</h1><div class="sub">system sans for humans · plex mono for machines</div>
  ${[['32', 'display — lock clock, about'], ['18', 'section heads'], ['15', 'handbook h1, handles'],
        ['13', 'ui base — menus, notes, settings'], ['12', 'buttons, labels'], ['11', 'keys, badges, meta'], ['10', 'uppercase micro-labels']]
        .map(([s, u]) => `<div class="spec"><span class="smp" style="font-size:${s}px">${s}px — the quick brown fox 0123456789</span><span class="meta">${u}</span></div>`).join('')}
  <div class="prose"><p>two stacks, two audiences. <code>--fys</code> (system sans — SF Pro on apple
  hardware) speaks to humans: menus, prose, notes, settings. <code>--fm</code> (IBM Plex Mono)
  speaks for the machine: terminal, keys, npub/nsec, badges, timestamps, relays. if a string could
  be typed at a prompt, it is mono. numbers are tabular, right-aligned. never center paragraphs.</p></div>`
  },
  {
    n: '03', t: 'space & shape', h: d => `<h1>space &amp; shape</h1><div class="sub">4px grid · soft corners, hard discipline</div>
  <div class="bars">${[4, 8, 12, 16, 24, 32, 48].map(s => `<div class="bar-row"><i style="width:${s}px"></i>${s}</div>`).join('')}</div>
  <div class="prose" style="margin-top:18px"><p>spacing is a 4px grid; the wallpaper dot grid is 24px.
  the radius scale: <strong>10px</strong> windows, <strong>8px</strong> menus and cards,
  <strong>6px</strong> buttons and inputs, <strong>4px</strong> chips and badges, full-round for
  switches and dock lights. minimum hit target 28px. hairlines at rgba(255,255,255,.10–.16).</p></div>`
  },
  {
    n: '04', t: 'components', h: d => `<h1>components</h1><div class="sub">live — click everything</div>
  <div class="crow"><span class="lbl">buttons</span>
    <button class="btn">default</button><button class="btn pri">primary · zap</button>
    <button class="btn ghost">ghost</button><button class="btn danger">danger</button>
    <button class="btn sm">small</button></div>
  <div class="crow"><span class="lbl">switch — ansi green finally does ui work</span>
    <button class="sw2 on"><i></i></button><button class="sw2"><i></i></button></div>
  <div class="crow"><span class="lbl">segmented control</span>
    <div class="seg"><button class="on">zap</button><button>phosphor</button><button>amber</button></div></div>
  <div class="crow"><span class="lbl">input</span>
    <div class="field"><input placeholder="hostname — focus me" style="width:220px"></div></div>
  <div class="crow"><span class="lbl">traffic lights — hover me</span>
    <span class="wtl"><button class="c">${TSVG.c}</button><button class="m">${TSVG.m}</button><button class="z">${TSVG.z}</button></span>
    <span class="mono-dim">gray when the window is unfocused</span></div>
  <div class="crow"><span class="lbl">badges</span>
    <span class="kb k1">kind:1</span><span class="kb k3">kind:3</span><span class="kb k7">kind:7</span>
    <span class="kb kz">kind:9735</span></div>
  <div class="crow"><span class="lbl">key chip — always copyable</span>
    <button class="key" data-copy="${d.npub}">${icon('copy', 11)}<span>${trunc(d.npub)}</span></button>
    <button class="key rev" data-copy="${d.nsec}">${icon('copy', 11)}<span>nsec1${'·'.repeat(14)}</span></button></div>
  <div class="crow"><span class="lbl">keyboard</span>
    <kbd>ctrl</kbd><kbd>space</kbd><span class="mono-dim">spotlight</span>
    <kbd>?</kbd><span class="mono-dim">shortcuts</span><kbd>alt</kbd><kbd>w</kbd><span class="mono-dim">close</span></div>
  <div class="crow"><span class="lbl">zap + spotlight + toast — try them</span>
    <button class="zb" data-zd>${BOLTICON(10)}<span>zap 21</span></button>
    <button class="btn ghost sm" data-sd>open spotlight</button>
    <button class="btn ghost sm" data-td>trigger banner</button></div>
  <div class="anat"><span class="lbl" style="width:100%">window anatomy</span>
    <div style="display:flex;gap:26px;flex-wrap:wrap;align-items:flex-start">
    <div class="anat-win"><div class="ah"><span class="al"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></span><span class="t">terminal</span></div>
      <div class="ab"></div><div class="ag"></div>
      <b class="mk" style="top:-9px;left:16px">1</b><b class="mk" style="top:3px;left:170px">2</b>
      <b class="mk" style="top:22px;right:110px">3</b><b class="mk" style="bottom:34px;left:12px">4</b>
      <b class="mk" style="bottom:-9px;right:6px">5</b></div>
    <ol class="anat-legend"><li><b>1</b>traffic lights 12px · gray when unfocused</li>
    <li><b>2</b>centered title 13px · 40px bar · drag to move</li>
    <li><b>3</b>hairline chrome / body</li><li><b>4</b>opaque body · mono where the machine speaks</li>
    <li><b>5</b>resize grip 18px</li></ol></div></div>`
  },
  {
    n: '05', t: 'motion', h: d => `<h1>motion</h1><div class="sub">springs, not theatre</div>
  <div class="prose"><p>one curve family, <code>cubic-bezier(.2,.8,.25,1)</code>, three durations:
  <code>130ms</code> hover and menus (scale .97), <code>200ms</code> window open (scale .96),
  <code>320ms</code> genie minimize toward the dock. the dock magnifies under the pointer with
  falloff to neighbors — playful but responsive, never laggy. <code>prefers-reduced-motion</code>
  removes all of it; the interface must survive that.</p>
  <p>snapping keeps its promise: while dragging near an edge, the dashed preview shows exactly
  where the window will land.</p></div>
  <div class="mo-track"><i class="mo-tile" style="--trg:4.5"></i></div>
  <button class="btn sm" data-mo>replay</button>`
  },
  {
    n: '06', t: 'nostr identity', h: d => `<h1>nostr identity</h1><div class="sub">the key is the account</div>
  <div class="prose"><p>a key is not a form field. identity components follow a strict lifecycle:</p>
  <ul><li><strong>npub</strong> is always truncated in layout — <code>${trunc(d.npub)}</code> — and
  <strong>always</strong> one click from a full copy (menubar edit menu works too).</li>
  <li><strong>nsec</strong> is never rendered by default: masked dots, explicit intent to reveal,
  err-red frame, auto-hidden with a visible countdown.</li>
  <li><strong>petname</strong> (derived: <code>${esc(d.pet)}</code>) is the friendly handle; the raw
  key is a copy action, not reading material.</li>
  <li>avatars are <strong>identicons</strong>: 5×5 mirrored cells from the key hash — snowflakes
  for keys. on the lock screen it stands in for a user photo.</li>
  <li>first boot offers an <strong>offline key file</strong> — a plain .txt the user owns.</li></ul></div>
  <div class="crow"><canvas width="50" height="50" style="border:1px solid var(--hair);border-radius:50%;image-rendering:pixelated"></canvas>
    <button class="key" data-copy="${d.npub}">${icon('copy', 11)}<span>${trunc(d.npub)}</span></button></div>
  <div class="prose"><p>prototype note: entropy is real, bech32 is real, but pubkey derivation is a
  stub — the same stance as the os itself: nostr ui ships first, the <code>keysvc</code> native
  service makes it true later.</p></div>`
  },
  {
    n: '07', t: 'voice', h: d => `<h1>voice</h1><div class="sub">lowercase · status prefixes · verbs first</div>
  <div class="prose"><p>system copy is lowercase and calm. status messages start with a bracketed
  prefix — <code>[ ok ]</code>, <code>[ !! ]</code>, <code>[ zap ]</code> — repeated as color on
  the notification icon, so meaning survives without reading.</p></div>
  <div class="vd"><span class="vt y">do</span><code>[ ok ] relay purplerelay.com connected · 38ms</code></div>
  <div class="vd"><span class="vt n">dont</span><code>Great news! Your relay was connected successfully!!</code></div>
  <div class="vd"><span class="vt y">do</span><code>[ !! ] relay nos.lol timed out — retrying in 30s</code></div>
  <div class="vd"><span class="vt n">dont</span><code>Oops! Something went wrong :(</code></div>
  <div class="prose" style="margin-top:16px"><p>numbers right-aligned, tabular. no exclamation
  marks — excitement is a color, not a punctuation mark.</p></div>`
  },
  {
    n: '08', t: 'ux patterns', h: d => `<h1>ux patterns</h1><div class="sub">unix power, human handles</div>
  <div class="prose"><ul>
  <li><strong>everything is one keystroke away.</strong> spotlight (ctrl space) indexes apps,
  handbook sections, actions and commands. if a feature exists, you can type its name.</li>
  <li><strong>menus are real.</strong> every item in the menu bar does something — no decorative
  menus, no grayed-out lies. the app menu renames itself to the focused window.</li>
  <li><strong>control center.</strong> the three things people actually change — accent, text size,
  wallpaper — live one click from anywhere, in a popover, not buried in settings.</li>
  <li><strong>identity is presence, not password.</strong> the lock screen shows your identicon
  and handle; enter or click and you are in. keys do the security, not typing.</li>
  <li><strong>actionable banners.</strong> zap → open feed. relay down → rejoin. never a dead end.</li>
  <li><strong>empty states are instructions.</strong> a blank feed says "all relays offline —
  join one below".</li>
  <li><strong>safety by default.</strong> destructive buttons arm before firing; secrets
  auto-hide with a countdown.</li>
  <li><strong>teach by doing.</strong> the getting-started checklist is real actions with real
  effects — 5/5 is earned.</li></ul></div>
  <div class="vd"><span class="vt y">do</span><code>[ !! ] relay nos.lol timed out · [rejoin]</code></div>
  <div class="vd"><span class="vt n">dont</span><code>An error occurred. (code 0x8002)</code></div>`
  },
];
