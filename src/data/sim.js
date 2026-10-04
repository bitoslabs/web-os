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

export const SIM = {
  relays: [{ host: 'relay.damus.io', on: true, ping: 38 }, { host: 'nos.lol', on: true, ping: 64 },
    { host: 'relay.nostr.band', on: true, ping: 91 }, { host: 'purplerelay.com', on: false, ping: 0 }],
  events: [], t: null, t2: null, hits: [],
  mk() {
    const r = Math.random();
    const ev = {
      ts: Date.now(), relay: pick(this.relays.filter(x => x.on)).host, me: false,
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
    setTimeout(() => toast('<b>relaysd:</b> 3/4 relays up', 'ok', { label: 'open feed', fn: () => WM.open('nostr') }), 900);
    const tick = () => {
      const up = this.relays.filter(r => r.on); if (up.length) {
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
          const rl = pick(c); rl.on = false; updatePills();
          toast(`relay <b>${rl.host}</b> timed out`, 'err', {
            label: 'rejoin', fn: () => {
              rl.on = true; updatePills();
              const w = WM.wins.get('nostr'); w && w.renderRelays && w.renderRelays();
              toast(`relay <b>${rl.host}</b> rejoined`, 'ok');
            }
          });
          const w = WM.wins.get('nostr'); w && w.renderRelays && w.renderRelays();
        }
      }
    };
    setTimeout(tick, 800);
    this.t = setInterval(tick, 2400 + Math.random() * 2400);
    this.t2 = setInterval(() => {
      this.relays.forEach(r => { if (r.on) r.ping = clamp(r.ping + rint(-9, 9), 18, 240); });
      const w = WM.wins.get('nostr'); if (w && w.renderRelays) w.renderRelays();
    }, 3000);
  }
};
