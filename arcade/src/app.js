(() => {
'use strict';
const $ = id => document.getElementById(id), C = window.AmidarCore;
const cv = $('cv'), ctx = cv.getContext('2d', { alpha: false }); const img = ctx.createImageData(224, 256); const img32 = new Uint32Array(img.data.buffer);
let machine = null, paused = false, soundOn = true, actx = null, node = null;
const ring = new Float32Array(1 << 15); let rHead = 0, rTail = 0;
function toast(t) { const e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), 1800); }
function msg(t) { $('msg').textContent = t; }

// ---------- ROM storage (IndexedDB, local only) ----------
const DB = 'amidar-arcade', ST = 'roms';
function idb() { return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function dbOp(mode, fn) { const d = await idb(); return new Promise((res, rej) => { const tx = d.transaction(ST, mode); const q = fn(tx.objectStore(ST)); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); }); }
const saveRoms = files => dbOp('readwrite', s => s.put(files, 'set'));
const loadRoms = () => dbOp('readonly', s => s.get('set'));
const forgetRoms = () => dbOp('readwrite', s => s.delete('set'));

function expand(name, data) { // accept zip(s) or raw files
  if (data.length > 4 && data[0] === 0x50 && data[1] === 0x4b) { const out = []; const z = fflate.unzipSync(data);
    for (const [n, d] of Object.entries(z)) { if (!n.endsWith('/')) out.push(...expand(n, d)); } return out; }
  return [{ name, data }];
}
async function useFiles(list, persist) {
  const set = C.assembleRoms(list);
  if (!set.ok) { msg(`Not a complete Konami “amidar” set.\nMissing: ${set.missing.join(', ')}\n(Found ${Object.keys(set.found).length}/10.)`); return false; }
  if (persist) { try { const keep = list.filter(f => C.AMIDAR_SET[C.crc32(f.data)]); await saveRoms(keep); } catch (e) { toast('Could not save ROM locally; it will be needed again next visit'); } }
  start(set.roms); return true;
}
$('file').addEventListener('change', async e => {
  unlockAudio(); const files = []; msg('Checking…');
  try { for (const f of e.target.files) files.push(...expand(f.name, new Uint8Array(await f.arrayBuffer()))); } catch (err) { msg('Could not read that file: ' + err); return; }
  e.target.value = ''; await useFiles(files, true);
});
$('forget').addEventListener('click', async () => { await forgetRoms().catch(() => {}); msg('Saved ROM removed from this browser.'); });
$('romBtn').addEventListener('click', () => { paused = true; $('pause').textContent = 'Resume'; $('closeOv').hidden = !machine; $('overlay').hidden = false; });
$('closeOv').addEventListener('click', () => { $('overlay').hidden = true; paused = false; $('pause').textContent = 'Pause'; });

function start(roms) {
  machine = new C.Amidar(roms, { sampleRate: actx ? actx.sampleRate : 48000 });
  rHead = rTail = 0; $('overlay').hidden = true; paused = false; $('pause').textContent = 'Pause'; toast('Tap COIN, then 1P START');
}

// ---------- Audio ----------
function unlockAudio() {
  try {
    if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; actx = new AC({ latencyHint: 'interactive' });
      node = actx.createScriptProcessor(1024, 0, 1); const gain = actx.createGain(); gain.gain.value = 2.2; node.connect(gain); gain.connect(actx.destination);
      node.onaudioprocess = ev => { const o = ev.outputBuffer.getChannelData(0); for (let i = 0; i < o.length; i++) { if (rTail !== rHead && soundOn && !paused) { o[i] = ring[rTail]; rTail = (rTail + 1) & (ring.length - 1); } else o[i] = 0; } };
      if (machine) for (const ay of machine.ay) ay.step = 1789772.7 / 8 / actx.sampleRate;
      if (machine) machine.rate = actx.sampleRate; }
    if (actx.state !== 'running') actx.resume();
    // iOS: play a silent buffer inside the gesture
    const b = actx.createBuffer(1, 1, actx.sampleRate), s = actx.createBufferSource(); s.buffer = b; s.connect(actx.destination); s.start(0);
  } catch (e) { }
}
function pushAudio(a) {
  if (!actx || actx.state !== 'running') return;
  const used = (rHead - rTail) & (ring.length - 1); if (used > actx.sampleRate * 0.15) return; // drop if too far ahead (latency cap)
  for (let i = 0; i < a.length; i++) { ring[rHead] = a[i]; rHead = (rHead + 1) & (ring.length - 1); }
}
document.addEventListener('pointerdown', unlockAudio, { passive: true }); document.addEventListener('keydown', unlockAudio);

// ---------- Input (joystick design reused from the TI-83 build) ----------
let touchDir = null, padDir = null, stickPointer = null, touchJump = false, padJump = false, coinT = 0, startT = 0;
const keys = new Map(); let seq = 0;
const keyMap = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
function direction4(x, y, old, dz) {
  if (Math.max(Math.abs(x), Math.abs(y)) < dz) return null;
  const horiz = old === 'left' || old === 'right'; let axis;
  if (old) axis = horiz ? (Math.abs(y) > Math.abs(x) * 1.15 ? 'y' : 'x') : (Math.abs(x) > Math.abs(y) * 1.15 ? 'x' : 'y');
  else axis = Math.abs(x) >= Math.abs(y) ? 'x' : 'y';
  return axis === 'x' ? (x >= 0 ? 'right' : 'left') : (y >= 0 ? 'down' : 'up');
}
function activeDir() { if (touchDir) return touchDir; let rec = -1, d = null; for (const [c, n] of keys) if (keyMap[c] && n > rec) { rec = n; d = keyMap[c]; } return d || padDir; }
const coin = () => { unlockAudio(); coinT = 6; }, start1 = () => { unlockAudio(); startT = 6; };
function togglePause() { paused = !paused; $('pause').textContent = paused ? 'Resume' : 'Pause'; }
$('coin').addEventListener('pointerdown', e => { e.preventDefault(); coin(); });
$('start1').addEventListener('pointerdown', e => { e.preventDefault(); start1(); });
$('pause').addEventListener('click', togglePause);
$('sound').addEventListener('click', () => { soundOn = !soundOn; $('sound').textContent = soundOn ? 'Sound on' : 'Sound off'; $('sound').classList.toggle('on', soundOn); });
$('jump').addEventListener('pointerdown', e => { e.preventDefault(); $('jump').setPointerCapture(e.pointerId); touchJump = true; $('jump').classList.add('active'); });
function relJump() { touchJump = false; $('jump').classList.remove('active'); }
for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) $('jump').addEventListener(n, relJump);
// Whole pad (plus a 26px invisible ring) is live. Direction = absolute position vs the FIXED pad centre, strict 4-way.
const zone = $('stickZone');
function stickDir(e) {
  const r = $('stick').getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  if (Math.hypot(dx, dy) < r.width * 0.09) return null; // small neutral centre (~13px)
  return direction4(dx, dy, touchDir, 0);
}
function moveStick(e) {
  if (e.pointerId !== stickPointer) return;
  touchDir = stickDir(e);
  const v = { left: [-27, 0], right: [27, 0], up: [0, -27], down: [0, 27] }[touchDir] || [0, 0];
  $('knob').style.transform = `translate(${v[0]}px,${v[1]}px)`; e.preventDefault();
}
zone.addEventListener('pointerdown', e => { if (stickPointer !== null) return; e.preventDefault(); stickPointer = e.pointerId; try { zone.setPointerCapture(e.pointerId); } catch (_) { } moveStick(e); });
zone.addEventListener('pointermove', moveStick);
function relStick(e) { if (e && e.pointerId !== undefined && e.pointerId !== stickPointer) return; stickPointer = null; touchDir = null; $('knob').style.transform = ''; }
for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(n, relStick);
zone.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
window.addEventListener('blur', () => clearInputs());
window.addEventListener('keydown', e => {
  if (keyMap[e.code] || ['Space', 'KeyX', 'Enter', 'KeyP', 'Digit5', 'KeyC', 'Digit1'].includes(e.code)) {
    e.preventDefault(); if (!keys.has(e.code)) keys.set(e.code, ++seq);
    if (!e.repeat) { if (e.code === 'KeyP') togglePause(); if (e.code === 'Digit5' || e.code === 'KeyC') coin(); if (e.code === 'Digit1' || e.code === 'Enter') start1(); }
  }
});
window.addEventListener('keyup', e => keys.delete(e.code));
function clearInputs() { keys.clear(); relStick(); relJump(); padDir = null; padJump = false; }
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInputs(); if (!paused) togglePause(); } });
let lastMenu = false, lastView = false, lastAny = false;
window.addEventListener('gamepadconnected', () => toast('Controller connected · A/B jump · View coin · Menu start'));
function pollPad() {
  let pads = []; try { pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; } catch (e) { }
  const p = pads.find(p => p && p.connected !== false); if (!p) { padDir = null; padJump = false; return; }
  const b = i => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > .5));
  const any = p.buttons.some(v => v && (v.pressed || v.value > .5)); if (any && !lastAny) unlockAudio(); lastAny = any;
  const dx = Number(b(15)) - Number(b(14)), dy = Number(b(13)) - Number(b(12));
  padDir = (dx || dy) ? direction4(dx, dy, padDir, .1) : direction4(p.axes[0] || 0, p.axes[1] || 0, padDir, .4);
  padJump = b(0) || b(1);
  const menu = b(9), view = b(8); if (menu && !lastMenu) start1(); if (view && !lastView) coin(); lastMenu = menu; lastView = view;
}

// ---------- Layout: whole portrait screen, nearest-neighbour ----------
// Size is computed from the viewport (not from the grid cell, which in landscape is sized by the canvas itself).
const SIZES = ['auto', 1, 2, 3, 4, 5, 'fill']; let sizeMode = localStorage.getItem('amidarSize') || 'auto';
if (!SIZES.map(String).includes(String(sizeMode))) sizeMode = 'auto';
function maxScale() {
  const vv = window.visualViewport, W = vv ? vv.width : innerWidth, H = vv ? vv.height : innerHeight;
  const cs = getComputedStyle(document.documentElement);
  const bar = $('bar').getBoundingClientRect().height, land = W > H;
  const ctrl = land ? 0 : $('controls').getBoundingClientRect().height;
  const side = land ? 2 * 170 : 0; // room for JUMP and stick beside the screen
  const aw = Math.max(50, W - side - 8), ah = Math.max(50, H - bar - ctrl - 2);
  return Math.min(aw / 224, ah / 256);
}
function fit() {
  const m = maxScale(), mi = Math.max(1, Math.floor(m)); let k, note = '';
  if (sizeMode === 'auto') k = mi;
  else if (sizeMode === 'fill') k = Math.max(1, m);
  else { k = Math.min(+sizeMode, mi); if (+sizeMode > mi) note = ` (max ${mi}× fits)`; }
  cv.style.width = Math.floor(224 * k) + 'px'; cv.style.height = Math.floor(256 * k) + 'px';
  const label = sizeMode === 'auto' ? `Auto ${mi}×` : sizeMode === 'fill' ? `Fill ${k.toFixed(2)}×` : `${k}×${note}`;
  $('size').textContent = 'Size: ' + label; return { k, mi, m, label };
}
$('size').addEventListener('click', () => { sizeMode = SIZES[(SIZES.map(String).indexOf(String(sizeMode)) + 1) % SIZES.length]; localStorage.setItem('amidarSize', sizeMode); const r = fit(); toast('Size: ' + r.label); });
let fitT; const refit = () => { fit(); clearTimeout(fitT); fitT = setTimeout(fit, 250); };
window.addEventListener('resize', refit); window.addEventListener('orientationchange', refit);
if (window.visualViewport) visualViewport.addEventListener('resize', refit);
window.addEventListener('load', refit);

// ---------- Main loop ----------
let prev = performance.now(), acc = 0; const FRAME = 1000 / C.FPS;
function loop(now) {
  pollPad(); const d = Math.min(100, now - prev); prev = now;
  if (machine && !paused) {
    acc += d; let n = 0;
    while (acc >= FRAME && n < 4) {
      const dir = activeDir();
      machine.setInput({ up: dir === 'up', down: dir === 'down', left: dir === 'left', right: dir === 'right', jump: touchJump || padJump || keys.has('Space') || keys.has('KeyX'), coin: coinT > 0, start1: startT > 0 });
      if (coinT > 0) coinT--; if (startT > 0) startT--;
      machine.runFrame(); pushAudio(machine.takeAudio()); acc -= FRAME; n++;
    }
    if (n === 4) acc = 0;
    if (n) { img32.set(machine.out); ctx.putImageData(img, 0, 0); }
  } else acc = 0;
  requestAnimationFrame(loop);
}
fit(); requestAnimationFrame(loop);
loadRoms().then(list => { if (list && list.length) { useFiles(list, false).then(ok => { if (!ok) $('overlay').hidden = false; }); } else $('overlay').hidden = false; }).catch(() => { $('overlay').hidden = false; });
window.amidarArcade = { get machine() { return machine; }, direction4, fit };
})();
