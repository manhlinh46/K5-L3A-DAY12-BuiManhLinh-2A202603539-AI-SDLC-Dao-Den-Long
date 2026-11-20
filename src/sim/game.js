// Pure, deterministic simulation for Đảo Đèn Lồng — Test Contract v1.1 (Ticket-02).
// Shared by the browser (web/main.js) and the headless CLI (src/headless.js).
// No DOM, no Math.random, no wall clock. step() follows the mandatory per-tick order:
//  1 input/pause · 2 counters · 3 player move + fall · 4 pickup · 5 lantern · 6 safe zones
//  7 pulse · 8 shades/drifters move · 9 contacts · 10 spawns · 11 win/lose · (12 snapshot: run.js)
import { mulberry32 } from './rng.js';
import { MAPS, groundAt } from './maps.js';

export const TICK_RATE = 60;
const DT = 1 / TICK_RATE;

// Ticket-02 constants that are not tuning keys (see docs/notes/phase-2.md).
export const WORLD = {
  gravity: 20,
  jumpSpeed: 7,
  stepHeight: 0.35, // max height change walked over; cliffs (3 m tiers) block
  fallY: -10,
  respawnWaitTicks: 60,
  pickupHeight: 1.5,
  moteStart: 20,
  moteCap: 30,
  moteSpawnEvery: 240,
  droppedTtl: 480,
  dropRing: [1.5, 2.5],
  pulseCenterY: 0.8,
  pulsePushTicks: 15,
  shadeHover: 1, // shade centre = ground + 1 m
  shadeDetect: 12,
  shadeGiveUp: 18,
  shadeHitHeight: 1.5,
  shadeWanderSpeed: 2,
  shadeFirstSpawn: 300,
  shadeFirstCount: 2,
  shadeMinPlayerDist: 15,
  recoilTicks: 60,
  recoilDist: 2,
  evictTicks: 30,
  drifterSpeed: 7,
  drifterIdleSpeed: 2,
  drifterMax: 2,
  drifterSpawnEvery: 1200,
  drifterSteal: 3,
  drifterMinCarry: 5,
  drifterDetect: 15,
  drifterHit: 1.2,
  drifterFleeTicks: 240,
  drifterDropFleeTicks: 120,
  drifterHover: 1.2,
  charmTicks: 600,
  charmRespawnTicks: 2700,
  charmSpeed: 7.2,
  windEvery: 1800,
  windTicks: 300,
  windWarnTicks: 120,
  windSpeed: 2,
  drainRange: 2, // Ticket-03: a wandering shade within 2 m (XZ) of its weak lantern starts to drain
  drainBreakPlayer: 6, // drain -> chase when Mây comes within 6 m
  drainEventEvery: 60,
  darkRoamRadius: 4, // wandering shades roam within ~4 m of the nearest unlit lantern
};
const W = WORLD;
// Fuel is stored in integer units of 1/60 (one tick of decay at 1.0/s) to avoid float drift.
const FU = 60;
const r1 = (v) => Math.round(v * 10) / 10 + 0;

const r3 = (v) => Math.round(v * 1000) / 1000 + 0;
const distXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const ticksOf = (s) => Math.round(s * TICK_RATE);
const idNum = (id) => Number(String(id).replace(/\D/g, '')) || 0;
const byId = (a, b) => idNum(a.id) - idNum(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const away = (from, to) => {
  // horizontal unit vector from `from` towards `to`; coincident -> +X
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const d = Math.hypot(dx, dz);
  return d > 1e-9 ? [dx / d, dz / d] : [1, 0];
};
export const SHADE_STATES = ['spawning', 'wander', 'chase', 'recoil', 'stunned'];
export const DRIFTER_STATES = ['idle', 'chase', 'flee', 'removed'];
export const NEUTRAL_INPUT = Object.freeze({ move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false });

export function timeLeft(g) {
  return Math.max(0, g.timeStartS - g.steps / TICK_RATE);
}
const hoverY = (g, x, z, h) => Math.min(groundAt(g.night, x, z) ?? 0, 6) + h;
// Ticket-03: carry capacity grows with successful lights; a lantern is "safe" only when lit with fuel >= threshold.
export const capacity = (g) => Math.min(g.T.capacity_max, g.T.carry_capacity + 2 * g.player.lights);
export const litNeeded = (g) => Math.ceil(g.T.win_ratio * g.lanterns.length - 1e-9);
export const isSafe =(g, L) => L.lit && L.fuelU >= g.T.low_fuel_threshold * FU;
const isWeak = (g, L) => L.lit && L.fuelU < g.T.low_fuel_threshold * FU;
const lanternById = (g, id) => g.lanterns.find((L) => L.id === id);
function nearestLantern(g, pos, pred) {
  let best = null;
  let bd = Infinity;
  for (const L of g.lanterns) {
    if (!pred(L)) continue;
    const d = distXZ(pos, L.pos);
    if (d < bd || (d === bd && idNum(L.id) < idNum(best.id))) [best, bd] = [L, d];
  }
  return best;
}

function newMote(g, pos, kind = 'random', ttl = null) {
  const m = { id: `M${g.nextMote++}`, pos, kind, ttl };
  g.motes.push(m);
  return m;
}
function newShadeId(g) {
  let id;
  do id = `S${g.nextShade++}`;
  while (g.shades.some((s) => s.id === id));
  return id;
}
function makeShade(g, id, x, z, state, stl = 0) {
  return { id, pos: [x, hoverY(g, x, z, W.shadeHover), z], state, stl, push: null, recoilDir: [1, 0], target: null, evict: null, drainTicks: 0 };
}
function activeState(g, s) {
  return !g.player.waiting && distXZ(s.pos, g.player.pos) <= W.shadeDetect ? 'chase' : 'wander';
}
const emptyMotePoints = (g) => g.M.moteSpawns.filter((pt) => !g.motes.some((m) => m.kind === 'random' && distXZ(m.pos, pt) < 0.01));

/**
 * Build the initial state of one night. Applying a scenario never emits events or awards score.
 * @param {{tuning: object, seed?: number, night?: 1|2|3, scenario?: object|null}} opts
 */
export function createGame({ tuning, seed = 1, night = 1, scenario = null }) {
  const T = tuning;
  const M = MAPS[night];
  const sc = scenario || {};
  const duration = T[`night${night}_duration_s`];
  const g = {
    T,
    M,
    night,
    rng: mulberry32(seed),
    tick: 0,
    steps: 0,
    state: 'playing',
    paused: false,
    result: null,
    score: 0,
    duration,
    timeStartS: sc.time_left_s ?? duration,
    player: {
      pos: [...M.start], vel: [0, 0, 0], grounded: true, facing: [0, 1], flames: T.flames, carried: 0,
      invuln: 0, dashCd: 0, pulseCd: 0, charm: 0, dashTicks: 0, dashDir: [0, 1], launch: null, waiting: false, respawn: 0, lights: 0,
    },
    lanterns: M.lanterns.map((pos, i) => ({ id: `L${i + 1}`, pos: [...pos], lit: false, deposited: 0, fuelU: 0, everLit: false, relit: 0 })),
    motes: [],
    shades: [],
    drifters: [],
    charms: M.charms.map((pos, i) => ({ id: `C${i + 1}`, pos: [...pos], available: true, respawn: 0 })),
    nextMote: 1,
    nextShade: 1,
    nextDrifter: 1,
    randomMotes: sc.random_motes !== false,
    randomShades: sc.random_shades !== false,
    randomDrifters: M.drifters && sc.random_drifters !== false,
    windEnabled: M.wind && sc.wind_enabled !== false,
    wind: { active: false, dir: 0 },
    prev: { jump: false, interact: false, pulse: false, dash: false, pause: false },
  };
  const p = g.player;

  if (sc.player) {
    const sp = sc.player;
    if (sp.pos) p.pos = [...sp.pos];
    if (sp.carried != null) p.carried = sp.carried;
    if (sp.flames != null) p.flames = sp.flames;
    if (sp.invuln_ticks != null) p.invuln = sp.invuln_ticks;
    if (sp.dash_cd_ticks != null) p.dashCd = sp.dash_cd_ticks;
    if (sp.pulse_cd_ticks != null) p.pulseCd = sp.pulse_cd_ticks;
    if (sp.charm_ticks != null) p.charm = sp.charm_ticks;
    if (sp.successful_lights != null) p.lights = sp.successful_lights;
    const h = groundAt(night, p.pos[0], p.pos[2]);
    p.grounded = h !== null && Math.abs(p.pos[1] - h) < 1e-6;
  }
  for (const u of sc.lanterns || []) {
    const L = g.lanterns.find((l) => l.id === u.id);
    if (u.pos) L.pos = [...u.pos];
    if (u.deposited != null) L.deposited = u.deposited;
    if (u.lit != null) L.lit = u.lit;
    // lit without fuel -> fuel 100; ever_lit defaults to the lit flag
    L.fuelU = L.lit ? Math.round((u.fuel ?? T.fuel_max) * FU) : 0;
    L.everLit = u.ever_lit ?? L.lit;
    if (u.relit_count != null) L.relit = u.relit_count;
  }

  if (Array.isArray(sc.motes)) {
    for (const m of sc.motes) {
      if (Array.isArray(m)) newMote(g, [...m]);
      else {
        const ttl = m.ttl_ticks ?? (m.ttl_s != null ? ticksOf(m.ttl_s) : null);
        newMote(g, [...m.pos], m.kind || (ttl != null ? 'dropped' : 'random'), ttl);
      }
    }
  } else if (g.randomMotes) {
    const pts = [...M.moteSpawns];
    for (let i = 0; i < W.moteStart && pts.length; i++) newMote(g, [...pts.splice(Math.floor(g.rng() * pts.length), 1)[0]]);
  }

  if (Array.isArray(sc.shades)) {
    const used = new Set(sc.shades.filter((s) => s.id).map((s) => s.id));
    for (const s of sc.shades) {
      let id = s.id;
      if (!id) {
        do id = `S${g.nextShade++}`;
        while (used.has(id));
        used.add(id);
      }
      const sh = makeShade(g, id, s.pos[0], s.pos[2], 'wander'); // y always = ground + hover
      sh.state = s.state || activeState(g, sh);
      sh.stl = s.state_ticks_left ?? (sh.state === 'stunned' ? ticksOf(T.pulse_stun_s) : sh.state === 'recoil' ? W.recoilTicks : 0);
      if (sh.state === 'recoil') sh.recoilDir = away(p.pos, sh.pos);
      sh.target = s.target_lantern_id ?? null;
      sh.drainTicks = 0;
      g.shades.push(sh);
    }
  }
  if (Array.isArray(sc.drifters)) {
    for (const d of sc.drifters) {
      const id = d.id || `D${g.nextDrifter++}`;
      g.drifters.push({ id, pos: [d.pos[0], d.pos[1] ?? hoverY(g, d.pos[0], d.pos[2], W.drifterHover), d.pos[2]], state: d.state || 'idle', stolen: d.stolen || 0, flee: d.state === 'flee' ? (d.state_ticks_left ?? W.drifterFleeTicks) : 0, target: null, stoleOnce: (d.stolen || 0) > 0 });
    }
  }
  if (Array.isArray(sc.charms)) {
    g.charms = sc.charms.map((c, i) => {
      const respawn = c.respawn_ticks ?? (c.respawn_s != null ? ticksOf(c.respawn_s) : 0);
      return { id: c.id || `C${i + 1}`, pos: [...(c.pos || M.charms[i] || [0, 0, 0])], available: c.available ?? respawn === 0, respawn };
    });
  }
  return g;
}

function endGame(g, result, reason, emit) {
  g.state = result;
  g.result = { result, reason };
  if (result === 'won') {
    // Ticket-03 dawn bonus: each lit lantern 50 + floor(fuel), each flame left 50 (time bonus removed)
    const S = g.T.score;
    for (const L of g.lanterns) if (L.lit) g.score += S.per_lit_at_dawn + Math.floor(L.fuelU / FU);
    g.score += S.per_flame_left * g.player.flames;
  }
  emit('game_over', { result, reason });
}

function dropMotes(g, centre, n, ring) {
  for (let i = 0; i < n; i++) {
    let x = centre[0];
    let z = centre[2];
    if (ring) {
      const a = g.rng() * 2 * Math.PI;
      const r = ring[0] + g.rng() * (ring[1] - ring[0]);
      x += r * Math.cos(a);
      z += r * Math.sin(a);
    }
    newMote(g, [x, groundAt(g.night, x, z) ?? centre[1], z], 'dropped', W.droppedTtl);
  }
}

// Keep shades out of lit lanterns' safe zones (block at the 6 m edge).
function blockSafe(g, s) {
  const lim = g.T.safe_radius + 1e-6;
  for (const L of g.lanterns) {
    if (!isSafe(g, L)) continue;
    const d = distXZ(s.pos, L.pos);
    if (d < lim) {
      const [ux, uz] = away(L.pos, s.pos);
      s.pos[0] = L.pos[0] + ux * lim;
      s.pos[2] = L.pos[2] + uz * lim;
    }
  }
}
function moveEntity(g, e, dir, len, hover, isShade) {
  e.pos[0] += dir[0] * len;
  e.pos[2] += dir[1] * len;
  if (isShade) blockSafe(g, e);
  e.pos[1] = hoverY(g, e.pos[0], e.pos[2], hover);
}
function wander(g, e, speed, hover, isShade) {
  if (!e.roam || distXZ(e.pos, e.roam) < 0.3) {
    e.roam = [e.pos[0], 0, e.pos[2]];
    for (let i = 0; i < 4; i++) {
      const a = g.rng() * 2 * Math.PI;
      const r = 2 + g.rng() * 6;
      const x = e.pos[0] + r * Math.cos(a);
      const z = e.pos[2] + r * Math.sin(a);
      if (groundAt(g.night, x, z) !== null) {
        e.roam = [x, 0, z];
        break;
      }
    }
  }
  const d = distXZ(e.pos, e.roam);
  if (d > 1e-9) moveEntity(g, e, away(e.pos, e.roam), Math.min(speed * DT, d), hover, isShade);
}

function movePlayer(g, inp, edge, emit) {
  const T = g.T;
  const p = g.player;
  let [mx, mz] = inp.move;
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  const th = (inp.cam_yaw_deg * Math.PI) / 180;
  const wx = mx * Math.cos(th) + mz * Math.sin(th);
  const wz = -mx * Math.sin(th) + mz * Math.cos(th);
  const ml = Math.hypot(wx, wz);
  if (ml > 1e-9) p.facing = [wx / ml, wz / ml];

  if (edge('dash') && p.dashTicks === 0 && (p.dashCd === 0 || p.charm > 0)) {
    p.dashTicks = ticksOf(T.dash_duration_s);
    p.dashDir = ml > 1e-9 ? [wx / ml, wz / ml] : [...p.facing];
    p.dashCd = p.charm > 0 ? 0 : ticksOf(T.dash_cooldown_s);
    if (!p.grounded) p.vel[1] = 0;
    emit('dash', {});
  }
  if (edge('jump') && p.grounded && p.dashTicks === 0) {
    p.vel[1] = W.jumpSpeed;
    p.grounded = false;
  }

  let vx;
  let vz;
  if (p.dashTicks > 0) [vx, vz] = [p.dashDir[0] * T.dash_speed, p.dashDir[1] * T.dash_speed];
  else if (p.launch) [vx, vz] = p.launch;
  else {
    const speed = p.charm > 0 ? W.charmSpeed : T.player_speed;
    [vx, vz] = [wx * speed, wz * speed];
  }
  if (g.wind.active) {
    vx += Math.cos((g.wind.dir * Math.PI) / 180) * W.windSpeed;
    vz += Math.sin((g.wind.dir * Math.PI) / 180) * W.windSpeed;
  }
  // horizontal move; a ground more than stepHeight above the feet is a wall (slide per axis)
  const ok = (x, z) => {
    const h = groundAt(g.night, x, z);
    return h === null || h <= p.pos[1] + W.stepHeight;
  };
  const nx = p.pos[0] + vx * DT;
  const nz = p.pos[2] + vz * DT;
  if (ok(nx, nz)) [p.pos[0], p.pos[2]] = [nx, nz];
  else if (ok(nx, p.pos[2])) p.pos[0] = nx;
  else if (ok(p.pos[0], nz)) p.pos[2] = nz;

  // vertical
  if (p.dashTicks > 0 && !p.grounded) p.vel[1] = 0; // air dash keeps altitude
  else if (!p.grounded) {
    p.vel[1] -= W.gravity * DT;
    p.pos[1] += p.vel[1] * DT;
  }
  const h = groundAt(g.night, p.pos[0], p.pos[2]);
  if (p.grounded) {
    if (h === null || h < p.pos[1] - W.stepHeight) {
      p.grounded = false;
      p.vel[1] = 0;
    } else p.pos[1] = h;
  } else if (h !== null && p.pos[1] <= h && p.vel[1] <= 0) {
    p.pos[1] = h;
    p.vel[1] = 0;
    p.grounded = true;
    p.launch = null;
  }
  p.vel[0] = vx;
  p.vel[2] = vz;

  // launch pads
  if (p.grounded && !p.launch) {
    for (const pad of g.M.pads) {
      if (distXZ(p.pos, pad.pos) <= pad.r && Math.abs(p.pos[1] - pad.pos[1]) < 0.05) {
        const dir = pad.dir || away(p.pos, [pad.target[0], 0, pad.target[1]]);
        p.launch = [dir[0] * pad.h, dir[1] * pad.h];
        p.vel = [p.launch[0], pad.vy, p.launch[1]];
        p.grounded = false;
        break;
      }
    }
  }

  // fall off the island: once, ignores invulnerability
  if (T.fall_enabled && p.pos[1] < W.fallY) {
    p.flames = Math.max(0, p.flames - 1);
    const lost = p.carried;
    p.carried = 0;
    Object.assign(p, { waiting: true, respawn: W.respawnWaitTicks, vel: [0, 0, 0], launch: null, dashTicks: 0 });
    emit('player_hit', { by: 'fall', flames: p.flames, dropped: 0, lost });
  }
}

/**
 * Advance one tick (1/60 s). `inp` is the held input for this tick (contract input fields).
 * Returns the events produced in this tick.
 */
export function step(g, inp) {
  if (g.state !== 'playing') return [];
  const T = g.T;
  const p = g.player;
  const t = g.tick + 1;
  const events = [];
  const emit = (name, data) => events.push({ type: 'event', tick: t, name, data });
  const edge = (k) => !!inp[k] && !g.prev[k];
  const finish = () => {
    g.tick = t;
    g.prev = { jump: !!inp.jump, interact: !!inp.interact, pulse: !!inp.pulse, dash: !!inp.dash, pause: !!inp.pause };
    return events;
  };

  // 1. input: pause first
  if (edge('pause')) {
    g.paused = !g.paused;
    emit(g.paused ? 'paused' : 'resumed', {});
  }
  if (g.paused) return finish();

  // 2. counters
  g.steps++;
  const dec = (o, k) => {
    if (o[k] > 0) o[k]--;
  };
  for (const k of ['invuln', 'dashCd', 'pulseCd', 'charm', 'dashTicks', 'respawn']) dec(p, k);
  for (const s of g.shades) if (s.state === 'stunned') dec(s, 'stl'); // recoil counts down as it moves (step 8)
  for (const d of g.drifters) if (d.state === 'flee') dec(d, 'flee');
  for (const c of g.charms) {
    if (!c.available && c.respawn > 0 && --c.respawn === 0) c.available = true;
  }
  g.motes = g.motes.filter((m) => m.ttl === null || --m.ttl > 0);
  // Ticket-03 step 2: fuel decay (1/s) + drain (5/s per draining shade); right after, empty lanterns go out
  for (const L of g.lanterns) {
    if (!L.lit) continue;
    const drainers = g.shades.filter((s) => s.state === 'drain' && s.target === L.id).sort(byId);
    L.fuelU -= Math.round(T.fuel_decay_per_s) + Math.round(T.drain_per_s) * drainers.length;
    for (const s of drainers) {
      if (++s.drainTicks % W.drainEventEvery === 0) emit('fuel_drain', { lantern_id: L.id, shade_id: s.id, fuel: r1(Math.max(0, L.fuelU) / FU) });
    }
    if (L.fuelU <= 0) {
      Object.assign(L, { lit: false, fuelU: 0, deposited: 0 });
      emit('lantern_out', { lantern_id: L.id });
    }
  }

  // 3. player movement (+ wind) and fall check
  if (g.windEnabled) {
    const c = g.steps % W.windEvery;
    if (c === 0) g.wind.dir = r3(g.rng() * 360);
    g.wind.active = g.steps >= W.windEvery && c < W.windTicks;
  }
  if (p.waiting) {
    if (p.respawn === 0) {
      Object.assign(p, { waiting: false, pos: [...g.M.start], vel: [0, 0, 0], grounded: true, facing: [0, 1], launch: null, dashTicks: 0, invuln: ticksOf(T.invuln_s) });
    }
  } else movePlayer(g, inp, edge, emit);
  const active = !p.waiting;

  // 4. pickup motes and charms
  const reach = (pos) => distXZ(p.pos, pos) <= T.pickup_radius && Math.abs(p.pos[1] - pos[1]) <= W.pickupHeight;
  if (active) {
    for (let i = 0; i < g.motes.length && p.carried < capacity(g); ) {
      if (reach(g.motes[i].pos)) {
        g.motes.splice(i, 1);
        p.carried++;
        emit('mote_picked', { carried: p.carried });
      } else i++;
    }
    for (const c of g.charms) {
      if (c.available && reach(c.pos)) {
        c.available = false;
        c.respawn = W.charmRespawnTicks;
        p.charm = W.charmTicks;
        emit('charm_picked', { charm_id: c.id, charm_ticks: p.charm });
      }
    }
  }

  // 5. lantern interaction
  // Ticket-03: accepting lanterns = unlit, or lit but not full; nearest, tie -> smaller id
  const justLit = [];
  const fullU = T.fuel_max * FU;
  const refuelNeed = (L) => Math.ceil((fullU - L.fuelU) / (T.fuel_per_mote * FU));
  if (active && edge('interact') && p.carried > 0) {
    const best = nearestLantern(g, p.pos, (L) => distXZ(p.pos, L.pos) <= T.interact_radius && (!L.lit || refuelNeed(L) > 0));
    if (best && !best.lit) {
      const relight = best.everLit;
      const cost = relight ? T.relight_cost : T.lantern_cost;
      const amount = Math.min(p.carried, cost - best.deposited);
      if (amount > 0) {
        p.carried -= amount;
        best.deposited += amount;
        g.score += T.score.per_mote * amount;
        emit('deposit', { lantern_id: best.id, amount, deposited: best.deposited });
        if (best.deposited >= cost) {
          Object.assign(best, { lit: true, fuelU: fullU, everLit: true });
          if (relight) best.relit++;
          p.lights++;
          g.score += relight ? T.score.per_relight : T.score.per_lantern;
          justLit.push(best);
          emit('lantern_lit', { lantern_id: best.id, relight });
        }
      }
    } else if (best) {
      const wasWeak = isWeak(g, best);
      const used = Math.min(p.carried, refuelNeed(best));
      best.fuelU = Math.min(fullU, best.fuelU + T.fuel_per_mote * FU * used);
      p.carried -= used;
      g.score += T.score.per_mote * used;
      emit('refuel', { lantern_id: best.id, amount: used, fuel: r1(best.fuelU / FU) });
      if (wasWeak && isSafe(g, best)) justLit.push(best); // regained its safe zone -> evict shades inside
    }
  }

  // 6. safe zones: shades caught inside a newly lit lantern are pushed to the edge within 30 ticks
  for (const L of justLit) for (const s of g.shades) if (distXZ(s.pos, L.pos) < T.safe_radius) s.evict = { L, ticks: W.evictTicks };
  for (const s of g.shades) {
    if (!s.evict) continue;
    const { L } = s.evict;
    const need = T.safe_radius + 1e-6 - distXZ(s.pos, L.pos);
    if (need <= 0) {
      s.evict = null;
      continue;
    }
    const dir = away(L.pos, s.pos);
    s.pos[0] += (dir[0] * need) / s.evict.ticks;
    s.pos[2] += (dir[1] * need) / s.evict.ticks;
    s.pos[1] = hoverY(g, s.pos[0], s.pos[2], W.shadeHover);
    if (--s.evict.ticks === 0) s.evict = null;
  }

  // 7. pulse
  if (active && edge('pulse') && p.pulseCd === 0 && p.carried >= T.pulse_cost) {
    p.carried -= T.pulse_cost;
    p.pulseCd = ticksOf(T.pulse_cooldown_s);
    const c = [p.pos[0], p.pos[1] + W.pulseCenterY, p.pos[2]];
    const in3d = (e) => Math.hypot(e.pos[0] - c[0], e.pos[1] - c[1], e.pos[2] - c[2]) <= T.pulse_radius;
    const ids = [];
    for (const s of [...g.shades].sort(byId)) {
      if (!in3d(s)) continue;
      g.score += s.state === 'drain' ? T.score.per_stun_drain : T.score.per_stun; // 15 total if it was draining
      s.state = 'stunned';
      s.stl = ticksOf(T.pulse_stun_s);
      s.push = { dir: away(p.pos, s.pos), ticks: W.pulsePushTicks };
      ids.push(s.id);
    }
    emit('pulse', { stunned_ids: ids });
    for (const d of [...g.drifters].sort(byId)) {
      if (!in3d(d)) continue;
      if (d.state === 'chase') Object.assign(d, { state: 'flee', flee: W.drifterFleeTicks });
      else if (d.state === 'flee' && d.stolen > 0) {
        emit('drifter_drop', { drifter_id: d.id, amount: d.stolen });
        dropMotes(g, d.pos, d.stolen, null);
        d.stolen = 0;
        d.flee = W.drifterDropFleeTicks;
      }
    }
  }

  // 8. shades and drifters move
  const shadeSpeed = g.M.shadeSpeed ?? T.shade_speed;
  for (const s of g.shades) {
    if (s.evict) continue;
    let fromStun = false;
    if (s.state === 'spawning' || (s.state === 'recoil' && s.stl === 0)) {
      s.state = activeState(g, s);
      s.push = null;
    } else if (s.state === 'stunned' && s.stl === 0) {
      // Ticket-03: stun always ends in wander (chase is re-checked from the next tick)
      s.state = 'wander';
      s.push = null;
      fromStun = true;
    }
    if (s.state === 'stunned') {
      if (s.push && s.push.ticks > 0) {
        moveEntity(g, s, s.push.dir, T.pulse_push_m / W.pulsePushTicks, W.shadeHover, true);
        s.push.ticks--;
      }
      continue;
    }
    if (s.state === 'recoil') {
      moveEntity(g, s, s.recoilDir, W.recoilDist / W.recoilTicks, W.shadeHover, true);
      s.stl--;
      continue;
    }
    const d = distXZ(s.pos, p.pos);
    if (s.state === 'drain') {
      const L = lanternById(g, s.target);
      if (active && d <= W.drainBreakPlayer) s.state = 'chase';
      else if (!L || !L.lit || !isWeak(g, L) || distXZ(s.pos, L.pos) > W.drainRange) {
        s.state = 'wander';
        s.target = null;
      } else continue; // stand still and drain (fuel is taken in step 2)
    } else if (s.state === 'wander' && !fromStun && active && d <= W.shadeDetect) s.state = 'chase';
    else if (s.state === 'chase' && (!active || d > W.shadeGiveUp)) s.state = 'wander';
    if (s.state === 'chase') {
      if (d > 1e-9) moveEntity(g, s, away(s.pos, p.pos), Math.min(shadeSpeed * DT, d), W.shadeHover, true);
      continue;
    }
    // wander: head for the nearest weak lantern (lit, fuel < threshold; scenario target first), else roam
    const pinned = s.target && lanternById(g, s.target);
    const weak = pinned && isWeak(g, pinned) ? pinned : nearestLantern(g, s.pos, (L) => isWeak(g, L));
    if (!weak) {
      // no weak lantern: drift towards the nearest unlit lantern (Ticket-03 "như trước"), roam once near it
      s.target = null;
      const dark = nearestLantern(g, s.pos, (L) => !L.lit);
      if (dark && distXZ(s.pos, dark.pos) > W.darkRoamRadius) {
        moveEntity(g, s, away(s.pos, dark.pos), W.shadeWanderSpeed * DT, W.shadeHover, true);
        s.roam = null;
      } else wander(g, s, W.shadeWanderSpeed, W.shadeHover, true);
      continue;
    }
    s.target = weak.id;
    let dl = distXZ(s.pos, weak.pos);
    if (dl > W.drainRange) {
      moveEntity(g, s, away(s.pos, weak.pos), Math.min(shadeSpeed * DT, dl - W.drainRange + 1e-6), W.shadeHover, true);
      dl = distXZ(s.pos, weak.pos);
    }
    if (dl <= W.drainRange + 1e-9) {
      s.state = 'drain';
      s.drainTicks = 0;
    }
  }
  for (const d of g.drifters) {
    if (d.state === 'flee') {
      if (d.flee === 0) d.state = 'removed';
      else moveEntity(g, d, away(p.pos, d.pos), W.drifterSpeed * DT, W.drifterHover, false);
      continue;
    }
    const dist = distXZ(d.pos, p.pos);
    d.state = active && !d.stoleOnce && p.carried >= W.drifterMinCarry && dist <= W.drifterDetect ? 'chase' : 'idle';
    if (d.state === 'chase') {
      if (dist > 1e-9) moveEntity(g, d, away(d.pos, p.pos), Math.min(W.drifterSpeed * DT, dist), W.drifterHover, false);
    } else wander(g, d, W.drifterIdleSpeed, W.drifterHover, false);
  }
  g.drifters = g.drifters.filter((d) => d.state !== 'removed');

  // 9. contacts: drifters steal first, then shades hit (ascending id)
  if (active) {
    for (const d of [...g.drifters].sort(byId)) {
      if (d.state !== 'chase' || p.carried === 0 || distXZ(d.pos, p.pos) > W.drifterHit) continue;
      const amount = Math.min(W.drifterSteal, p.carried);
      p.carried -= amount;
      Object.assign(d, { stolen: amount, stoleOnce: true, state: 'flee', flee: W.drifterFleeTicks });
      emit('drifter_steal', { drifter_id: d.id, amount, carried: p.carried });
    }
    for (const s of [...g.shades].sort(byId)) {
      if (s.evict || (s.state !== 'wander' && s.state !== 'chase')) continue;
      if (distXZ(s.pos, p.pos) > T.shade_hit_radius || Math.abs(p.pos[1] - (s.pos[1] - W.shadeHover)) > W.shadeHitHeight) continue;
      if (p.invuln > 0) continue; // touching an invulnerable player does nothing
      p.flames = Math.max(0, p.flames - 1);
      const dropped = Math.floor(p.carried * T.hit_drop_ratio + 1e-9);
      p.carried -= dropped;
      dropMotes(g, p.pos, dropped, W.dropRing);
      p.invuln = ticksOf(T.invuln_s);
      Object.assign(s, { state: 'recoil', stl: W.recoilTicks, recoilDir: away(p.pos, s.pos) });
      emit('player_hit', { by: 'shade', flames: p.flames, dropped });
    }
  }

  // 10. scheduled spawns (new entities interact from the next tick)
  if (g.randomMotes && g.steps % W.moteSpawnEvery === 0 && g.motes.length < W.moteCap) {
    const pts = emptyMotePoints(g);
    if (pts.length) newMote(g, [...pts[Math.floor(g.rng() * pts.length)]]);
  }
  if (g.randomShades) {
    const due = g.steps === W.shadeFirstSpawn ? W.shadeFirstCount : g.steps > W.shadeFirstSpawn && (g.steps - W.shadeFirstSpawn) % g.M.shadeInterval === 0 ? 1 : 0;
    const taken = [];
    for (let i = 0; i < due && g.shades.length < g.M.shadeMax; i++) {
      const pts = g.M.shadeSpawns.filter(
        (pt) => !taken.includes(pt) && distXZ(pt, p.pos) >= W.shadeMinPlayerDist && g.lanterns.every((L) => !isSafe(g, L) || distXZ(pt, L.pos) > T.safe_radius),
      );
      if (!pts.length) break;
      const pt = pts[Math.floor(g.rng() * pts.length)];
      taken.push(pt);
      const s = makeShade(g, newShadeId(g), pt[0], pt[2], 'spawning');
      g.shades.push(s);
      emit('shade_spawned', { id: s.id });
    }
  }
  if (g.randomDrifters && g.steps % W.drifterSpawnEvery === 0 && g.drifters.length < W.drifterMax) {
    const pt = g.M.shadeSpawns[Math.floor(g.rng() * g.M.shadeSpawns.length)];
    g.drifters.push({ id: `D${g.nextDrifter++}`, pos: [pt[0], hoverY(g, pt[0], pt[2], W.drifterHover), pt[2]], state: 'idle', stolen: 0, flee: 0, target: null, stoleOnce: false });
  }

  // 11. win / lose (Ticket-03): no flames always loses first; no early win; at dawn win iff
  //     lanterns lit on the last tick >= ceil(win_ratio × total)
  if (p.flames <= 0) endGame(g, 'lost', 'no_flames', emit);
  else if (g.timeStartS - g.steps / TICK_RATE <= 1e-9) {
    const lit = g.lanterns.filter((L) => L.lit).length;
    if (lit >= litNeeded(g)) endGame(g, 'won', 'dawn_survived', emit);
    else endGame(g, 'lost', 'dawn', emit);
  }

  return finish();
}

export function snapshot(g) {
  const p = g.player;
  return {
    type: 'snapshot',
    tick: g.tick,
    sim_tick: g.steps,
    state: g.paused && g.state === 'playing' ? 'paused' : g.state,
    night: g.night,
    time_left_s: r3(timeLeft(g)),
    score: g.score,
    wind: { active: g.wind.active, dir_deg: g.wind.dir },
    player: {
      pos: p.pos.map(r3),
      vel: p.vel.map(r3),
      grounded: p.grounded,
      invuln: p.invuln > 0,
      invuln_s: r3(p.invuln / TICK_RATE),
      flames: p.flames,
      carried: p.carried,
      capacity: capacity(g),
      successful_lights: p.lights,
      dash_cd_s: r3(p.dashCd / TICK_RATE),
      pulse_cd_s: r3(p.pulseCd / TICK_RATE),
      charm_s: r3(p.charm / TICK_RATE),
    },
    lanterns: g.lanterns.map((L) => ({ id: L.id, pos: L.pos.map(r3), lit: L.lit, deposited: L.deposited, fuel: L.lit ? r1(L.fuelU / FU) : 0, ever_lit: L.everLit, relit_count: L.relit })),
    shades: g.shades.map((s) => ({ id: s.id, pos: s.pos.map(r3), state: s.state, state_ticks_left: s.stl, target_lantern_id: s.target })),
    motes_active: g.motes.length,
    motes: g.motes.map((m) => ({ id: m.id, pos: m.pos.map(r3), kind: m.kind, ttl_s: m.ttl === null ? null : r3(m.ttl / TICK_RATE) })),
    drifters: g.drifters.map((d) => ({ id: d.id, pos: d.pos.map(r3), state: d.state, stolen: d.stolen })),
    charms: g.charms.map((c) => ({ id: c.id, pos: c.pos.map(r3), available: c.available, respawn_s: r3(c.respawn / TICK_RATE) })),
  };
}
