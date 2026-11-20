// Pure leaderboard rules shared by the server (src/leaderboard.js) and the static web build (localStorage).
export const MAX_ENTRIES = 10;
// 3–12 characters: letters (incl. Vietnamese with diacritics — bonus), digits, underscore
export const NAME_RE = /^[\p{L}\p{M}\p{N}_]{3,12}$/u;

export class LeaderboardError extends Error {}

export function validateEntry(e) {
  const name = typeof e?.name === 'string' ? e.name.normalize('NFC').trim() : '';
  if (!NAME_RE.test(name) || [...name].length > 12) throw new LeaderboardError('name must be 3–12 characters: letters, digits or _');
  if (!Number.isInteger(e.score) || e.score < 0) throw new LeaderboardError('score must be an integer >= 0');
  if (!Number.isInteger(e.nights_won) || e.nights_won < 0 || e.nights_won > 3) throw new LeaderboardError('nights_won must be 0..3');
  if (!Number.isInteger(e.seed)) throw new LeaderboardError('seed must be an integer');
  return { name, score: e.score, nights_won: e.nights_won, seed: e.seed };
}

/** ISO 8601 with the local UTC offset, e.g. 2026-11-20T16:45:03.120+07:00 */
export function isoWithOffset(date = new Date()) {
  const off = -date.getTimezoneOffset();
  const pad = (n, w = 2) => String(Math.abs(n)).padStart(w, '0');
  const local = new Date(date.getTime() + off * 60000).toISOString().slice(0, -1);
  return `${local}${off >= 0 ? '+' : '-'}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}

export function sortEntries(entries) {
  return [...entries].sort((a, b) => b.score - a.score || Date.parse(a.achieved_at) - Date.parse(b.achieved_at));
}

/** Pure: returns the new top-10 list after inserting `entry` (already validated, with achieved_at). */
export function insertEntry(entries, entry) {
  return sortEntries([...entries, entry]).slice(0, MAX_ENTRIES);
}

