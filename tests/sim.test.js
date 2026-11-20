// Behaviour tests for the simulation, one block per PRD-0 / Test Contract requirement.
// Expected values are derived from game.contract.json tuning, never hard-coded copies of output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runHeadless } from '../src/sim/run.js';
import { createGame, step, NEUTRAL_INPUT, WORLD } from '../src/sim/game.js';

const { tuning: T } = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url)));
const EMPTY = { random_motes: false, random_shades: false, motes: [], shades: [] };
const run = (scenario, frames = [], ticks = 60, seed = 1, snapshotEvery = 1) =>
  runHeadless({ tuning: T, seed, scenario: { ...EMPTY, ...scenario }, inputs: { frames }, ticks, snapshotEvery }).lines;
const snaps = (lines) => lines.filter((l) => l.type === 'snapshot');
const events = (lines, name) => lines.filter((l) => l.type === 'event' && (!name || l.name === name));
const at = (lines, tick) => snaps(lines).find((s) => s.tick === tick);
const press = (tick, key, extra = {}) => [{ tick, [key]: true, ...extra }, { tick: tick + 1, [key]: false }];
const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('tick model: snapshot 0 is pre-input state, --ticks N runs exactly N steps, ends with end line', () => {
  const l = run({}, [{ tick: 0, move: [0, 1] }], 30);
  assert.deepEqual(snaps(l)[0].player.pos, [0, 0, 0]);
  assert.equal(at(l, 30).sim_tick, 30);
  assert.deepEqual(l.at(-1), { type: 'end', ticks: 30, state: 'playing', score: 0 });
  near(at(l, 30).time_left_s, T.night1_duration_s - 30 / 60);
});

test('movement: player_speed m/s, camera yaw rotation per contract formula, diagonal normalised', () => {
  near(at(run({}, [{ tick: 0, move: [0, 1] }]), 60).player.pos[2], T.player_speed);
  near(at(run({}, [{ tick: 0, move: [1, 0] }]), 60).player.pos[0], T.player_speed);
  const yaw = at(run({}, [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }]), 60).player.pos; // x' = z·sin90 = +X
  near(yaw[0], T.player_speed);
  near(yaw[2], 0);
  const diag = at(run({}, [{ tick: 0, move: [1, 1] }]), 60).player.pos;
  near(Math.hypot(diag[0], diag[2]), T.player_speed);
  const half = at(run({}, [{ tick: 0, move: [0, 0.5] }]), 60).player.pos;
  near(half[2], T.player_speed / 2);
});

test('absent fields keep previous value; no inputs = player stands still', () => {
  const l = run({}, [{ tick: 0, move: [0, 1] }, { tick: 30, jump: true }], 60);
  near(at(l, 60).player.pos[2], T.player_speed); // move kept after frame without "move"
  assert.deepEqual(at(run({}, [], 60), 60).player.pos, [0, 0, 0]);
});

test('jump: rising edge only, lands back on y=0', () => {
  const l = run({}, [{ tick: 0, jump: true }], 120);
  assert.ok(at(l, 15).player.pos[1] > 0.5);
  assert.equal(at(l, 120).player.pos[1], 0); // holding jump does not re-jump
});

test('island edge: no fall (fall_enabled=false), player stays within island radius', () => {
  assert.equal(T.fall_enabled, false);
  const l = run({ player: { pos: [0, 0, 38] } }, [{ tick: 0, move: [0, 1] }], 120);
  near(at(l, 120).player.pos[2], WORLD.islandRadius);
  assert.equal(events(l, 'player_hit').length, 0);
});

test('pickup: within pickup_radius auto-picks, +per_mote, respects carry_capacity', () => {
  const l = run({ motes: [[0, 0, T.pickup_radius]] }, [], 1);
  assert.deepEqual(events(l, 'mote_picked')[0], { type: 'event', tick: 1, name: 'mote_picked', data: { carried: 1 } });
  assert.equal(at(l, 1).score, T.score.per_mote);
  assert.equal(at(l, 1).motes_active, 0);
  const far = run({ motes: [[0, 0, T.pickup_radius + 0.01]] }, [], 1);
  assert.equal(events(far, 'mote_picked').length, 0);
  const full = run({ player: { carried: T.carry_capacity }, motes: [[0, 0, 0.5]] }, [], 5);
  assert.equal(events(full, 'mote_picked').length, 0);
  assert.equal(at(full, 5).motes_active, 1);
});

test('deposit: interact within interact_radius, partial then lit at lantern_cost', () => {
  const L = { id: 'L1', pos: [0, 0, T.interact_radius] };
  const part = run({ player: { carried: T.lantern_cost - 1 }, lanterns: [L] }, press(0, 'interact'), 3);
  assert.deepEqual(events(part, 'deposit')[0].data, { lantern_id: 'L1', amount: T.lantern_cost - 1, deposited: T.lantern_cost - 1 });
  assert.equal(events(part, 'lantern_lit').length, 0);
  const full = run({ player: { carried: T.lantern_cost + 2 }, lanterns: [L] }, press(0, 'interact'), 3);
  assert.deepEqual(events(full, 'deposit')[0].data, { lantern_id: 'L1', amount: T.lantern_cost, deposited: T.lantern_cost });
  assert.deepEqual(events(full, 'lantern_lit')[0].data, { lantern_id: 'L1' });
  assert.equal(at(full, 3).player.carried, 2);
  assert.equal(at(full, 3).score, T.score.per_lantern);
  assert.equal(at(full, 3).lanterns[0].lit, true);
  const outOfRange = run({ player: { carried: 5 }, lanterns: [{ id: 'L1', pos: [0, 0, T.interact_radius + 0.01] }] }, press(0, 'interact'), 3);
  assert.equal(events(outOfRange, 'deposit').length, 0);
});

test('interact is edge-triggered: holding it deposits once', () => {
  const l = run({ player: { carried: 2 }, lanterns: [{ id: 'L1', pos: [0, 0, 1] }] }, [{ tick: 0, interact: true }], 30);
  assert.equal(events(l, 'deposit').length, 1);
});

test('pulse: costs pulse_cost, stuns + pushes shades within pulse_radius, cooldown, +per_stun', () => {
  const sc = { player: { carried: 5 }, shades: [{ id: 'A', pos: [T.pulse_radius, 0, 0] }, { id: 'B', pos: [-(T.pulse_radius + 3), 0, 0] }] };
  const l = run(sc, [...press(0, 'pulse'), ...press(10, 'pulse')], 20);
  const p = events(l, 'pulse');
  assert.equal(p.length, 1, 'second pulse blocked by cooldown');
  assert.deepEqual(p[0].data, { stunned_ids: ['A'] });
  const s1 = at(l, 1);
  assert.equal(s1.player.carried, 5 - T.pulse_cost);
  assert.equal(s1.score, T.score.per_stun);
  assert.equal(s1.shades[0].state, 'stunned');
  near(s1.shades[0].pos[0], T.pulse_radius + T.pulse_push_m);
  const cd = T.pulse_cooldown_s * 60;
  const again = run(sc, [...press(0, 'pulse'), ...press(cd, 'pulse')], cd + 2);
  assert.equal(events(again, 'pulse').length, 2, 'pulse available again after cooldown');
  const broke = run({ ...sc, player: { carried: T.pulse_cost - 1 } }, press(0, 'pulse'), 3);
  assert.equal(events(broke, 'pulse').length, 0);
});

test('stun lasts pulse_stun_s: shade frozen, then resumes chase', () => {
  const n = T.pulse_stun_s * 60;
  const l = run({ player: { carried: 5 }, shades: [{ id: 'A', pos: [5, 0, 0] }] }, press(0, 'pulse'), n + 5);
  const frozen = at(l, 1).shades[0].pos[0];
  assert.equal(at(l, n).shades[0].state, 'stunned');
  assert.equal(at(l, n).shades[0].pos[0], frozen);
  assert.equal(at(l, n + 1).shades[0].state, 'chase');
  assert.ok(at(l, n + 1).shades[0].pos[0] < frozen);
});

test('shade chases at shade_speed', () => {
  const l = run({ shades: [{ id: 'A', pos: [30, 0, 0] }] }, [], 60);
  near(at(l, 60).shades[0].pos[0], 30 - T.shade_speed);
});

test('hit: within shade_hit_radius loses a flame, drops hit_drop_ratio of motes, invuln_s', () => {
  const l = run({ player: { carried: 4 }, shades: [{ id: 'A', pos: [T.shade_hit_radius + T.shade_speed / 60, 0, 0] }] }, [], 200);
  const hits = events(l, 'player_hit');
  assert.deepEqual(hits[0], { type: 'event', tick: 1, name: 'player_hit', data: { by: 'shade', flames: T.flames - 1, dropped: Math.floor(4 * T.hit_drop_ratio) } });
  assert.equal(hits[1].tick - hits[0].tick, T.invuln_s * 60);
});

test('safe_radius: shades never get within safe_radius of a lantern', () => {
  const L = { id: 'L1', pos: [0, 0, 0] };
  const l = run({ lanterns: [L], shades: [{ id: 'A', pos: [20, 0, 0] }] }, [], 600);
  for (const s of snaps(l)) assert.ok(Math.hypot(s.shades[0].pos[0], s.shades[0].pos[2]) > T.safe_radius);
  assert.equal(events(l, 'player_hit').length, 0);
});

test('win: lighting the last lantern -> game_over won all_lit with time + flame bonus', () => {
  const lit = ['L2', 'L3', 'L4', 'L5'].map((id) => ({ id, lit: true }));
  const l = run({ player: { carried: T.lantern_cost }, lanterns: [{ id: 'L1', pos: [0, 0, 1] }, ...lit], time_left_s: 100 }, press(0, 'interact'), 50);
  const go = events(l, 'game_over');
  assert.deepEqual(go[0].data, { result: 'won', reason: 'all_lit' });
  const timeLeft = Math.floor(100 - 1 / 60);
  assert.deepEqual(l.at(-1), { type: 'end', ticks: 1, state: 'won', score: T.score.per_lantern + timeLeft * T.score.per_second_left + T.flames * T.score.per_flame_left });
});

test('scenario setup awards no score / events (pre-lit lanterns)', () => {
  const l = run({ lanterns: [{ id: 'L1', lit: true }] }, [], 5);
  assert.equal(at(l, 0).score, 0);
  assert.equal(events(l).length, 0);
});

test('lose: no flames -> lost no_flames; time out -> lost dawn', () => {
  const l = run({ player: { flames: 1 }, shades: [{ id: 'A', pos: [0.5, 0, 0] }] }, [], 50);
  assert.deepEqual(events(l, 'game_over')[0].data, { result: 'lost', reason: 'no_flames' });
  assert.equal(l.at(-1).state, 'lost');
  const d = run({ time_left_s: 1 }, [], 500);
  assert.deepEqual(events(d, 'game_over')[0], { type: 'event', tick: 60, name: 'game_over', data: { result: 'lost', reason: 'dawn' } });
  assert.equal(d.at(-1).ticks, 60);
});

test('random spawning: shade_spawned events with unique ids; disabled by random_shades=false', () => {
  // empty shade list but random_shades on (default) -> first spawn after shadeSpawnS
  // player stands inside L1's safe zone so the run survives until the spawn tick
  const sc = { shades: [{ id: 'S1', pos: [-30, 0, 0] }], lanterns: [{ id: 'L1', pos: [0, 0, 0] }] };
  const l = runHeadless({ tuning: T, seed: 3, scenario: sc, ticks: WORLD.shadeSpawnS * 60 + 1, snapshotEvery: 60 }).lines;
  const sp = events(l, 'shade_spawned');
  assert.equal(sp.length, 1);
  assert.equal(sp[0].tick, WORLD.shadeSpawnS * 60);
  assert.notEqual(sp[0].data.id, 'S1', 'auto id must not collide with scenario id');
  const ids = snaps(l).at(-1).shades.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(snaps(l)[0].motes_active, WORLD.moteTarget);
  assert.equal(snaps(runHeadless({ tuning: T, seed: 3, ticks: 1 }).lines)[0].shades.length, WORLD.shadeInitial);
  assert.equal(events(run({}, [], WORLD.shadeSpawnS * 60 + 1), 'shade_spawned').length, 0);
});

test('determinism: same seed/scenario/inputs -> identical output; different seed -> different world', () => {
  const frames = [{ tick: 0, move: [0.3, 1], cam_yaw_deg: 37 }, { tick: 200, pulse: true }, { tick: 201, pulse: false }];
  const a = JSON.stringify(runHeadless({ tuning: T, seed: 42, inputs: { frames }, ticks: 3000 }).lines);
  const b = JSON.stringify(runHeadless({ tuning: T, seed: 42, inputs: { frames }, ticks: 3000 }).lines);
  const c = JSON.stringify(runHeadless({ tuning: T, seed: 43, inputs: { frames }, ticks: 3000 }).lines);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('step() after game over is a no-op', () => {
  const g = createGame({ tuning: T, scenario: { ...EMPTY, time_left_s: 1 / 60 } });
  step(g, NEUTRAL_INPUT);
  assert.equal(g.state, 'lost');
  assert.deepEqual(step(g, NEUTRAL_INPUT), []);
});
