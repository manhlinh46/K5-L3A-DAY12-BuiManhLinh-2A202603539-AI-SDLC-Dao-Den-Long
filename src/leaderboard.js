// Ticket-04 local leaderboard: top 10, score desc, ties -> earlier achieved_at first. Persisted to a JSON file.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { MAX_ENTRIES, sortEntries, insertEntry, validateEntry, isoWithOffset, LeaderboardError } from './leaderboard-core.js';
export { MAX_ENTRIES, NAME_RE, sortEntries, insertEntry, validateEntry, isoWithOffset, LeaderboardError } from './leaderboard-core.js';

export function loadEntries(file) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(data.entries) ? sortEntries(data.entries).slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

export function saveEntries(file, entries) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify({ entries }, null, 2) + '\n');
  renameSync(tmp, file); // atomic replace so a crash never leaves a half-written file
}

export function addScore(file, raw, now = new Date()) {
  const entry = { ...validateEntry(raw), achieved_at: isoWithOffset(now) };
  const entries = insertEntry(loadEntries(file), entry);
  saveEntries(file, entries);
  return { entry, entries, rank: entries.indexOf(entry) + 1 }; // 0 = did not make the top 10
}
