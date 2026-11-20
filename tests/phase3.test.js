// Ticket-03 "Đèn cạn dầu": fuel, refuel, relight, drain, capacity, new win/score rules, contract v1.2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHeadless } from '../src/sim/run.js';
import { T, run, snaps, events, at, press, near, xz } from './helpers.js';

const far = { pos: [0, 0, -30] }; // player position far from the action

test('fuel: lit -> 100, decays 1.0/s; at 0 the lantern goes out (lantern_out, deposited 0, ever_lit stays)', () => {
  const l = run({ player: far, lanterns: [{ id: 'L1', lit: true, fuel: 0.5, deposited: 10 }] }, [], 40);
  assert.equal(at(l, 0).lanterns[0].fuel, 0.5);
  near(at(l, 12).lanterns[0].fuel, 0.3);
  assert.deepEqual(events(l, 'lantern_out')[0], { type: 'event', tick: 30, name: 'lantern_out', data: { lantern_id: 'L1' } });
  const L = at(l, 30).lanterns[0];
  assert.deepEqual([L.lit, L.fuel, L.deposited, L.ever_lit], [false, 0, 0, true]);
  const full = run({ player: far, lanterns: [{ id: 'L1', lit: true }] }, [], 60);
  assert.equal(at(full, 0).lanterns[0].fuel, T.fuel_max, 'lit without fuel defaults to 100');
  assert.equal(at(full, 60).lanterns[0].fuel, T.fuel_max - T.fuel_decay_per_s);
});

test('refuel: used = min(carried, ceil((100 − fuel)/10)), fuel += 10 × used (max 100), +5 per mote', () => {
  const l = run({ player: { carried: 10 }, lanterns: [{ id: 'L1', pos: [0, 0, 1], lit: true, fuel: 55 }] }, press(0, 'interact'), 2);
  assert.deepEqual(events(l, 'refuel')[0].data, { lantern_id: 'L1', amount: 5, fuel: 100 });
  assert.equal(at(l, 1).player.carried, 5);
  assert.equal(at(l, 1).score, 5 * T.score.per_mote);
  const part = run({ player: { carried: 2 }, lanterns: [{ id: 'L1', pos: [0, 0, 1], lit: true, fuel: 55 }] }, press(0, 'interact'), 2);
  assert.deepEqual(events(part, 'refuel')[0].data, { lantern_id: 'L1', amount: 2, fuel: 75 });
});

test('relight: an ever-lit lantern needs only 5 motes, +40, relit_count++, lantern_lit relight: true, fuel 100', () => {
  const l = run({ player: { carried: 7 }, lanterns: [{ id: 'L1', pos: [0, 0, 1], lit: false, ever_lit: true }] }, press(0, 'interact'), 2);
  assert.deepEqual(events(l, 'deposit')[0].data, { lantern_id: 'L1', amount: T.relight_cost, deposited: T.relight_cost });
  assert.deepEqual(events(l, 'lantern_lit')[0].data, { lantern_id: 'L1', relight: true });
  const L = at(l, 1).lanterns[0];
  assert.deepEqual([L.lit, L.fuel, L.relit_count], [true, 100, 1]);
  assert.equal(at(l, 1).score, T.relight_cost * T.score.per_mote + T.score.per_relight);
  assert.equal(at(l, 1).player.carried, 2);
});

test('full lifecycle: light (10) -> run out -> relight (5)', () => {
  const sc = { player: { carried: 15 }, lanterns: [{ id: 'L1', pos: [0, 0, 1] }] };
  const l = run(sc, [...press(0, 'interact'), ...press(6010, 'interact')], 6020, { every: 10 });
  const lit = events(l, 'lantern_lit');
  assert.deepEqual(lit.map((e) => e.data.relight), [false, true]);
  assert.equal(events(l, 'lantern_out')[0].tick, 1 + 100 * 60);
});

test('capacity = 10 + 2 × successful_lights (max 20), counts relights, scenario value', () => {
  const l = run({ player: { carried: 10 }, lanterns: [{ id: 'L1', pos: [0, 0, 1] }], motes: [[0.5, 0, 0], [0.5, 0, 0.2], [0.5, 0, 0.4]] }, press(0, 'interact'), 3);
  assert.equal(at(l, 0).player.capacity, T.carry_capacity);
  assert.equal(at(l, 1).player.capacity, T.carry_capacity + 2);
  // tick 1: pickup (step 4) runs before lighting (step 5) at 10/10, so nothing is picked; tick 2: all 3 motes fit in 0/12
  assert.equal(at(l, 1).player.carried, 0);
  assert.equal(at(l, 2).player.carried, 3);
  assert.equal(at(run({ player: { successful_lights: 3 } }, [], 1), 0).player.capacity, 16);
  assert.equal(at(run({ player: { successful_lights: 9 } }, [], 1), 0).player.capacity, T.capacity_max);
  const cap = run({ player: { carried: 10, successful_lights: 1 }, motes: [[0, 0, 0.3], [0, 0, 0.5], [0, 0, 0.7]] }, [], 1);
  assert.equal(at(cap, 1).player.carried, 12);
});

test('weak lantern (fuel < 30) loses its safe zone; exactly 30 keeps it', () => {
  const sc = (fuel) => ({ player: { pos: [0, 0, 0] }, lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel }], shades: [{ id: 'A', pos: [8, 0, 0], state: 'chase' }] });
  const weak = run(sc(29), [], 120);
  assert.ok(events(weak, 'player_hit').length > 0);
  const ok = run(sc(31), [], 60);
  assert.equal(events(ok, 'player_hit').length, 0);
  for (const s of snaps(ok)) assert.ok(xz(s.shades[0].pos, [0, 0, 0]) >= T.safe_radius - 1e-3);
});

test('drain: wandering shade goes to the nearest weak lantern, drains 5/s (+1/s decay), fuel_drain every 60 ticks, lantern out -> wander', () => {
  const sc = { player: far, lanterns: [{ id: 'L1', pos: [10, 0, 0], lit: true, fuel: 20 }], shades: [{ id: 'S1', pos: [14, 0, 0] }] };
  const l = run(sc, [], 400);
  assert.equal(at(l, 1).shades[0].target_lantern_id, 'L1');
  const t0 = snaps(l).find((s) => s.shades[0].state === 'drain').tick;
  assert.ok(t0 <= 31, `reached in ~2 m / 4 m/s, got ${t0}`);
  const f0 = at(l, t0 + 1).lanterns[0].fuel;
  near(at(l, t0 + 61).lanterns[0].fuel, f0 - (T.drain_per_s + T.fuel_decay_per_s), 0.05);
  const fd = events(l, 'fuel_drain');
  assert.ok(fd.length >= 2);
  assert.equal(fd[1].tick - fd[0].tick, 60);
  assert.deepEqual(Object.keys(fd[0].data), ['lantern_id', 'shade_id', 'fuel']);
  const out = events(l, 'lantern_out')[0];
  assert.ok(out);
  assert.equal(at(l, out.tick + 1).shades[0].state, 'wander');
});

test('drain stacks across shades; drain -> chase when Mây within 6 m; pulse on a drainer scores 15', () => {
  const two = run({ player: far, lanterns: [{ id: 'L1', pos: [10, 0, 0], lit: true, fuel: 25 }], shades: [{ id: 'S1', pos: [11.5, 0, 0], state: 'drain', target_lantern_id: 'L1' }, { id: 'S2', pos: [8.5, 0, 0], state: 'drain', target_lantern_id: 'L1' }] }, [], 60);
  near(at(two, 60).lanterns[0].fuel, 25 - (2 * T.drain_per_s + T.fuel_decay_per_s), 0.01);
  const sc = { player: { pos: [10, 0, 7], carried: 6 }, lanterns: [{ id: 'L1', pos: [10, 0, 0], lit: true, fuel: 25 }], shades: [{ id: 'S1', pos: [11.5, 0, 0], state: 'drain', target_lantern_id: 'L1' }] };
  // walk from z=7 to z=5.5: distance to S1 becomes √(1.5² + 5.5²) ≈ 5.7 m < 6 m
  const chase = run(sc, [{ tick: 0, move: [0, -1] }, { tick: 15, move: [0, 0] }], 30);
  assert.equal(at(chase, 5).shades[0].state, 'drain', 'still draining while Mây is > 6 m away');
  assert.ok(snaps(chase).some((s) => s.shades[0].state === 'chase'));
  const pulse = run({ ...sc, player: { pos: [10, 0, 3], carried: 6 } }, press(0, 'pulse'), 3);
  assert.equal(at(pulse, 1).shades[0].state, 'stunned');
  assert.equal(at(pulse, 1).score, T.score.per_stun_drain);
});

test('refuelling a weak lantern to ≥ 30 evicts shades inside 6 m within 30 ticks (no damage); drainers -> wander', () => {
  const sc = { player: { pos: [10, 0, 1.5], carried: 10, invuln_ticks: 0 }, lanterns: [{ id: 'L1', pos: [10, 0, 0], lit: true, fuel: 20 }], shades: [{ id: 'S1', pos: [11.5, 0, 0], state: 'drain', target_lantern_id: 'L1' }] };
  const l = run(sc, press(0, 'interact'), 40);
  assert.ok(events(l, 'refuel')[0].data.fuel >= T.low_fuel_threshold);
  assert.ok(xz(at(l, 31).shades[0].pos, [10, 0, 0]) >= T.safe_radius - 1e-3);
  assert.equal(events(l, 'player_hit').length, 0);
});

test('night durations 240 / 270 / 300 s (dawn at that tick); win thresholds 3/5, 4/6, 5/7', () => {
  for (const [night, s, need] of [[1, 240, 3], [2, 270, 4], [3, 300, 5]]) {
    const base = { random_shades: false, random_drifters: false, wind_enabled: false, player: { pos: night === 3 ? [0, 0, -30] : [0, 0, 0] } };
    // full night with nothing lit -> lost dawn exactly at duration × 60
    const full = runHeadless({ tuning: T, seed: 1, night, scenario: base, ticks: s * 60 + 10, snapshotEvery: 600 }).lines;
    assert.deepEqual(snaps(full)[0].time_left_s, s);
    assert.deepEqual([full.at(-1).ticks, full.at(-1).state], [s * 60, 'lost'], `night ${night}`);
    // short night (lanterns pre-lit with 100 fuel would run out after 100 s in a full night)
    const lit = Array.from({ length: need }, (_, i) => ({ id: `L${i + 1}`, lit: true }));
    const won = runHeadless({ tuning: T, seed: 1, night, scenario: { ...base, lanterns: lit, time_left_s: 1 }, ticks: 100 }).lines;
    assert.equal(won.at(-1).state, 'won', `night ${night}: ${need} lit wins`);
    const lost = runHeadless({ tuning: T, seed: 1, night, scenario: { ...base, lanterns: lit.slice(1), time_left_s: 1 }, ticks: 100 }).lines;
    assert.equal(lost.at(-1).state, 'lost', `night ${night}: ${need - 1} lit loses`);
  }
});

test('contract v1.2 snapshot fields', () => {
  const s = snaps(run({ lanterns: [{ id: 'L1', lit: true, fuel: 42.25 }] }, [], 1))[0];
  assert.deepEqual(Object.keys(s.lanterns[0]).slice(0, 7), ['id', 'pos', 'lit', 'deposited', 'fuel', 'ever_lit', 'relit_count']);
  assert.equal(s.lanterns[0].fuel, 42.3, '1 decimal');
  assert.equal(s.lanterns[1].fuel, 0);
  assert.equal(typeof s.player.capacity, 'number');
});
