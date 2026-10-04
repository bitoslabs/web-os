'use strict';
/* ============================================================================
   BITOS WEB / NOSTR SIMULATION
   Relay traffic, events, keys, and zaps here are simulations; they are not a
   production network or cryptographic service. Shared by the shell status
   pills and the nostr / terminal / sysmon apps.
   ========================================================================== */
import { toast, esc, clamp, rint, pick, store, petname, bech32 } from '../core/index.js';
import { WM } from '../shell/window-manager.js';
import { flashSats, updatePills } from '../shell/menubar.js';

const NOTES = ['plan9 was right about everything, we just were not ready',
  'switched relays around — purplerelay is 40ms from the cafe. unreal',
  'NIP-07 is the correct amount of abstraction. no notes',
  'backed up the dotfiles to a git repo on a spare thinkpad. retirement plan',
  'the bitos setup asked me to wiggle my mouse for entropy and honestly? delightful',
  'the dock magnifies. i have done nothing today but move my mouse. worth it',
  '3am: rewrote my status bar in 40 lines of shell. going to bed',
  'zapped the maintainer of my keyboard firmware. 21 sats, infinite gratitude',
  'spotlight on a linux box feels illegal in the best way',
  'nmap says my toaster has 3 open ports now. progress?',
  'man pages are the only documentation that never lied to me',
  'live-booted bitos off a usb stick from 2016. it just worked. suspicious',
  'tcpdump -w /dev/null is my white noise machine',
  'nostr without zaps is just shouting into the void with extra steps',
  'found a 486 in the e-waste bin. it boots. of course it boots',
  'key rotation day. new npub, same bad opinions',
  'the terminal window is the most honest ui ever shipped',
  'ps aux | grep joy',
  'wifi on the train: 4 relays down, 1 holding. respect',
  'spent the weekend drawing identicons. they are snowflakes for keys',
  'rm -rf doubt && touch courage'];
const ZAPS = [1, 3, 5, 7, 10, 21, 21, 21, 50, 100, 420, 1000];

/* Relay roles follow NIP-65: `read` relays are queried for events, `write`
 * relays receive published events, and `primary` is the preferred write relay
 * (at most one). Role sets are cached in recompute() so hot paths — the event
 * tick and publish — do not re-filter the relay list. */
const bareHost = v => String(v || '').trim().toLowerCase()
  .replace(/^wss?:\/\//, '').replace(/\/+$/, '');
const ROLE_KEYS = ['read', 'write', 'primary'];

export const SIM = {
  relays: [{ host: 'relay.damus.io', on: true, ping: 38, read: true, write: true, primary: true },
    { host: 'nos.lol', on: true, ping: 64, read: true, write: true, primary: false },
    { host: 'relay.nostr.band', on: true, ping: 91, read: true, write: false, primary: false },
    { host: 'purplerelay.com', on: false, ping: 0, read: true, write: true, primary: false }],
  rRelays: [], wRelays: [], primary: null, up: 0,
  events: [], t: null, t2: null, hits: [],

  /* apply a persisted config, keeping current pings for known hosts */
  hydrate(cfg) {
    if (Array.isArray(cfg) && cfg.length) {
      const known = new Map(this.relays.map(r => [r.host, r]));
      this.relays = cfg.map(c => {
        const base = known.get(c.host);
        return { host: c.host, on: !!c.on, ping: base ? base.ping : 0,
          read: c.read !== false, write: c.write !== false, primary: !!c.primary };
      });
    }
    this.recompute();
  },
  snapshot() { return this.relays.map(r => ({ host: r.host, on: !!r.on, read: !!r.read, write: !!r.write, primary: !!r.primary })); },
  persist() { if (store.d) { store.d.relays = this.snapshot(); store.save(); } },
  /* rebuild the cached role sets and counts in one pass */
  recompute() {
    const r = [], w = []; let up = 0, primary = null;
    for (const x of this.relays) {
      if (!x.on) continue;
      up++;
      if (x.read) r.push(x);
      if (x.write) w.push(x);
      if (x.primary && !primary) primary = x;
    }
    this.rRelays = r; this.wRelays = w; this.up = up; this.primary = primary;
  },
  setRole(host, role, val) {
    if (!ROLE_KEYS.includes(role)) return;
    const r = this.relays.find(x => x.host === host); if (!r) return;
    if (role === 'primary') {
      this.relays.forEach(x => { x.primary = false; });
      if (val) { r.primary = true; r.write = true; }
    } else {
      r[role] = !!val;
      if (role === 'write' && !val) r.primary = false;
    }
    this.recompute(); this.persist();
  },
  addRelay(v) {
    const host = bareHost(v);
    if (!host || !/\./.test(host) || this.relays.some(r => r.host === host)) return null;
    const r = { host, on: true, ping: rint(20, 120), read: true, write: true, primary: false };
    this.relays.push(r); this.recompute(); this.persist(); return r;
  },
  removeRelay(host) {
    const i = this.relays.findIndex(r => r.host === host); if (i < 0) return false;
    this.relays.splice(i, 1); this.recompute(); this.persist(); return true;
  },
  /* ask any open app that renders the relay roster to repaint */
  refreshViews() {
    for (const id of ['nostr', 'settings']) {
      const w = WM.wins.get(id); if (w && w.renderRelays) w.renderRelays();
    }
  },

  mk() {
    const r = Math.random();
    const src = this.rRelays.length ? this.rRelays : this.relays.filter(x => x.on);
    const ev = {
      ts: Date.now(), relay: src.length ? pick(src).host : 'local', me: false,
      author: petname(bech32('npub', crypto.getRandomValues(new Uint8Array(8))))
    };
    if (r < .12) { ev.kind = 9735; ev.amt = pick(ZAPS); }
    else if (r < .24) { ev.kind = 7; ev.text = '+'; }
    else if (r < .3) { ev.kind = 3; ev.text = 'updated contact list'; }
    else { ev.kind = 1; ev.text = pick(NOTES); }
    return ev;
  },
  seed() { const arr = []; for (let i = 5; i >= 0; i--) { const ev = this.mk(); ev.ts = Date.now() - i * 60000 - rint(0, 40000); arr.push(ev); } this.events = arr.reverse(); },
  start() {
    if (this.t) return;
    if (!this.events.length) this.seed();
    setTimeout(() => toast(`<b>relaysd:</b> ${this.up}/${this.relays.length} relays up`, 'ok', { label: 'open feed', fn: () => WM.open('nostr') }), 900);
    const tick = () => {
      const up = this.rRelays; if (up.length) {
        const ev = this.mk(); ev.relay = pick(up).host; this.events.unshift(ev);
        store.d.seen++; this.hits.push(Date.now());
        if (ev.kind === 9735) {
          store.d.satsIn += ev.amt; store.save(); flashSats();
          toast(`+<b>${ev.amt} sats</b> from ${esc(ev.author)}`, 'zap', { label: 'open feed', fn: () => WM.open('nostr') });
        }
        if (store.d.seen % 25 === 0) store.save();
        const w = WM.wins.get('nostr'); if (w && w.addEvent) w.addEvent(ev);
      }
      if (Math.random() < .05) {
        const c = this.relays.filter(x => x.on && x.host !== 'relay.damus.io');
        if (c.length && Math.random() < .5) {
          const rl = pick(c); rl.on = false; this.recompute(); this.persist(); updatePills();
          toast(`relay <b>${rl.host}</b> timed out`, 'err', {
            label: 'rejoin', fn: () => {
              rl.on = true; SIM.recompute(); SIM.persist(); updatePills(); SIM.refreshViews();
              toast(`relay <b>${rl.host}</b> rejoined`, 'ok');
            }
          });
          this.refreshViews();
        }
      }
    };
    setTimeout(tick, 800);
    this.t = setInterval(tick, 2400 + Math.random() * 2400);
    this.t2 = setInterval(() => {
      this.relays.forEach(r => { if (r.on) r.ping = clamp(r.ping + rint(-9, 9), 18, 240); });
      this.refreshViews();
    }, 3000);
  }
};
