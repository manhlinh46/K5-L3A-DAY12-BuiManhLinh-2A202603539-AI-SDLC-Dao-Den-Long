// Strict validation of --inputs / --scenario files (Test Contract v1.1). Any violation -> InputError (exit 2).
// Unknown extra keys are ignored so newer graders' fields do not break older contracts.
export class InputError extends Error {}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);
const isNat = (v) => isInt(v) && v >= 0;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);
function need(cond, msg) {
  if (!cond) throw new InputError(msg);
}

const BUTTONS = ['jump', 'interact', 'pulse', 'dash', 'pause'];
const SHADE_STATES = ['spawning', 'wander', 'chase', 'recoil', 'stunned', 'drain'];
const DRIFTER_STATES = ['idle', 'chase', 'flee'];

export function validateInputs(obj) {
  need(isObj(obj) && Array.isArray(obj.frames), 'inputs: expected an object with a "frames" array');
  let last = -1;
  obj.frames.forEach((f, i) => {
    const at = `inputs.frames[${i}]`;
    need(isObj(f), `${at}: must be an object`);
    need(isNat(f.tick), `${at}.tick: must be an integer >= 0`);
    need(f.tick > last, `${at}.tick: ticks must be strictly increasing`);
    last = f.tick;
    if ('move' in f) need(Array.isArray(f.move) && f.move.length === 2 && f.move.every((v) => isNum(v) && v >= -1 && v <= 1), `${at}.move: must be [x, z] with each value in [-1, 1]`);
    if ('cam_yaw_deg' in f) need(isNum(f.cam_yaw_deg), `${at}.cam_yaw_deg: must be a number`);
    for (const b of BUTTONS) if (b in f) need(typeof f[b] === 'boolean', `${at}.${b}: must be a boolean`);
  });
  return obj;
}

function uniqueIds(arr, at) {
  const ids = new Set();
  arr.forEach((e, i) => {
    if (!('id' in e)) return;
    need(typeof e.id === 'string' && e.id.length > 0, `${at}[${i}].id: must be a non-empty string`);
    need(!ids.has(e.id), `${at}[${i}].id: duplicate id "${e.id}"`);
    ids.add(e.id);
  });
}

export function validateScenario(obj, lanternIds) {
  need(isObj(obj), 'scenario: must be a JSON object');
  if ('player' in obj) {
    const p = obj.player;
    need(isObj(p), 'scenario.player: must be an object');
    if ('pos' in p) need(isVec3(p.pos), 'scenario.player.pos: must be [x, y, z]');
    for (const k of ['carried', 'flames', 'invuln_ticks', 'dash_cd_ticks', 'pulse_cd_ticks', 'charm_ticks', 'successful_lights']) if (k in p) need(isNat(p[k]), `scenario.player.${k}: must be an integer >= 0`);
  }
  for (const k of ['random_motes', 'random_shades', 'random_drifters', 'wind_enabled']) if (k in obj) need(typeof obj[k] === 'boolean', `scenario.${k}: must be a boolean`);
  if ('motes' in obj) {
    need(Array.isArray(obj.motes), 'scenario.motes: must be an array');
    obj.motes.forEach((m, i) => {
      if (Array.isArray(m)) return need(isVec3(m), `scenario.motes[${i}]: must be [x, y, z]`);
      need(isObj(m) && isVec3(m.pos), `scenario.motes[${i}]: must be [x, y, z] or {pos: [x, y, z]}`);
      if ('kind' in m) need(['random', 'dropped'].includes(m.kind), `scenario.motes[${i}].kind: must be "random" or "dropped"`);
      if ('ttl_ticks' in m) need(isNat(m.ttl_ticks), `scenario.motes[${i}].ttl_ticks: must be an integer >= 0`);
      if ('ttl_s' in m && m.ttl_s !== null) need(isNum(m.ttl_s) && m.ttl_s >= 0, `scenario.motes[${i}].ttl_s: must be a number >= 0`);
    });
  }
  if ('shades' in obj) {
    need(Array.isArray(obj.shades), 'scenario.shades: must be an array');
    obj.shades.forEach((s, i) => {
      need(isObj(s) && isVec3(s.pos), `scenario.shades[${i}].pos: must be [x, y, z]`);
      if ('state' in s) need(SHADE_STATES.includes(s.state), `scenario.shades[${i}].state: must be one of ${SHADE_STATES.join(', ')}`);
      if ('state_ticks_left' in s) need(isNat(s.state_ticks_left), `scenario.shades[${i}].state_ticks_left: must be an integer >= 0`);
      if ('target_lantern_id' in s && s.target_lantern_id !== null) need(lanternIds.includes(s.target_lantern_id), `scenario.shades[${i}].target_lantern_id: unknown lantern "${s.target_lantern_id}"`);
    });
    uniqueIds(obj.shades, 'scenario.shades');
  }
  if ('drifters' in obj) {
    need(Array.isArray(obj.drifters), 'scenario.drifters: must be an array');
    obj.drifters.forEach((d, i) => {
      need(isObj(d) && isVec3(d.pos), `scenario.drifters[${i}].pos: must be [x, y, z]`);
      if ('state' in d) need(DRIFTER_STATES.includes(d.state), `scenario.drifters[${i}].state: must be one of ${DRIFTER_STATES.join(', ')}`);
      if ('stolen' in d) need(isNat(d.stolen), `scenario.drifters[${i}].stolen: must be an integer >= 0`);
      if ('state_ticks_left' in d) need(isNat(d.state_ticks_left), `scenario.drifters[${i}].state_ticks_left: must be an integer >= 0`);
    });
    uniqueIds(obj.drifters, 'scenario.drifters');
  }
  if ('charms' in obj) {
    need(Array.isArray(obj.charms), 'scenario.charms: must be an array');
    obj.charms.forEach((c, i) => {
      need(isObj(c), `scenario.charms[${i}]: must be an object`);
      if ('pos' in c) need(isVec3(c.pos), `scenario.charms[${i}].pos: must be [x, y, z]`);
      if ('available' in c) need(typeof c.available === 'boolean', `scenario.charms[${i}].available: must be a boolean`);
      if ('respawn_ticks' in c) need(isNat(c.respawn_ticks), `scenario.charms[${i}].respawn_ticks: must be an integer >= 0`);
      if ('respawn_s' in c) need(isNum(c.respawn_s) && c.respawn_s >= 0, `scenario.charms[${i}].respawn_s: must be a number >= 0`);
    });
    uniqueIds(obj.charms, 'scenario.charms');
  }
  if ('lanterns' in obj) {
    need(Array.isArray(obj.lanterns), 'scenario.lanterns: must be an array');
    obj.lanterns.forEach((l, i) => {
      const at = `scenario.lanterns[${i}]`;
      need(isObj(l) && typeof l.id === 'string', `${at}.id: must be a string`);
      need(lanternIds.includes(l.id), `${at}.id: unknown lantern "${l.id}" (expected one of ${lanternIds.join(', ')})`);
      if ('pos' in l) need(isVec3(l.pos), `${at}.pos: must be [x, y, z]`);
      if ('deposited' in l) need(isNat(l.deposited), `${at}.deposited: must be an integer >= 0`);
      if ('lit' in l) need(typeof l.lit === 'boolean', `${at}.lit: must be a boolean`);
      if ('ever_lit' in l) need(typeof l.ever_lit === 'boolean', `${at}.ever_lit: must be a boolean`);
      if ('fuel' in l) need(isNum(l.fuel) && l.fuel >= 0 && l.fuel <= 100, `${at}.fuel: must be a number in [0, 100]`);
      if ('relit_count' in l) need(isNat(l.relit_count), `${at}.relit_count: must be an integer >= 0`);
    });
  }
  if ('time_left_s' in obj) need(isNum(obj.time_left_s) && obj.time_left_s > 0, 'scenario.time_left_s: must be a number > 0');
  return obj;
}
