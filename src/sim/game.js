// Pure, deterministic game simulation for Đảo Đèn Lồng (Night 1).
// Shared by the browser renderer (web/main.js) and the headless CLI (src/headless.js).
// No DOM, no Math.random, no wall-clock time: state only changes through step().
import { mulberry32 } from './rng.js';

export const TICK_RATE = 60;
const DT = 1 / TICK_RATE;

// World constants not covered by the contract tuning (documented in docs/notes/phase-1.md).
export const WORLD = {
  islandRadius: 40, // player/shades are clamped inside (fall_enabled = false)
  lanternRing: 25, // L1..L5 on a circle of this radius, L1 at (0,0,25), 72° apart
  gravity: 20, // m/s²
  jumpSpeed: 7, // m/s (≈1.2 m apex)
  moteTarget: 30, // random motes: initial count and respawn cap
  moteRespawnS: 4, // one mote respawns every N seconds while below cap
  moteMinR: 3,
  moteMaxR: 38,
  shadeInitial: 2,
  shadeMax: 6,
  shadeSpawnS: 20, // one new shade every N seconds while below max
  shadeSpawnR: 36,
  shadeSpawnMinDist: 15, // from player
};

const r3 = (v) => Math.round(v * 1000) / 1000 + 0; // +0 turns -0 into 0
const distXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const secToTicks = (s) => Math.round(s * TICK_RATE);

export const NEUTRAL_INPUT = Object.freeze({ move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false });

export function defaultLanterns(T) {
  const out = [];
  for (let i = 0; i < T.lantern_count_night1; i++) {
    const a = (i * 2 * Math.PI) / T.lantern_count_night1;
    out.push({ id: `L${i + 1}`, pos: [r3(WORLD.lanternRing * Math.sin(a)), 0, r3(WORLD.lanternRing * Math.cos(a))], lit: false, deposited: 0 });
  }
  return out;
}

function newMoteId(g) {
  return `M${g.nextMoteId++}`;
}
function newShadeId(g) {
  let id;
  do id = `S${g.nextShadeId++}`;
  while (g.shades.some((s) => s.id === id));
  return id;
}

function spawnMote(g) {
  const a = g.rng() * 2 * Math.PI;
  const { moteMinR: lo, moteMaxR: hi } = WORLD;
  const r = Math.sqrt(lo * lo + g.rng() * (hi * hi - lo * lo));
  const m = { id: newMoteId(g), pos: [r * Math.sin(a), 0, r * Math.cos(a)] };
  g.motes.push(m);
  return m;
}

function spawnShade(g) {
  let pos;
  for (let tries = 0; tries < 20; tries++) {
    const a = g.rng() * 2 * Math.PI;
    pos = [WORLD.shadeSpawnR * Math.sin(a), 0, WORLD.shadeSpawnR * Math.cos(a)];
    const farFromPlayer = distXZ(pos, g.player.pos) >= WORLD.shadeSpawnMinDist;
    const outsideSafe = g.lanterns.every((L) => distXZ(pos, L.pos) > g.T.safe_radius);
    if (farFromPlayer && outsideSafe) break;
  }
  const s = { id: newShadeId(g), pos, state: 'chase', stunTicks: 0 };
  constrainShade(g, s);
  g.shades.push(s);
  return s;
}

// Keep a shade on the island and strictly outside every lantern's safe_radius.
function constrainShade(g, s) {
  const R = WORLD.islandRadius;
  const d0 = Math.hypot(s.pos[0], s.pos[2]);
  if (d0 > R) {
    s.pos[0] *= R / d0;
    s.pos[2] *= R / d0;
  }
  const limit = g.T.safe_radius + 1e-3;
  for (const L of g.lanterns) {
    const dx = s.pos[0] - L.pos[0];
    const dz = s.pos[2] - L.pos[2];
    const d = Math.hypot(dx, dz);
    if (d < limit) {
      const [ux, uz] = d > 1e-9 ? [dx / d, dz / d] : [1, 0];
      s.pos[0] = L.pos[0] + ux * limit;
      s.pos[2] = L.pos[2] + uz * limit;
    }
  }
}

export function timeLeft(g) {
  return Math.max(0, g.timeStartS - g.steps / TICK_RATE);
}

/**
 * Build the initial state. Applying a scenario never emits events or awards score.
 * @param {{tuning: object, seed?: number, scenario?: object|null}} opts
 */
export function createGame({ tuning, seed = 1, scenario = null }) {
  const T = tuning;
  const sc = scenario || {};
  const g = {
    T,
    rng: mulberry32(seed),
    tick: 0,
    steps: 0,
    state: 'playing',
    result: null,
    score: 0,
    timeStartS: sc.time_left_s ?? T.night1_duration_s,
    player: { pos: [0, 0, 0], vy: 0, flames: T.flames, carried: 0, invulnTicks: 0, pulseCdTicks: 0 },
    lanterns: defaultLanterns(T),
    motes: [],
    shades: [],
    nextMoteId: 1,
    nextShadeId: 1,
    randomMotes: sc.random_motes !== false,
    randomShades: sc.random_shades !== false,
    moteTimer: 0,
    shadeTimer: 0,
    prev: { jump: false, interact: false, pulse: false },
  };

  if (sc.player) {
    if (sc.player.pos) g.player.pos = [...sc.player.pos];
    if (sc.player.carried != null) g.player.carried = sc.player.carried;
    if (sc.player.flames != null) g.player.flames = sc.player.flames;
  }
  for (const u of sc.lanterns || []) {
    const L = g.lanterns.find((l) => l.id === u.id);
    if (u.pos) L.pos = [...u.pos];
    if (u.deposited != null) L.deposited = u.deposited;
    if (u.lit != null) L.lit = u.lit;
  }

  if (Array.isArray(sc.motes)) for (const p of sc.motes) g.motes.push({ id: newMoteId(g), pos: [...p] });
  else if (g.randomMotes) for (let i = 0; i < WORLD.moteTarget; i++) spawnMote(g);

  if (Array.isArray(sc.shades)) {
    // auto ids (S1, S2, ...) never collide with explicit ids given in the scenario
    const used = new Set(sc.shades.filter((s) => s.id).map((s) => s.id));
    for (const s of sc.shades) {
      let id = s.id;
      if (!id) {
        do id = `S${g.nextShadeId++}`;
        while (used.has(id));
        used.add(id);
      }
      g.shades.push({ id, pos: [...s.pos], state: 'chase', stunTicks: 0 });
    }
  } else if (g.randomShades) for (let i = 0; i < WORLD.shadeInitial; i++) spawnShade(g);

  return g;
}

function endGame(g, result, reason, emit) {
  g.state = result;
  g.result = { result, reason };
  if (result === 'won') {
    g.score += g.T.score.per_second_left * Math.floor(timeLeft(g) + 1e-9) + g.T.score.per_flame_left * g.player.flames;
  }
  emit('game_over', { result, reason });
}

/**
 * Advance one tick (1/60 s). `inp` is the held input state for this tick.
 * Returns the events produced in this step (each tagged with the new tick number).
 */
export function step(g, inp) {
  if (g.state !== 'playing') return [];
  const T = g.T;
  const p = g.player;
  const t = g.tick + 1;
  const events = [];
  const emit = (name, data) => events.push({ type: 'event', tick: t, name, data });
  const edge = (k) => !!inp[k] && !g.prev[k];

  // 1. Movement (camera-relative, per contract formula)
  let [mx, mz] = inp.move;
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  const th = (inp.cam_yaw_deg * Math.PI) / 180;
  const wx = mx * Math.cos(th) + mz * Math.sin(th);
  const wz = -mx * Math.sin(th) + mz * Math.cos(th);
  p.pos[0] += wx * T.player_speed * DT;
  p.pos[2] += wz * T.player_speed * DT;
  const R = WORLD.islandRadius;
  const dc = Math.hypot(p.pos[0], p.pos[2]);
  if (dc > R) {
    p.pos[0] *= R / dc;
    p.pos[2] *= R / dc;
  }

  // 2. Jump + gravity
  const grounded = p.pos[1] <= 0 && p.vy <= 0;
  if (edge('jump') && grounded) p.vy = WORLD.jumpSpeed;
  if (p.pos[1] > 0 || p.vy > 0) {
    p.vy -= WORLD.gravity * DT;
    p.pos[1] += p.vy * DT;
    if (p.pos[1] <= 0) {
      p.pos[1] = 0;
      p.vy = 0;
    }
  }

  // 3. Auto-pickup motes in range (list order) while below capacity
  for (let i = 0; i < g.motes.length && p.carried < T.carry_capacity; ) {
    if (distXZ(p.pos, g.motes[i].pos) <= T.pickup_radius) {
      g.motes.splice(i, 1);
      p.carried++;
      g.score += T.score.per_mote;
      emit('mote_picked', { carried: p.carried });
    } else i++;
  }

  // 4. Interact: deposit into the nearest unlit lantern within interact_radius
  if (edge('interact') && p.carried > 0) {
    let best = null;
    let bd = Infinity;
    for (const L of g.lanterns) {
      if (L.lit) continue;
      const d = distXZ(p.pos, L.pos);
      if (d <= T.interact_radius && d < bd) {
        best = L;
        bd = d;
      }
    }
    if (best) {
      const amount = Math.min(p.carried, T.lantern_cost - best.deposited);
      if (amount > 0) {
        p.carried -= amount;
        best.deposited += amount;
        emit('deposit', { lantern_id: best.id, amount, deposited: best.deposited });
        if (best.deposited >= T.lantern_cost) {
          best.lit = true;
          g.score += T.score.per_lantern;
          emit('lantern_lit', { lantern_id: best.id });
        }
      }
    }
  }

  // 5. Pulse: costs carried motes, stuns + pushes shades within pulse_radius
  if (edge('pulse') && p.pulseCdTicks === 0 && p.carried >= T.pulse_cost) {
    p.carried -= T.pulse_cost;
    p.pulseCdTicks = secToTicks(T.pulse_cooldown_s);
    const ids = [];
    for (const s of g.shades) {
      const dx = s.pos[0] - p.pos[0];
      const dz = s.pos[2] - p.pos[2];
      const d = Math.hypot(dx, dz);
      if (d <= T.pulse_radius) {
        s.state = 'stunned';
        s.stunTicks = secToTicks(T.pulse_stun_s);
        const [ux, uz] = d > 1e-9 ? [dx / d, dz / d] : [1, 0];
        s.pos[0] += ux * T.pulse_push_m;
        s.pos[2] += uz * T.pulse_push_m;
        constrainShade(g, s);
        ids.push(s.id);
        g.score += T.score.per_stun;
      }
    }
    emit('pulse', { stunned_ids: ids });
  }

  // 6. Shades: stunned ones freeze for pulse_stun_s, others chase the player
  const stepLen = T.shade_speed * DT;
  for (const s of g.shades) {
    if (s.stunTicks > 0) {
      s.stunTicks--;
      continue;
    }
    s.state = 'chase';
    const dx = p.pos[0] - s.pos[0];
    const dz = p.pos[2] - s.pos[2];
    const d = Math.hypot(dx, dz);
    if (d > 1e-9) {
      const m = Math.min(stepLen, d);
      s.pos[0] += (dx / d) * m;
      s.pos[2] += (dz / d) * m;
    }
    constrainShade(g, s);
  }

  // 7. Shade contact (one hit max per step, then invulnerability)
  if (p.invulnTicks === 0) {
    for (const s of g.shades) {
      if (s.state === 'stunned') continue;
      if (distXZ(p.pos, s.pos) <= T.shade_hit_radius) {
        p.flames = Math.max(0, p.flames - 1);
        const dropped = Math.floor(p.carried * T.hit_drop_ratio + 1e-9);
        p.carried -= dropped;
        p.invulnTicks = secToTicks(T.invuln_s);
        emit('player_hit', { by: 'shade', flames: p.flames, dropped });
        break;
      }
    }
  }

  // 8. Random spawns (only when enabled)
  if (g.randomMotes && ++g.moteTimer >= secToTicks(WORLD.moteRespawnS)) {
    g.moteTimer = 0;
    if (g.motes.length < WORLD.moteTarget) spawnMote(g);
  }
  if (g.randomShades && ++g.shadeTimer >= secToTicks(WORLD.shadeSpawnS)) {
    g.shadeTimer = 0;
    if (g.shades.length < WORLD.shadeMax) emit('shade_spawned', { id: spawnShade(g).id });
  }

  // 9. Clocks
  g.steps++;
  g.tick = t;
  if (p.invulnTicks > 0) p.invulnTicks--;
  if (p.pulseCdTicks > 0) p.pulseCdTicks--;
  g.prev = { jump: !!inp.jump, interact: !!inp.interact, pulse: !!inp.pulse };

  // 10. End conditions (win has priority)
  if (g.lanterns.every((L) => L.lit)) endGame(g, 'won', 'all_lit', emit);
  else if (p.flames <= 0) endGame(g, 'lost', 'no_flames', emit);
  else if (g.timeStartS - g.steps / TICK_RATE <= 1e-9) endGame(g, 'lost', 'dawn', emit);

  return events;
}

export function snapshot(g) {
  const p = g.player;
  return {
    type: 'snapshot',
    tick: g.tick,
    sim_tick: g.steps,
    state: g.state,
    time_left_s: r3(timeLeft(g)),
    score: g.score,
    player: { pos: p.pos.map(r3), flames: p.flames, carried: p.carried },
    lanterns: g.lanterns.map((L) => ({ id: L.id, pos: L.pos.map(r3), lit: L.lit, deposited: L.deposited })),
    shades: g.shades.map((s) => ({ id: s.id, pos: s.pos.map(r3), state: s.state })),
    motes_active: g.motes.length,
    motes: g.motes.map((m) => ({ id: m.id, pos: m.pos.map(r3) })),
  };
}
