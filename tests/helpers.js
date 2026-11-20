// Shared helpers for the node:test suites. Expectations are derived from game.contract.json tuning.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { runHeadless } from '../src/sim/run.js';

export const { tuning: T } = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url)));
export const EMPTY = { random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false, motes: [], shades: [], drifters: [] };
export const run = (scenario, frames = [], ticks = 60, { night = 1, seed = 1, every = 1, raw = false } = {}) =>
  runHeadless({ tuning: T, seed, night, scenario: raw ? scenario : { ...EMPTY, ...scenario }, inputs: { frames }, ticks, snapshotEvery: every }).lines;
export const snaps = (lines) => lines.filter((l) => l.type === 'snapshot');
export const events = (lines, name) => lines.filter((l) => l.type === 'event' && l.name !== 'night_start' && (!name || l.name === name));
export const at = (lines, tick) => snaps(lines).find((s) => s.tick === tick);
export const press = (tick, key, extra = {}) => [{ tick, [key]: true, ...extra }, { tick: tick + 1, [key]: false }];
export const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b} (±${eps})`);
export const xz = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
export const sec = (s) => Math.round(s * 60);
