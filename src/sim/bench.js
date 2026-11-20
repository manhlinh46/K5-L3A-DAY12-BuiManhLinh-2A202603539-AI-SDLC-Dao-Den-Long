// Ticket-04 standard benchmark scene (identical for every submission):
// Night 1, exactly 200 wandering shades + 100 motes spread uniformly over the island (seed),
// L1–L3 lit with fuel 100, player idle at (0,0,0); spawns/damage/pickup/fuel decay/night end disabled.
import { createGame, addShade, addMote } from './game.js';
import { mulberry32 } from './rng.js';

export const BENCH = { shades: 200, motes: 100, radius: 38, warmupS: 3, cameraRadius: 30, cameraY: 15, cameraPeriodS: 15 };

export function createBenchGame(tuning, seed = 42) {
  const g = createGame({
    tuning,
    seed,
    night: 1,
    bench: true,
    scenario: {
      random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false,
      motes: [], shades: [],
      lanterns: ['L1', 'L2', 'L3'].map((id) => ({ id, lit: true, fuel: 100 })),
    },
  });
  const rng = mulberry32(seed);
  const point = () => {
    const a = rng() * 2 * Math.PI;
    const r = BENCH.radius * Math.sqrt(rng()); // uniform over the disc
    return [r * Math.cos(a), r * Math.sin(a)];
  };
  for (let i = 0; i < BENCH.shades; i++) {
    const [x, z] = point();
    addShade(g, x, z, 'wander');
  }
  for (let i = 0; i < BENCH.motes; i++) {
    const [x, z] = point();
    addMote(g, [x, 0, z]);
  }
  return g;
}
