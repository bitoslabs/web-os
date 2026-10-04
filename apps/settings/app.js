/* Built-in app: Settings. Appearance, display, sound, power, storage, and
 * privacy controls. Preview state persists to localStorage; device backlight,
 * audio, network, and power actions require the native services in
 * docs/NATIVE_API.md before they do anything real. */
import { registerApp, store, esc, icon, trunc, wireComp, toast, dialog, native, clamp } from '../../src/core/index.js';
import { setAccent, ACCENT_COLORS, ACCENT_SWATCHES, accentHexOf, accentName } from '../../src/shell/menubar.js';
import { syncCC } from '../../src/shell/control-center.js';
import { mark } from '../../src/shell/tour.js';
import { WM } from '../../src/shell/window-manager.js';
import { toggleWall, toggleIcons, setFontScale, fontScale, setBright, setMotion, setResize, setToasts, setTheme, FS_STEPS } from '../../src/shell/menus.js';
import { SIM } from '../../src/data/sim.js';

registerApp('settings', {
  title: 'settings', icon: 'sl', sub: '/var/lib/bitos', w: 500, h: 600,
  mount(body) {
    const d = store.d;
    const rel = SIM.relays.filter(r => r.on).length;
    const used = Math.min(31.4, 2.1 + d.seen * 0.012);
    const pct = Math.round(used / 32 * 100);
    body.innerHTML = `<div class="scrolly set">
      <div class="grpbox"><span class="lbl">appearance</span>
        <div class="row"><div class="rt"><span class="lbl">theme</span>light, dark, or follow the system</div>
          <div class="themecards" data-themegrp>${['light', 'dark', 'auto'].map(t => `<button class="tcard ${d.theme === t ? 'on' : ''}" data-theme-opt="${t}" title="${t}"><span class="tp ${t}"></span><span class="tn">${t}</span></button>`).join('')}</div></div>
        <div class="row"><div class="rt"><span class="lbl">theme color</span>accent — focus, selection, identity</div>
          <div class="accside">
            <div class="swatches" data-accseg>
              <label class="sw custom${d.accent === 'custom' ? ' on' : ''}" data-sw="custom" title="custom">
                <input type="color" class="pick" data-accpick value="${esc(d.accentHex || '#8b5cf6')}" aria-label="custom accent color">
              </label>
              ${ACCENT_SWATCHES.map(n => { const on = d.accent === n || accentHexOf(d.accent) === ACCENT_COLORS[n]; return `<button class="sw${on ? ' on' : ''}" data-sw="${n}" title="${n}" style="background:${ACCENT_COLORS[n]}"></button>`; }).join('')}
            </div>
            <span class="accname" data-accname>${esc(accentName())}</span>
          </div></div>
        <div class="row"><div class="rt"><span class="lbl">wallpaper</span>grid + packets</div>
          <button class="sw2 ${d.wall ? 'on' : ''}" data-wall><i></i></button></div>
        <div class="row"><div class="rt"><span class="lbl">desktop icons</span></div>
          <button class="sw2 ${d.icons ? 'on' : ''}" data-icons><i></i></button></div>
        <div class="row"><div class="rt"><span class="lbl">reduce motion</span>stop window and menu animation</div>
          <button class="sw2 ${d.motion ? 'on' : ''}" data-motion><i></i></button></div>
        <div class="row"><div class="rt"><span class="lbl">window resizing</span>drag window edges and corners to resize</div>
          <button class="sw2 ${d.resize === false ? '' : 'on'}" data-resize><i></i></button></div>
        <div class="row"><div class="rt"><span class="lbl">toast messages</span>banners for saves, deletes, and errors</div>
          <button class="sw2 ${d.toasts === false ? '' : 'on'}" data-toasts><i></i></button></div>
      </div>

      <div class="grpbox"><span class="lbl">display</span>
        <div class="row"><div class="rt"><span class="lbl">text size</span>scales the whole interface</div>
          <div class="seg" data-fsseg>${FS_STEPS.map(([k, v]) => `<button data-fs="${v}" class="${fontScale() === v ? 'on' : ''}">${k}</button>`).join('')}</div></div>
        <div class="row"><div class="rt"><span class="lbl">brightness</span>preview — backlight needs the display service</div>
          <div class="u-row u-gap-8"><input type="range" min="40" max="120" step="5" value="${d.bright}" data-bright><span class="u-static" data-brightv>${d.bright}%</span></div></div>
      </div>

      <div class="grpbox"><span class="lbl">sound</span>
        <div class="row"><div class="rt"><span class="lbl">output volume</span>preview — routes through the sound service</div>
          <div class="u-row u-gap-8"><input type="range" min="0" max="100" step="5" value="${d.vol}" data-vol ${d.mute ? 'disabled' : ''}><span class="u-static" data-volv>${d.mute ? 'muted' : d.vol + '%'}</span></div></div>
        <div class="row"><div class="rt"><span class="lbl">mute</span></div>
          <button class="sw2 ${d.mute ? 'on' : ''}" data-mute><i></i></button></div>
        <div class="row"><div class="rt"><span class="lbl">alert sounds</span>banners stay visible when off</div>
          <button class="sw2 ${d.alerts ? 'on' : ''}" data-alerts><i></i></button></div>
      </div>

      <div class="grpbox"><span class="lbl">network</span>
        <div class="row"><div class="rt"><span class="lbl">wi-fi</span>${native ? 'adapter status from the network service' : 'not available in the browser preview'}</div>
          <span class="mono-dim">${native ? 'checking…' : 'no adapter'}</span></div>
        <div class="row"><div class="rt"><span class="lbl">nostr relays</span><span data-rel>${rel}/4 up</span></div>
          <button class="btn sm" data-openrel>manage</button></div>
      </div>

      <div class="grpbox"><span class="lbl">power</span>
        <div class="row"><div class="rt"><span class="lbl">power mode</span>preview — the governor is native</div>
          <div class="seg" data-powseg>${['saver', 'balanced', 'performance'].map(p => `<button data-pow="${p}" class="${d.power === p ? 'on' : ''}">${p}</button>`).join('')}</div></div>
        <div class="row"><div class="rt"><span class="lbl">restart</span>${native ? 'asks for confirmation' : 'requires the system service'}</div>
          <button class="btn sm" data-restart ${native ? '' : 'disabled'}>restart</button></div>
        <div class="row"><div class="rt"><span class="lbl">shut down</span>${native ? 'asks for confirmation' : 'requires the system service'}</div>
          <button class="btn sm danger" data-shutdown ${native ? '' : 'disabled'}>shut down</button></div>
      </div>

      <div class="grpbox"><span class="lbl">storage</span>
        <div class="row"><div class="rt"><span class="lbl">data partition</span>preview estimate</div>
          <div class="u-row u-gap-8"><span class="bar"><i style="width:${pct}%"></i></span><span class="u-static">${used.toFixed(1)} / 32 gb</span></div></div>
      </div>

      <div class="grpbox"><span class="lbl">privacy</span>
        <div class="row"><div class="rt"><span class="lbl">share anonymous usage</span>off by default</div>
          <button class="sw2 ${d.telemetry ? 'on' : ''}" data-telemetry><i></i></button></div>
        <div class="row"><div class="rt"><span class="lbl">crash reports</span></div>
          <button class="sw2 ${d.crashes ? 'on' : ''}" data-crashes><i></i></button></div>
        <div class="row"><div class="rt"><span class="lbl">clear local data</span>wipes preview state, keeps your keys</div>
          <button class="btn sm danger" data-clear>clear</button></div>
      </div>

      <div class="grpbox"><span class="lbl">session</span>
        <div class="row"><div class="rt"><span class="lbl">hostname</span></div>
          <input data-host value="${esc(d.host)}" maxlength="20"></div>
        <div class="row"><div class="rt"><span class="lbl">handle</span></div>
          <input data-pet value="${esc(d.pet)}" maxlength="32"></div>
        <div class="row"><div class="rt"><span class="lbl">keymap</span>set at first boot</div>
          <span class="mono-dim">${esc(d.keymap)}</span></div>
        <div class="row"><div class="rt"><span class="lbl">identity</span></div>
          <button class="key" data-copy="${d.npub}">${icon('copy', 11)}<span>${trunc(d.npub)}</span></button></div>
      </div>

      <div class="grpbox"><span class="lbl">data</span>
        <div class="row"><div class="rt"><span class="lbl">zaps</span></div><span class="mono-dim" data-bal></span></div>
        <div class="row"><div class="rt"><span class="lbl">events seen</span></div><span class="mono-dim">${d.seen.toLocaleString()}</span></div>
        <div class="row"><div class="rt"><span class="lbl">account created</span></div><span class="mono-dim">${new Date(d.born).toLocaleDateString()}</span></div>
      </div>

      <div class="grpbox"><span class="lbl">danger</span>
        <div class="row"><div class="rt"><span class="lbl">reset demo</span>wipes state · reboots into setup</div>
          <button class="btn danger sm" data-reset>reset</button></div>
      </div>

      <p class="note">in this prototype, settings persist to browser localStorage; in bitos they
      write through the native settings service. controls marked <b>preview</b> are simulated until
      the matching native method exists. lost? press <b>?</b> — or <b>ctrl space</b> for spotlight.</p></div>`;

    wireComp(body);
    const bal = body.querySelector('[data-bal]');
    bal.textContent = `${d.satsIn.toLocaleString()} in · ${d.satsOut.toLocaleString()} out`;

    /* appearance — theme mode */
    const themeGrp = body.querySelector('[data-themegrp]');
    themeGrp.querySelectorAll('button').forEach(b => b.onclick = () => {
      setTheme(b.dataset.themeOpt);
      themeGrp.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    });

    /* appearance — theme color swatches (custom + named palette) */
    const accSeg = body.querySelector('[data-accseg]');
    const accPick = body.querySelector('[data-accpick]');
    accSeg.querySelectorAll('.sw:not(.custom)').forEach(b => b.onclick = () => {
      setAccent(b.dataset.sw); mark('accent'); syncCC();
      toast('theme color → <b>' + b.dataset.sw + '</b>', 'ok');
    });
    accPick.oninput = e => { setAccent('custom', e.target.value); mark('accent'); syncCC(); };

    /* appearance — switches */
    body.querySelector('[data-wall]').onclick = e => { toggleWall(); e.currentTarget.classList.toggle('on', d.wall); };
    body.querySelector('[data-icons]').onclick = e => { toggleIcons(); e.currentTarget.classList.toggle('on', d.icons); };
    body.querySelector('[data-motion]').onclick = e => { setMotion(!d.motion); e.currentTarget.classList.toggle('on', d.motion); };
    body.querySelector('[data-resize]').onclick = e => { setResize(d.resize === false); e.currentTarget.classList.toggle('on', d.resize !== false); };
    body.querySelector('[data-toasts]').onclick = e => { setToasts(d.toasts === false); e.currentTarget.classList.toggle('on', d.toasts !== false); };

    /* display — text size + brightness */
    const fsSeg = body.querySelector('[data-fsseg]');
    fsSeg.querySelectorAll('button').forEach(b => b.onclick = () => {
      setFontScale(parseFloat(b.dataset.fs));
      fsSeg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    });
    const bright = body.querySelector('[data-bright]'), brightV = body.querySelector('[data-brightv]');
    bright.oninput = e => { setBright(clamp(parseInt(e.target.value, 10), 40, 120)); brightV.textContent = d.bright + '%'; };

    /* sound */
    const vol = body.querySelector('[data-vol]'), volV = body.querySelector('[data-volv]');
    const syncVol = () => {
      volV.textContent = d.mute ? 'muted' : d.vol + '%';
      vol.disabled = !!d.mute; vol.value = d.vol;
    };
    vol.oninput = e => { d.vol = parseInt(e.target.value, 10); store.save(); syncVol(); };
    body.querySelector('[data-mute]').onclick = e => { d.mute = !d.mute; store.save(); e.currentTarget.classList.toggle('on', d.mute); syncVol(); };
    body.querySelector('[data-alerts]').onclick = e => { d.alerts = !d.alerts; store.save(); e.currentTarget.classList.toggle('on', d.alerts); };

    /* network */
    body.querySelector('[data-openrel]').onclick = () => WM.open('nostr');

    /* power */
    const powSeg = body.querySelector('[data-powseg]');
    powSeg.querySelectorAll('button').forEach(b => b.onclick = () => {
      d.power = b.dataset.pow; store.save();
      powSeg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    });
    const powerAction = async (action, label) => {
      const ok = await dialog({
        title: label + '?', danger: action === 'shutdown', ok: label,
        body: 'this will ' + (action === 'restart' ? 'restart' : 'power off') + ' the machine and end your session.',
      });
      if (!ok) return;
      try { await native.requestPowerAction(action); toast('[ !! ] ' + label + ' requested', 'info'); }
      catch (e) { toast('could not ' + action + ' — ' + esc(e.message || e.code || 'service unavailable'), 'err'); }
    };
    const restart = body.querySelector('[data-restart]'), shutdown = body.querySelector('[data-shutdown]');
    if (native) {
      restart.onclick = () => powerAction('restart', 'restart');
      shutdown.onclick = () => powerAction('shutdown', 'shut down');
    }

    /* privacy */
    body.querySelector('[data-telemetry]').onclick = e => { d.telemetry = !d.telemetry; store.save(); e.currentTarget.classList.toggle('on', d.telemetry); };
    body.querySelector('[data-crashes]').onclick = e => { d.crashes = !d.crashes; store.save(); e.currentTarget.classList.toggle('on', d.crashes); };
    body.querySelector('[data-clear]').onclick = async () => {
      const ok = await dialog({ title: 'clear local data?', danger: true, ok: 'clear', body: 'removes preview preferences and activity; your keypair is not exported.' });
      if (ok) store.reset();
    };

    /* session */
    body.querySelector('[data-host]').onchange = e => {
      d.host = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') || 'bitos';
      e.target.value = d.host; store.save(); toast('hostname set · prompts update on next line', 'ok');
    };
    body.querySelector('[data-pet]').onchange = e => {
      d.pet = e.target.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || d.pet;
      e.target.value = d.pet; store.save();
    };

    /* danger */
    const rb = body.querySelector('[data-reset]'); let armed = false, at = null;
    rb.onclick = () => {
      if (!armed) {
        armed = true; rb.classList.add('armed'); rb.textContent = 'sure?';
        at = setTimeout(() => { armed = false; rb.classList.remove('armed'); rb.textContent = 'reset'; }, 3000);
      } else { clearTimeout(at); store.reset(); }
    };
  }
});
