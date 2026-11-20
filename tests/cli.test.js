// End-to-end tests of the headless CLI exactly as the grader calls it (headless_cmd from game.contract.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const contract = JSON.parse(readFileSync(join(ROOT, 'game.contract.json'), 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'ddl-'));
const file = (name, obj) => {
  const p = join(dir, name);
  writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return p;
};
function cli(args) {
  const [cmd, ...base] = contract.headless_cmd.split(' ');
  return spawnSync(cmd, [...base, ...args], { cwd: ROOT, encoding: 'utf8' });
}
const readLines = (p) => readFileSync(p, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('contract file declares all required fields and tuning keys', () => {
  for (const k of ['contract_version', 'team', 'build_cmd', 'run_cmd', 'headless_cmd', 'tuning']) assert.ok(k in contract, k);
  assert.equal(contract.contract_version, '1.1');
  // Ticket-02 Part 1 standard numbers (must match exactly)
  const standard = {
    player_speed: 6, carry_capacity: 10, lantern_cost: 10, lantern_count_night1: 5, pickup_radius: 1, interact_radius: 2,
    pulse_cost: 3, pulse_radius: 5, night1_duration_s: 300, night2_duration_s: 330, night3_duration_s: 360, flames: 3,
    invuln_s: 1.5, hit_drop_ratio: 0.5, pulse_stun_s: 2, pulse_push_m: 4, pulse_cooldown_s: 3, safe_radius: 6,
    shade_speed: 4, shade_hit_radius: 1, fall_enabled: true, dash_speed: 14, dash_duration_s: 0.2, dash_cooldown_s: 1.5,
  };
  for (const [k, v] of Object.entries(standard)) assert.equal(contract.tuning[k], v, k);
  assert.deepEqual(contract.tuning.score, { per_mote: 10, per_lantern: 100, per_stun: 5, per_second_left: 2, per_flame_left: 50 });
  for (const k of ['per_mote', 'per_lantern', 'per_stun', 'per_second_left', 'per_flame_left']) assert.ok(k in contract.tuning.score, k);
});

test('full default run: exit 0, valid JSONL, snapshots every N from tick 0, end line last', () => {
  const out = join(dir, 'run.jsonl');
  const r = cli(['--seed', '5', '--night', '1', '--ticks', '600', '--out', out, '--snapshot-every', '25']);
  assert.equal(r.status, 0, r.stderr);
  const lines = readLines(out);
  assert.deepEqual(lines[0], { type: 'event', tick: 0, name: 'night_start', data: { night: 1 } });
  const snaps = lines.filter((l) => l.type === 'snapshot');
  assert.deepEqual(snaps.map((s) => s.tick), Array.from({ length: 25 }, (_, i) => i * 25));
  const end = lines.at(-1);
  assert.equal(end.type, 'end');
  assert.ok(['playing', 'won', 'lost'].includes(end.state));
  assert.equal(lines.filter((l) => l.type === 'end').length, 1);
  const s = snaps[0];
  for (const k of ['tick', 'sim_tick', 'state', 'time_left_s', 'score', 'player', 'lanterns', 'shades', 'motes_active']) assert.ok(k in s, k);
  assert.equal(s.lanterns.length, 5);
  // events are emitted in tick order and before the snapshot of the same tick
  let last = 0;
  for (const l of lines.slice(0, -1)) {
    assert.ok(l.tick >= last);
    last = l.tick;
  }
});

test('determinism through the CLI: two runs are byte-identical', () => {
  const inputs = file('det-in.json', { frames: [{ tick: 0, move: [1, 1], cam_yaw_deg: 15 }, { tick: 90, jump: true }, { tick: 91, jump: false }] });
  const a = join(dir, 'a.jsonl');
  const b = join(dir, 'b.jsonl');
  for (const out of [a, b]) assert.equal(cli(['--seed', '99', '--night', '1', '--inputs', inputs, '--ticks', '4000', '--out', out]).status, 0);
  assert.equal(readFileSync(a, 'utf8'), readFileSync(b, 'utf8'));
});

test('malformed inputs/scenario -> exit 2 with message on stderr', () => {
  const out = join(dir, 'x.jsonl');
  const bad = [
    ['--inputs', file('bad1.json', '{not json')],
    ['--inputs', file('bad2.json', { frames: [{ tick: 5 }, { tick: 5 }] })],
    ['--inputs', file('bad3.json', { frames: [{ tick: 0, move: [2, 0] }] })],
    ['--inputs', file('bad4.json', { frames: [{ tick: 0, pulse: 'yes' }] })],
    ['--inputs', file('bad5.json', { nope: [] })],
    ['--scenario', file('bad6.json', { player: { pos: [0, 0] } })],
    ['--scenario', file('bad7.json', { motes: 'many' })],
    ['--scenario', file('bad8.json', '[1,2]')],
    ['--inputs', file('bad9.json', { frames: [{ tick: 0, dash: 1 }] })],
    ['--inputs', file('bad10.json', { frames: [{ tick: 0, pause: 'on' }] })],
    ['--scenario', file('bad11.json', { shades: [{ pos: [1, 0, 1], state: 'angry' }] })],
    ['--scenario', file('bad12.json', { drifters: [{ pos: [1, 0] }] })],
    ['--scenario', file('bad13.json', { charms: [{ available: 'yes' }] })],
    ['--scenario', file('bad14.json', { player: { invuln_ticks: -1 } })],
    ['--scenario', file('bad15.json', { wind_enabled: 1 })],
  ];
  for (const extra of bad) {
    const r = cli(['--seed', '1', '--night', '1', '--ticks', '10', '--out', out, ...extra]);
    assert.equal(r.status, 2, `expected exit 2 for ${extra[1]}; got ${r.status}`);
    assert.match(r.stderr, /headless error/);
  }
});

test('other errors -> non-zero exit (missing args, missing file, unknown night)', () => {
  const out = join(dir, 'y.jsonl');
  assert.notEqual(cli(['--seed', '1', '--night', '1', '--out', out]).status, 0);
  assert.notEqual(cli(['--seed', '1', '--night', '1', '--ticks', '10', '--out', out, '--inputs', join(dir, 'missing.json')]).status, 0);
  assert.notEqual(cli(['--seed', '1', '--night', '4', '--ticks', '10', '--out', out]).status, 0);
  for (const n of ['2', '3']) assert.equal(cli(['--seed', '1', '--night', n, '--ticks', '10', '--out', out]).status, 0, `night ${n}`);
});
