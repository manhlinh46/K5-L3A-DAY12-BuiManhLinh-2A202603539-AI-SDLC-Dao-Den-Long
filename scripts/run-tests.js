#!/usr/bin/env node
// Portable test runner: lists tests/*.test.js and passes explicit paths to `node --test`.
// (Glob patterns in `node --test` need Node ≥ 21; directory arguments fail on Node 24 — CI uses Node 20/22.)
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = readdirSync(join(root, 'tests'))
  .filter((f) => f.endsWith('.test.js'))
  .sort()
  .map((f) => join('tests', f));
const r = spawnSync(process.execPath, ['--test', ...files, ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
process.exit(r.status ?? 1);
