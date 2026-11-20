// Headless run loop (contract tick model): snapshot at tick 0 is the state after the
// scenario is applied; step k reads the input of tick k and produces state k+1.
import { createGame, step, snapshot, NEUTRAL_INPUT } from './game.js';

export function runHeadless({ tuning, seed, night = 1, scenario = null, inputs = null, ticks, snapshotEvery = 10 }) {
  const g = createGame({ tuning, seed, night, scenario });
  const frames = inputs ? inputs.frames : [];
  const held = { ...NEUTRAL_INPUT, move: [0, 0] };
  const out = [{ type: 'event', tick: 0, name: 'night_start', data: { night } }, snapshot(g)];
  let fi = 0;
  for (let k = 0; k < ticks && g.state === 'playing'; k++) {
    while (fi < frames.length && frames[fi].tick <= k) {
      const f = frames[fi++];
      for (const key of Object.keys(held)) if (key in f) held[key] = key === 'move' ? [...f.move] : f[key];
    }
    for (const e of step(g, held)) out.push(e);
    if (g.tick % snapshotEvery === 0) out.push(snapshot(g));
  }
  out.push({ type: 'end', ticks: g.tick, state: g.paused && g.state === 'playing' ? 'paused' : g.state, score: g.score });
  return { game: g, lines: out };
}
