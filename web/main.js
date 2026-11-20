// Renderer + input for Đảo Đèn Lồng. Game rules live in /src/sim (same code as headless);
// this file only turns keyboard/mouse into contract-style input and draws the sim state.
import * as THREE from 'three';
import { createGame, step, timeLeft, WORLD, TICK_RATE } from '/src/sim/game.js';

const { tuning: T } = await (await fetch('/game.contract.json')).json();
const $ = (id) => document.getElementById(id);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0716);
scene.fog = new THREE.FogExp2(0x160c28, 0.022);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const hemi = new THREE.HemisphereLight(0x6b5ca8, 0x120a20, 0.5);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0x8fa0ff, 0.35);
moon.position.set(-30, 50, -20);
scene.add(moon);

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });
const glowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,180,1)');
  gr.addColorStop(0.35, 'rgba(255,190,90,.55)');
  gr.addColorStop(1, 'rgba(255,160,60,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const glow = (size, opacity = 1) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.setScalar(size);
  return s;
};

// ---------- static world (decor uses its own fixed PRNG, never the sim rng) ----------
let decorSeed = 12345;
const drand = () => ((decorSeed = (decorSeed * 16807) % 2147483647) / 2147483647);
const R = WORLD.islandRadius;
const island = new THREE.Mesh(new THREE.CylinderGeometry(R, R - 7, 8, 72, 1), std(0x2b4a40));
island.position.y = -4;
scene.add(island);
const rockMat = std(0x3a3450);
for (let i = 0; i < 46; i++) {
  const a = (i / 46) * Math.PI * 2 + drand() * 0.1;
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + drand() * 0.9), rockMat);
  rock.position.set(Math.sin(a) * (R - 0.4), 0.1, Math.cos(a) * (R - 0.4));
  scene.add(rock);
}
const treeMat = std(0x1f3a3a);
const trunkMat = std(0x3b2a26);
for (let i = 0; i < 40; i++) {
  const a = drand() * Math.PI * 2;
  const r = 8 + drand() * 28;
  const x = Math.sin(a) * r;
  const z = Math.cos(a) * r;
  if (Math.abs(r - WORLD.lanternRing) < T.safe_radius + 1) continue; // keep the lantern ring clear
  const h = 2 + drand() * 2.5;
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1), trunkMat);
  trunk.position.y = 0.5;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.9 + h * 0.2, h, 7), treeMat);
  crown.position.y = 1 + h / 2;
  tree.add(trunk, crown);
  tree.position.set(x, 0, z);
  scene.add(tree);
}
const sea = new THREE.Mesh(new THREE.CircleGeometry(300, 48), new THREE.MeshBasicMaterial({ color: 0x241a40 }));
sea.rotation.x = -Math.PI / 2;
sea.position.y = -9;
scene.add(sea);
const cloudMat = std(0x5a4c8a, { transparent: true, opacity: 0.85 });
for (let i = 0; i < 60; i++) {
  const a = drand() * Math.PI * 2;
  const r = 50 + drand() * 70;
  const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + drand() * 6, 1), cloudMat);
  puff.position.set(Math.sin(a) * r, -8 + drand() * 3, Math.cos(a) * r);
  puff.scale.y = 0.45;
  scene.add(puff);
}

// ---------- dynamic actors ----------
function makePlayer() {
  const g = new THREE.Group();
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.15, 10), std(0x4a6fa5));
  robe.position.y = 0.58;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), std(0xf2d3b1));
  head.position.y = 1.35;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.78, 0.42, 20), std(0xe6cf8f)); // nón lá
  hat.position.y = 1.68;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.35), std(0x222222));
  string.position.set(0.55, 1.35, 0.25);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc0392b, emissive: 0xff8a2b, emissiveIntensity: 1.5 }));
  lamp.position.set(0.55, 1.12, 0.25);
  const light = new THREE.PointLight(0xffb35c, 3, 12, 1.4);
  light.position.copy(lamp.position);
  const halo = glow(1.2, 0.9);
  halo.position.copy(lamp.position);
  g.add(robe, head, hat, string, lamp, light, halo);
  g.userData = { light, halo, lamp };
  scene.add(g);
  return g;
}
const playerMesh = makePlayer();

const lanternMeshes = new Map();
function makeLantern(L) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3.4), std(0x4a3426));
  pole.position.y = 1.7;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.4, 8), std(0x2d1f18));
  cap.position.y = 4.35;
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8a2a1f, emissive: 0xff7a1a, emissiveIntensity: 0.05, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), bodyMat);
  body.scale.y = 1.25;
  body.position.y = 3.65;
  const light = new THREE.PointLight(0xffa64d, 0, 26, 1.3);
  light.position.y = 3.6;
  const halo = glow(5, 0);
  halo.position.y = 3.65;
  const ring = new THREE.Mesh(new THREE.RingGeometry(T.safe_radius - 0.12, T.safe_radius, 64), new THREE.MeshBasicMaterial({ color: 0xffc56b, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(pole, cap, body, light, halo, ring);
  g.userData = { bodyMat, light, halo, ring };
  scene.add(g);
  return g;
}

const moteMeshes = new Map();
const moteCore = new THREE.SphereGeometry(0.12, 8, 6);
const moteMat = new THREE.MeshBasicMaterial({ color: 0xfff0a8 });
function makeMote() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(moteCore, moteMat), glow(1.1, 0.9));
  scene.add(g);
  return g;
}

const shadeMeshes = new Map();
const shadeBody = new THREE.SphereGeometry(0.85, 14, 10);
function makeShade() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x14081f, emissive: 0x3d1466, emissiveIntensity: 0.6, roughness: 1, transparent: true, opacity: 0.92 });
  const body = new THREE.Mesh(shadeBody, mat);
  body.scale.set(1, 1.15, 1);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.2, 10), mat);
  tail.rotation.x = Math.PI;
  tail.position.y = -0.95;
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8b4ff });
  const eyes = [-0.28, 0.28].map((x) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), eyeMat);
    e.position.set(x, 0.2, 0.75);
    return e;
  });
  g.add(body, tail, ...eyes);
  g.userData = { mat, eyeMat };
  scene.add(g);
  return g;
}

const pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, side: THREE.DoubleSide }));
pulseRing.rotation.x = -Math.PI / 2;
scene.add(pulseRing);
let pulseAnim = 1;

function syncMap(map, items, make, apply) {
  const seen = new Set();
  for (const it of items) {
    seen.add(it.id);
    if (!map.has(it.id)) map.set(it.id, make(it));
    apply(map.get(it.id), it);
  }
  for (const [id, m] of map) if (!seen.has(id)) {
    scene.remove(m);
    map.delete(id);
  }
}

// ---------- audio (WebAudio tones, no asset files) ----------
let actx = null;
function tone(freq, dur = 0.15, type = 'sine', vol = 0.12, delay = 0) {
  if (!actx) return;
  const t0 = actx.currentTime + delay;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(actx.destination);
  o.start(t0);
  o.stop(t0 + dur);
}

// ---------- input ----------
const held = new Set();
const latch = { jump: false, interact: false, pulse: false };
const KEYMAP = { Space: 'jump', KeyE: 'interact', KeyQ: 'pulse' };
let camYaw = 0; // degrees, contract convention: forward = (sin θ, cos θ)
addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  if (!held.has(e.code) && KEYMAP[e.code]) latch[KEYMAP[e.code]] = true;
  held.add(e.code);
  if (e.code === 'Enter' && !running) startGame();
  if (e.code === 'KeyR') startGame();
});
addEventListener('keyup', (e) => held.delete(e.code));
let dragX = null;
addEventListener('pointerdown', (e) => (dragX = e.clientX));
addEventListener('pointerup', () => (dragX = null));
addEventListener('pointermove', (e) => {
  if (dragX === null) return;
  camYaw -= (e.clientX - dragX) * 0.35;
  dragX = e.clientX;
});
function currentInput() {
  const k = (c) => (held.has(c) ? 1 : 0);
  // camera looks along +forward, so screen-right is -X at yaw 0 -> D maps to move.x = -1
  const mx = k('KeyA') - k('KeyD');
  const mz = k('KeyW') - k('KeyS');
  const inp = { move: [mx, mz], cam_yaw_deg: camYaw };
  for (const [code, name] of Object.entries(KEYMAP)) inp[name] = held.has(code) || latch[name];
  return inp;
}

// ---------- game flow ----------
let g = createGame({ tuning: T, seed: 1 });
let running = false;
let flash = 0;
let lastMove = [0, 1];
function startGame() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  g = createGame({ tuning: T, seed: (Date.now() & 0x7fffffff) >>> 0 });
  running = true;
  camYaw = 0;
  $('overlay').classList.add('hidden');
}
$('startBtn').addEventListener('click', startGame);

let toastTimer = 0;
function toast(msg) {
  $('toast').textContent = msg;
  $('toast').style.opacity = 1;
  toastTimer = 2.2;
}

function onEvent(e) {
  switch (e.name) {
    case 'mote_picked':
      tone(880 + e.data.carried * 40, 0.12, 'triangle', 0.08);
      break;
    case 'deposit':
      tone(523, 0.2, 'sine', 0.1);
      break;
    case 'lantern_lit':
      [523, 659, 784].forEach((f, i) => tone(f, 0.6, 'sine', 0.1, i * 0.09));
      toast(`Đèn ${e.data.lantern_id} đã sáng!`);
      break;
    case 'pulse':
      tone(330, 0.35, 'sawtooth', 0.05);
      pulseAnim = 0;
      if (e.data.stunned_ids.length) toast(`Xua được ${e.data.stunned_ids.length} Bóng Mực`);
      break;
    case 'player_hit':
      tone(110, 0.35, 'square', 0.08);
      flash = 1;
      break;
    case 'shade_spawned':
      tone(150, 0.6, 'sine', 0.06);
      toast('Một Bóng Mực trồi lên từ sương...');
      break;
    case 'game_over':
      running = false;
      showEnd(e.data);
      break;
  }
}

function showEnd({ result, reason }) {
  const why = { all_lit: 'Cả 5 Đèn Lồng Lớn đã sáng, sương đen tan dần.', dawn: 'Bình minh đến khi đảo vẫn còn tối.', no_flames: 'Ngọn lửa của Mây đã tắt.' }[reason];
  const lit = g.lanterns.filter((L) => L.lit).length;
  $('card').innerHTML = `<h1>${result === 'won' ? 'Đảo đã sáng!' : 'Thua rồi...'}</h1><p>${why}</p>
    <p>Điểm: <b style="color:var(--gold);font-size:22px">${g.score}</b><br>Đèn đã thắp: ${lit}/5 · Lửa còn: ${g.player.flames}</p>
    <button id="againBtn">Chơi lại (R)</button>`;
  $('againBtn').addEventListener('click', startGame);
  $('overlay').classList.remove('hidden');
  if (result === 'won') [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.8, 'sine', 0.1, i * 0.15));
}

function updateHud() {
  const p = g.player;
  $('flames').textContent = '✦'.repeat(p.flames) + '·'.repeat(Math.max(0, T.flames - p.flames));
  $('carried').textContent = `${p.carried}/${T.carry_capacity}`;
  $('lit').textContent = `${g.lanterns.filter((L) => L.lit).length}/${g.lanterns.length}`;
  const s = Math.ceil(timeLeft(g));
  $('time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  $('score').textContent = g.score;
  const cdTotal = Math.round(T.pulse_cooldown_s * TICK_RATE);
  const ready = p.pulseCdTicks === 0 && p.carried >= T.pulse_cost;
  $('pulseFill').style.width = `${(1 - p.pulseCdTicks / cdTotal) * 100}%`;
  $('pulseFill').style.background = ready ? '#ffc56b' : '#6d5a8a';
  const near = g.lanterns.find((L) => !L.lit && Math.hypot(L.pos[0] - p.pos[0], L.pos[2] - p.pos[2]) <= T.interact_radius);
  $('hint').textContent = near && p.carried > 0 ? `Nhấn E để nạp đèn ${near.id} (${near.deposited}/${T.lantern_cost})`
    : near ? `Đèn ${near.id}: cần ${T.lantern_cost - near.deposited} đom đóm` : `Tỏa sáng (Q) · tốn ${T.pulse_cost} đom đóm`;
}

// ---------- main loop: fixed 60 Hz sim, render every frame ----------
let acc = 0;
let last = performance.now();
let clock = 0;
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  clock += dt;
  camYaw += ((held.has('ArrowLeft') ? 1 : 0) - (held.has('ArrowRight') ? 1 : 0)) * 100 * dt;
  if (running) {
    acc += dt;
    while (acc >= 1 / TICK_RATE && running) {
      const inp = currentInput();
      if (inp.move[0] || inp.move[1]) lastMove = inp.move;
      for (const e of step(g, inp)) onEvent(e);
      latch.jump = latch.interact = latch.pulse = false;
      acc -= 1 / TICK_RATE;
    }
  }
  draw(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function draw(dt) {
  const p = g.player;
  const litCount = g.lanterns.filter((L) => L.lit).length;
  // island brightens as lanterns are lit
  hemi.intensity = 0.45 + litCount * 0.16;
  scene.fog.density = 0.022 - litCount * 0.0028;

  playerMesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
  const th = (camYaw * Math.PI) / 180;
  const [mx, mz] = lastMove;
  playerMesh.rotation.y = Math.atan2(mx * Math.cos(th) + mz * Math.sin(th), -mx * Math.sin(th) + mz * Math.cos(th));
  playerMesh.visible = p.invulnTicks === 0 || Math.floor(clock * 12) % 2 === 0;
  // creative: Mây's hat lantern glows brighter with every firefly carried
  const carriedFrac = p.carried / T.carry_capacity;
  playerMesh.userData.light.intensity = 3 + carriedFrac * 14;
  playerMesh.userData.halo.scale.setScalar(1 + carriedFrac * 1.6);

  syncMap(lanternMeshes, g.lanterns, makeLantern, (m, L) => {
    m.position.set(L.pos[0], L.pos[1], L.pos[2]);
    const u = m.userData;
    const frac = L.lit ? 1 : L.deposited / T.lantern_cost;
    u.bodyMat.emissiveIntensity = L.lit ? 2.2 + Math.sin(clock * 3 + L.pos[0]) * 0.15 : 0.05 + frac * 0.6;
    u.light.intensity = L.lit ? 60 : frac * 6;
    u.halo.material.opacity = L.lit ? 0.9 : frac * 0.4;
    u.ring.material.opacity = L.lit ? 0.38 : 0.12;
  });
  syncMap(moteMeshes, g.motes, makeMote, (m, mo) => {
    const h = mo.id.charCodeAt(1) + mo.id.length * 7;
    m.position.set(mo.pos[0] + Math.sin(clock * 1.3 + h) * 0.25, 0.9 + Math.sin(clock * 2 + h) * 0.25, mo.pos[2] + Math.cos(clock * 1.1 + h) * 0.25);
  });
  syncMap(shadeMeshes, g.shades, makeShade, (m, s) => {
    const stunned = s.state === 'stunned';
    m.position.set(s.pos[0], 1.3 + Math.sin(clock * 2.5 + s.pos[0]) * 0.15, s.pos[2]);
    m.lookAt(p.pos[0], 1.3, p.pos[2]);
    m.userData.eyeMat.color.setHex(stunned ? 0x777788 : 0xd8b4ff);
    m.userData.mat.emissiveIntensity = stunned ? 0.15 : 0.6;
    m.rotation.z = stunned ? Math.sin(clock * 10) * 0.25 : 0;
  });

  if (pulseAnim < 1) {
    pulseAnim = Math.min(1, pulseAnim + dt / 0.45);
    pulseRing.position.set(p.pos[0], 0.1, p.pos[2]);
    pulseRing.scale.setScalar(0.5 + pulseAnim * T.pulse_radius);
    pulseRing.material.opacity = 0.8 * (1 - pulseAnim);
  }
  flash = Math.max(0, flash - dt * 2.5);
  renderer.domElement.style.filter = flash > 0 ? `saturate(${1 - flash * 0.6}) hue-rotate(${flash * 40}deg)` : '';
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').style.opacity = 0;

  // third-person camera behind the player along the contract's forward vector
  const dist = 10;
  const target = new THREE.Vector3(p.pos[0] - Math.sin(th) * dist, p.pos[1] + 5.5, p.pos[2] - Math.cos(th) * dist);
  camera.position.lerp(target, 1 - Math.exp(-dt * 8));
  camera.lookAt(p.pos[0], p.pos[1] + 1.4, p.pos[2]);
  updateHud();
}

camera.position.set(0, 6, -10);
requestAnimationFrame(frame);
