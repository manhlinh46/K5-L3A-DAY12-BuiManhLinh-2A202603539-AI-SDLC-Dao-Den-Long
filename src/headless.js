#!/usr/bin/env node
// Headless CLI per Test Contract v1.1.
// node src/headless.js --seed <int> --night <1|2|3> [--scenario f.json] [--inputs f.json]
//                      --ticks <int> --out <file.jsonl> [--snapshot-every <int>]
// Exit codes: 0 ok, 1 usage/runtime error, 2 malformed inputs/scenario file.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHeadless } from './sim/run.js';
import { LANTERN_IDS } from './sim/maps.js';
import { InputError, validateInputs, validateScenario } from './sim/validate.js';

class UsageError extends Error {}
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const known = new Set(['--seed', '--night', '--scenario', '--inputs', '--ticks', '--out', '--snapshot-every']);
  const a = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!known.has(argv[i])) throw new UsageError(`unknown argument: ${argv[i]}`);
    if (i + 1 >= argv.length) throw new UsageError(`missing value for ${argv[i]}`);
    a[argv[i].slice(2)] = argv[i + 1];
  }
  const int = (name, def, min) => {
    const v = a[name] ?? def;
    if (v === undefined) throw new UsageError(`--${name} is required`);
    if (!/^-?\d+$/.test(String(v)) || Number(v) < min) throw new UsageError(`--${name} must be an integer >= ${min}`);
    return Number(v);
  };
  const opts = {
    seed: int('seed', undefined, -2147483648),
    night: int('night', 1, 1),
    ticks: int('ticks', undefined, 0),
    snapshotEvery: int('snapshot-every', 10, 1),
    out: a.out,
    scenario: a.scenario,
    inputs: a.inputs,
  };
  if (!opts.out) throw new UsageError('--out is required');
  if (![1, 2, 3].includes(opts.night)) throw new UsageError(`--night must be 1, 2 or 3 (got ${opts.night})`);
  return opts;
}

function readJson(path, label) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    throw new Error(`cannot read ${label} file "${path}": ${e.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new InputError(`${label} file "${path}" is not valid JSON: ${e.message}`);
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { tuning } = JSON.parse(readFileSync(join(ROOT, 'game.contract.json'), 'utf8'));
  const lanternIds = LANTERN_IDS(opts.night);
  const scenario = opts.scenario ? validateScenario(readJson(opts.scenario, 'scenario'), lanternIds) : null;
  const inputs = opts.inputs ? validateInputs(readJson(opts.inputs, 'inputs')) : null;
  const { lines } = runHeadless({ tuning, seed: opts.seed, night: opts.night, scenario, inputs, ticks: opts.ticks, snapshotEvery: opts.snapshotEvery });
  writeFileSync(opts.out, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}

try {
  main();
} catch (e) {
  process.stderr.write(`headless error: ${e.message}\n`);
  process.exit(e instanceof InputError ? 2 : 1);
}
