// Strict validation of --inputs / --scenario files. Any violation -> InputError (CLI exits 2).
export class InputError extends Error {}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);
function need(cond, msg) {
  if (!cond) throw new InputError(msg);
}

const BUTTONS = ['jump', 'interact', 'pulse', 'dash'];

export function validateInputs(obj) {
  need(isObj(obj) && Array.isArray(obj.frames), 'inputs: expected an object with a "frames" array');
  let last = -1;
  obj.frames.forEach((f, i) => {
    const at = `inputs.frames[${i}]`;
    need(isObj(f), `${at}: must be an object`);
    need(isInt(f.tick) && f.tick >= 0, `${at}.tick: must be an integer >= 0`);
    need(f.tick > last, `${at}.tick: ticks must be strictly increasing`);
    last = f.tick;
    if ('move' in f)
      need(Array.isArray(f.move) && f.move.length === 2 && f.move.every((v) => isNum(v) && v >= -1 && v <= 1), `${at}.move: must be [x, z] with each value in [-1, 1]`);
    if ('cam_yaw_deg' in f) need(isNum(f.cam_yaw_deg), `${at}.cam_yaw_deg: must be a number`);
    for (const b of BUTTONS) if (b in f) need(typeof f[b] === 'boolean', `${at}.${b}: must be a boolean`);
  });
  return obj;
}

export function validateScenario(obj, lanternIds) {
  need(isObj(obj), 'scenario: must be a JSON object');
  if ('player' in obj) {
    const p = obj.player;
    need(isObj(p), 'scenario.player: must be an object');
    if ('pos' in p) need(isVec3(p.pos), 'scenario.player.pos: must be [x, y, z]');
    if ('carried' in p) need(isInt(p.carried) && p.carried >= 0, 'scenario.player.carried: must be an integer >= 0');
    if ('flames' in p) need(isInt(p.flames) && p.flames >= 0, 'scenario.player.flames: must be an integer >= 0');
  }
  for (const k of ['random_motes', 'random_shades']) if (k in obj) need(typeof obj[k] === 'boolean', `scenario.${k}: must be a boolean`);
  if ('motes' in obj) need(Array.isArray(obj.motes) && obj.motes.every(isVec3), 'scenario.motes: must be an array of [x, y, z]');
  if ('shades' in obj) {
    need(Array.isArray(obj.shades), 'scenario.shades: must be an array');
    const ids = new Set();
    obj.shades.forEach((s, i) => {
      need(isObj(s) && isVec3(s.pos), `scenario.shades[${i}].pos: must be [x, y, z]`);
      if ('id' in s) {
        need(typeof s.id === 'string' && s.id.length > 0, `scenario.shades[${i}].id: must be a non-empty string`);
        need(!ids.has(s.id), `scenario.shades[${i}].id: duplicate id "${s.id}"`);
        ids.add(s.id);
      }
    });
  }
  if ('lanterns' in obj) {
    need(Array.isArray(obj.lanterns), 'scenario.lanterns: must be an array');
    obj.lanterns.forEach((l, i) => {
      const at = `scenario.lanterns[${i}]`;
      need(isObj(l) && typeof l.id === 'string', `${at}.id: must be a string`);
      need(lanternIds.includes(l.id), `${at}.id: unknown lantern "${l.id}" (expected one of ${lanternIds.join(', ')})`);
      if ('pos' in l) need(isVec3(l.pos), `${at}.pos: must be [x, y, z]`);
      if ('deposited' in l) need(isInt(l.deposited) && l.deposited >= 0, `${at}.deposited: must be an integer >= 0`);
      if ('lit' in l) need(typeof l.lit === 'boolean', `${at}.lit: must be a boolean`);
    });
  }
  if ('time_left_s' in obj) need(isNum(obj.time_left_s) && obj.time_left_s > 0, 'scenario.time_left_s: must be a number > 0');
  return obj;
}
