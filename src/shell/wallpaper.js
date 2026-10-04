'use strict';
/* OS shell module: decorative canvas wallpaper; no app or native state. */
import { $, hexRgb } from '../core/index.js';
import { setDeskEl } from './state.js';

export const wall = {
  cv: null, ctx: null, stat: null, W: 0, H: 0, dpr: 1, on: true, raf: 0, packets: [], acc: '#8b5cf6',
  init() {
    this.cv = $('#wall');
    const desk = $('#desktop'); setDeskEl(desk);
    this.resize = () => {
      const r = desk.getBoundingClientRect(); this.W = r.width; this.H = r.height;
      this.dpr = window.devicePixelRatio || 1;
      this.cv.width = this.W * this.dpr; this.cv.height = this.H * this.dpr;
      this.ctx = this.cv.getContext('2d'); this.rebuild();
    };
    window.addEventListener('resize', this.resize); this.resize();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) this.loop();
  },
  rebuild() {
    const cs = getComputedStyle(document.documentElement);
    this.acc = (cs.getPropertyValue('--acc') || '#8b5cf6').trim();
    const a = hexRgb(this.acc.startsWith('#') ? this.acc : '#8b5cf6');
    const s = this.stat = document.createElement('canvas');
    s.width = Math.max(1, this.W * this.dpr); s.height = Math.max(1, this.H * this.dpr);
    const c = s.getContext('2d'); c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const ink = document.documentElement.dataset.theme === 'light' ? '10,10,16' : '232,230,227';
    c.fillStyle = `rgba(${ink},.05)`;
    for (let x = 12; x < this.W; x += 24) for (let y = 12; y < this.H; y += 24) c.fillRect(x, y, 1, 1);
    c.strokeStyle = `rgba(${ink},.08)`; c.lineWidth = 1;
    for (let x = 48; x < this.W; x += 96) for (let y = 48; y < this.H; y += 96) {
      c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x + 4, y); c.moveTo(x, y - 4); c.lineTo(x, y + 4); c.stroke();
    }
    const P = [[13, 2], [4, 14], [10, 14], [9, 22], [18, 10], [12, 10]];
    const k = Math.min(this.W, this.H) * .068, cx = this.W * .64, cy = this.H * .5;
    c.beginPath(); P.forEach(([x, y], i) => { const X = cx + (x - 11) * k, Y = cy + (y - 12) * k; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.closePath();
    c.fillStyle = `rgba(${a[0]},${a[1]},${a[2]},.05)`; c.fill();
    c.strokeStyle = `rgba(${a[0]},${a[1]},${a[2]},.14)`; c.lineWidth = 2; c.stroke();
    this.packets = []; for (let i = 0; i < 13; i++) this.packets.push(this.mk());
  },
  mk() {
    return {
      x: Math.random() * this.W, y: 24 * (1 + Math.floor(Math.random() * Math.max(2, this.H / 24 - 2))),
      v: (14 + Math.random() * 54) * (Math.random() < .5 ? -1 : 1), len: 10 + Math.random() * 20, a: .12 + Math.random() * .2
    };
  },
  loop() {
    cancelAnimationFrame(this.raf);
    const step = () => {
      if (!this.on) { this.raf = 0; return; }
      const c = this.ctx; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, this.W, this.H);
      c.drawImage(this.stat, 0, 0, this.W, this.H);
      const a = hexRgb(this.acc.startsWith('#') ? this.acc : '#8b5cf6');
      for (const p of this.packets) {
        p.x += p.v / 60;
        if (p.x < -40 || p.x > this.W + 40) Object.assign(p, this.mk());
        c.strokeStyle = `rgba(${a[0]},${a[1]},${a[2]},${p.a})`; c.lineWidth = 1;
        c.beginPath(); c.moveTo(p.x - Math.sign(p.v) * p.len, p.y); c.lineTo(p.x, p.y); c.stroke();
        c.fillStyle = `rgba(${a[0]},${a[1]},${a[2]},${p.a + .15})`; c.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
      this.raf = requestAnimationFrame(step);
    };
    step();
  },
  setOn(v) {
    this.on = v; this.cv.style.display = v ? '' : 'none';
    if (v) {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.ctx.clearRect(0, 0, this.W, this.H); this.ctx.drawImage(this.stat, 0, 0, this.W, this.H);
      } else this.loop();
    } else if (this.raf) cancelAnimationFrame(this.raf);
  }
};
