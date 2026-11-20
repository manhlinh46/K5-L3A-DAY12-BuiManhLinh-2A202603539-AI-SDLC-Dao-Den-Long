// Ticket-04: standard benchmark scene and soak command (bench timing itself needs a GPU window: see docs/proof/phase-4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBenchGame, BENCH } from '../src/sim/bench.js';
import { step, snapshot, NEUTRAL_INPUT } from '../src/sim/game.js';
import { T } from './helpers.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const contract = JSON.parse(readFileSync(join(ROOT, 'game.contract.json'), 'utf8'));

test('bench scene: Night 1, 200 wandering shades + 100 motes on the island, L1–L3 lit at 100, player at origin', () => {
  const s = snapshot(createBenchGame(T, 42));
  assert.equal(s.night, 1);
  assert.equal(s.shades.length, BENCH.shades);
  assert.ok(s.shades.every((x) => x.state === 'wander'));
  assert.equal(s.motes_active, BENCH.motes);
  for (const p of [...s.shades.map((x) => x.pos), ...s.motes.map((m) => m.pos)]) assert.ok(Math.hypot(p[0], p[2]) <= 40);
  assert.deepEqual(s.lanterns.map((L) => [L.id, L.lit, L.fuel]), [['L1', true, 100], ['L2', true, 100], ['L3', true, 100], ['L4', false, 0], ['L5', false, 0]]);
  assert.deepEqual(s.player.pos, [0, 0, 0]);
  // same seed -> same scene
  assert.equal(JSON.stringify(snapshot(createBenchGame(T, 42))), JSON.stringify(s));
});

test('bench scene: no spawns, damage, pickup, fuel decay or night end; shades keep wandering', () => {
  const g = createBenchGame(T, 42);
  const events = [];
  for (let i = 0; i < 60 * 40; i++) events.push(...step(g, NEUTRAL_INPUT));
  const s = snapshot(g);
  assert.deepEqual(events, []);
  assert.equal(s.state, 'playing');
  assert.equal(s.shades.length, BENCH.shades);
  assert.ok(s.shades.every((x) => x.state === 'wander'));
  assert.equal(s.motes_active, BENCH.motes);
  assert.equal(s.player.flames, T.flames);
  assert.deepEqual(s.lanterns.slice(0, 3).map((L) => L.fuel), [100, 100, 100]);
  assert.ok(s.shades.some((x, i) => x.pos[0] !== snapshot(createBenchGame(T, 42)).shades[i].pos[0]), 'shades move');
});

test('soak command (contract soak_cmd): 10 nights in one process, 0 crashes, memory within 1.2×, contract output keys', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'ddl-soak-')), 'soak.json');
  const [cmd, ...args] = contract.soak_cmd.split(' ');
  const r = spawnSync(cmd === 'node' ? process.execPath : cmd, [...args, '--seed', '7', '--nights', '10', '--out', out], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  for (const k of ['nights', 'crashes', 'results', 'mem_start_mb', 'mem_end_mb', 'duration_s']) assert.ok(k in j, k);
  assert.equal(j.nights, 10);
  assert.equal(j.crashes, 0);
  assert.equal(j.results.length, 10);
  assert.ok(j.results.every((x) => ['won', 'lost', 'playing'].includes(x)));
  assert.ok(j.mem_end_mb <= 1.2 * j.mem_start_mb, `${j.mem_end_mb} vs ${j.mem_start_mb}`);
});
