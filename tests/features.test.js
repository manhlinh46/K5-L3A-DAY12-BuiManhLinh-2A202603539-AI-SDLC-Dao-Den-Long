// Ticket-02 features: dash, fall/respawn, pause, charms, drifters, eviction, maps (pads, tiers, ramps, wind), schedules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORLD } from '../src/sim/game.js';
import { groundAt, MAPS } from '../src/sim/maps.js';
import { runHeadless } from '../src/sim/run.js';
import { T, run, snaps, events, at, press, near, xz, sec } from './helpers.js';

const DASH_T = sec(T.dash_duration_s);

test('dash: 14 m/s for 12 ticks (2.8 m), event, cooldown 1.5 s from dash start, re-press while dashing ignored', () => {
  const l = run({}, [...press(0, 'dash'), ...press(5, 'dash'), ...press(30, 'dash'), ...press(sec(T.dash_cooldown_s), 'dash')], 120);
  const d = events(l, 'dash');
  assert.deepEqual(d.map((e) => e.tick), [1, sec(T.dash_cooldown_s) + 1]);
  near(at(l, DASH_T).player.pos[2], T.dash_speed * T.dash_duration_s); // standing -> facing (+Z at start)
  near(at(l, DASH_T + 10).player.pos[2], T.dash_speed * T.dash_duration_s);
  near(at(l, 1).player.dash_cd_s, T.dash_cooldown_s);
});

test('dash direction = movement direction; air dash keeps altitude; no invulnerability while dashing', () => {
  const l = run({}, [{ tick: 0, move: [1, 0] }, ...press(1, 'dash')], 20);
  assert.ok(at(l, 13).player.pos[0] > 2.8);
  near(at(l, 13).player.pos[2], 0);
  const air = run({}, [{ tick: 0, jump: true }, ...press(10, 'dash')], 30);
  const y = at(air, 11).player.pos[1];
  near(at(air, 20).player.pos[1], y);
  const hit = run({ shades: [{ id: 'A', pos: [0, 0, 2] }] }, press(0, 'dash'), 10);
  assert.equal(events(hit, 'player_hit').length, 1);
});

test('fall off the island (Y < −10): once, ignores invuln, −1 flame, lose all motes, wait 60 ticks, respawn at start with 90-tick invuln', () => {
  const l = run({ player: { pos: [0, 0, 39.5], carried: 4, invuln_ticks: 50 } }, [{ tick: 0, move: [0, 1] }, { tick: 20, move: [0, 0] }], 300);
  const f = events(l, 'player_hit');
  assert.equal(f.length, 1);
  assert.deepEqual(f[0].data, { by: 'fall', flames: T.flames - 1, dropped: 0, lost: 4 });
  const t = f[0].tick;
  assert.equal(at(l, t).player.carried, 0);
  assert.notDeepEqual(at(l, t + 59).player.pos, [0, 0, 0]);
  assert.deepEqual(at(l, t + 60).player.pos, [0, 0, 0]);
  assert.deepEqual(at(l, t + 60).player.vel, [0, 0, 0]);
  near(at(l, t + 60).player.invuln_s, T.invuln_s);
  const last = run({ player: { pos: [0, 0, 39.5], flames: 1 } }, [{ tick: 0, move: [0, 1] }], 300);
  assert.deepEqual(events(last, 'game_over')[0].data, { result: 'lost', reason: 'no_flames' });
});

test('respawn wait: no pickup and no shade contact', () => {
  const l = run({ player: { pos: [0, 0, 39.5] }, motes: [[0, 0, 0.5]] }, [{ tick: 0, move: [0, 1] }, { tick: 5, move: [0, 0] }], 200);
  const t = events(l, 'player_hit')[0].tick;
  const pick = events(l, 'mote_picked');
  assert.equal(pick.length, 1);
  assert.ok(pick[0].tick >= t + 60, 'mote near start picked only after respawn');
});

test('pause: rising edge toggles; tick advances but sim_tick/time/cooldowns freeze; state "paused"; paused/resumed events', () => {
  const l = run({ player: { carried: 5 }, shades: [{ id: 'A', pos: [8, 0, 0] }] }, [...press(0, 'pulse'), ...press(10, 'pause'), ...press(40, 'pause')], 60);
  assert.deepEqual(events(l, 'paused')[0], { type: 'event', tick: 11, name: 'paused', data: {} });
  assert.deepEqual(events(l, 'resumed')[0], { type: 'event', tick: 41, name: 'resumed', data: {} });
  const a = at(l, 11);
  const b = at(l, 40);
  assert.equal(a.state, 'paused');
  assert.equal(b.state, 'paused');
  assert.equal(b.sim_tick, a.sim_tick);
  assert.equal(b.time_left_s, a.time_left_s);
  assert.equal(b.player.pulse_cd_s, a.player.pulse_cd_s);
  assert.deepEqual(b.shades, a.shades);
  assert.equal(at(l, 41).state, 'playing');
  assert.equal(at(l, 41).sim_tick, a.sim_tick + 1);
  assert.equal(l.at(-1).ticks, 60);
});

test('charm (Night 2): pickup like a mote, 600 ticks, speed 7.2 m/s, dash without cooldown, respawn after 2700 ticks', () => {
  // walk -X along the bridge for 1 s, then stand still (dashes face -X too and stay on island A)
  const l = run({ player: { pos: [34.5, 0, 0] } }, [{ tick: 1, move: [-1, 0] }, { tick: 61, move: [0, 0] }, ...press(70, 'dash'), ...press(90, 'dash'), ...press(95, 'dash')], 2800, { night: 2, every: 10 });
  assert.deepEqual(events(l, 'charm_picked')[0], { type: 'event', tick: 1, name: 'charm_picked', data: { charm_id: 'C1', charm_ticks: WORLD.charmTicks } });
  const s = snaps(l);
  const x10 = at(l, 10).player.pos[0];
  const x60 = at(l, 60).player.pos[0];
  near(x10 - x60, WORLD.charmSpeed * (50 / 60), 0.01);
  assert.equal(events(l, 'dash').length, 2, 'dash at 70 and 90 (no cooldown); 95 ignored mid-dash');
  assert.equal(at(l, 10).charms[0].available, false);
  assert.equal(at(l, 2700).charms[0].available, false);
  assert.equal(at(l, 2710).charms[0].available, true);
  assert.ok(s.length > 0);
});

test('drifter: idle -> chase when carrying ≥5 within 15 m; steals min(3, carried) once; flees 240 ticks then removed', () => {
  const sc = { player: { carried: 6 }, drifters: [{ id: 'D1', pos: [6, 1.2, 0] }] };
  const l = run(sc, [], 400, { night: 2 });
  assert.equal(at(l, 1).drifters[0].state, 'chase');
  const st = events(l, 'drifter_steal');
  assert.equal(st.length, 1);
  assert.deepEqual(st[0].data, { drifter_id: 'D1', amount: 3, carried: 3 });
  const t = st[0].tick;
  assert.equal(at(l, t).drifters[0].state, 'flee');
  assert.equal(at(l, t).drifters[0].stolen, 3);
  assert.equal(at(l, t + WORLD.drifterFleeTicks - 1).drifters.length, 1);
  assert.equal(at(l, t + WORLD.drifterFleeTicks).drifters.length, 0);
  const lazy = run({ player: { carried: 4 }, drifters: [{ id: 'D1', pos: [6, 1.2, 0] }] }, [], 60, { night: 2 });
  assert.equal(events(lazy, 'drifter_steal').length, 0);
  assert.equal(at(lazy, 60).drifters[0].state, 'idle');
});

test('drifter steals through invulnerability and never costs a flame; safe zones do not block it', () => {
  const l = run({ player: { carried: 6, invuln_ticks: 600 }, lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }], drifters: [{ id: 'D1', pos: [6, 1.2, 0] }] }, [], 120, { night: 2 });
  assert.equal(events(l, 'drifter_steal').length, 1);
  assert.equal(events(l, 'player_hit').length, 0);
});

test('pulse vs drifter: chase -> flee without stealing; fleeing with loot -> drifter_drop as dropped motes, gone 120 ticks later', () => {
  // D1 starts idle and turns to chase in step 8 of tick 1, so pulse on tick 1
  const chase = run({ player: { carried: 9 }, drifters: [{ id: 'D1', pos: [4, 1.2, 0] }] }, press(1, 'pulse'), 300, { night: 2 });
  assert.equal(at(chase, 1).drifters[0].state, 'chase');
  assert.equal(at(chase, 2).drifters[0].state, 'flee');
  assert.equal(events(chase, 'drifter_steal').length, 0);
  const loot = run({ player: { carried: 5 }, drifters: [{ id: 'D1', pos: [3, 1.2, 0], state: 'flee', stolen: 3 }] }, press(0, 'pulse'), 200, { night: 2 });
  assert.deepEqual(events(loot, 'drifter_drop')[0], { type: 'event', tick: 1, name: 'drifter_drop', data: { drifter_id: 'D1', amount: 3 } });
  const s1 = at(loot, 1);
  assert.equal(s1.motes.filter((m) => m.kind === 'dropped').length, 3);
  assert.equal(s1.drifters[0].stolen, 0);
  assert.equal(at(loot, 1 + WORLD.drifterDropFleeTicks - 1).drifters.length, 1);
  assert.equal(at(loot, 1 + WORLD.drifterDropFleeTicks).drifters.length, 0);
});

test('drifter schedule: Night 2/3 at tick 1200, 2400 (max 2, ids D1, D2); none on Night 1', () => {
  const lines = (night) => runHeadless({ tuning: T, seed: 4, night, scenario: { random_shades: false }, ticks: 2401, snapshotEvery: 1 }).lines;
  for (const night of [2, 3]) {
    const l = lines(night);
    assert.equal(at(l, 1199).drifters.length, 0);
    assert.deepEqual(at(l, 1200).drifters.map((d) => [d.id, d.state]), [['D1', 'idle']]);
    assert.deepEqual(at(l, 2400).drifters.map((d) => d.id), ['D1', 'D2']);
  }
  assert.equal(at(lines(1), 2400).drifters.length, 0);
});

test('dropped motes: TTL 480 ticks then disappear; can be picked up again', () => {
  const l = run({ motes: [{ pos: [5, 0, 0], kind: 'dropped', ttl_ticks: 480 }] }, [], 481);
  assert.equal(at(l, 479).motes.length, 1);
  assert.equal(at(l, 480).motes.length, 0);
  const pick = run({ motes: [{ pos: [0, 0, 0.5], kind: 'dropped', ttl_ticks: 480 }] }, [], 2);
  assert.equal(events(pick, 'mote_picked').length, 1);
});

test('lighting a lantern pushes shades inside the 6 m zone out within 30 ticks, without damage', () => {
  const sc = { player: { carried: 10 }, lanterns: [{ id: 'L1', pos: [0, 0, 1.5] }], shades: [{ id: 'A', pos: [1.2, 0, 0], state: 'stunned', state_ticks_left: 5 }] };
  const l = run(sc, press(0, 'interact'), 40);
  assert.equal(events(l, 'lantern_lit').length, 1);
  assert.ok(xz(at(l, 30).shades[0].pos, [0, 0, 1.5]) >= T.safe_radius - 1e-3);
  assert.equal(events(l, 'player_hit').length, 0);
});

test('Night 2 map: two islands + bridge (no railing) + launch pad flight ≈1.4 s landing on the other island', () => {
  assert.equal(groundAt(2, 35, 0), 0);
  assert.equal(groundAt(2, 35, 2.5), null);
  const l = run({ player: { pos: [20, 0, 18] } }, [], 150, { night: 2 });
  const s = snaps(l);
  const land = s.find((x) => x.tick > 5 && x.player.grounded);
  assert.ok(land, 'landed');
  assert.ok(Math.abs(land.tick / 60 - 1.4) < 0.1, `flight ${land.tick / 60}s`);
  assert.ok(xz(land.player.pos, [70, 0, 0]) <= 28, 'lands on island B');
  // movement keys do not override the launch velocity
  const steer = run({ player: { pos: [20, 0, 18] } }, [{ tick: 2, move: [-1, -1] }], land.tick, { night: 2 });
  assert.deepEqual(at(steer, land.tick).player.pos, land.player.pos);
  assert.equal(events(l, 'player_hit').length, 0);
});

test('Night 3 map: cliffs block, ramp climbs to tier 1, pad (0,3,13) lands on tier 2, tower blocks', () => {
  // walk +Z from tier 0 at x=0 into the tier-1 wall at r=24 -> blocked
  const wall = run({ player: { pos: [0, 0, 27] } }, [{ tick: 0, move: [0, -1] }], 120, { night: 3 });
  assert.ok(at(wall, 120).player.pos[2] >= 24 - 0.2);
  assert.equal(at(wall, 120).player.pos[1], 0);
  // ramp at 30°: from r=31 walk inward along the ramp to tier 1 (y = 3)
  const a = (30 * Math.PI) / 180;
  const yaw = (Math.atan2(-Math.cos(a), -Math.sin(a)) * 180) / Math.PI; // contract yaw so that move [0,1] points inward
  const ramp = run({ player: { pos: [31 * Math.cos(a), 0, 31 * Math.sin(a)] } }, [{ tick: 0, move: [0, 1], cam_yaw_deg: yaw }], 100, { night: 3 });
  near(at(ramp, 100).player.pos[1], 3, 1e-6);
  const pad = run({ player: { pos: [0, 3, 13] } }, [], 120, { night: 3 });
  const land = snaps(pad).find((x) => x.tick > 5 && x.player.grounded);
  near(land.player.pos[1], 6, 1e-6);
  assert.ok(Math.hypot(land.player.pos[0], land.player.pos[2]) <= 8);
  const tower = run({ player: { pos: [0, 6, -6] } }, [{ tick: 0, move: [0, 1] }], 120, { night: 3 });
  assert.ok(Math.hypot(at(tower, 120).player.pos[0], at(tower, 120).player.pos[2]) >= 2 - 1e-6);
});

test('Night 3 wind: every 30 s a 5 s gust at 2 m/s in a seeded random direction; disabled by wind_enabled=false', () => {
  const l = run({ player: { pos: [0, 0, -30] }, wind_enabled: true }, [], 2200, { night: 3, every: 1 });
  assert.equal(at(l, 1799).wind.active, false);
  assert.equal(at(l, 1800).wind.active, true);
  assert.equal(at(l, 2099).wind.active, true);
  assert.equal(at(l, 2100).wind.active, false);
  const p0 = at(l, 1799).player.pos;
  const p1 = at(l, 2099).player.pos;
  near(xz(p0, p1), WORLD.windSpeed * (300 / 60), 0.05);
  const off = run({ player: { pos: [0, 0, -30] } }, [], 1900, { night: 3, every: 100 });
  assert.equal(at(off, 1900).wind.active, false);
});

test('Night 3: shade speed 4.5; Night 2/3 shade intervals 7 s / 6 s and caps 8 / 10', () => {
  const l3 = run({ player: { pos: [0, 0, -30] }, shades: [{ id: 'A', pos: [10, 0, -30] }] }, [], 60, { night: 3 });
  near(at(l3, 60).shades[0].pos[0], 10 - MAPS[3].shadeSpeed);
  for (const [night, interval, max] of [[2, 420, 8], [3, 360, 10]]) {
    const l = runHeadless({ tuning: T, seed: 2, night, scenario: { random_drifters: false, player: { invuln_ticks: 100000 } }, ticks: 300 + interval * 12, snapshotEvery: 100 }).lines;
    const sp = events(l, 'shade_spawned');
    assert.deepEqual(sp.slice(0, 3).map((e) => e.tick), [300, 300, 300 + interval]);
    assert.ok(sp.length <= max);
  }
});

test('contract v1.1 snapshot fields', () => {
  const s = snaps(runHeadless({ tuning: T, seed: 1, night: 2, ticks: 1 }).lines)[0];
  for (const k of ['night', 'wind', 'motes', 'drifters', 'charms']) assert.ok(k in s, k);
  for (const k of ['pos', 'vel', 'grounded', 'invuln', 'flames', 'carried', 'dash_cd_s', 'pulse_cd_s', 'charm_s']) assert.ok(k in s.player, k);
  assert.deepEqual(Object.keys(s.wind), ['active', 'dir_deg']);
  for (const m of s.motes) assert.deepEqual(Object.keys(m), ['id', 'pos', 'kind', 'ttl_s']);
  assert.deepEqual(s.charms.map((c) => [c.id, c.available, c.respawn_s]), [['C1', true, 0]]);
  assert.equal(s.lanterns.length, 6);
  assert.equal(snaps(runHeadless({ tuning: T, seed: 1, night: 3, ticks: 1 }).lines)[0].lanterns.length, 7);
});

test('performance: a full night (21,600 ticks) runs headless in ≤ 30 s', () => {
  for (const night of [1, 2, 3]) {
    const t0 = performance.now();
    runHeadless({ tuning: T, seed: 11, night, scenario: { player: { invuln_ticks: 1e9 } }, ticks: 21600, snapshotEvery: 10 });
    const ms = performance.now() - t0;
    assert.ok(ms < 30000, `night ${night}: ${ms.toFixed(0)} ms`);
  }
});
