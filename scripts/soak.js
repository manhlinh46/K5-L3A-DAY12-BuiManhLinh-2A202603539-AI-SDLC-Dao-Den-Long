#!/usr/bin/env node
// Ticket-04 soak test: node --expose-gc scripts/soak.js --seed 7 --nights 10 --out soak.json
// 10 nights in ONE process (night 1 -> 2 -> 3 -> 1 ...); night i (i = 1..N) uses seed + i.
// Seeded random input: new move direction every 30 ticks; per tick 5 % jump, 3 % dash, 2 % pulse, 10 % interact.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, step } from '../src/sim/game.js';
import { mulberry32 } from '../src/sim/rng.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []));
const seed = Number(args.seed ?? 7);
const nights = Number(args.nights ?? 10);
const out = args.out ?? 'soak.json';
if (!Number.isInteger(seed) || !Number.isInteger(nights) || nights < 1) {
  process.stderr.write('usage: soak.js --seed <int> --nights <int> --out <file>\n');
  process.exit(1);
}
const { tuning } = JSON.parse(readFileSync(join(ROOT, 'game.contract.json'), 'utf8'));
const rssMb = () => {
  globalThis.gc?.(); // with --expose-gc, measure live memory rather than garbage waiting for collection
  return Math.round((process.memoryUsage().rss / 1048576) * 10) / 10;
};

const t0 = performance.now();
const results = [];
let crashes = 0;
let memStart = null;
let g = null;
for (let i = 1; i <= nights; i++) {
  const night = ((i - 1) % 3) + 1;
  try {
    g = createGame({ tuning, seed: seed + i, night });
    if (i === 1) memStart = rssMb(); // RSS after the first night is loaded
    const rng = mulberry32((seed + i) ^ 0x5eed);
    const maxTicks = Math.round(g.duration * 60) + 10;
    const inp = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
    for (let k = 0; k < maxTicks && g.state === 'playing'; k++) {
      if (k % 30 === 0) {
        const a = rng() * 2 * Math.PI;
        inp.move = [Math.cos(a), Math.sin(a)];
      }
      inp.jump = rng() < 0.05;
      inp.dash = rng() < 0.03;
      inp.pulse = rng() < 0.02;
      inp.interact = rng() < 0.1;
      step(g, inp);
    }
    results.push(g.state);
  } catch (e) {
    crashes++;
    results.push('crash');
    process.stderr.write(`night ${i} crashed: ${e.stack}\n`);
  }
  g = null; // reset between nights
}
const memEnd = rssMb(); // RSS after the last night has been reset
const report = { nights, crashes, results, mem_start_mb: memStart, mem_end_mb: memEnd, duration_s: Math.round((performance.now() - t0) / 100) / 10, seed, node: process.version, gc_exposed: typeof globalThis.gc === 'function' };
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
const ok = crashes === 0 && memEnd <= 1.2 * memStart;
process.exit(ok ? 0 : 1);
