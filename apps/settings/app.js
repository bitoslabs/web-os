/* Built-in app: Settings. macOS-style sidebar + search + detail. Preview state
 * persists to localStorage; device backlight, audio, network, and power actions
 * require the native services in docs/NATIVE_API.md before they do anything. */
import { registerApp, store, esc, icon, trunc, wireComp, toast, dialog, native, clamp, SYSINFO, drawIdenticon, genKey, petname, copyText } from '../../src/core/index.js';
import { setAccent, syncAccentUI, ACCENT_COLORS, ACCENT_SWATCHES, accentHexOf, accentName } from '../../src/shell/menubar.js';
import { syncCC } from '../../src/shell/control-center.js';
import { mark } from '../../src/shell/tour.js';
import { WM } from '../../src/shell/window-manager.js';
import { toggleWall, toggleIcons, setFontScale, fontScale, setBright, setMotion, setResize, setToasts, setTheme, FS_STEPS } from '../../src/shell/menus.js';
import { lockFlow } from '../../src/shell/lock.js';
import { SIM } from '../../src/data/sim.js';

registerApp('settings', {
  title: 'settings', icon: 'sl', sub: '/var/lib/bitos', w: 820, h: 580,
  mount(body) {
    const d = store.d;
    const rel = SIM.relays.filter(r => r.on).length;
    const used = Math.min(31.4, 2.1 + d.seen * 0.012);
    const usedTxt = used.toFixed(1) + ' / 32 gb';
    const pct = Math.round(used / 32 * 100);

    /* ---------- row helpers ---------- */
    const lbl = r => `<div class="rt"><span class="lbl">${esc(r.label)}</span>${r.desc ? esc(r.desc) : ''}</div>`;
    const rowTag = (r, inner) => `<div class="row" data-r="${r.id}">${lbl(r)}${inner}</div>`;

    const S = (id, o) => ({ id, type: 'switch', ...o });
    const SG = (id, o) => ({ id, type: 'seg', ...o });
    const RG = (id, o) => ({ id, type: 'range', ...o });
    const IN = (id, o) => ({ id, type: 'input', ...o });
    const BT = (id, o) => ({ id, type: 'button', ...o });
    const TX = (id, o) => ({ id, type: 'text', ...o });
    const KE = (id, o) => ({ id, type: 'key', ...o });
    const BA = (id, o) => ({ id, type: 'bar', ...o });
    const SL = (id, o) => ({ id, type: 'select', ...o });

    function renderRow(r) {
      const dis = typeof r.disabled === 'function' ? r.disabled() : r.disabled;
      if (r.type === 'custom') return `<div class="row" data-r="${r.id}">${r.noLabel ? '' : lbl(r)}${r.html}</div>`;
      if (r.type === 'switch') return rowTag(r, `<button class="sw2${r.get() ? ' on' : ''}"${dis ? ' disabled' : ''}><i></i></button>`);
      if (r.type === 'seg') return rowTag(r, `<div class="seg">${r.options.map(o => `<button data-val="${esc(o.value)}" class="${String(r.get()) === String(o.value) ? 'on' : ''}">${esc(o.label)}</button>`).join('')}</div>`);
      if (r.type === 'range') return rowTag(r, `<div class="u-row u-gap-8"><input type="range" data-rng min="${r.min}" max="${r.max}" step="${r.step || 1}" value="${r.get()}"${dis ? ' disabled' : ''}>${r.fmt ? `<span class="u-static" data-out>${esc(r.fmt(r.get()))}</span>` : ''}</div>`);
      if (r.type === 'input') return rowTag(r, `<input data-in value="${esc(r.get())}"${r.maxlength ? ` maxlength="${r.maxlength}"` : ''} spellcheck="false">`);
      if (r.type === 'button') return rowTag(r, `<button class="btn ${r.cls || 'sm'}"${dis ? ' disabled' : ''}>${esc(r.btn)}</button>`);
      if (r.type === 'text') return rowTag(r, `<span class="mono-dim">${esc(r.get())}</span>`);
      if (r.type === 'key') return rowTag(r, `<button class="key" data-copy="${esc(r.get())}">${icon('copy', 11)}<span>${esc(trunc(r.get()))}</span></button>`);
      if (r.type === 'select') return rowTag(r, `<div class="sel"><select data-sel>${r.options.map(o => `<option value="${esc(o)}"${o === r.get() ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`);
      if (r.type === 'bar') return rowTag(r, `<div class="u-row u-gap-8"><span class="bar"><i style="width:${r.pct}%"></i></span><span class="u-static">${esc(r.get())}</span></div>`);
      return '';
    }

    /* ---------- sections ---------- */
    const themeRow = { id: 'theme', type: 'custom', label: 'theme', desc: 'light, dark, or follow the system', html:
      `<div class="themecards">${['light', 'dark', 'auto'].map(t => `<button class="tcard ${d.theme === t ? 'on' : ''}" data-theme-opt="${t}" title="${t}"><span class="tp ${t}"></span><span class="tn">${t}</span></button>`).join('')}</div>`,
      wire(root) {
        root.querySelectorAll('[data-theme-opt]').forEach(b => b.onclick = () => {
          setTheme(b.dataset.themeOpt);
          document.querySelectorAll('[data-theme-opt]').forEach(x => x.classList.toggle('on', x.dataset.themeOpt === d.theme));
        });
      } };
    const accentRow = { id: 'accent', type: 'custom', label: 'theme color', desc: 'accent — focus, selection, identity', html:
      `<div class="accside"><div class="swatches">
        <label class="sw custom${d.accent === 'custom' ? ' on' : ''}" data-sw="custom" title="custom"><input type="color" class="pick" data-accpick value="${esc(d.accentHex || '#8b5cf6')}" aria-label="custom accent color"></label>
        ${ACCENT_SWATCHES.map(n => { const on = d.accent === n || accentHexOf(d.accent) === ACCENT_COLORS[n]; return `<button class="sw${on ? ' on' : ''}" data-sw="${n}" title="${n}" style="background:${ACCENT_COLORS[n]}"></button>`; }).join('')}
      </div><span class="accname" data-accname>${esc(accentName())}</span></div>`,
      wire(root) {
        root.querySelectorAll('.sw:not(.custom)').forEach(b => b.onclick = () => { setAccent(b.dataset.sw); mark('accent'); syncCC(); toast('theme color → <b>' + b.dataset.sw + '</b>', 'ok'); });
        const pick = root.querySelector('[data-accpick]');
        pick.oninput = e => { setAccent('custom', e.target.value); mark('accent'); syncCC(); };
        // keep the name and selection in sync while this pane stays open
        const iv = setInterval(() => { const row = body.querySelector('[data-r="accent"]'); if (!row) { clearInterval(iv); return; } row.querySelector('[data-accname]').textContent = accentName(); }, 800);
      } };

    const resetBtn = el => {
      let armed = false, at = null;
      el.onclick = () => {
        if (!armed) { armed = true; el.classList.add('armed'); el.textContent = 'sure?'; at = setTimeout(() => { armed = false; el.classList.remove('armed'); el.textContent = 'reset'; }, 3000); }
        else { clearTimeout(at); store.reset(); }
      };
    };

    const restart = (action, label) => async () => {
      const ok = await dialog({ title: label + '?', danger: action === 'shutdown', ok: label, body: 'this will ' + (action === 'restart' ? 'restart' : 'power off') + ' the machine and end your session.' });
      if (!ok) return;
      try { await native.requestPowerAction(action); toast('[ !! ] ' + label + ' requested', 'info'); }
      catch (e) { toast('could not ' + action + ' — ' + esc(e.message || e.code || 'service unavailable'), 'err'); }
    };

    const KEYMAPS = ['us', 'us-intl', 'de', 'fr', 'es', 'se', 'br', 'jp'];
    const cardName = () => { const pn = body.querySelector('.set-prof .pn'); if (pn) pn.textContent = d.name || d.pet; };
    const setHandle = v => { d.pet = v.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || d.pet; store.save(); cardName(); toast('handle → <b>' + esc(d.pet) + '</b>', 'ok'); return d.pet; };
    const setName = v => { d.name = v.trim().replace(/\s+/g, ' ').slice(0, 40); store.save(); cardName(); const n = body.querySelector('[data-pf-name]'); if (n) n.textContent = d.name || d.pet; return d.name; };
    const setBio = v => { d.bio = v.trim().slice(0, 80); store.save(); const b = body.querySelector('.pf-b'); if (b) b.textContent = d.bio || 'no status set'; return d.bio; };
    const setNip05 = v => { d.nip05 = v.trim().slice(0, 64); store.save(); return d.nip05; };
    const setSite = v => { d.website = v.trim().slice(0, 80); store.save(); return d.website; };
    const setLud16 = v => { d.lud16 = v.trim().slice(0, 64); store.save(); return d.lud16; };
    const paintAv = (el, size) => {
      if (!el) return;
      el.innerHTML = '';
      if (d.avatar) { const img = document.createElement('img'); img.alt = ''; img.src = d.avatar; el.append(img); }
      else { const cv = document.createElement('canvas'); cv.width = size; cv.height = size; el.append(cv); try { drawIdenticon(cv, d.npub); } catch (e) { } }
    };
    const paintAvatars = () => {
      paintAv(body.querySelector('[data-card-av]'), 38);
      detailEl.querySelectorAll('[data-pf-av]').forEach(el => paintAv(el, 64));
    };
    const readAvatar = file => new Promise(res => {
      if (!file || !/^image\//.test(file.type || '')) { res(null); return; }
      const fr = new FileReader();
      fr.onerror = () => res(null);
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => res(null);
        img.onload = () => {
          try {
            const S = 160, c = document.createElement('canvas'); c.width = S; c.height = S;
            const x = c.getContext('2d'), m = Math.min(img.width, img.height);
            x.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
            res(c.toDataURL('image/jpeg', .85));
          } catch (e) { res(null); }
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
    const setAvatar = v => { d.avatar = v || ''; store.save(); paintAvatars(); };
    const avatarRow = { id: 'p_av', type: 'custom', label: 'avatar', desc: 'square image, centre-cropped · preview only', html:
      `<div class="u-row u-gap-8"><button class="btn sm" data-av-up>change…</button><button class="btn sm ghost" data-av-rm${d.avatar ? '' : ' disabled'}>remove</button><input type="file" accept="image/*" hidden data-av-file></div>`,
      wire(root) {
        const file = root.querySelector('[data-av-file]'), up = root.querySelector('[data-av-up]'), rm = root.querySelector('[data-av-rm]');
        up.onclick = () => file.click();
        file.onchange = async () => {
          const url = await readAvatar(file.files && file.files[0]);
          file.value = '';
          if (!url) { toast('could not read that image', 'err'); return; }
          setAvatar(url); rm.disabled = false; toast('avatar updated', 'ok');
        };
        rm.onclick = () => { setAvatar(''); rm.disabled = true; toast('avatar removed — using identicon', 'ok'); };
      } };
    const mkNsec = id => ({ id, type: 'custom', label: 'secret key', desc: 'never share — guard it like cash', html:
      `<div class="u-row u-gap-8"><span data-sec class="mono-dim">hidden</span><button class="btn sm" data-reveal>reveal</button></div>`,
      wire(root) {
        const out = root.querySelector('[data-sec]'), rv = root.querySelector('[data-reveal]');
        let shown = false, t = null;
        const hide = () => { shown = false; out.textContent = 'hidden'; out.classList.remove('c-err'); rv.textContent = 'reveal'; clearTimeout(t); };
        rv.onclick = () => {
          if (!shown) { shown = true; out.textContent = d.nsec; out.classList.add('c-err'); rv.textContent = 'copy'; t = setTimeout(hide, 20000); }
          else copyText(d.nsec, 'secret key copied — clear it when done');
        };
        rv.ondblclick = hide;
      } });
    const downloadKey = () => {
      const txt = `bitos key backup\ncreated: ${new Date().toISOString()}\nhandle: ${d.pet}\n\n` +
        `npub (public — share freely):\n${d.npub}\n\nnsec (secret — never share, never screenshot):\n${d.nsec}\n\n` +
        `store this offline. bitos will not show the secret again.\n`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
      a.download = `bitos-key-${d.host}.txt`; a.click(); URL.revokeObjectURL(a.href);
      toast('key file saved — treat it like cash', 'ok');
    };
    const rotateKey = async () => {
      const ok = await dialog({ title: 'rotate identity?', danger: true, ok: 'rotate', body: 'a new keypair replaces this one; the old key is not recoverable here.' });
      if (!ok) return;
      const k = genKey(); d.npub = k.npub; d.nsec = k.nsec; d.pet = petname(k.npub); store.save();
      cardName(); paintAvatars();
      const pk = body.querySelector('.set-prof .pk'); if (pk) pk.textContent = trunc(d.npub);
      const pfk = body.querySelector('[data-pf-npub]'); if (pfk) pfk.textContent = d.npub;
      renderDetail(cur); renderList();
      toast('identity rotated — new npub ' + trunc(d.npub), 'ok');
    };

    const sections = [
      { id: 'identity', name: 'identity', icon: 'bolt', cap: 'you', groups: [
        { title: 'machine', rows: [
          IN('host', { label: 'hostname', desc: 'shows in your shell prompt', maxlength: 20, get: () => d.host, set: v => {
            d.host = v.toLowerCase().replace(/[^a-z0-9-]/g, '') || 'bitos'; store.save();
            toast('hostname → <b>' + esc(d.host) + '</b>', 'ok'); return d.host;
          } }),
          SL('keymap', { label: 'keymap', desc: 'keyboard layout', options: KEYMAPS, get: () => d.keymap, set: v => { d.keymap = v; store.save(); toast('keymap → <b>' + esc(v) + '</b>', 'ok'); } }),
          BT('lock', { label: 'lock screen', desc: 'preview lock — enter or click to return', btn: 'lock', cls: 'sm', fn: () => lockFlow(() => { }) }),
        ] },
      ] },
      { id: 'profile', name: 'profile', icon: 'bolt', hidden: true, groups: [
        { rows: [
          { id: 'p_head', type: 'custom', noLabel: true, html:
            `<div class="pf-head"><div class="av av-lg" data-pf-av></div><div class="pf-meta"><div class="pf-n" data-pf-name>${esc(d.name || d.pet)}</div><div class="pf-k" data-pf-npub>${esc(d.npub)}</div><div class="pf-b">${esc(d.bio || 'no status set')}</div></div></div>`,
            wire(root) { paintAv(root.querySelector('[data-pf-av]'), 64); } },
          avatarRow,
        ] },
        { title: 'profile', rows: [
          IN('p_name', { label: 'display name', desc: 'shown on the profile and lock screen', maxlength: 40, get: () => d.name || d.pet, set: setName }),
          IN('p_bio', { label: 'about', desc: 'a short line on your profile', maxlength: 80, get: () => d.bio, set: setBio }),
          IN('p_handle', { label: 'handle', desc: 'your petname', maxlength: 32, get: () => d.pet, set: setHandle }),
        ] },
        { title: 'nostr profile', rows: [
          IN('p_nip05', { label: 'nip05', desc: 'name@domain — verifiable handle', maxlength: 64, get: () => d.nip05, set: setNip05 }),
          IN('p_site', { label: 'website', maxlength: 80, get: () => d.website, set: setSite }),
          IN('p_lud16', { label: 'lightning address', desc: 'name@wallet — for receiving zaps', maxlength: 64, get: () => d.lud16, set: setLud16 }),
          BT('p_pub', { label: 'publish profile', desc: 'preview — would broadcast a kind:0 metadata event', btn: 'publish', cls: 'sm', fn: () => {
            toast('profile published — kind:0 to ' + rel + ' relays (preview)', 'ok');
          } }),
        ] },
        { title: 'keys', rows: [
          KE('p_npub', { label: 'public key', desc: 'share freely — click to copy', get: () => d.npub }),
          mkNsec('p_nsec'),
          BT('p_backup', { label: 'key backup', desc: 'download npub + nsec as a text file', btn: 'save key file', cls: 'sm', fn: downloadKey }),
          BT('p_rot', { label: 'rotate key', desc: 'generate a fresh keypair · old key is gone', btn: 'rotate…', cls: 'sm danger', fn: rotateKey }),
        ] },
        { title: 'session', rows: [
          BT('p_lock', { label: 'lock screen', desc: 'preview lock — enter or click to return', btn: 'lock', cls: 'sm', fn: () => lockFlow(() => { }) }),
        ] },
      ] },
      { id: 'appearance', name: 'appearance', icon: 'sl', cap: 'you', groups: [
        { rows: [themeRow, accentRow,
          S('motion', { label: 'reduce motion', desc: 'stop window and menu animation', get: () => d.motion, set: v => setMotion(v) }),
        ] },
      ] },
      { id: 'desktop', name: 'desktop & dock', icon: 'grid', cap: 'you', groups: [
        { rows: [
          S('wall', { label: 'wallpaper', desc: 'grid + packets', get: () => d.wall, set: v => toggleWall() }),
          S('icons', { label: 'desktop icons', get: () => d.icons, set: v => toggleIcons() }),
          S('resize', { label: 'window resizing', desc: 'drag window edges and corners', get: () => d.resize !== false, set: v => setResize(v) }),
        ] },
      ] },
      { id: 'display', name: 'display', icon: 'max', cap: 'you', groups: [
        { rows: [
          SG('fs', { label: 'text size', desc: 'scales the whole interface', get: () => fontScale(), options: FS_STEPS.map(([k, v]) => ({ label: k, value: v })), set: v => setFontScale(parseFloat(v)) }),
          RG('bright', { label: 'brightness', desc: 'preview — backlight needs the display service', min: 40, max: 120, step: 5, get: () => d.bright, set: v => setBright(clamp(v, 40, 120)), fmt: v => v + '%' }),
        ] },
      ] },
      { id: 'sound', name: 'sound', icon: 'act', cap: 'you', groups: [
        { rows: [
          RG('vol', { label: 'output volume', desc: 'preview — routes through the sound service', min: 0, max: 100, step: 5, get: () => d.vol, set: v => { d.vol = v; store.save(); }, fmt: v => d.mute ? 'muted' : v + '%', disabled: () => d.mute }),
          S('mute', { label: 'mute', get: () => d.mute, set: v => { d.mute = !!v; store.save(); }, after: () => {
            const out = body.querySelector('[data-r="vol"] [data-out]'); if (out) out.textContent = d.mute ? 'muted' : d.vol + '%';
            const rg = body.querySelector('[data-r="vol"] [data-rng]'); if (rg) rg.disabled = d.mute;
          } }),
        ] },
      ] },
      { id: 'notifications', name: 'notifications', icon: 'list', cap: 'you', groups: [
        { rows: [
          S('toasts', { label: 'toast messages', desc: 'banners for saves, deletes, and errors', get: () => d.toasts !== false, set: v => setToasts(v) }),
          S('alerts', { label: 'alert sounds', desc: 'banners stay visible when off', get: () => d.alerts, set: v => { d.alerts = !!v; store.save(); } }),
        ] },
      ] },
      { id: 'network', name: 'network', icon: 'ext', cap: 'system', groups: [
        { rows: [
          TX('wifi', { label: 'wi-fi', desc: native ? 'adapter status from the network service' : 'not available in the browser preview', get: () => native ? 'checking…' : 'no adapter' }),
          TX('relays', { label: 'nostr relays', desc: 'live preview peers', get: () => rel + '/4 up' }),
          BT('openrel', { label: 'relay manager', desc: 'add, drop, or inspect relays', btn: 'open nostr', cls: 'sm', fn: () => WM.open('nostr') }),
        ] },
      ] },
      { id: 'power', name: 'power', icon: 'pow', cap: 'system', groups: [
        { rows: [
          SG('pow', { label: 'power mode', desc: 'preview — the governor is native', get: () => d.power, options: [{ label: 'saver', value: 'saver' }, { label: 'balanced', value: 'balanced' }, { label: 'performance', value: 'performance' }], set: v => { d.power = v; store.save(); } }),
          BT('restart', { label: 'restart', desc: native ? 'asks for confirmation' : 'requires the system service', btn: 'restart', cls: 'sm', disabled: !native, fn: restart('restart', 'restart') }),
          BT('shutdown', { label: 'shut down', desc: native ? 'asks for confirmation' : 'requires the system service', btn: 'shut down', cls: 'sm danger', disabled: !native, fn: restart('shutdown', 'shut down') }),
        ] },
      ] },
      { id: 'storage', name: 'storage', icon: 'home', cap: 'system', groups: [
        { rows: [
          BA('disk', { label: 'data partition', desc: 'preview estimate · 32 gb total', pct, get: () => usedTxt }),
          BT('caches', { label: 'clear caches', desc: 'preview — reports freed space only', btn: 'clear', cls: 'sm', fn: () => toast('preview only — caches are not real yet', 'info') }),
        ] },
      ] },
      { id: 'privacy', name: 'privacy & security', icon: 'check', cap: 'system', groups: [
        { rows: [
          S('telemetry', { label: 'share anonymous usage', desc: 'off by default', get: () => d.telemetry, set: v => { d.telemetry = !!v; store.save(); } }),
          S('crashes', { label: 'crash reports', get: () => d.crashes, set: v => { d.crashes = !!v; store.save(); } }),
          BT('clear', { label: 'clear local data', desc: 'wipes preview state, keeps your keys', btn: 'clear', cls: 'sm danger', fn: async () => {
            const ok = await dialog({ title: 'clear local data?', danger: true, ok: 'clear', body: 'removes preview preferences and activity; your keypair is not exported.' });
            if (ok) store.reset();
          } }),
        ] },
      ] },
      { id: 'general', name: 'general', icon: 'help', cap: 'system', groups: [
        { rows: [
          TX('device', { label: 'device', get: () => SYSINFO ? (SYSINFO.deviceName || 'bitos') + (SYSINFO.cpuArch ? ' · ' + SYSINFO.cpuArch : '') : 'bitos web preview' }),
          TX('version', { label: 'version', get: () => 'bitos web · v1 preview' }),
          TX('born', { label: 'account created', get: () => new Date(d.born).toLocaleDateString() }),
          BT('handbook', { label: 'handbook', desc: 'design system and usage guide', btn: 'open', cls: 'sm', fn: () => WM.open('handbook') }),
          BT('sysmon', { label: 'system monitor', btn: 'open', cls: 'sm', fn: () => WM.open('system-monitor') }),
          BT('reset', { label: 'reset demo', desc: 'wipes state · reboots into setup', btn: 'reset', cls: 'sm danger', fn: () => { }, wire: root => resetBtn(root.querySelector('button')) }),
        ] },
      ] },
    ];

    const byId = {};
    sections.forEach(s => s.groups.forEach(g => g.rows.forEach(r => { r.sec = s.id; byId[r.id] = r; })));

    /* ---------- shell markup ---------- */
    body.innerHTML = `<div class="set-shell">
      <aside class="set-side">
        <div class="set-search">${icon('mag', 14)}<input data-setq placeholder="search settings" spellcheck="false" autocomplete="off"></div>
        <div class="set-prof"><div class="av av-card" data-card-av></div><div><div class="pn">${esc(d.name || d.pet)}</div><div class="pk">${esc(trunc(d.npub))}</div></div></div>
        <div class="set-list" data-setlist></div>
      </aside>
      <section class="set-detail" data-setdetail></section>
    </div>`;
    paintAv(body.querySelector('[data-card-av]'), 38);
    let cur = 'profile', curHit = null;
    const prof = body.querySelector('.set-prof');
    prof.title = 'open profile';
    prof.onclick = () => { curHit = null; renderDetail('profile'); renderList(); };
    const syncProf = () => prof.classList.toggle('on', cur === 'profile');

    const listEl = body.querySelector('[data-setlist]'), detailEl = body.querySelector('[data-setdetail]'), qEl = body.querySelector('[data-setq]');

    function renderSections() {
      let cap = '';
      listEl.innerHTML = sections.filter(s => !s.hidden).map(s => {
        let head = '';
        if (s.cap !== cap) { cap = s.cap; head = `<div class="set-cap">${esc(cap)}</div>`; }
        return head + `<button class="set-item${s.id === cur ? ' on' : ''}" data-sec="${s.id}"><span class="sv">${icon(s.icon, 16)}</span><b>${esc(s.name)}</b></button>`;
      }).join('');
    }
    function renderResults(q) {
      const hits = [];
      sections.forEach(s => s.groups.forEach(g => g.rows.forEach(r => {
        if (!r.label) return;
        const hay = (r.label + ' ' + (r.desc || '') + ' ' + s.name).toLowerCase();
        if (hay.includes(q)) hits.push({ s, r });
      })));
      listEl.innerHTML = hits.length
        ? hits.map(h => `<button class="set-item${h.r.id === curHit ? ' on' : ''}" data-sec="${h.s.id}" data-hit="${h.r.id}"><span class="sv">${icon(h.s.icon, 16)}</span><span><b>${esc(h.r.label)}</b><em>${esc(h.s.name)}</em></span></button>`).join('')
        : `<div class="set-empty">no settings match “${esc(q)}”</div>`;
    }
    function renderList() {
      const q = qEl.value.trim().toLowerCase();
      if (q) renderResults(q); else renderSections();
    }

    function renderDetail(id, hitId) {
      const s = sections.find(x => x.id === id) || sections[0];
      cur = s.id;
      syncProf();
      const rowsHtml = s.groups.map(g => `<div class="grpbox">${g.title ? `<span class="lbl">${esc(g.title)}</span>` : ''}${g.rows.map(renderRow).join('')}</div>`).join('');
      detailEl.innerHTML = `<div class="set-h"><h1>${esc(s.name)}</h1><div class="sub">/var/lib/bitos · preview settings</div></div><div class="set-body set">${rowsHtml}</div>`;
      wireComp(detailEl);
      s.groups.forEach(g => g.rows.forEach(r => {
        const rowEl = detailEl.querySelector(`[data-r="${r.id}"]`); if (!rowEl) return;
        if (r.type === 'custom' || r.wire) { if (r.wire) r.wire(rowEl); return; }
        const sw = rowEl.querySelector('.sw2'), seg = rowEl.querySelector('.seg'), rng = rowEl.querySelector('[data-rng]'), inp = rowEl.querySelector('[data-in]'), btn = rowEl.querySelector('button.btn'), sel = rowEl.querySelector('[data-sel]');
        if (sw && r.get && r.set) sw.onclick = () => { r.set(!r.get()); sw.classList.toggle('on', !!r.get()); if (r.after) r.after(); };
        if (seg && r.set) seg.querySelectorAll('button').forEach(b => b.onclick = () => { r.set(r.parse ? r.parse(b.dataset.val) : b.dataset.val); seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); });
        if (rng && r.set) rng.oninput = e => { r.set(Number(e.target.value)); const o = rowEl.querySelector('[data-out]'); if (o && r.fmt) o.textContent = r.fmt(Number(e.target.value)); };
        if (inp && r.set) inp.onchange = e => { const v = r.set(e.target.value); if (v != null) e.target.value = v; };
        if (sel && r.set) sel.onchange = () => r.set(sel.value);
        if (btn && r.fn) btn.onclick = () => r.fn();
      }));
      if (hitId) {
        const hit = detailEl.querySelector(`[data-r="${hitId}"]`);
        if (hit) { hit.classList.add('hit'); hit.scrollIntoView({ block: 'center' }); }
      }
    }

    listEl.addEventListener('click', e => {
      const item = e.target.closest('[data-sec]'); if (!item) return;
      curHit = item.dataset.hit || null;
      renderDetail(item.dataset.sec, curHit);
      renderList();
    });
    qEl.oninput = () => { if (!qEl.value.trim()) curHit = null; renderList(); };
    qEl.onkeydown = e => { if (e.key === 'Escape') { qEl.value = ''; renderList(); } };

    renderList();
    renderDetail(cur);
  }
});
