// Pure gameplay math: ramp height fields, trick judging, quests.
// No Three.js or DOM here so node --test can exercise it.

export const WORLD_LIMIT = 190;

function local(ramp, x, z) {
  const dx = x - ramp.x;
  const dz = z - ramp.z;
  const s = Math.sin(ramp.yaw || 0);
  const c = Math.cos(ramp.yaw || 0);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

// Height of a single ramp at a world point, or null when outside.
// yaw points DOWNhill. The ramp rises towards -localZ.
export function rampHeight(ramp, x, z) {
  const { lx, lz } = local(ramp, x, z);
  const half = (ramp.width || 8) * 0.5;
  if (Math.abs(lx) > half) return null;

  if (ramp.type === 'quarter') {
    const t = -lz;
    const R = ramp.radius;
    if (t < 0 || t > R) return null;
    return R - Math.sqrt(Math.max(0, R * R - t * t));
  }

  if (ramp.type === 'wedge' || ramp.type === 'bank') {
    const t = -lz;
    if (t < 0 || t > ramp.length) return null;
    return ramp.height * (t / ramp.length);
  }

  if (ramp.type === 'funbox') {
    const D = ramp.depth * 0.5;
    const L = ramp.length;
    if (Math.abs(lz) <= D) return ramp.height;
    const d = Math.abs(lz);
    if (d > D + L) return null;
    return ramp.height * (1 - (d - D) / L);
  }

  return null;
}

export function sampleGround(ramps, x, z) {
  let height = 0;
  let ramp = null;
  for (let i = 0; i < ramps.length; i++) {
    const h = rampHeight(ramps[i], x, z);
    if (h !== null && h > height) {
      height = h;
      ramp = ramps[i];
    }
  }
  return { height, ramp };
}

export function groundNormal(ramps, x, z, eps = 0.35) {
  const hL = sampleGround(ramps, x - eps, z).height;
  const hR = sampleGround(ramps, x + eps, z).height;
  const hD = sampleGround(ramps, x, z - eps).height;
  const hU = sampleGround(ramps, x, z + eps).height;
  const nx = (hL - hR) / (2 * eps);
  const nz = (hD - hU) / (2 * eps);
  const len = Math.hypot(nx, 1, nz);
  return { x: nx / len, y: 1 / len, z: nz / len, slope: Math.hypot(nx, nz) };
}

// Which multiple of 360 is nearest, and how far off are we?
export function landingCheck(angleDeg, tolerance = 68) {
  const turns = Math.round(angleDeg / 360);
  const diff = angleDeg - turns * 360;
  return {
    clean: Math.abs(diff) <= tolerance,
    turns,
    diff,
    tolerance,
  };
}

export function rotationLabel(angleDeg) {
  const a = Math.abs(Math.round(angleDeg));
  const half = a % 360 >= 180 ? 1 : 0;
  return `${Math.floor(a / 360) + half * 0.5}`.replace('.5', '½');
}

export function trickName(trick, turns) {
  const t = Math.round(turns);
  if (t <= 0) return trick.name;
  if (t === 1) return trick.name;
  return `${t === 2 ? 'Double' : t === 3 ? 'Triple' : t + 'x'} ${trick.name}`;
}

export function wheelieScore(angle, dt, pedal = 1) {
  if (angle > 74) return 0;
  if (angle < 26) return 0;
  return 34 * dt * pedal;
}

export function formatMoney(n) {
  return '$' + Math.max(0, Math.round(n)).toLocaleString('en-US');
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function speedKmh(ms) {
  return Math.max(0, Math.round(ms * 3.6));
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

let questSerial = 0;

const TRICK_NAMES = {
  backflip: 'backflip',
  frontflip: 'frontflip',
  sideflip: 'sideflip',
  barspin: 'barspin',
};

export function createQuest(rng = Math.random, difficulty = 0, avoid = []) {
  let type = pick(rng, QUEST_TYPES.filter((t) => !avoid.includes(t)));
  if (!type) type = pick(rng, QUEST_TYPES.slice(0, 6));
  const boost = 1 + difficulty * 0.18;
  const id = ++questSerial;

  if (type === 'coins') {
    const target = 4 + Math.floor(rng() * 4) + difficulty;
    return {
      id, type,
      title: 'Coin Run',
      desc: `Collect ${target} glowing coins`,
      target,
      reward: Math.round((55 + target * 12) * boost),
      icon: 'coin',
    };
  }
  if (type === 'trick') {
    const trick = pick(rng, Object.keys(TRICK_NAMES));
    const target = 2 + Math.floor(rng() * 2);
    return {
      id, type, trick,
      title: `${TRICK_NAMES[trick]} session`,
      desc: `Land ${target} clean ${TRICK_NAMES[trick]}${target > 1 ? 's' : ''}`,
      target,
      reward: Math.round((150 + target * 45) * boost),
      icon: 'trick',
    };
  }
  if (type === 'wheelie') {
    const target = 6 + Math.floor(rng() * 5);
    return {
      id, type,
      title: 'Balance act',
      desc: `Hold wheelies for ${target} seconds total`,
      target,
      reward: Math.round((90 + target * 8) * boost),
      icon: 'wheelie',
    };
  }
  if (type === 'distance') {
    const target = 400 + Math.floor(rng() * 5) * 120;
    return {
      id, type,
      title: 'City cruise',
      desc: `Ride ${target} m through Volt City`,
      target,
      reward: Math.round((70 + target * 0.12) * boost),
      icon: 'distance',
    };
  }
  if (type === 'air') {
    const target = 8 + Math.floor(rng() * 7);
    return {
      id, type,
      title: 'Sky time',
      desc: `Spend ${target} seconds in the air`,
      target,
      reward: Math.round((110 + target * 10) * boost),
      icon: 'air',
    };
  }
  if (type === 'combo') {
    const target = 500 + Math.floor(rng() * 5) * 150;
    return {
      id, type,
      title: 'Combo chef',
      desc: `Land a single combo worth ${target}`,
      target,
      reward: Math.round((130 + target * 0.16) * boost),
      icon: 'combo',
    };
  }
  if (type === 'speed') {
    const target = 45 + Math.floor(rng() * 4) * 5;
    return {
      id, type,
      title: 'Speed demon',
      desc: `Hit ${target} km/h`,
      target,
      reward: Math.round((90 + target * 2) * boost),
      icon: 'speed',
    };
  }
  return {
    id, type: 'visit',
    title: 'Park check',
    desc: 'Drop into the Volt City skate park',
    target: 1,
    reward: 60,
    icon: 'visit',
  };
}

export function progressQuest(quest, event) {
  if (!quest || quest.done) return quest;
  let add = 0;
  if (event.type === 'coin' && quest.type === 'coins') add = event.amount ?? 1;
  else if (event.type === 'trick' && quest.type === 'trick' && event.trick === quest.trick) add = event.amount ?? 1;
  else if (event.type === 'wheelie' && quest.type === 'wheelie') add = event.amount ?? 0;
  else if (event.type === 'distance' && quest.type === 'distance') add = event.amount ?? 0;
  else if (event.type === 'air' && quest.type === 'air') add = event.amount ?? 0;
  else if (event.type === 'combo' && quest.type === 'combo') add = Math.max(0, (event.amount ?? 0) - quest.progress);
  else if (event.type === 'speed' && quest.type === 'speed') add = Math.max(0, (event.amount ?? 0) - quest.progress);
  else if (event.type === 'visit' && quest.type === 'visit' && event.place === 'park') add = 1;
  if (!add) return quest;
  const progress = Math.min(quest.target, quest.progress + add);
  return { ...quest, progress, done: progress >= quest.target - 1e-6 };
}

export function starsForScore(score) {
  if (score >= 5000) return 3;
  if (score >= 2000) return 2;
  if (score >= 700) return 1;
  return 0;
}

export function cleanAngle(angle, target) {
  // shortest signed distance to a target rotation
  let d = angle - target;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}
