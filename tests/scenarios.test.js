// Headless scenario suite (tests/scenarios/*.json) run through the real CLI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCase, ROOT } from '../scripts/scenario-check.js';

const dir = join(ROOT, 'tests', 'scenarios');
const out = mkdtempSync(join(tmpdir(), 'ddl-sc-'));
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  for (const c of JSON.parse(readFileSync(join(dir, f), 'utf8'))) {
    test(`scenario ${f}:${c.name} — ${c.requirement}`, () => {
      const r = runCase(c, out);
      assert.ok(r.pass, r.failures.join('\n'));
    });
  }
}
