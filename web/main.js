// Renderer, input, audio and game flow for Đảo Đèn Lồng. All rules live in /src/sim (same code as
// headless); this file turns keyboard/mouse into contract-style input and draws the sim state.
import * as THREE from 'three';
import { createGame, step, timeLeft, WORLD, TICK_RATE, isSafe, capacity, litNeeded } from '/src/sim/game.js';
import { MAPS } from '/src/sim/maps.js';

const { tuning: T } = await (await fetch('/game.contract.json')).json();
const $ = (id) => document.getElementById(id);
const C = { sky: 0x0e1430, fog: 0x1b2350, grass: 0x2f5d50, sand: 0xc9b48a, wood: 0x6b4a2f, sea: 0x12384a, lit: 0xffb347, core: 0xffe9b0, off: 0x5b5f6e,
  moteCore: 0xfff6c2, moteHalo: 0xffe58a, shade: 0x120a1a, rim: 0x7a3cff, stunned: 0x3a3450, robe: 0xe8e2d0, scarf: 0xc8102e, gold: 0xf2c14e, drifter: 0x8fa3b8 };
const INTRO = {
  1: 'Mây à, sương đen tràn về bến rồi. Gom đom đóm, thắp lại năm ngọn đèn cho thuyền về nhé.',
  2: 'Hai hòn đảo, một cây cầu tre không lan can. Coi chừng Gió Lạc — nó mê đom đóm của con lắm.',
  3: 'Đêm cuối rồi. Leo lên Đảo Chuông, thắp bảy ngọn đèn, và giữ chặt nón khi gió nổi.',
};

// ---------- settings (persisted) ----------
const settings = { volume: 0.7, sens: 1, colorblind: false };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem('ddl-settings') || '{}'));
} catch {}
const saveSettings = () => {
  try {
    localStorage.setItem('ddl-settings', JSON.stringify(settings));
  } catch {}
};

const isSafeView = (L) => isSafe(g, L);
const applyPalette = () => document.documentElement.classList.toggle('cb', !!settings.colorblind);
applyPalette();

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.sky);
scene.fog = new THREE.FogExp2(C.fog, 0.02);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
const ambient = new THREE.AmbientLight(0xb8c0ff, 0.15); // intensity = 0.15 + 0.55 × lit/total
scene.add(ambient);
const moon = new THREE.DirectionalLight(0x8fa0ff, 0.3);
moon.position.set(-30, 60, -20);
scene.add(moon);

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });
const glowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,246,194,1)');
  gr.addColorStop(0.35, 'rgba(255,229,138,.55)');
  gr.addColorStop(1, 'rgba(255,179,71,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const glow = (size, opacity = 1, color = 0xffffff) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.setScalar(size);
  return s;
};

// ---------- world (rebuilt per night) ----------
let world = new THREE.Group();
scene.add(world);
const sea = new THREE.Mesh(new THREE.CircleGeometry(320, 48), new THREE.MeshBasicMaterial({ color: C.sea }));
sea.rotation.x = -Math.PI / 2;
sea.position.y = -12;
scene.add(sea);
let decor = 777;
const drand = () => ((decor = (decor * 16807) % 2147483647) / 2147483647);
const cloudMat = mat(0x2a4a66, { transparent: true, opacity: 0.8 });
for (let i = 0; i < 50; i++) {
  const a = drand() * Math.PI * 2;
  const r = 60 + drand() * 80;
  const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(4 + drand() * 7, 1), cloudMat);
  puff.position.set(35 + Math.cos(a) * r, -11 + drand() * 3, Math.sin(a) * r);
  puff.scale.y = 0.4;
  scene.add(puff);
}

function islandDisc(r, cx, cz, top = 0) {
  const g = new THREE.Group();
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(r, r - 1, 1, 64), mat(C.grass));
  grass.position.y = top - 0.5;
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.6, r * 0.55, 9, 40), mat(C.sand));
  rock.position.y = top - 5.5;
  g.add(grass, rock);
  g.position.set(cx, 0, cz);
  return g;
}
function addTrees(n, cx, cz, rMin, rMax, avoid) {
  const trunkM = mat(C.wood);
  const crownM = mat(0x24473e);
  for (let i = 0; i < n; i++) {
    const a = drand() * Math.PI * 2;
    const r = rMin + drand() * (rMax - rMin);
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    if (avoid(x, z)) continue;
    const h = 2 + drand() * 2;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.2), trunkM);
    trunk.position.y = 0.6;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.9 + h * 0.2, h, 7), crownM);
    crown.position.y = 1.2 + h / 2;
    tree.add(trunk, crown);
    tree.position.set(x, 0, z);
    world.add(tree);
  }
}
function padMesh(pos) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.2, 24), mat(C.scarf, { emissive: C.gold, emissiveIntensity: 0.4 }));
  disc.position.y = 0.1;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 24), new THREE.MeshBasicMaterial({ color: C.gold }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.22;
  g.add(disc, ring, glow(2.5, 0.5, C.gold));
  g.position.set(...pos);
  world.add(g);
}

function buildWorld(night) {
  scene.remove(world);
  world = new THREE.Group();
  scene.add(world);
  lanternMeshes.clear();
  const M = MAPS[night];
  const nearLantern = (x, z) => M.lanterns.some((L) => Math.hypot(L[0] - x, L[2] - z) < 7) || Math.hypot(x - M.start[0], z - M.start[2]) < 4;
  if (night === 1) {
    world.add(islandDisc(40, 0, 0));
    addTrees(30, 0, 0, 35.5, 39, nearLantern); // outer rim only: keeps the camera view clear
  } else if (night === 2) {
    world.add(islandDisc(28, 0, 0), islandDisc(28, 70, 0));
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 4), mat(C.wood));
    bridge.position.set(35, -0.15, 0);
    world.add(bridge);
    for (let x = 26.5; x < 44; x += 1.2) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 4.1), mat(0x4e3622));
      plank.position.set(x, 0.02, 0);
      world.add(plank);
    }
    addTrees(14, 0, 0, 24, 27, (x, z) => nearLantern(x, z) || Math.hypot(x - 20, z - 18) < 3 || (x > 20 && Math.abs(z) < 4));
    addTrees(14, 70, 0, 24, 27, (x, z) => nearLantern(x, z) || Math.hypot(x - 50, z + 18) < 3 || (x < 50 && Math.abs(z) < 4));
  } else {
    world.add(islandDisc(45, 0, 0));
    const tierM = mat(0x3a6b5c);
    const shape = new THREE.Shape(); // half annulus r 12..24, z > 0 (shape y = -world z)
    shape.absarc(0, 0, 24, 0, -Math.PI, true);
    shape.absarc(0, 0, 12, -Math.PI, 0, false);
    const tier1 = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false, curveSegments: 32 }), tierM);
    tier1.rotation.x = -Math.PI / 2;
    world.add(tier1);
    const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6, 40), tierM);
    tier2.position.y = 3;
    world.add(tier2);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, 8, 16), mat(C.wood));
    tower.position.y = 10;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3, 2, 8), mat(0x3b2a26));
    roof.position.y = 15;
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.6), mat(C.gold, { metalness: 0.6, roughness: 0.4 }));
    bell.position.y = 13.6;
    world.add(tower, roof, bell);
    for (const deg of [30, 150]) {
      const a = (deg * Math.PI) / 180;
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, Math.hypot(6, 3)), mat(C.sand));
      ramp.position.set(Math.cos(a) * 27, 1.4, Math.sin(a) * 27);
      ramp.lookAt(Math.cos(a) * 24, 2.9, Math.sin(a) * 24);
      world.add(ramp);
    }
    addTrees(24, 0, 0, 37, 44, (x, z) => nearLantern(x, z) || (z > 0 && Math.abs(Math.atan2(z, x) * 57.3 - 30) < 12) || (z > 0 && Math.abs(Math.atan2(z, x) * 57.3 - 150) < 12));
  }
  for (const pad of M.pads) padMesh(pad.pos);
  scene.fog.density = night === 2 ? 0.016 : 0.02;
}

// ---------- actors ----------
function makePlayer() {
  const g = new THREE.Group();
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.15, 10), mat(C.robe));
  robe.position.y = 0.58;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.07, 6, 14), mat(C.scarf));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.12;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), mat(0xf2d3b1));
  head.position.y = 1.36;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.78, 0.42, 20), mat(C.sand));
  hat.position.y = 1.68;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ color: C.lit, emissive: C.lit, emissiveIntensity: 1.5 }));
  lamp.position.set(0.55, 1.12, 0.25);
  const light = new THREE.PointLight(C.lit, 3, 12, 1.4);
  light.position.copy(lamp.position);
  const halo = glow(1.2, 0.9, C.moteHalo);
  halo.position.copy(lamp.position);
  g.add(robe, scarf, head, hat, lamp, light, halo);
  g.userData = { light, halo };
  scene.add(g);
  return g;
}
const playerMesh = makePlayer();

const lanternMeshes = new Map();
function makeLantern(L) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3.4), mat(C.wood));
  pole.position.y = 1.7;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.4, 8), mat(0x3b2a26));
  cap.position.y = 4.35;
  const bodyMat = new THREE.MeshStandardMaterial({ color: C.off, emissive: C.lit, emissiveIntensity: 0, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), bodyMat);
  body.scale.y = 1.25;
  body.position.y = 3.65;
  const light = new THREE.PointLight(C.lit, 0, 26, 1.3);
  light.position.y = 3.6;
  const halo = glow(5, 0, C.core);
  halo.position.y = 3.65;
  const ring = new THREE.Mesh(new THREE.RingGeometry(T.safe_radius - 0.12, T.safe_radius, 64), new THREE.MeshBasicMaterial({ color: C.lit, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  // torn-paper mark shown on unlit lanterns (readable without colour)
  const tear = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.7), new THREE.MeshBasicMaterial({ color: 0x0b0d18, side: THREE.DoubleSide }));
  tear.position.set(0.18, 3.65, 0.6);
  tear.rotation.z = 0.5;
  // fuel bar (billboarded each frame)
  const bar = new THREE.Group();
  const barBg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.18), new THREE.MeshBasicMaterial({ color: 0x1b2350, depthTest: false }));
  const barFill = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.11), new THREE.MeshBasicMaterial({ color: C.gold, depthTest: false }));
  barFill.position.z = 0.01;
  bar.add(barBg, barFill);
  bar.position.y = 5.0;
  bar.renderOrder = 10;
  g.add(pole, cap, body, light, halo, ring, tear, bar);
  g.userData = { bodyMat, body, light, halo, ring, tear, bar, barFill };
  world.add(g);
  return g;
}

const moteMeshes = new Map();
const moteGeo = new THREE.SphereGeometry(0.12, 8, 6);
const moteMat = new THREE.MeshBasicMaterial({ color: C.moteCore });
function makeMote() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(moteGeo, moteMat), glow(1.1, 0.9, C.moteHalo));
  scene.add(g);
  return g;
}
const shadeMeshes = new Map();
const shadeGeo = new THREE.SphereGeometry(0.85, 14, 10);
function makeShade() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: C.shade, roughness: 1 });
  const body = new THREE.Mesh(shadeGeo, bodyMat);
  body.scale.set(1, 1.15, 1);
  const rimMat = new THREE.MeshBasicMaterial({ color: C.rim, side: THREE.BackSide, transparent: true, opacity: 0.85 });
  const rim = new THREE.Mesh(shadeGeo, rimMat);
  rim.scale.set(1.09, 1.25, 1.09);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.2, 10), bodyMat);
  tail.rotation.x = Math.PI;
  tail.position.y = -0.95;
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8b4ff });
  for (const x of [-0.28, 0.28]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), eyeMat);
    e.position.set(x, 0.2, 0.75);
    g.add(e);
  }
  g.add(body, rim, tail);
  g.userData = { bodyMat, rimMat, eyeMat };
  scene.add(g);
  return g;
}
const drifterMeshes = new Map();
function makeDrifter() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: C.drifter, side: THREE.DoubleSide, transparent: true, opacity: 0.85, emissive: C.drifter, emissiveIntensity: 0.25 });
  const strips = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 2.4, 1, 6), m);
    s.rotation.z = Math.PI / 2;
    s.position.set(0, i * 0.25 - 0.25, i * 0.2);
    strips.push(s);
    g.add(s);
  }
  g.userData = { m, strips };
  scene.add(g);
  return g;
}
const charmMeshes = new Map();
function makeCharm() {
  const g = new THREE.Group();
  const border = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0), new THREE.MeshBasicMaterial({ color: C.gold, side: THREE.DoubleSide }));
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.88), new THREE.MeshBasicMaterial({ color: C.scarf, side: THREE.DoubleSide }));
  paper.position.z = 0.01;
  g.add(border, paper, glow(1.8, 0.6, C.scarf));
  scene.add(g);
  return g;
}
const pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), new THREE.MeshBasicMaterial({ color: C.core, transparent: true, opacity: 0, side: THREE.DoubleSide }));
pulseRing.rotation.x = -Math.PI / 2;
scene.add(pulseRing);
let pulseAnim = 1;
const leafGeo = new THREE.BufferGeometry();
const LEAVES = 60;
leafGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LEAVES * 3), 3));
const leaves = new THREE.Points(leafGeo, new THREE.PointsMaterial({ color: 0x9fd18b, size: 0.25 }));
leaves.visible = false;
scene.add(leaves);

function syncMap(map, items, make, apply) {
  const seen = new Set();
  for (const it of items) {
    seen.add(it.id);
    if (!map.has(it.id)) map.set(it.id, make(it));
    apply(map.get(it.id), it);
  }
  for (const [id, m] of map) {
    if (!seen.has(id)) {
      m.parent?.remove(m);
      map.delete(id);
    }
  }
}

// ---------- audio: WebAudio synth (no asset files) ----------
const A = { ctx: null, master: null, music: null, nextNote: 0, step: 0 };
function initAudio() {
  if (A.ctx) return;
  A.ctx = new (window.AudioContext || window.webkitAudioContext)();
  A.master = A.ctx.createGain();
  A.master.gain.value = settings.volume;
  A.master.connect(A.ctx.destination);
  A.music = A.ctx.createGain();
  A.music.gain.value = 0.35;
  A.music.connect(A.master);
  for (const f of [110, 164.8]) {
    // soft night drone
    const o = A.ctx.createOscillator();
    const g = A.ctx.createGain();
    o.frequency.value = f;
    g.gain.value = 0.035;
    o.connect(g).connect(A.music);
    o.start();
  }
}
function tone(freq, dur = 0.15, type = 'sine', vol = 0.12, delay = 0, dest) {
  if (!A.ctx) return;
  const t0 = A.ctx.currentTime + delay;
  const o = A.ctx.createOscillator();
  const g = A.ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest || A.master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}
function noise(dur = 0.6, vol = 0.08, freq = 600) {
  if (!A.ctx) return;
  const len = Math.floor(A.ctx.sampleRate * dur);
  const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = A.ctx.createBufferSource();
  src.buffer = buf;
  const f = A.ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = A.ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(A.master);
  src.start();
}
const PENTA = [261.6, 293.7, 329.6, 392, 440, 523.3];
function musicTick() {
  if (!A.ctx || screen !== 'play') return;
  if (A.ctx.currentTime < A.nextNote) return;
  const n = PENTA[(A.step * 3 + (A.step >> 2)) % PENTA.length];
  tone(n, 1.6, 'triangle', 0.035, 0, A.music);
  A.step++;
  A.nextNote = A.ctx.currentTime + 0.9;
}
const SFX = {
  mote: (c) => tone(880 + c * 40, 0.12, 'triangle', 0.08),
  lit: () => [523, 659, 784].forEach((f, i) => tone(f, 0.6, 'sine', 0.1, i * 0.09)),
  pulse: () => (tone(330, 0.35, 'sawtooth', 0.05), noise(0.3, 0.05, 1200)),
  hit: () => tone(110, 0.35, 'square', 0.08),
  jump: () => tone(440, 0.12, 'sine', 0.06),
  dash: () => noise(0.18, 0.09, 2400),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.8, 'sine', 0.1, i * 0.15)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.7, 'triangle', 0.09, i * 0.2)),
  shade: () => tone(150, 0.6, 'sine', 0.07),
  count: () => tone(1200, 0.06, 'square', 0.05),
  wind: () => noise(1.6, 0.06, 500),
  charm: () => [660, 990].forEach((f, i) => tone(f, 0.3, 'triangle', 0.08, i * 0.08)),
  steal: () => tone(700, 0.4, 'sawtooth', 0.04),
  out: () => [330, 247].forEach((f, i) => tone(f, 0.5, 'triangle', 0.08, i * 0.15)),
};

// ---------- input ----------
const held = new Set();
const latch = { jump: false, interact: false, pulse: false, dash: false };
const KEYMAP = { Space: 'jump', KeyE: 'interact', KeyQ: 'pulse', ShiftLeft: 'dash', ShiftRight: 'dash' };
let camYaw = 0;
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!held.has(e.code) && KEYMAP[e.code]) latch[KEYMAP[e.code]] = true;
  held.add(e.code);
  if (e.code === 'F3') $('fps').classList.toggle('hidden');
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (screen === 'play') setScreen('pause');
    else if (screen === 'pause') setScreen('play');
    else if (screen === 'settings') closeSettings();
  }
  if (e.code === 'Enter') {
    const primary = document.querySelector('.overlay:not(.hidden) button');
    if (primary) primary.click();
  }
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => held.clear());
let dragX = null;
renderer.domElement.addEventListener('pointerdown', (e) => (dragX = e.clientX));
addEventListener('pointerup', () => (dragX = null));
addEventListener('pointermove', (e) => {
  if (dragX === null || screen !== 'play') return;
  camYaw -= (e.clientX - dragX) * 0.35 * settings.sens;
  dragX = e.clientX;
});
function currentInput() {
  const k = (c) => (held.has(c) ? 1 : 0);
  // camera looks along +forward, so screen-right is world -X at yaw 0 -> D maps to move.x = -1
  const inp = { move: [k('KeyA') - k('KeyD'), k('KeyW') - k('KeyS')], cam_yaw_deg: camYaw, pause: false };
  for (const [code, name] of Object.entries(KEYMAP)) inp[name] = inp[name] || held.has(code) || latch[name];
  return inp;
}

// ---------- game flow ----------
const QS = new URLSearchParams(location.search);
const START_NIGHT = [1, 2, 3].includes(Number(QS.get('night'))) ? Number(QS.get('night')) : 1; // ?night=2 to practise / test a night
if (QS.has('fps')) document.getElementById('fps').classList.remove('hidden');
// ?debug exposes the live game for visual checks only (screenshots of fuel bars etc.); never used by headless/tests
if (QS.has('debug')) window.__ddl = { get g() { return g; } };
let screen = 'menu';
let prevScreen = 'menu';
let g = createGame({ tuning: T, seed: 1, night: 1 });
const campaign = { night: 1, total: 0 };
let lastSecond = 999;
buildWorld(1);

const OVERLAYS = { menu: 'ovMenu', intro: 'ovIntro', result: 'ovResult', pause: 'ovPause', settings: 'ovSettings', dawn: 'ovDawn' };
function setScreen(s) {
  if (s === 'settings') prevScreen = screen;
  screen = s;
  for (const [k, id] of Object.entries(OVERLAYS)) $(id).classList.toggle('hidden', k !== s);
  $('hudRoot').classList.toggle('hidden', !['play', 'pause'].includes(s) && !(s === 'settings' && prevScreen === 'pause'));
  if (s === 'play') acc = 0;
}
function closeSettings() {
  saveSettings();
  setScreen(prevScreen);
}
function newNight(night) {
  campaign.night = night;
  g = createGame({ tuning: T, seed: (Date.now() & 0x7fffffff) >>> 0, night });
  camYaw = 0;
  lastSecond = 999;
  buildWorld(night);
  for (const m of [moteMeshes, shadeMeshes, drifterMeshes, charmMeshes]) {
    for (const v of m.values()) v.parent?.remove(v);
    m.clear();
  }
  camera.position.set(g.player.pos[0], 6, g.player.pos[2] - 10);
}
function showIntro(night) {
  newNight(night);
  $('introNight').textContent = `Đêm ${night}`;
  $('introName').textContent = MAPS[night].name;
  $('introQuote').textContent = `"${INTRO[night]}" — Ông Đăng`;
  $('introGoal').textContent = `Giữ ít nhất ${litNeeded(g)}/${MAPS[night].lanterns.length} Đèn Lồng Lớn sáng tới bình minh (${Math.round(g.duration / 60 * 10) / 10} phút). Đèn cạn dầu sẽ tắt — nhớ châm thêm đom đóm!`;
  setScreen('intro');
}
function showResult({ result, reason }) {
  const won = result === 'won';
  if (won) campaign.total += g.score;
  (won ? SFX.win : SFX.lose)();
  const why = { dawn_survived: `Bình minh! ${g.lanterns.filter((L) => L.lit).length} đèn vẫn sáng, sương đen tan dần.`, dawn: `Bình minh đến nhưng chưa đủ ${litNeeded(g)} đèn sáng.`, no_flames: 'Ngọn Lửa của Mây đã tắt.' }[reason];
  $('resTitle').textContent = won ? `Đêm ${campaign.night} hoàn thành!` : 'Thua rồi...';
  $('resText').textContent = why;
  $('resScore').textContent = won ? `Điểm Đêm: ${g.score} · Tổng: ${campaign.total}` : `Tổng điểm hiện có: ${campaign.total}`;
  $('resBtns').innerHTML = won
    ? `<button data-act="${campaign.night === 3 ? 'dawn' : 'next'}">${campaign.night === 3 ? 'Đón Bình Minh' : 'Đêm tiếp theo'} (Enter)</button>`
    : `<button data-act="restart">Chơi lại Đêm (Enter)</button><button class="ghost" data-act="menu">Về menu</button>`;
  setScreen('result');
}
const ACTIONS = {
  start: () => {
    initAudio();
    campaign.total = 0;
    showIntro(START_NIGHT);
  },
  play: () => setScreen('play'),
  next: () => showIntro(campaign.night + 1),
  dawn: () => {
    $('dawnScore').textContent = campaign.total;
    setScreen('dawn');
  },
  restart: () => {
    newNight(campaign.night);
    setScreen('play');
  },
  resume: () => setScreen('play'),
  menu: () => {
    newNight(1);
    setScreen('menu');
  },
  settings: () => {
    $('setVol').value = settings.volume;
    $('setSens').value = settings.sens;
    $('setCb').checked = !!settings.colorblind;
    setScreen('settings');
  },
  closeSettings,
};
document.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act) {
    initAudio();
    ACTIONS[act]();
  }
});
$('setVol').addEventListener('input', (e) => {
  settings.volume = Number(e.target.value);
  if (A.master) A.master.gain.value = settings.volume;
  saveSettings();
});
$('setCb').addEventListener('change', (e) => {
  settings.colorblind = e.target.checked;
  applyPalette();
  saveSettings();
});
$('setSens').addEventListener('input', (e) => {
  settings.sens = Number(e.target.value);
  saveSettings();
});

let toastTimer = 0;
function toast(msg) {
  $('toast').textContent = msg;
  $('toast').style.opacity = 1;
  toastTimer = 2.2;
}
let flash = 0;
function onEvent(e) {
  switch (e.name) {
    case 'mote_picked': SFX.mote(e.data.carried); break;
    case 'deposit': tone(523, 0.2, 'sine', 0.1); break;
    case 'lantern_lit': SFX.lit(); toast(`Đèn ${e.data.lantern_id} ${e.data.relight ? 'được thắp lại' : 'đã sáng'}!`); break;
    case 'refuel': tone(587, 0.2, 'sine', 0.09); break;
    case 'lantern_out': SFX.out(); toast(`Đèn ${e.data.lantern_id} đã cạn dầu và tắt!`); break;
    case 'pulse': SFX.pulse(); pulseAnim = 0; break;
    case 'player_hit': SFX.hit(); flash = 1; if (e.data.by === 'fall') toast('Mây rơi xuống biển mây...'); break;
    case 'dash': SFX.dash(); break;
    case 'shade_spawned': SFX.shade(); break;
    case 'charm_picked': SFX.charm(); toast('Bùa Gió! Chạy nhanh, lướt liên tục'); break;
    case 'drifter_steal': SFX.steal(); toast(`Gió Lạc cướp ${e.data.amount} đom đóm!`); break;
    case 'drifter_drop': toast('Gió Lạc đánh rơi đom đóm'); break;
    case 'game_over': showResult(e.data); break;
  }
}

// ---------- HUD ----------
for (let i = 0; i < T.capacity_max; i++) $('bar').insertAdjacentHTML('beforeend', '<div class="slot"></div>');
const slots = [...document.querySelectorAll('.slot')];
const v3 = new THREE.Vector3();
function updateHud() {
  const p = g.player;
  $('flames').innerHTML = Array.from({ length: T.flames }, (_, i) => `<div class="flame${i < p.flames ? '' : ' out'}"></div>`).join('');
  const s = Math.ceil(timeLeft(g));
  $('timer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  $('timer').classList.toggle('danger', s <= 30);
  if (s <= 30 && settings.colorblind) $('timer').textContent = `⚠ ${$('timer').textContent}`;
  const lit = g.lanterns.filter((L) => L.lit).length;
  $('lit').textContent = `${lit}/${g.lanterns.length} (cần ${litNeeded(g)})`;
  $('score').textContent = campaign.total + g.score;
  $('nightName').textContent = `Đêm ${g.night} · ${MAPS[g.night].name}`;
  const cap = capacity(g);
  slots.forEach((el, i) => {
    el.classList.toggle('on', i < p.carried);
    el.classList.toggle('hidden', i >= cap);
  });
  $('carryText').textContent = `${p.carried}/${cap}`;
  const dashFrac = p.charm > 0 ? 1 : 1 - p.dashCd / Math.round(T.dash_cooldown_s * TICK_RATE);
  $('cdDash').style.setProperty('--p', dashFrac);
  $('cdDash').classList.toggle('charm', p.charm > 0);
  $('cdPulse').style.setProperty('--p', p.carried < T.pulse_cost ? 0 : 1 - p.pulseCd / Math.round(T.pulse_cooldown_s * TICK_RATE));
  $('charmTag').classList.toggle('hidden', p.charm === 0);
  $('charmTag').textContent = `Bùa Gió ${Math.ceil(p.charm / 60)}s`;
  const near = g.lanterns.find((L) => (!L.lit || L.fuelU < T.fuel_max * 60 - 60) && Math.hypot(L.pos[0] - p.pos[0], L.pos[2] - p.pos[2]) <= T.interact_radius);
  $('hint').classList.toggle('hidden', !near);
  if (near) $('hint').textContent = near.lit ? `E — Châm dầu (${Math.floor(near.fuelU / 60)}/${T.fuel_max})` : `E — Nạp ánh sáng (${near.deposited}/${near.everLit ? T.relight_cost : T.lantern_cost})`;
  // arrow to the nearest unlit lantern when it is off-screen
  let best = null;
  let bd = Infinity;
  for (const L of g.lanterns) {
    if (L.lit) continue;
    const d = Math.hypot(L.pos[0] - p.pos[0], L.pos[2] - p.pos[2]);
    if (d < bd) [best, bd] = [L, d];
  }
  const arrow = $('arrow');
  if (best) {
    v3.set(best.pos[0], best.pos[1] + 3.6, best.pos[2]).project(camera);
    const behind = v3.z > 1;
    const off = behind || Math.abs(v3.x) > 0.95 || Math.abs(v3.y) > 0.92;
    arrow.classList.toggle('hidden', !off);
    if (off) {
      let x = behind ? -v3.x : v3.x;
      let y = behind ? -v3.y : v3.y;
      if (behind && Math.abs(x) < 1e-3 && Math.abs(y) < 1e-3) y = -1;
      const k = 0.88 / Math.max(Math.abs(x), Math.abs(y));
      x *= k;
      y *= k;
      arrow.style.left = `${((x + 1) / 2) * innerWidth - 14}px`;
      arrow.style.top = `${((1 - y) / 2) * innerHeight - 14}px`;
      arrow.style.transform = `rotate(${Math.atan2(x, y)}rad)`;
    }
  } else arrow.classList.add('hidden');
  // wind warning (2 s ahead) and countdown beeps in the last 10 s
  const toGust = WORLD.windEvery - (g.steps % WORLD.windEvery);
  const warn = g.windEnabled && !g.wind.active && toGust <= WORLD.windWarnTicks;
  $('windWarn').classList.toggle('hidden', !warn);
  if (warn && toGust === WORLD.windWarnTicks) SFX.wind();
  if (s <= 10 && s < lastSecond && screen === 'play') SFX.count();
  lastSecond = s;
}

// ---------- main loop: fixed 60 Hz sim, render every frame ----------
let acc = 0;
let last = performance.now();
let clock = 0;
const fps = { frames: [], avg: 0 };
window.__fps = fps;
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  clock += dt;
  fps.frames.push(dt);
  if (fps.frames.length > 240) fps.frames.shift();
  fps.avg = fps.frames.length / fps.frames.reduce((a, b) => a + b, 0);
  if (!$('fps').classList.contains('hidden')) $('fps').textContent = `${fps.avg.toFixed(0)} FPS`;
  if (screen === 'play') {
    camYaw += ((held.has('ArrowLeft') ? 1 : 0) - (held.has('ArrowRight') ? 1 : 0)) * 100 * dt * settings.sens;
    acc += dt;
    while (acc >= 1 / TICK_RATE && screen === 'play') {
      const inp = currentInput();
      const couldJump = g.player.grounded;
      for (const e of step(g, inp)) onEvent(e);
      if (couldJump && inp.jump && latch.jump && g.player.vel[1] > 0) SFX.jump();
      latch.jump = latch.interact = latch.pulse = latch.dash = false;
      acc -= 1 / TICK_RATE;
    }
    musicTick();
  }
  draw(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function draw(dt) {
  const p = g.player;
  const lit = g.lanterns.filter((L) => L.lit).length;
  ambient.intensity = 0.15 + 0.55 * (lit / g.lanterns.length);
  playerMesh.position.set(...p.pos);
  playerMesh.rotation.y = Math.atan2(p.facing[0], p.facing[1]);
  playerMesh.visible = !p.waiting && (p.invuln === 0 || Math.floor(clock * 12) % 2 === 0);
  const cf = p.carried / capacity(g); // creative: hat lantern glows with carried light
  playerMesh.userData.light.intensity = 3 + cf * 14;
  playerMesh.userData.halo.scale.setScalar(1 + cf * 1.6);

  syncMap(lanternMeshes, g.lanterns, makeLantern, (m, L) => {
    m.position.set(...L.pos);
    const u = m.userData;
    const cost = L.everLit ? T.relight_cost : T.lantern_cost;
    const frac = L.lit ? 1 : L.deposited / cost;
    const fuel = L.fuelU / 60;
    const low = L.lit && fuel < T.low_fuel_threshold;
    const blinkOff = low && Math.floor(clock * 2) % 2 === 1; // slow 1 Hz blink when fuel < 30
    const k = blinkOff ? 0.25 : 1;
    u.bodyMat.color.setHex(L.lit ? C.lit : C.off);
    u.bodyMat.emissive.setHex(L.lit ? C.core : C.lit);
    u.bodyMat.emissiveIntensity = (L.lit ? 1.6 + Math.sin(clock * 3 + L.pos[0]) * 0.15 : frac * 0.6) * k;
    u.light.intensity = (L.lit ? 15 + 45 * Math.min(1, fuel / 50) : frac * 6) * k;
    u.halo.material.opacity = (L.lit ? 0.9 : frac * 0.4) * k;
    u.ring.material.opacity = isSafeView(L) ? 0.35 : 0; // safe zone only when lit with fuel >= 30
    u.body.scale.set(L.lit ? 1 : 0.95, L.lit ? 1.25 : 1.25 * 0.8, L.lit ? 1 : 0.95); // unlit: squashed 20 %
    u.body.position.y = L.lit ? 3.65 : 3.5;
    u.tear.visible = !L.lit;
    u.bar.visible = L.lit && !blinkOff;
    u.barFill.scale.x = Math.max(0.001, fuel / T.fuel_max);
    u.barFill.position.x = -0.75 * (1 - fuel / T.fuel_max);
    u.barFill.material.color.setHex(low ? (settings.colorblind ? 0xffffff : 0xff5a5f) : C.gold);
    u.bar.quaternion.copy(camera.quaternion);
  });
  syncMap(moteMeshes, g.motes, makeMote, (m, mo) => {
    const h = Number(mo.id.slice(1)) * 1.7;
    const fade = mo.ttl !== null && mo.ttl < 120 ? (Math.floor(clock * 8) % 2 ? 0.3 : 1) : 1;
    m.children[1].material.opacity = 0.9 * fade;
    m.position.set(mo.pos[0] + Math.sin(clock * 1.3 + h) * 0.2, mo.pos[1] + 0.9 + Math.sin(clock * 2 + h) * 0.2, mo.pos[2] + Math.cos(clock * 1.1 + h) * 0.2);
  });
  syncMap(shadeMeshes, g.shades, makeShade, (m, s) => {
    const stunned = s.state === 'stunned';
    m.position.set(s.pos[0], s.pos[1] + 0.3 + Math.sin(clock * 2.5 + s.pos[0]) * 0.15, s.pos[2]);
    m.lookAt(p.pos[0], m.position.y, p.pos[2]);
    m.userData.bodyMat.color.setHex(stunned ? C.stunned : C.shade);
    const rim = settings.colorblind ? 0x00b3ff : C.rim; // colour-blind palette: #7A3CFF -> #00B3FF
    m.userData.rimMat.color.setHex(stunned ? C.stunned : rim);
    m.userData.eyeMat.color.setHex(stunned ? 0x777788 : settings.colorblind ? 0x00b3ff : 0xd8b4ff);
    m.userData.bodyMat.emissive?.setHex(s.state === 'drain' ? 0x2a1150 : 0x000000);
    m.scale.setScalar(s.state === 'spawning' ? 0.4 : s.state === 'recoil' ? 0.9 : 1);
    m.rotation.z = stunned ? Math.sin(clock * 10) * 0.25 : 0;
  });
  syncMap(drifterMeshes, g.drifters, makeDrifter, (m, d) => {
    m.position.set(...d.pos);
    m.lookAt(p.pos[0], d.pos[1], p.pos[2]);
    m.userData.strips.forEach((s, i) => (s.rotation.x = Math.sin(clock * 6 + i) * 0.6));
    m.userData.m.opacity = d.state === 'flee' ? 0.45 : 0.85;
  });
  syncMap(charmMeshes, g.charms, makeCharm, (m, c) => {
    m.visible = c.available;
    m.position.set(c.pos[0], c.pos[1] + 1.1 + Math.sin(clock * 2) * 0.15, c.pos[2]);
    m.rotation.y = clock * 1.5;
  });
  if (pulseAnim < 1) {
    pulseAnim = Math.min(1, pulseAnim + dt / 0.45);
    pulseRing.position.set(p.pos[0], p.pos[1] + 0.1, p.pos[2]);
    pulseRing.scale.setScalar(0.5 + pulseAnim * T.pulse_radius);
    pulseRing.material.opacity = 0.8 * (1 - pulseAnim);
  }
  // wind leaves: shown during the 2 s warning and the gust
  const toGust = WORLD.windEvery - (g.steps % WORLD.windEvery);
  leaves.visible = g.windEnabled && (g.wind.active || toGust <= WORLD.windWarnTicks);
  if (leaves.visible) {
    const a = (g.wind.dir * Math.PI) / 180;
    const arr = leafGeo.attributes.position.array;
    for (let i = 0; i < LEAVES; i++) {
      const ph = (clock * (g.wind.active ? 0.5 : 0.2) + i / LEAVES) % 1;
      const off = (i * 7.31) % 20 - 10;
      const along = ph * 30 - 15;
      arr[i * 3] = p.pos[0] + Math.cos(a) * along - Math.sin(a) * off;
      arr[i * 3 + 1] = p.pos[1] + 0.5 + ((i * 3.7) % 4);
      arr[i * 3 + 2] = p.pos[2] + Math.sin(a) * along + Math.cos(a) * off;
    }
    leafGeo.attributes.position.needsUpdate = true;
  }
  flash = Math.max(0, flash - dt * 2.5);
  $('flash').style.background = `rgba(255,90,95,${flash * 0.35})`;
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').style.opacity = 0;

  const th = (camYaw * Math.PI) / 180;
  const target = new THREE.Vector3(p.pos[0] - Math.sin(th) * 10, p.pos[1] + 5.5, p.pos[2] - Math.cos(th) * 10);
  if (screen === 'menu') target.set(Math.sin(clock * 0.1) * 30, 18, Math.cos(clock * 0.1) * 30);
  camera.position.lerp(target, 1 - Math.exp(-dt * (screen === 'menu' ? 1 : 8)));
  camera.lookAt(screen === 'menu' ? 0 : p.pos[0], screen === 'menu' ? 0 : p.pos[1] + 1.4, screen === 'menu' ? 0 : p.pos[2]);
  if (['play', 'pause'].includes(screen) || prevScreen === 'pause') updateHud();
}

camera.position.set(0, 18, -30);
setScreen('menu');
requestAnimationFrame(frame);
