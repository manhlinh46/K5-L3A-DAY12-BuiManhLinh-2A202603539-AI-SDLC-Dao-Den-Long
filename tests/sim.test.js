// Night 1 core rules (PRD-0) under the Ticket-02 standard numbers. One block per requirement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, NEUTRAL_INPUT, WORLD } from '../src/sim/game.js';
import { runHeadless } from '../src/sim/run.js';
import { T, run, snaps, events, at, press, near, xz, sec } from './helpers.js';

test('tick model: night_start + snapshot 0 before input, --ticks N runs N steps, end line last', () => {
  const l = run({}, [{ tick: 0, move: [0, 1] }], 30);
  assert.deepEqual(l[0], { type: 'event', tick: 0, name: 'night_start', data: { night: 1 } });
  assert.deepEqual(snaps(l)[0].player.pos, [0, 0, 0]);
  assert.equal(at(l, 30).sim_tick, 30);
  assert.deepEqual(l.at(-1), { type: 'end', ticks: 30, state: 'playing', score: 0 });
  near(at(l, 30).time_left_s, T.night1_duration_s - 30 / 60);
});

test('movement: 6 m/s, camera yaw formula, diagonal normalised, analog magnitude', () => {
  near(at(run({}, [{ tick: 0, move: [0, 1] }]), 60).player.pos[2], T.player_speed);
  near(at(run({}, [{ tick: 0, move: [1, 0] }]), 60).player.pos[0], T.player_speed);
  const yaw = at(run({}, [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }]), 60).player.pos;
  near(yaw[0], T.player_speed);
  near(yaw[2], 0);
  const diag = at(run({}, [{ tick: 0, move: [1, 1] }]), 60).player.pos;
  near(Math.hypot(diag[0], diag[2]), T.player_speed);
  near(at(run({}, [{ tick: 0, move: [0, 0.5] }]), 60).player.pos[2], T.player_speed / 2);
  // stop within 0.1 s: velocity is 0 on the first tick without input
  const stop = run({}, [{ tick: 0, move: [0, 1] }, { tick: 30, move: [0, 0] }], 40);
  assert.equal(at(stop, 31).player.vel[2], 0);
});

test('absent fields keep previous value; no inputs = player stands still', () => {
  near(at(run({}, [{ tick: 0, move: [0, 1] }, { tick: 30, jump: true }], 60), 60).player.pos[2], T.player_speed);
  assert.deepEqual(at(run({}, [], 60), 60).player.pos, [0, 0, 0]);
});

test('jump: 7 m/s, gravity 20, only when grounded, lands on y=0', () => {
  const l = run({}, [{ tick: 0, jump: true }, { tick: 20, jump: false }, { tick: 21, jump: true }], 120);
  assert.ok(at(l, 15).player.pos[1] > 0.5);
  assert.equal(at(l, 15).player.grounded, false);
  const apex = Math.max(...snaps(l).map((s) => s.player.pos[1]));
  near(apex, (WORLD.jumpSpeed * WORLD.jumpSpeed) / (2 * WORLD.gravity), 0.1); // ≈1.225 m; air re-press ignored
  assert.equal(at(l, 120).player.pos[1], 0);
  assert.equal(at(l, 120).player.grounded, true);
});

test('pickup: XZ ≤ pickup_radius and height diff ≤ 1.5; capacity; no score on pickup', () => {
  const l = run({ motes: [[0, 0, T.pickup_radius]] }, [], 1);
  assert.deepEqual(events(l, 'mote_picked')[0], { type: 'event', tick: 1, name: 'mote_picked', data: { carried: 1 } });
  assert.equal(at(l, 1).score, 0);
  assert.equal(events(run({ motes: [[0, 0, T.pickup_radius + 0.01]] }, [], 1), 'mote_picked').length, 0);
  assert.equal(events(run({ motes: [[0, 2, 0.5]] }, [], 1), 'mote_picked').length, 0, 'mote 2 m above feet');
  const full = run({ player: { carried: T.carry_capacity }, motes: [[0, 0, 0.5]] }, [], 5);
  assert.equal(events(full, 'mote_picked').length, 0);
  assert.equal(at(full, 5).motes_active, 1);
});

test('deposit: within 2 m, min(carried, missing), lantern remembers progress, +10/mote +100/lantern', () => {
  const L = { id: 'L1', pos: [0, 0, T.interact_radius] };
  const part = run({ player: { carried: 4 }, lanterns: [{ ...L, deposited: 3 }] }, press(0, 'interact'), 3);
  assert.deepEqual(events(part, 'deposit')[0].data, { lantern_id: 'L1', amount: 4, deposited: 7 });
  assert.equal(at(part, 3).score, 4 * T.score.per_mote);
  const full = run({ player: { carried: T.carry_capacity }, lanterns: [{ ...L, deposited: 6 }] }, press(0, 'interact'), 3);
  assert.deepEqual(events(full, 'deposit')[0].data, { lantern_id: 'L1', amount: T.lantern_cost - 6, deposited: T.lantern_cost });
  assert.deepEqual(events(full, 'lantern_lit')[0].data, { lantern_id: 'L1', relight: false }); // v1.2 adds relight
  assert.equal(at(full, 3).player.carried, T.carry_capacity - (T.lantern_cost - 6));
  assert.equal(at(full, 3).score, (T.lantern_cost - 6) * T.score.per_mote + T.score.per_lantern);
  const far = run({ player: { carried: 5 }, lanterns: [{ id: 'L1', pos: [0, 0, T.interact_radius + 0.01] }] }, press(0, 'interact'), 3);
  assert.equal(events(far, 'deposit').length, 0);
});

// Ticket-03 replaced "lit lanterns are skipped": a lit lantern that is not full is a refuel target.
// (A lit lantern is never exactly full when E is processed: fuel decays in step 2, before step 5.)
test('interact: edge-triggered; nearest accepting lantern, tie -> smaller id; lit-not-full lantern gets refuelled', () => {
  assert.equal(events(run({ player: { carried: 2 }, lanterns: [{ id: 'L1', pos: [0, 0, 1] }] }, [{ tick: 0, interact: true }], 30), 'deposit').length, 1);
  const tie = run({ player: { carried: 2 }, lanterns: [{ id: 'L2', pos: [1, 0, 0] }, { id: 'L1', pos: [-1, 0, 0] }] }, press(0, 'interact'), 2);
  assert.equal(events(tie, 'deposit')[0].data.lantern_id, 'L1');
  const lit = run({ player: { carried: 2 }, lanterns: [{ id: 'L1', pos: [0, 0, 0.5], lit: true, fuel: 95 }, { id: 'L2', pos: [0, 0, 1.5] }] }, press(0, 'interact'), 2);
  assert.equal(events(lit, 'deposit').length, 0);
  assert.equal(events(lit, 'refuel')[0].data.lantern_id, 'L1');
});

test('pulse: costs 3, 3D radius 5 from feet+0.8, stun 120 ticks, push 4 m over 15 ticks, cooldown 3 s, +5/shade', () => {
  const sc = { player: { carried: 7 }, shades: [{ id: 'A', pos: [4.9, 0, 0] }, { id: 'B', pos: [-13, 0, 0] }] }; // B: outside pulse radius and detection
  const l = run(sc, [...press(0, 'pulse'), ...press(60, 'pulse')], 130);
  const p = events(l, 'pulse');
  assert.equal(p.length, 1, 'second pulse blocked by cooldown');
  assert.deepEqual(p[0].data, { stunned_ids: ['A'] });
  assert.equal(at(l, 1).player.carried, 7 - T.pulse_cost);
  assert.equal(at(l, 1).score, T.score.per_stun);
  assert.equal(at(l, 1).shades[0].state, 'stunned');
  near(at(l, 15).shades[0].pos[0], 4.9 + T.pulse_push_m);
  near(at(l, 100).shades[0].pos[0], 4.9 + T.pulse_push_m); // frozen after the push
  const cd = sec(T.pulse_cooldown_s);
  assert.equal(events(run(sc, [...press(0, 'pulse'), ...press(cd, 'pulse')], cd + 2), 'pulse').length, 2);
  assert.equal(events(run({ ...sc, player: { carried: T.pulse_cost - 1 } }, press(0, 'pulse'), 3), 'pulse').length, 0);
});

test('pulse re-hit refreshes stun and counts score again (even if already stunned)', () => {
  const cd = sec(T.pulse_cooldown_s);
  const l = run({ player: { carried: 6 }, shades: [{ id: 'A', pos: [1.5, 0, 0], state: 'stunned', state_ticks_left: 10 }] }, press(0, 'pulse'), 5);
  assert.deepEqual(events(l, 'pulse')[0].data.stunned_ids, ['A']);
  assert.equal(at(l, 1).shades[0].state_ticks_left, sec(T.pulse_stun_s));
  assert.equal(at(l, 1).score, T.score.per_stun);
  assert.ok(cd > 0);
});

// Ticket-03: "Hết choáng thì về wander" (was: straight back to chase in Phase 2).
test('stun lasts pulse_stun_s, then wander for one tick, then chase when player within 12 m', () => {
  const n = sec(T.pulse_stun_s);
  const l = run({ player: { carried: 5 }, shades: [{ id: 'A', pos: [3, 0, 0] }] }, press(0, 'pulse'), n + 5);
  assert.equal(at(l, n).shades[0].state, 'stunned');
  assert.equal(at(l, n + 1).shades[0].state, 'wander');
  assert.equal(at(l, n + 2).shades[0].state, 'chase');
  assert.ok(at(l, n + 3).shades[0].pos[0] < at(l, n + 2).shades[0].pos[0]);
});

test('shade: chase at 4 m/s inside 12 m, wander outside, gives up beyond 18 m', () => {
  const l = run({ shades: [{ id: 'A', pos: [11, 0, 0] }] }, [], 60);
  assert.equal(at(l, 1).shades[0].state, 'chase');
  near(at(l, 60).shades[0].pos[0], 11 - T.shade_speed);
  const far = run({ shades: [{ id: 'A', pos: [30, 0, 0] }] }, [], 60);
  assert.equal(at(far, 60).shades[0].state, 'wander');
  // player runs away at 6 m/s from a 4 m/s chaser: gap grows past 18 m -> wander
  const flee = run({ shades: [{ id: 'A', pos: [-11, 0, 0] }] }, [{ tick: 0, move: [1, 0] }], 300);
  assert.ok(snaps(flee).some((s) => s.shades[0].state === 'chase'));
  assert.equal(at(flee, 300).shades[0].state, 'wander');
});

test('hit: −1 flame, drop floor(carried/2) on a 1.5–2.5 m ring (480-tick TTL), invuln 90 ticks, shade recoils 2 m/60 ticks', () => {
  const l = run({ player: { carried: 5 }, shades: [{ id: 'A', pos: [1.05, 0, 0] }] }, [], 200);
  const hits = events(l, 'player_hit');
  assert.deepEqual(hits[0], { type: 'event', tick: 1, name: 'player_hit', data: { by: 'shade', flames: T.flames - 1, dropped: 2 } });
  const s1 = at(l, 1);
  assert.equal(s1.player.carried, 3);
  assert.equal(s1.player.invuln, true);
  const dropped = s1.motes.filter((m) => m.kind === 'dropped');
  assert.equal(dropped.length, 2);
  for (const m of dropped) {
    const d = xz(m.pos, s1.player.pos);
    assert.ok(d >= 1.5 - 1e-6 && d <= 2.5 + 1e-6, `ring distance ${d}`);
    near(m.ttl_s, 8);
  }
  assert.equal(s1.shades[0].state, 'recoil');
  near(at(l, 61).shades[0].pos[0], s1.shades[0].pos[0] + WORLD.recoilDist, 0.01);
  assert.ok(hits[1].tick - hits[0].tick >= sec(T.invuln_s));
});

test('invulnerable player: shade contact does nothing; max one flame per tick', () => {
  const l = run({ player: { invuln_ticks: 30 }, shades: [{ id: 'A', pos: [0.5, 0, 0] }, { id: 'B', pos: [-0.5, 0, 0] }] }, [], 20);
  assert.equal(events(l, 'player_hit').length, 0);
  assert.equal(at(l, 20).shades[0].state, 'chase');
  const two = run({ shades: [{ id: 'S2', pos: [0.5, 0, 0] }, { id: 'S1', pos: [-0.5, 0, 0] }] }, [], 1);
  assert.equal(events(two, 'player_hit').length, 1);
  assert.equal(at(two, 1).shades.find((s) => s.id === 'S1').state, 'recoil', 'ascending id hits first');
});

test('safe zone: only LIT lanterns; shades blocked at 6 m', () => {
  const lit = run({ lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }], shades: [{ id: 'A', pos: [10, 0, 0] }] }, [], 300);
  for (const s of snaps(lit)) assert.ok(xz(s.shades[0].pos, [0, 0, 0]) >= T.safe_radius - 1e-3);
  assert.equal(events(lit, 'player_hit').length, 0);
  const unlit = run({ lanterns: [{ id: 'L1', pos: [0, 0, 0] }], shades: [{ id: 'A', pos: [10, 0, 0] }] }, [], 300);
  assert.ok(events(unlit, 'player_hit').length > 0);
});

// Ticket-03 REPLACED "win as soon as all lanterns are lit" (Phase 1/2 tests `win` + `win priority` removed):
// win only at dawn with ≥ ceil(0.6 × total) lanterns lit; dawn bonus = Σ(50 + floor(fuel)) + 50 × flames.
test('win: lighting every lantern does not end the night; dawn with ≥ 3/5 lit -> won dawn_survived + dawn bonus', () => {
  const lit = ['L2', 'L3', 'L4', 'L5'].map((id) => ({ id, lit: true }));
  const early = run({ player: { carried: T.lantern_cost }, lanterns: [{ id: 'L1', pos: [0, 0, 1] }, ...lit], time_left_s: 100 }, press(0, 'interact'), 50);
  assert.equal(events(early, 'game_over').length, 0);
  assert.equal(early.at(-1).state, 'playing');
  const l = run({ lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true }, { id: 'L3', lit: true, fuel: 50 }], time_left_s: 2 }, [], 500);
  assert.deepEqual(events(l, 'game_over')[0], { type: 'event', tick: 120, name: 'game_over', data: { result: 'won', reason: 'dawn_survived' } });
  // fuel after 120 ticks of decay: 98 / 98 / 48
  const bonus = (T.score.per_lit_at_dawn + 98) * 2 + (T.score.per_lit_at_dawn + 48) + T.flames * T.score.per_flame_left;
  assert.deepEqual(l.at(-1), { type: 'end', ticks: 120, state: 'won', score: bonus });
});

test('lose at dawn below the threshold (2/5); no flames on the dawn tick loses no_flames', () => {
  const two = run({ lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true }], time_left_s: 1 }, [], 100);
  assert.deepEqual(events(two, 'game_over')[0].data, { result: 'lost', reason: 'dawn' });
  assert.equal(two.at(-1).score, 0);
  const dead = run({ player: { flames: 1 }, lanterns: ['L1', 'L2', 'L3'].map((id) => ({ id, lit: true })), shades: [{ id: 'A', pos: [0.5, 0, 0] }], time_left_s: 1 / 60 }, [], 5);
  assert.deepEqual(events(dead, 'game_over')[0].data, { result: 'lost', reason: 'no_flames' });
});

test('scenario setup awards no score / events (pre-lit lanterns)', () => {
  const l = run({ lanterns: [{ id: 'L1', lit: true }] }, [], 5);
  assert.equal(at(l, 0).score, 0);
  assert.equal(events(l).length, 0);
});

test('lose: no flames -> lost no_flames; time out -> lost dawn', () => {
  const l = run({ player: { flames: 1 }, shades: [{ id: 'A', pos: [0.5, 0, 0] }] }, [], 50);
  assert.deepEqual(events(l, 'game_over')[0].data, { result: 'lost', reason: 'no_flames' });
  const d = run({ time_left_s: 1 }, [], 500);
  assert.deepEqual(events(d, 'game_over')[0], { type: 'event', tick: 60, name: 'game_over', data: { result: 'lost', reason: 'dawn' } });
});

test('Night 1 standard map + schedules: 20 motes, +1 at 240k (cap / free points), 2 shades at 300, then every 480, max 6', () => {
  const l = runHeadless({ tuning: T, seed: 9, night: 1, scenario: { lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }] }, ticks: 300 + 480 * 6, snapshotEvery: 10 }).lines;
  const s0 = snaps(l)[0];
  assert.deepEqual(s0.lanterns.map((L) => L.pos), [[0, 0, 0], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]]);
  assert.equal(s0.motes_active, WORLD.moteStart);
  assert.equal(new Set(s0.motes.map((m) => m.pos.join())).size, WORLD.moteStart, '20 distinct points');
  assert.equal(at(l, 240).motes_active, WORLD.moteStart + 1);
  const sp = events(l, 'shade_spawned');
  assert.deepEqual(sp.slice(0, 2).map((e) => [e.tick, e.data.id]), [[300, 'S1'], [300, 'S2']]);
  assert.deepEqual(sp.slice(2).map((e) => e.tick), [780, 1260, 1740, 2220]);
  assert.equal(snaps(l).at(-1).shades.length, 6);
  assert.equal(at(l, 300).shades[0].state, 'spawning');
  assert.notEqual(at(l, 310).shades[0].state, 'spawning');
  for (const s of at(l, 300).shades) near(Math.hypot(s.pos[0], s.pos[2]), 37, 0.01); // spawn ring r = 37
});

test('determinism: same seed/scenario/inputs -> identical output; different seed -> different world', () => {
  const frames = [{ tick: 0, move: [0.3, 1], cam_yaw_deg: 37 }, { tick: 400, pulse: true }, { tick: 401, pulse: false }, { tick: 500, dash: true }, { tick: 501, dash: false }];
  for (const night of [1, 2, 3]) {
    const a = JSON.stringify(runHeadless({ tuning: T, seed: 42, night, inputs: { frames }, ticks: 3000 }).lines);
    const b = JSON.stringify(runHeadless({ tuning: T, seed: 42, night, inputs: { frames }, ticks: 3000 }).lines);
    const c = JSON.stringify(runHeadless({ tuning: T, seed: 43, night, inputs: { frames }, ticks: 3000 }).lines);
    assert.equal(a, b);
    assert.notEqual(a, c);
  }
});

test('step() after game over is a no-op', () => {
  const g = createGame({ tuning: T, scenario: { random_shades: false, time_left_s: 1 / 60 } });
  step(g, NEUTRAL_INPUT);
  assert.equal(g.state, 'lost');
  assert.deepEqual(step(g, NEUTRAL_INPUT), []);
});
