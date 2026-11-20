// Runs a scenario case through the real headless CLI and checks its expectations.
// Case format: tests/scenarios/phase1.json. `events` must appear in order (as a subsequence);
// `data` is matched as a subset; `no_events` must never appear; `end` fields must match;
// `snapshots`: [{tick, path: "player.pos.1", eq | approx (+eps)}] checks values in the snapshot of that tick.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const contract = JSON.parse(readFileSync(join(ROOT, 'game.contract.json'), 'utf8'));

const subset = (want, got) => Object.entries(want).every(([k, v]) => JSON.stringify(got?.[k]) === JSON.stringify(v));

export function runCase(c, outDir) {
  mkdirSync(outDir, { recursive: true });
  const args = ['--seed', String(c.seed), '--night', String(c.night || 1), '--ticks', String(c.ticks), '--out', join(outDir, `${c.name}.jsonl`)];
  if (c.snapshot_every) args.push('--snapshot-every', String(c.snapshot_every));
  if (c.scenario) writeFileSync(join(outDir, `${c.name}.scenario.json`), JSON.stringify(c.scenario, null, 2)), args.push('--scenario', join(outDir, `${c.name}.scenario.json`));
  if (c.inputs) writeFileSync(join(outDir, `${c.name}.inputs.json`), JSON.stringify(c.inputs, null, 2)), args.push('--inputs', join(outDir, `${c.name}.inputs.json`));
  const [cmd, ...base] = contract.headless_cmd.split(' ');
  const r = spawnSync(cmd, [...base, ...args], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) return { pass: false, failures: [`exit ${r.status}: ${r.stderr.trim()}`], lines: [] };
  const lines = readFileSync(join(outDir, `${c.name}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { ...check(c.expect, lines), lines };
}

export function check(expect, lines) {
  const failures = [];
  const evs = lines.filter((l) => l.type === 'event');
  let i = 0;
  for (const w of expect.events || []) {
    while (i < evs.length && !(evs[i].name === w.name && subset(w.data || {}, evs[i].data) && (w.tick === undefined || evs[i].tick === w.tick))) i++;
    if (i === evs.length) failures.push(`missing event (in order): ${JSON.stringify(w)}`);
    else i++;
  }
  for (const n of expect.no_events || []) {
    const hit = evs.find((e) => e.name === n);
    if (hit) failures.push(`unexpected event: ${JSON.stringify(hit)}`);
  }
  for (const w of expect.snapshots || []) {
    const snap = lines.find((l) => l.type === 'snapshot' && l.tick === w.tick);
    if (!snap) {
      failures.push(`no snapshot at tick ${w.tick}`);
      continue;
    }
    const v = w.path.split('.').reduce((o, k) => (o == null ? o : o[k]), snap);
    const okv = 'approx' in w ? typeof v === 'number' && Math.abs(v - w.approx) <= (w.eps ?? 1e-3) : JSON.stringify(v) === JSON.stringify(w.eq);
    if (!okv) failures.push(`snapshot ${w.tick} ${w.path}: want ${JSON.stringify('approx' in w ? w.approx : w.eq)} got ${JSON.stringify(v)}`);
  }
  const end = lines.at(-1);
  if (end?.type !== 'end') failures.push('last line is not an end line');
  else if (expect.end && !subset(expect.end, end)) failures.push(`end mismatch: want ${JSON.stringify(expect.end)} got ${JSON.stringify(end)}`);
  return { pass: failures.length === 0, failures };
}
