// Ticket-04 §3 local leaderboard: validation, ordering, top 10, persistence, export command, HTTP API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { addScore, insertEntry, isoWithOffset, loadEntries, validateEntry, MAX_ENTRIES } from '../src/leaderboard.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const e = (name, score, extra = {}) => ({ name, score, nights_won: 1, seed: 1, ...extra });

test('name: 3–12 chars of letters/digits/_ (Vietnamese diacritics accepted); invalid fields rejected', () => {
  for (const ok of ['Abc', 'May_01', 'Nguyễn_Mây', 'a'.repeat(12)]) assert.equal(validateEntry(e(ok, 1)).name, ok.normalize('NFC'));
  for (const bad of ['ab', 'a'.repeat(13), 'has space', 'semi;colon', '', null]) assert.throws(() => validateEntry(e(bad, 1)));
  assert.throws(() => validateEntry(e('Abc', -1)));
  assert.throws(() => validateEntry(e('Abc', 1, { nights_won: 4 })));
  assert.throws(() => validateEntry(e('Abc', 1.5)));
});

test('ordering: score desc, ties -> earlier achieved_at first; keeps top 10', () => {
  let list = [];
  for (let i = 0; i < 12; i++) list = insertEntry(list, { ...e(`P${i}xx`, i % 4), achieved_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() });
  assert.equal(list.length, MAX_ENTRIES);
  for (let i = 1; i < list.length; i++) {
    const [a, b] = [list[i - 1], list[i]];
    assert.ok(a.score > b.score || (a.score === b.score && Date.parse(a.achieved_at) <= Date.parse(b.achieved_at)));
  }
  assert.deepEqual(list.slice(0, 3).map((x) => x.name), ['P3xx', 'P7xx', 'P11xx']);
});

test('achieved_at is ISO 8601 with a timezone offset', () => {
  assert.match(isoWithOffset(new Date()), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}[+-]\d\d:\d\d$/);
});

test('persistence on disk + export command prints entries in rank order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ddl-lb-'));
  const file = join(dir, 'leaderboard.json');
  addScore(file, e('Alpha', 300), new Date('2026-01-01T00:00:00Z'));
  addScore(file, e('Beta', 500), new Date('2026-01-01T00:01:00Z'));
  addScore(file, e('Gamma', 300), new Date('2026-01-01T00:02:00Z'));
  assert.deepEqual(loadEntries(file).map((x) => x.name), ['Beta', 'Alpha', 'Gamma']); // survives a "restart" (fresh read)
  const out = join(dir, 'out.json');
  const r = spawnSync(process.execPath, ['server.js', '--export-leaderboard', out], { cwd: ROOT, env: { ...process.env, DDL_DATA_DIR: dir }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const exported = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual(Object.keys(exported), ['entries']);
  assert.deepEqual(exported.entries.map((x) => [x.name, x.score]), [['Beta', 500], ['Alpha', 300], ['Gamma', 300]]);
  for (const x of exported.entries) assert.deepEqual(Object.keys(x).sort(), ['achieved_at', 'name', 'nights_won', 'score', 'seed']);
});

test('HTTP API: POST validates and stores, GET returns ranked entries', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ddl-api-'));
  process.env.DDL_DATA_DIR = dir;
  const { startServer } = await import(`../server.js?${Date.now()}`);
  const server = await startServer(0, '127.0.0.1');
  const base = `http://127.0.0.1:${server.address().port}/api/leaderboard`;
  try {
    const bad = await fetch(base, { method: 'POST', body: JSON.stringify(e('x', 1)) });
    assert.equal(bad.status, 400);
    const ok = await fetch(base, { method: 'POST', body: JSON.stringify(e('Mây_01', 777, { nights_won: 3, seed: 42 })) });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).rank, 1);
    const list = await (await fetch(base)).json();
    assert.equal(list.entries[0].name, 'Mây_01');
  } finally {
    server.close();
    delete process.env.DDL_DATA_DIR;
  }
});
