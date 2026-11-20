// Standard maps (Ticket-02 Part 2). Angles: from +X, counter-clockwise seen from above:
// a point at radius r, angle a is (r·cos a, y, r·sin a).
const rad = (d) => (d * Math.PI) / 180;
const r3 = (v) => Math.round(v * 1000) / 1000 + 0;
const ring = (n, r, start, step, y = 0, cx = 0, cz = 0) =>
  Array.from({ length: n }, (_, i) => [r3(cx + r * Math.cos(rad(start + i * step))), y, r3(cz + r * Math.sin(rad(start + i * step)))]);

export const MAPS = {
  1: {
    name: 'Đảo Bến',
    start: [0, 0, 0],
    lanterns: [[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]],
    moteSpawns: [...ring(8, 12, 0, 45), ...ring(16, 33, 0, 22.5)],
    shadeSpawns: ring(12, 37, 15, 30),
    shadeInterval: 480,
    shadeMax: 6,
    shadeSpeed: null, // null -> tuning.shade_speed
    drifters: false,
    charms: [],
    pads: [],
    wind: false,
  },
  2: {
    name: 'Đảo Cau',
    start: [0, 0, 0],
    lanterns: [[0, 0, 20], [17, 0, -10], [-17, 0, -10], [70, 0, 20], [87, 0, -10], [53, 0, -10]],
    moteSpawns: [...ring(4, 10, 0, 90), ...ring(8, 22, 0, 45), ...ring(4, 10, 0, 90, 0, 70), ...ring(8, 22, 0, 45, 0, 70)],
    shadeSpawns: [...ring(8, 26, 22.5, 45), ...ring(8, 26, 22.5, 45, 0, 70)],
    shadeInterval: 420,
    shadeMax: 8,
    shadeSpeed: null,
    drifters: true,
    charms: [[35, 0, 0]],
    pads: [
      { pos: [20, 0, 18], r: 1, vy: 14, h: 24, target: [70, 0] },
      { pos: [50, 0, -18], r: 1, vy: 14, h: 24, target: [0, 0] },
    ],
    wind: false,
  },
  3: {
    name: 'Đảo Chuông',
    start: [0, 0, -30], // assumption: (0,0,0) is inside the bell tower on Night 3
    lanterns: [[0, 6, 6], [18, 3, 10], [-18, 3, 10], [35, 0, -10], [-35, 0, -10], [20, 0, -35], [-20, 0, -35]],
    moteSpawns: [...ring(18, 34, 0, 20), ...ring(8, 18, 20, 20, 3), ...ring(4, 5, 45, 90, 6)],
    shadeSpawns: ring(16, 43, 0, 22.5),
    shadeInterval: 360,
    shadeMax: 10,
    shadeSpeed: 4.5,
    drifters: true,
    charms: [[30, 0, 25], [-30, 0, 25]],
    pads: [{ pos: [0, 3, 13], r: 1, vy: 12, h: 8, dir: [0, -1] }],
    wind: true,
  },
};

const RAMPS = [30, 150].map((a) => [Math.cos(rad(a)), Math.sin(rad(a))]);

/** Ground height at (x, z) for a night, or null where there is no ground (sea of clouds). */
export function groundAt(night, x, z) {
  if (night === 1) return Math.hypot(x, z) <= 40 ? 0 : null;
  if (night === 2) {
    if (Math.hypot(x, z) <= 28 || Math.hypot(x - 70, z) <= 28) return 0;
    if (x >= 26 && x <= 44 && z >= -2 && z <= 2) return 0; // bamboo bridge, no railing
    return null;
  }
  const r = Math.hypot(x, z);
  if (r > 45) return null;
  if (r < 2) return 14; // bell tower: 8 m above tier 2, acts as an unclimbable wall
  if (r <= 8) return 6;
  if (r >= 12 && r <= 24 && z > 0) return 3;
  let h = 0;
  for (const [ux, uz] of RAMPS) {
    const along = x * ux + z * uz;
    const lateral = Math.abs(-x * uz + z * ux);
    if (lateral <= 1.5 && along >= 24 && along <= 30) h = Math.max(h, (3 * (30 - along)) / 6);
  }
  return h;
}

export const LANTERN_IDS = (night) => MAPS[night].lanterns.map((_, i) => `L${i + 1}`);
