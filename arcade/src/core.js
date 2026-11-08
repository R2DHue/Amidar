// Amidar (Konami 1982) hardware emulation core - "Turtles"/Scramble-style board.
// Hardware behaviour transcribed from MAME src/mame/galaxian/galaxian.cpp + galaxian_v.cpp
// (turtles machine config, turtles_map, konami_sound_2x_ay8910, galaxian video).
// No ROM data is contained in this file. Requires global Z80 (vendor/Z80.js, MIT).
(function (root) {
'use strict';
const MAIN_HZ = 18432000 / 3 / 2;          // 3.072 MHz
const SND_HZ = 14318181 / 8;               // 1.7897 MHz
const LINES = 264, VBSTART = 240;
const FPS = (18432000 / 3) / 384 / 264;    // ~60.606 Hz
const MAIN_PER_LINE = MAIN_HZ / FPS / LINES;  // 192
const SND_PER_LINE = SND_HZ / FPS / LINES;

// ---------------- AY-3-8910 ----------------
const AY_VOL = (() => { const t = new Float32Array(16); for (let i = 1; i < 16; i++) t[i] = Math.pow(10, (i - 15) * 1.5 / 20); t[0] = 0; return t; })();
class AY {
  constructor(clock, rate) { this.step = clock / 8 / rate; this.reset(); this.portA = () => 0xff; this.portB = () => 0xff; }
  reset() { this.r = new Uint8Array(16); this.addr = 0; this.tc = [0, 0, 0]; this.to = [0, 0, 0]; this.nc = 0; this.rng = 1; this.no = 0; this.ec = 0; this.ehold = true; this.emask = 0; this.epos = 15; }
  address(v) { this.addr = v & 15; }
  write(v) { const a = this.addr; this.r[a] = v; if (a === 13) { this.emask = (v & 4) ? 15 : 0; this.epos = 0; this.ehold = false; this.ec = 0; } }
  read() { const a = this.addr; if (a === 14) return (this.r[7] & 0x40) ? this.r[14] : this.portA(); if (a === 15) return (this.r[7] & 0x80) ? this.r[15] : this.portB(); return this.r[a]; }
  // generate one output sample (sum of 3 channels, 0..3)
  sample() {
    const r = this.r; let ticks = this.step; // ticks of clock/8 per sample
    let acc = [0, 0, 0], n = 0;
    // integrate in sub-steps of the master /8 clock (tone counters run at clock/16 -> period*2 ticks)
    const sub = Math.max(1, Math.round(ticks)); const frac = ticks / sub;
    for (let s = 0; s < sub; s++) {
      for (let c = 0; c < 3; c++) {
        const per = ((r[c * 2] | ((r[c * 2 + 1] & 15) << 8)) || 1);
        this.tc[c] += frac; while (this.tc[c] >= per) { this.tc[c] -= per; this.to[c] ^= 1; }
      }
      const np = (r[6] & 31) || 1; this.nc += frac * 0.5;
      while (this.nc >= np) { this.nc -= np; this.rng ^= (((this.rng ^ (this.rng >> 3)) & 1) << 17); this.rng >>= 1; this.no = this.rng & 1; }
      const ep = (r[11] | (r[12] << 8)) || 1; this.ec += frac * 0.5;
      while (this.ec >= ep) { this.ec -= ep; if (!this.ehold && ++this.epos > 15) { const sh = r[13];
          if (!(sh & 8)) { this.emask = 0; this.epos = 15; this.ehold = true; }
          else if (sh & 1) { if (sh & 2) this.emask ^= 15; this.epos = 15; this.ehold = true; }
          else { if (sh & 2) this.emask ^= 15; this.epos = 0; } } }
      const ev = ((15 - this.epos) ^ this.emask) & 15;
      for (let c = 0; c < 3; c++) {
        const m = r[7] >> c; const t = (this.to[c] | (m & 1)) & (this.no | ((m >> 3) & 1));
        const v = r[8 + c] & 16 ? ev : r[8 + c] & 15; acc[c] += t ? AY_VOL[v] : 0;
      }
      n++;
    }
    return (acc[0] + acc[1] + acc[2]) / n;
  }
}

// ---------------- ROM set ----------------
// CRC32 -> [region, offset, size, canonicalName] for MAME "amidar" (Konami) set.
const AMIDAR_SET = {
  '621b74de': ['main', 0x0000, 0x1000, '1.2c'], '38538b98': ['main', 0x1000, 0x1000, '2.2e'],
  '099ecb24': ['main', 0x2000, 0x1000, '3.2f'], 'ba149a93': ['main', 0x3000, 0x1000, '4.2h'],
  'eecc1abf': ['main', 0x4000, 0x1000, '5.2j'], '8ca7b750': ['snd', 0x0000, 0x1000, 's1.5c'],
  '9b5bdc0a': ['snd', 0x1000, 0x1000, 's2.5d'], '2cfe5ede': ['gfx', 0x0000, 0x0800, 'c2.5f'],
  '57c4fd0d': ['gfx', 0x0800, 0x0800, 'c2.5d'], 'f940dcc3': ['prom', 0x0000, 0x0020, 'amidar.clr'],
};
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0'); }
// files: array of {name, data:Uint8Array}. Returns {ok, roms, found, missing}
function assembleRoms(files) {
  const roms = { main: new Uint8Array(0x8000).fill(0xff), snd: new Uint8Array(0x2000).fill(0xff), gfx: new Uint8Array(0x1000), prom: new Uint8Array(0x20) };
  const found = {};
  for (const f of files) { const c = crc32(f.data); const e = AMIDAR_SET[c]; if (e && f.data.length === e[2] && !found[e[3]]) { roms[e[0]].set(f.data, e[1]); found[e[3]] = f.name; } }
  const missing = Object.values(AMIDAR_SET).map(e => e[3]).filter(n => !found[n]);
  return { ok: missing.length === 0, roms, found, missing };
}

// ---------------- Machine ----------------
class Amidar {
  constructor(roms, opts = {}) {
    this.rate = opts.sampleRate || 48000;
    this.rom = roms.main; this.srom = roms.snd; this.gfx = roms.gfx; this.prom = roms.prom;
    this.ram = new Uint8Array(0x800); this.vram = new Uint8Array(0x400); this.obj = new Uint8Array(0x100); this.sram = new Uint8Array(0x400);
    this.in0 = 0xff; this.in1 = 0xff; this.in2 = 0xf1; this.in3 = 0xff; // DIP defaults (MAME amidaru): 3 lives, demo sound on, upright, 1C/1C
    this.latch = 0; this.sndctl = 0; this.irqEn = 0; this.flipX = 0; this.flipY = 0; this.bg = [0, 0, 0];
    this.sndIrq = false; this.sndCycles = 0; this.muted = false; this.frameNo = 0; this.watchdog = 0;
    this.ay = [new AY(SND_HZ, this.rate), new AY(SND_HZ, this.rate)];
    this.ay[0].portA = () => this.latch; this.ay[0].portB = () => this.timer();
    const self = this;
    this.cpu = new Z80({
      mem_read: a => self.r(a), mem_write: (a, v) => self.w(a, v),
      io_read: () => 0xff, io_write: () => {}
    });
    this.scpu = new Z80({
      mem_read: a => a < 0x2000 ? self.srom[a] : ((a & 0x8000) && !(a & 0x1000) ? self.sram[a & 0x3ff] : 0xff),
      mem_write: (a, v) => { if ((a & 0x9000) === 0x8000 && a >= 0x8000) self.sram[a & 0x3ff] = v; },
      io_read: p => { p &= 0xff; let r = 0xff; if (p & 0x20) r &= self.ay[1].read(); if (p & 0x80) r &= self.ay[0].read(); return r; },
      io_write: (p, v) => { p &= 0xff; if (p & 0x10) self.ay[1].address(v); else if (p & 0x20) self.ay[1].write(v); if (p & 0x40) self.ay[0].address(v); else if (p & 0x80) self.ay[0].write(v); }
    });
    this.palette = this.buildPalette();
    this.decodeGfx();
    this.fb = new Uint32Array(256 * 256);
    this.out = new Uint32Array(224 * 256); // rotated portrait output
    this.audioBuf = []; this.sampAcc = 0;
  }
  timer() { const cyc = Math.floor(this.sndCycles * 8) % 40960; let c = cyc, hi = 0; if (c >= 20480) { hi = 1; c -= 20480; } return (hi << 7) | (((c >> 14) & 1) << 6) | (((c >> 13) & 1) << 5) | (((c >> 11) & 1) << 4) | 0x0e; }
  r(a) {
    if (a < 0x8000) return this.rom[a];
    const m = a & ~0x4000;
    if (m >= 0x8000 && m < 0x8800) return this.ram[m & 0x7ff];
    if ((a & ~0x4400) >= 0x9000 && (a & ~0x4400) < 0x9400) return this.vram[a & 0x3ff];
    if ((a & ~0x4700) >= 0x9800 && (a & ~0x4700) < 0x9900) return this.obj[a & 0xff];
    const b = a & ~0x47ff; if (b === 0xa800) { this.watchdog = 0; return 0xff; }
    const p = a & ~0x47c0;
    if (p >= 0xb000 && p < 0xb040) { const port = (a >> 4) & 3; return port === 0 ? this.in0 : port === 1 ? this.in1 : port === 2 ? this.in2 : 0xff; }
    if (p >= 0xb800 && p < 0xb840) { const port = (a >> 4) & 3; return port === 0 ? this.latch : port === 1 ? this.sndctl : port === 2 ? this.in3 : 0xff; }
    return 0xff;
  }
  w(a, v) {
    if (a < 0x8000) return;
    const m = a & ~0x4000; if (m >= 0x8000 && m < 0x8800) { this.ram[m & 0x7ff] = v; return; }
    if ((a & ~0x4400) >= 0x9000 && (a & ~0x4400) < 0x9400) { this.vram[a & 0x3ff] = v; return; }
    if ((a & ~0x4700) >= 0x9800 && (a & ~0x4700) < 0x9900) { this.obj[a & 0xff] = v; return; }
    const l = a & ~0x47c7;
    if (l >= 0xa000 && l <= 0xa038) {
      const d = v & 1;
      switch (l) { case 0xa000: this.bg[0] = d; break; case 0xa008: this.irqEn = d; break; case 0xa010: this.flipY = d; break; case 0xa018: this.flipX = d; break; case 0xa020: this.bg[1] = d; break; case 0xa028: this.bg[2] = d; break; }
      return;
    }
    const p = a & ~0x47c0;
    if (p >= 0xb800 && p < 0xb840) { const port = (a >> 4) & 3;
      if (port === 0) this.latch = v;
      else if (port === 1) { const old = this.sndctl; this.sndctl = v; if ((old & 8) && !(v & 8)) this.sndIrq = true; this.muted = !!(v & 0x10); }
    }
  }
  buildPalette() {
    // MAME compute_resistor_weights(0,255,-1, 1000/470/220 with 470 pulldown) approximated by normalized conductances.
    const w3 = this.weights([1000, 470, 220]), w2 = this.weights([470, 220]);
    const pal = new Uint32Array(32);
    for (let i = 0; i < 32; i++) { const c = this.prom[i];
      const r = Math.round(w3[0] * (c & 1) + w3[1] * ((c >> 1) & 1) + w3[2] * ((c >> 2) & 1));
      const g = Math.round(w3[0] * ((c >> 3) & 1) + w3[1] * ((c >> 4) & 1) + w3[2] * ((c >> 5) & 1));
      const b = Math.round(w2[0] * ((c >> 6) & 1) + w2[1] * ((c >> 7) & 1));
      pal[i] = 0xff000000 | (b << 16) | (g << 8) | r; }
    return pal;
  }
  weights(res) { // emulates MAME resistor network scaling with 470 ohm pulldown, normalized so all-on = 255
    const pd = 1 / 470; const out = []; let max = 0; const all = res.reduce((s, r) => s + 1 / r, 0);
    for (const r of res) { const g = 1 / r; out.push(g); }
    max = all / (all + pd); return out.map(g => 255 * (g / (all + pd)) / max);
  }
  decodeGfx() {
    const g = this.gfx; this.chars = new Uint8Array(256 * 64); this.sprites = new Uint8Array(64 * 256);
    for (let n = 0; n < 256; n++) for (let y = 0; y < 8; y++) { const b0 = g[n * 8 + y], b1 = g[0x800 + n * 8 + y]; for (let x = 0; x < 8; x++) this.chars[n * 64 + y * 8 + x] = (((b0 >> (7 - x)) & 1) << 1) | ((b1 >> (7 - x)) & 1); }
    for (let n = 0; n < 64; n++) for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const o = n * 32 + (y & 7) + (x & 8) + ((y & 8) << 1); const b0 = g[o], b1 = g[0x800 + o]; this.sprites[n * 256 + y * 16 + x] = (((b0 >> (7 - (x & 7))) & 1) << 1) | ((b1 >> (7 - (x & 7))) & 1); }
  }
  setInput(s) { // s: {up,down,left,right,jump,coin,start1,start2,service}
    let i0 = 0xff, i1 = this.in1 | 0xc8, i2 = this.in2 | 0x50;
    if (s.right) i0 &= ~0x10; if (s.left) i0 &= ~0x20; if (s.jump) i0 &= ~0x08; if (s.coin) i0 &= ~0x80; if (s.service) i0 &= ~0x04;
    if (s.start1) i1 &= ~0x80; if (s.start2) i1 &= ~0x40; if (s.up) i2 &= ~0x10; if (s.down) i2 &= ~0x40;
    this.in0 = i0; this.in1 = i1; this.in2 = i2;
  }
  runFrame() {
    const spf = this.rate / FPS; const perLine = spf / LINES;
    for (let line = 0; line < LINES; line++) {
      if (line === VBSTART && this.irqEn) this.cpu.interrupt(true, 0);
      this.mc = (this.mc || 0) + MAIN_PER_LINE; while (this.mc > 0) this.mc -= this.cpu.run_instruction();
      this.sc = (this.sc || 0) + SND_PER_LINE;
      while (this.sc > 0) {
        if (this.sndIrq && this.scpu.getState().iff1) { this.scpu.interrupt(false, 0xff); this.sndIrq = false; }
        const c = this.scpu.run_instruction(); this.sc -= c; this.sndCycles += c;
      }
      this.sampAcc += perLine;
      while (this.sampAcc >= 1) { this.sampAcc -= 1; const raw = (this.ay[0].sample() + this.ay[1].sample()) / 6; this.dcx = (this.dcx || 0) + (raw - (this.dcx || 0)) * 0.0015; const v = this.muted ? 0 : (raw - this.dcx) * 1.4; this.audioBuf.push(v); }
    }
    this.frameNo++; this.render();
  }
  takeAudio() { const a = this.audioBuf; this.audioBuf = []; return a; }
  render() {
    const fb = this.fb, pal = this.palette, obj = this.obj, vr = this.vram, ch = this.chars;
    const bgc = 0xff000000 | ((this.bg[2] * 0x55) << 16) | ((this.bg[1] * 0x47) << 8) | (this.bg[0] * 0x55);
    fb.fill(bgc);
    // tilemap: 32x32, per-column scroll (obj even bytes), per-column color (obj odd bytes), pen 0 transparent
    for (let col = 0; col < 32; col++) {
      const scroll = obj[col * 2], color = (obj[col * 2 + 1] & 7) * 4;
      for (let y = 0; y < 256; y++) {
        const ty = (y + scroll) & 255; const code = vr[((ty >> 3) << 5) | col]; const row = code * 64 + (ty & 7) * 8;
        let sx = col * 8, sy = y; 
        for (let x = 0; x < 8; x++) { const p = ch[row + x]; if (p) { let dx = sx + x, dy = sy; if (this.flipX) dx = 255 - dx; if (this.flipY) dy = 255 - dy; fb[dy * 256 + dx] = pal[color + p]; } }
      }
    }
    // sprites (8 at obj 0x40), lower index higher priority, clip x < 17
    const sp = this.sprites;
    for (let n = 7; n >= 0; n--) {
      const b = 0x40 + n * 4; let sy = (240 - (obj[b] - (n < 3 ? 1 : 0))) & 255; const code = obj[b + 1] & 0x3f; let fx = obj[b + 1] & 0x40, fy = obj[b + 1] & 0x80; const color = (obj[b + 2] & 7) * 4; let sx = (obj[b + 3] + 1) & 255;
      if (this.flipX) { sx = (240 - sx) & 255; fx = !fx; } if (this.flipY) { sy = (240 - sy) & 255; fy = !fy; }
      for (let y = 0; y < 16; y++) { const dy = sy + y; if (dy > 255) continue; const srow = (fy ? 15 - y : y) * 16 + code * 256;
        for (let x = 0; x < 16; x++) { const dx = sx + x; if (dx > 255) continue; if (this.flipX ? dx > 255 - 17 : dx < 17) continue; const p = sp[srow + (fx ? 15 - x : x)]; if (p) fb[dy * 256 + dx] = pal[color + p]; } }
    }
    // crop visible 256x224 (y 16..239) and rotate 90 degrees clockwise (ROT90) -> 224x256
    const out = this.out;
    for (let oy = 0; oy < 256; oy++) for (let ox = 0; ox < 224; ox++) out[oy * 224 + ox] = fb[(239 - ox) * 256 + oy];
  }
}
const api = { Amidar, assembleRoms, crc32, AMIDAR_SET, FPS, WIDTH: 224, HEIGHT: 256 };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AmidarCore = api;
})(typeof self !== 'undefined' ? self : this);
