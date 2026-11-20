// Runs a scenario case through the real headless CLI and checks its expectations.
// Case format: tests/scenarios/phase1.json. `events` must appear in order (as a subsequence);
// `data` is matched as a subset; `no_events` must never appear; `end` fields must match.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const contract = JSON.parse(readFileSync(join(ROOT, 'game.contract.json'), 'utf8'));

const subset = (want, got) => Object.entries(want).every(([k, v]) => JSON.stringify(got?.[k]) === JSON.stringify(v));

export function runCase(c, outDir) {
  mkdirSync(outDir, { recursive: true });
  const args = ['--seed', String(c.seed), '--night', '1', '--ticks', String(c.ticks), '--out', join(outDir, `${c.name}.jsonl`)];
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
  const end = lines.at(-1);
  if (end?.type !== 'end') failures.push('last line is not an end line');
  else if (expect.end && !subset(expect.end, end)) failures.push(`end mismatch: want ${JSON.stringify(expect.end)} got ${JSON.stringify(end)}`);
  return { pass: failures.length === 0, failures };
}
